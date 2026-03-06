import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { prospectIds } = body;

  if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
    return NextResponse.json({ error: "prospectIds array is required" }, { status: 400 });
  }

  if (prospectIds.length > 100) {
    return NextResponse.json({ error: "Maximum 100 prospects per bulk conversion" }, { status: 400 });
  }

  const prospects = await prisma.prospect.findMany({
    where: {
      id: { in: prospectIds },
      status: { not: "converted" },
    },
  });

  if (prospects.length === 0) {
    return NextResponse.json({ error: "No eligible prospects found" }, { status: 400 });
  }

  const results: { prospectId: string; contactId: string; success: boolean; error?: string }[] = [];

  for (const prospect of prospects) {
    try {
      // Find or create company
      let companyId: string | null = null;
      if (prospect.companyName) {
        const existingCompany = prospect.companyDomain
          ? await prisma.company.findUnique({ where: { domain: prospect.companyDomain } })
          : null;

        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          const company = await prisma.company.create({
            data: {
              name: prospect.companyName,
              domain: prospect.companyDomain,
              industry: prospect.industry,
              size: prospect.companySize,
            },
          });
          companyId = company.id;
        }
      }

      // Check for existing contact with same email
      if (prospect.email) {
        const existingContact = await prisma.contact.findUnique({
          where: { email: prospect.email },
        });
        if (existingContact) {
          await prisma.prospect.update({
            where: { id: prospect.id },
            data: { status: "converted", contactId: existingContact.id },
          });
          results.push({ prospectId: prospect.id, contactId: existingContact.id, success: true });
          continue;
        }
      }

      const contact = await prisma.contact.create({
        data: {
          firstName: prospect.firstName || "Unknown",
          lastName: prospect.lastName || "Unknown",
          email: prospect.email,
          phone: prospect.phone,
          jobTitle: prospect.jobTitle,
          companyId,
          ownerId: session.user.id,
          source: "prospecting",
          lifecycleStage: "lead",
          leadStatus: "new",
        },
      });

      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { status: "converted", contactId: contact.id },
      });

      results.push({ prospectId: prospect.id, contactId: contact.id, success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed";
      results.push({ prospectId: prospect.id, contactId: "", success: false, error: message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return NextResponse.json({
    data: {
      results,
      summary: {
        total: prospects.length,
        success: successCount,
        failed: failCount,
      },
    },
  });
}
