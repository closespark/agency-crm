import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apollo, apolloToProspect } from "@/lib/integrations/apollo";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.APOLLO_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Apollo integration not configured. Set APOLLO_API_KEY in your environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { email, domain } = body;

    if (!email && !domain) {
      return NextResponse.json(
        { error: "Either email or domain is required" },
        { status: 400 }
      );
    }

    // Person enrichment by email
    if (email) {
      const result = await apollo.enrichPerson(email);
      const person = result.person;

      if (!person) {
        return NextResponse.json(
          { error: "No person found for this email" },
          { status: 404 }
        );
      }

      const enrichedData = apolloToProspect(person);

      // Try to update existing contact
      const contact = await prisma.contact.findUnique({
        where: { email },
      });

      if (contact) {
        const updatedContact = await prisma.contact.update({
          where: { id: contact.id },
          data: {
            jobTitle: enrichedData.jobTitle || contact.jobTitle,
            customFields: JSON.stringify({
              ...(contact.customFields
                ? JSON.parse(contact.customFields)
                : {}),
              linkedinUrl: enrichedData.linkedinUrl,
              enrichedAt: new Date().toISOString(),
              apolloData: enrichedData.enrichedData,
            }),
          },
        });

        // Also update the company if we have new data
        if (enrichedData.companyName && enrichedData.companyDomain) {
          const existingCompany = contact.companyId
            ? await prisma.company.findUnique({
                where: { id: contact.companyId },
              })
            : await prisma.company.findUnique({
                where: { domain: enrichedData.companyDomain },
              });

          if (existingCompany) {
            await prisma.company.update({
              where: { id: existingCompany.id },
              data: {
                industry: enrichedData.industry || existingCompany.industry,
                size: enrichedData.companySize || existingCompany.size,
              },
            });
          }
        }

        return NextResponse.json({
          data: { type: "contact", record: updatedContact, enrichment: enrichedData },
        });
      }

      // Try to update existing prospect
      const prospect = await prisma.prospect.findFirst({
        where: { email },
      });

      if (prospect) {
        const updatedProspect = await prisma.prospect.update({
          where: { id: prospect.id },
          data: {
            firstName: enrichedData.firstName || prospect.firstName,
            lastName: enrichedData.lastName || prospect.lastName,
            jobTitle: enrichedData.jobTitle || prospect.jobTitle,
            linkedinUrl: enrichedData.linkedinUrl || prospect.linkedinUrl,
            companyName: enrichedData.companyName || prospect.companyName,
            companyDomain:
              enrichedData.companyDomain || prospect.companyDomain,
            companySize: enrichedData.companySize || prospect.companySize,
            industry: enrichedData.industry || prospect.industry,
            location: enrichedData.location || prospect.location,
            enrichedData: enrichedData.enrichedData,
          },
        });

        return NextResponse.json({
          data: { type: "prospect", record: updatedProspect, enrichment: enrichedData },
        });
      }

      // No existing record, just return enrichment data
      return NextResponse.json({
        data: { type: "new", record: null, enrichment: enrichedData },
      });
    }

    // Company enrichment by domain
    if (domain) {
      const result = await apollo.enrichCompany(domain);
      const org = result.organization;

      if (!org) {
        return NextResponse.json(
          { error: "No company found for this domain" },
          { status: 404 }
        );
      }

      // Try to update existing company
      const existingCompany = await prisma.company.findUnique({
        where: { domain },
      });

      if (existingCompany) {
        const updatedCompany = await prisma.company.update({
          where: { id: existingCompany.id },
          data: {
            name: org.name || existingCompany.name,
            industry: org.industry || existingCompany.industry,
            size: org.estimated_num_employees
              ? categorizeSize(org.estimated_num_employees)
              : existingCompany.size,
            revenue: org.annual_revenue || existingCompany.revenue,
            phone: org.phone || existingCompany.phone,
            city: org.city || existingCompany.city,
            state: org.state || existingCompany.state,
            country: org.country || existingCompany.country,
            description: org.description || existingCompany.description,
            customFields: JSON.stringify({
              ...(existingCompany.customFields
                ? JSON.parse(existingCompany.customFields)
                : {}),
              linkedinUrl: org.linkedin_url,
              enrichedAt: new Date().toISOString(),
            }),
          },
        });

        return NextResponse.json({
          data: { type: "company", record: updatedCompany, enrichment: org },
        });
      }

      // No existing record, return raw enrichment
      return NextResponse.json({
        data: { type: "new", record: null, enrichment: org },
      });
    }
  } catch (error) {
    console.error("Error enriching via Apollo:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

function categorizeSize(employees: number): string {
  if (employees <= 10) return "1-10";
  if (employees <= 50) return "11-50";
  if (employees <= 200) return "51-200";
  if (employees <= 500) return "201-500";
  if (employees <= 1000) return "501-1000";
  return "1001+";
}
