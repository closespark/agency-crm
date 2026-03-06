import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  try {
    const { apollo } = await import("@/lib/integrations/apollo");

    // Enrich person data by email
    let enrichedPerson = null;
    if (prospect.email) {
      const personResult = await apollo.enrichPerson(prospect.email);
      enrichedPerson = personResult.person;
    }

    // Enrich company data by domain
    let enrichedCompany = null;
    if (prospect.companyDomain) {
      const companyResult = await apollo.enrichCompany(prospect.companyDomain);
      enrichedCompany = companyResult.organization;
    }

    const enrichedData = {
      person: enrichedPerson,
      company: enrichedCompany,
      enrichedAt: new Date().toISOString(),
    };

    const updateData: Record<string, unknown> = {
      enrichedData: JSON.stringify(enrichedData),
      status: prospect.status === "new" ? "verified" : prospect.status,
    };

    // Update fields from enrichment if they were missing
    if (enrichedPerson) {
      if (!prospect.email && enrichedPerson.email) updateData.email = enrichedPerson.email;
      if (!prospect.linkedinUrl && enrichedPerson.linkedin_url) updateData.linkedinUrl = enrichedPerson.linkedin_url;
      if (!prospect.jobTitle && enrichedPerson.title) updateData.jobTitle = enrichedPerson.title;
    }

    if (enrichedCompany) {
      if (!prospect.companySize && enrichedCompany.estimated_num_employees) {
        const emp = enrichedCompany.estimated_num_employees;
        if (emp <= 10) updateData.companySize = "1-10";
        else if (emp <= 50) updateData.companySize = "11-50";
        else if (emp <= 200) updateData.companySize = "51-200";
        else if (emp <= 500) updateData.companySize = "201-500";
        else if (emp <= 1000) updateData.companySize = "501-1000";
        else updateData.companySize = "1001+";
      }
      if (!prospect.industry && enrichedCompany.industry) updateData.industry = enrichedCompany.industry;
    }

    const updated = await prisma.prospect.update({
      where: { id },
      data: updateData,
      include: {
        search: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
