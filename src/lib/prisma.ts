import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL || "";

  // Add connection pooling params for Railway/serverless if not already present
  const url = new URL(databaseUrl || "postgresql://localhost:5432/acrm");
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", process.env.NODE_ENV === "production" ? "10" : "5");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "10");
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasourceUrl: url.toString(),
  } as unknown as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
