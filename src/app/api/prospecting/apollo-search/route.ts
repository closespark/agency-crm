import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { searchId, params } = body;

  if (!params) {
    return NextResponse.json({ error: "Search params are required" }, { status: 400 });
  }

  try {
    const { apollo, apolloToProspect } = await import("@/lib/integrations/apollo");

    const response = await apollo.peopleSearch(params);
    const people = response.people || [];

    if (people.length === 0) {
      return NextResponse.json({ data: { prospects: [], count: 0 } });
    }

    const prospects = people.map((r) => apolloToProspect(r));

    // If a searchId is provided, attach to existing search; otherwise create a new one
    let targetSearchId = searchId;
    if (!targetSearchId) {
      const search = await prisma.prospectSearch.create({
        data: {
          name: `Apollo Search - ${new Date().toLocaleDateString()}`,
          icp: JSON.stringify(params),
          status: "complete",
          resultsCount: prospects.length,
        },
      });
      targetSearchId = search.id;
    }

    await prisma.prospect.createMany({
      data: prospects.map((p) => ({
        searchId: targetSearchId,
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

    if (searchId) {
      const totalProspects = await prisma.prospect.count({ where: { searchId } });
      await prisma.prospectSearch.update({
        where: { id: searchId },
        data: { status: "complete", resultsCount: totalProspects },
      });
    }

    return NextResponse.json({
      data: {
        searchId: targetSearchId,
        count: prospects.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apollo search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
