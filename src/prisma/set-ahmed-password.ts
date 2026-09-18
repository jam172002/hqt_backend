import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// One-off dev-only script: gives the pre-existing "Ahmed Khan" e2e fixture
// teacher a known password so it can be used to manually verify the
// hqt_mobile teacher-side homework flow against the real demo enrollment.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { firstName: 'Ahmed', lastName: 'Khan', status: 'ACTIVE' },
  });
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
  await prisma.user.update({ where: { id: teacher.userId }, data: { password: passwordHash } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: teacher.userId } });
  console.log(`Set password for Ahmed Khan (${user.email ?? user.phone}) to ChangeMe123!`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
