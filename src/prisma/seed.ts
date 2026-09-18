import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_CODES } from '../modules/auth/constants/roles.constant';

// Standalone script, outside Nest's DI container, so it wires its own
// driver adapter rather than going through PrismaService.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD_SALT_ROUNDS = 12;

const ROLE_SEED: Array<{ code: string; name: string; description: string }> = [
  {
    code: ROLE_CODES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full platform control, including admin management.',
  },
  {
    code: ROLE_CODES.ADMIN,
    name: 'Admin',
    description: 'Manages students, teachers, courses, trials and content.',
  },
  {
    code: ROLE_CODES.TEACHER,
    name: 'Teacher',
    description: 'Teaches assigned students and manages their own classes.',
  },
  {
    code: ROLE_CODES.PARENT,
    name: 'Parent',
    description: 'Manages one or more children/students.',
  },
  {
    code: ROLE_CODES.STUDENT,
    name: 'Student',
    description: 'Attends classes and tracks their own progress.',
  },
];

// SRS/architecture: admin/super-admin accounts are provisioned out of
// band, not via self-registration - this seed is that "out of band" path
// for local development, so there's always at least one way in.
const SEED_SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@hqt.local';
const SEED_SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';

// SRS Section 7 "Initial Courses" - the six courses the platform launches with.
const COURSE_SEED: Array<{
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  suitableFor: string;
  ageGroup: string;
  sortOrder: number;
}> = [
  {
    slug: 'quran-reading',
    name: 'Quran Reading',
    shortDescription: 'Learn to read the Quran fluently with correct pronunciation.',
    description:
      'A foundational course covering Arabic letters, connecting words, and fluent Quranic reading for beginners of all ages.',
    suitableFor: 'Beginners with little or no prior Quran reading experience.',
    ageGroup: 'All ages',
    sortOrder: 1,
  },
  {
    slug: 'noorani-qaida',
    name: 'Noorani Qaida',
    shortDescription: 'The essential first step before reading the Quran directly.',
    description:
      'Covers Arabic alphabet recognition, harakat (vowel marks), and basic joining rules to prepare students for Quran reading.',
    suitableFor: 'Absolute beginners, especially young children.',
    ageGroup: 'Children (4+) and beginner adults',
    sortOrder: 2,
  },
  {
    slug: 'tajweed',
    name: 'Tajweed',
    shortDescription: 'Master the rules of correct Quranic recitation.',
    description:
      'In-depth study of Tajweed rules - articulation points (makharij), characteristics of letters, and recitation rules - for students who already read Quran.',
    suitableFor: 'Students who can already read Quran and want to recite it correctly.',
    ageGroup: 'All ages',
    sortOrder: 3,
  },
  {
    slug: 'hifz-ul-quran',
    name: 'Hifz-ul-Quran',
    shortDescription: 'Memorize the Quran with a structured, one-to-one program.',
    description:
      'A structured memorization program with regular revision cycles, tailored to each student\'s pace, taught one-to-one.',
    suitableFor: 'Students committed to memorizing part or all of the Quran.',
    ageGroup: 'All ages',
    sortOrder: 4,
  },
  {
    slug: 'quran-translation',
    name: 'Quran Translation',
    shortDescription: "Understand the meaning of the Quran's verses.",
    description:
      "Verse-by-verse translation and explanation of the Quran's meaning, context, and lessons for daily life.",
    suitableFor: 'Students who want to understand what they recite.',
    ageGroup: 'Teenagers and adults',
    sortOrder: 5,
  },
  {
    slug: 'islamic-studies',
    name: 'Islamic Studies',
    shortDescription: 'Core Islamic knowledge: beliefs, worship, and character.',
    description:
      'Covers Islamic beliefs (Aqeedah), acts of worship (Fiqh), the life of the Prophet (Seerah), and Islamic manners (Akhlaq).',
    suitableFor: 'Students of all ages seeking foundational Islamic knowledge.',
    ageGroup: 'All ages',
    sortOrder: 6,
  },
];

async function seedRoles(): Promise<void> {
  for (const role of ROLE_SEED) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
  console.log(`Seeded ${ROLE_SEED.length} roles.`);
}

async function seedSuperAdmin(): Promise<void> {
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: ROLE_CODES.SUPER_ADMIN },
  });

  const passwordHash = await bcrypt.hash(SEED_SUPER_ADMIN_PASSWORD, PASSWORD_SALT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: SEED_SUPER_ADMIN_EMAIL },
    update: { password: passwordHash, status: 'ACTIVE' },
    create: {
      email: SEED_SUPER_ADMIN_EMAIL,
      password: passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: superAdminRole.id } },
    },
  });

  await prisma.adminProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, firstName: 'Super', lastName: 'Admin', jobTitle: 'Platform Owner' },
  });

  console.log(`Seeded super admin: ${SEED_SUPER_ADMIN_EMAIL} / ${SEED_SUPER_ADMIN_PASSWORD}`);
}

async function seedCourses(): Promise<void> {
  for (const course of COURSE_SEED) {
    await prisma.course.upsert({
      where: { slug: course.slug },
      update: {
        name: course.name,
        shortDescription: course.shortDescription,
        description: course.description,
        suitableFor: course.suitableFor,
        ageGroup: course.ageGroup,
        sortOrder: course.sortOrder,
      },
      create: { ...course, status: 'PUBLISHED' },
    });
  }
  console.log(`Seeded ${COURSE_SEED.length} courses.`);
}

async function main(): Promise<void> {
  await seedRoles();
  await seedSuperAdmin();
  await seedCourses();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
