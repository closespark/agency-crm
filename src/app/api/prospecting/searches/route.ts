import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(url.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.get("pageSize") || "20")));
  const search = url.get("search") || "";
  const status = url.get("status") || "";
  const sortBy = url.get("sortBy") || "createdAt";
  const sortDir = url.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [{ name: { contains: search } }];
  }
  if (status) where.status = status;

  const [searches, total] = await Promise.all([
    prisma.prospectSearch.findMany({
      where,
      include: {
        _count: { select: { prospects: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.prospectSearch.count({ where }),
  ]);

  return NextResponse.json({
    data: searches,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, icp, source } = body;

  if (!name || !icp) {
    return NextResponse.json({ error: "Name and ICP are required" }, { status: 400 });
  }

  // If source is "apollo", create the search and run Apollo people search
  if (source === "apollo") {
    const search = await prisma.prospectSearch.create({
      data: {
        name,
        icp: typeof icp === "string" ? icp : JSON.stringify(icp),
        status: "searching",
      },
    });

    try {
      const { apollo, apolloToProspect } = await import("@/lib/integrations/apollo");
      const icpData = typeof icp === "string" ? JSON.parse(icp) : icp;

      const apolloParams = {
        person_titles: icpData.jobTitles || undefined,
        person_locations: icpData.locations || undefined,
        q_keywords: (icpData.keywords || []).join(" ") || undefined,
        organization_num_employees_ranges: icpData.companySize ? [icpData.companySize] : undefined,
      };

      const response = await apollo.peopleSearch(apolloParams);
      const people = response.people || [];
      const prospects = people.map((r) => apolloToProspect(r));

      if (prospects.length > 0) {
        await prisma.prospect.createMany({
          data: prospects.map((p) => ({
            searchId: search.id,
            firstName: p.firstName || null,
            lastName: p.lastName || null,
            email: p.email || null,
            phone: null,
            linkedinUrl: p.linkedinUrl || null,
            jobTitle: p.jobTitle || null,
            companyName: p.companyName || null,
            companyDomain: p.companyDomain || null,
            companySize: p.companySize || null,
            industry: p.industry || null,
            location: p.location || null,
            enrichedData: p.enrichedData || null,
            fitScore: null,
            status: "new",
          })),
        });
      }

      await prisma.prospectSearch.update({
        where: { id: search.id },
        data: { status: "complete", resultsCount: prospects.length },
      });
    } catch {
      await prisma.prospectSearch.update({
        where: { id: search.id },
        data: { status: "complete" },
      });
    }

    const updated = await prisma.prospectSearch.findUnique({
      where: { id: search.id },
      include: { _count: { select: { prospects: true } } },
    });

    return NextResponse.json({ data: updated }, { status: 201 });
  }

  // If source is "ai", use the AI prospector which creates its own search and prospects
  if (source === "ai") {
    try {
      const { createProspectSearch } = await import("@/lib/ai/prospector");
      const icpData = typeof icp === "string" ? JSON.parse(icp) : icp;
      const searchId = await createProspectSearch(name, icpData);

      const created = await prisma.prospectSearch.findUnique({
        where: { id: searchId },
        include: { _count: { select: { prospects: true } } },
      });

      return NextResponse.json({ data: created }, { status: 201 });
    } catch {
      // If AI fails, create a draft search so the user can retry
      const search = await prisma.prospectSearch.create({
        data: {
          name,
          icp: typeof icp === "string" ? icp : JSON.stringify(icp),
          status: "draft",
        },
        include: { _count: { select: { prospects: true } } },
      });
      return NextResponse.json({ data: search }, { status: 201 });
    }
  }

  // Default: just create a draft search
  const search = await prisma.prospectSearch.create({
    data: {
      name,
      icp: typeof icp === "string" ? icp : JSON.stringify(icp),
      status: "draft",
    },
    include: { _count: { select: { prospects: true } } },
  });

  return NextResponse.json({ data: search }, { status: 201 });
}
