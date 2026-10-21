import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { poolMax } from '@/lib/db-pool';

declare global {
  var __platformPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and add your database address.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: poolMax() }) });
}

/** Lazily created so builds and pages with a fallback work without a database. */
export function getDb(): PrismaClient {
  globalThis.__platformPrisma ??= createClient();
  return globalThis.__platformPrisma;
}
