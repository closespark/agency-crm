import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Contact, Company, Deal, Ticket } from "@/types";

export interface SearchResult {
  id: string;
  type: "contact" | "company" | "deal" | "ticket";
  title: string;
  subtitle: string;
  url: string;
}

export interface SearchResponse {
  contacts: SearchResult[];
  companies: SearchResult[];
  deals: SearchResult[];
  tickets: SearchResult[];
}

const MAX_PER_TYPE = 5;

async function searchContacts(q: string): Promise<SearchResult[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
      ],
    },
    include: { company: { select: { name: true } } },
    take: MAX_PER_TYPE,
    orderBy: { updatedAt: "desc" },
  });

  return contacts.map((c: Contact & { company?: { name: string } | null }) => ({
    id: c.id,
    type: "contact" as const,
    title: `${c.firstName} ${c.lastName}`,
    subtitle: c.email || c.company?.name || "",
    url: `/contacts/${c.id}`,
  }));
}

async function searchCompanies(q: string): Promise<SearchResult[]> {
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { domain: { contains: q } },
      ],
    },
    take: MAX_PER_TYPE,
    orderBy: { updatedAt: "desc" },
  });

  return companies.map((c: Company) => ({
    id: c.id,
    type: "company" as const,
    title: c.name,
    subtitle: c.domain || c.industry || "",
    url: `/companies/${c.id}`,
  }));
}

async function searchDeals(q: string): Promise<SearchResult[]> {
  const deals = await prisma.deal.findMany({
    where: {
      name: { contains: q },
    },
    include: {
      contact: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
    take: MAX_PER_TYPE,
    orderBy: { updatedAt: "desc" },
  });

  return deals.map((d: Deal & { contact?: { firstName: string; lastName: string } | null; company?: { name: string } | null }) => ({
    id: d.id,
    type: "deal" as const,
    title: d.name,
    subtitle: d.company?.name || (d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : d.stage),
    url: `/deals/${d.id}`,
  }));
}

async function searchTickets(q: string): Promise<SearchResult[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      subject: { contains: q },
    },
    include: {
      contact: { select: { firstName: true, lastName: true } },
    },
    take: MAX_PER_TYPE,
    orderBy: { updatedAt: "desc" },
  });

  return tickets.map((t: Ticket & { contact?: { firstName: string; lastName: string } | null }) => ({
    id: t.id,
    type: "ticket" as const,
    title: t.subject,
    subtitle: t.contact ? `${t.contact.firstName} ${t.contact.lastName}` : t.status,
    url: `/tickets/${t.id}`,
  }));
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim() || "";
  const type = searchParams.get("type") || "all";

  if (!q || q.length < 2) {
    return NextResponse.json<SearchResponse>({
      contacts: [],
      companies: [],
      deals: [],
      tickets: [],
    });
  }

  const [contacts, companies, deals, tickets] = await Promise.all([
    type === "all" || type === "contacts" ? searchContacts(q) : Promise.resolve([]),
    type === "all" || type === "companies" ? searchCompanies(q) : Promise.resolve([]),
    type === "all" || type === "deals" ? searchDeals(q) : Promise.resolve([]),
    type === "all" || type === "tickets" ? searchTickets(q) : Promise.resolve([]),
  ]);

  return NextResponse.json<SearchResponse>({
    contacts,
    companies,
    deals,
    tickets,
  });
}
