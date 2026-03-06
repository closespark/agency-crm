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

  if (prospect.status === "converted" && prospect.contactId) {
    return NextResponse.json({ error: "Prospect already converted" }, { status: 400 });
  }

  try {
    // Use the AI-powered conversion which handles company creation and deduplication
    const { convertProspectToContact } = await import("@/lib/ai/prospector");
    const contactId = await convertProspectToContact(id);

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    const updatedProspect = await prisma.prospect.findUnique({ where: { id } });

    return NextResponse.json({ data: { prospect: updatedProspect, contact } });
  } catch {
    // Fallback: manual conversion
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
          where: { id },
          data: { status: "converted", contactId: existingContact.id },
        });
        const updatedProspect = await prisma.prospect.findUnique({ where: { id } });
        return NextResponse.json({ data: { prospect: updatedProspect, contact: existingContact } });
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
      where: { id },
      data: { status: "converted", contactId: contact.id },
    });

    const updatedProspect = await prisma.prospect.findUnique({ where: { id } });
    return NextResponse.json({ data: { prospect: updatedProspect, contact } });
  }
}
