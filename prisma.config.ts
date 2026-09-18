import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma ORM 7 configuration. Since v7, the schema location, migrations
 * folder, seed command and CLI database URL live here rather than in
 * package.json or the schema's `datasource` block (PrismaClient itself
 * gets its connection via a driver adapter - see src/prisma/prisma.service.ts).
 */
export default defineConfig({
  schema: 'src/prisma/schema.prisma',
  migrations: {
    path: 'src/prisma/migrations',
    // tsx, not ts-node: ts-node's type-checking pass currently chokes on
    // TypeScript 6's ambient-global resolution for a plain script context.
    seed: 'tsx src/prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
