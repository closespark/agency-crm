import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  apollo,
  apolloToProspect,
  type ApolloSearchParams,
} from "@/lib/integrations/apollo";

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
    const {
      searchName,
      person_titles,
      person_locations,
      organization_industry_tag_ids,
      organization_num_employees_ranges,
      organization_locations,
      q_keywords,
      page,
      per_page,
    } = body;

    if (!searchName) {
      return NextResponse.json(
        { error: "searchName is required to track this search" },
        { status: 400 }
      );
    }

    const searchParams: ApolloSearchParams = {};
    if (person_titles) searchParams.person_titles = person_titles;
    if (person_locations) searchParams.person_locations = person_locations;
    if (organization_industry_tag_ids)
      searchParams.organization_industry_tag_ids =
        organization_industry_tag_ids;
    if (organization_num_employees_ranges)
      searchParams.organization_num_employees_ranges =
        organization_num_employees_ranges;
    if (organization_locations)
      searchParams.organization_locations = organization_locations;
    if (q_keywords) searchParams.q_keywords = q_keywords;
    if (page) searchParams.page = page;
    if (per_page) searchParams.per_page = per_page;

    // Create or find the ProspectSearch record
    const prospectSearch = await prisma.prospectSearch.create({
      data: {
        name: searchName,
        icp: JSON.stringify(searchParams),
        status: "searching",
      },
    });

    // Call Apollo API
    const result = await apollo.peopleSearch(searchParams);

    // Save results as Prospects linked to the search
    const prospects = [];
    for (const person of result.people) {
      const prospectData = apolloToProspect(person);
      const prospect = await prisma.prospect.create({
        data: {
          searchId: prospectSearch.id,
          ...prospectData,
        },
      });
      prospects.push(prospect);
    }

    // Update search status and count
    await prisma.prospectSearch.update({
      where: { id: prospectSearch.id },
      data: {
        status: "complete",
        resultsCount: result.pagination.total_entries,
      },
    });

    return NextResponse.json({
      data: {
        search: {
          id: prospectSearch.id,
          name: searchName,
          totalResults: result.pagination.total_entries,
          totalPages: result.pagination.total_pages,
          currentPage: result.pagination.page,
        },
        prospects,
      },
    });
  } catch (error) {
    console.error("Error searching Apollo:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
