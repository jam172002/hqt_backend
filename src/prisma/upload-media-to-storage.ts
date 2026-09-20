import 'dotenv/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// One-off: copies every MediaFile's bytes from the local uploads/ folder into
// the S3/R2 bucket under the same storageKey, so rows seeded (or uploaded)
// while STORAGE_PROVIDER=local start resolving once the API switches to s3.
// Safe to re-run - objects are simply overwritten with identical content.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const UPLOADS_DIR = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH ?? 'uploads');

async function main(): Promise<void> {
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    throw new Error('Set STORAGE_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY first.');
  }
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

  const files = await prisma.mediaFile.findMany();
  let uploaded = 0;
  const missing: string[] = [];

  for (const file of files) {
    try {
      const body = await fs.readFile(path.join(UPLOADS_DIR, file.storageKey));
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: file.storageKey, Body: body, ContentType: file.mimeType }),
      );
      uploaded += 1;
    } catch {
      missing.push(file.storageKey);
    }
  }

  console.log(`Uploaded ${uploaded} of ${files.length} media files.`);
  if (missing.length > 0) {
    console.log(`Not found locally (${missing.length}):`, missing.join(', '));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
