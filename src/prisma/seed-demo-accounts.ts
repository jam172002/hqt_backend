import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_CODES } from '../modules/auth/constants/roles.constant';

// Standalone script for manually verifying the hqt_mobile app end-to-end
// (login as a real student/parent, not just a teacher) - see seed.ts for
// why this bypasses Nest's DI container.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD_SALT_ROUNDS = 12;
const DEMO_PASSWORD = 'ChangeMe123!';

async function main(): Promise<void> {
  const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE_CODES.STUDENT } });
  const parentRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE_CODES.PARENT } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, PASSWORD_SALT_ROUNDS);

  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { firstName: 'Ahmed', lastName: 'Khan', status: 'ACTIVE' },
  });
  const course = await prisma.course.findUniqueOrThrow({ where: { slug: 'quran-reading' } });

  const studentUser = await prisma.user.upsert({
    where: { email: 'demo.student@hqt.local' },
    update: {},
    create: {
      email: 'demo.student@hqt.local',
      password: passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: studentRole.id } },
    },
  });
  const studentProfile = await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      firstName: 'Zara',
      lastName: 'Malik',
      countryCode: 'US',
      timezone: 'America/New_York',
      status: 'ACTIVE',
    },
  });

  const parentUser = await prisma.user.upsert({
    where: { email: 'demo.parent@hqt.local' },
    update: {},
    create: {
      email: 'demo.parent@hqt.local',
      password: passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: parentRole.id } },
    },
  });
  const parentProfile = await prisma.parentProfile.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      userId: parentUser.id,
      firstName: 'Hassan',
      lastName: 'Malik',
      countryCode: 'US',
      timezone: 'America/New_York',
    },
  });

  await prisma.parentStudentRelationship.upsert({
    where: { parentId_studentId: { parentId: parentProfile.id, studentId: studentProfile.id } },
    update: {},
    create: {
      parentId: parentProfile.id,
      studentId: studentProfile.id,
      relationshipType: 'FATHER',
      isPrimary: true,
    },
  });

  let enrollment = await prisma.enrollment.findFirst({
    where: { studentId: studentProfile.id, courseId: course.id },
  });
  enrollment ??= await prisma.enrollment.create({
    data: {
      studentId: studentProfile.id,
      courseId: course.id,
      teacherId: teacher.id,
      status: 'ACTIVE',
      startedAt: new Date(),
      studentTimezone: studentProfile.timezone,
    },
  });

  const upcomingStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const existingSession = await prisma.classSession.findFirst({ where: { enrollmentId: enrollment.id } });
  if (!existingSession) {
    await prisma.classSession.create({
      data: {
        enrollmentId: enrollment.id,
        studentId: studentProfile.id,
        teacherId: teacher.id,
        courseId: course.id,
        scheduledStartAt: upcomingStart,
        scheduledEndAt: new Date(upcomingStart.getTime() + 30 * 60 * 1000),
        status: 'SCHEDULED',
        meetingProvider: 'ZOOM',
        meetingUrl: 'https://zoom.us/j/demo-session',
      },
    });
  }

  const existingHomework = await prisma.homework.findFirst({ where: { enrollmentId: enrollment.id } });
  if (!existingHomework) {
    await prisma.homework.create({
      data: {
        enrollmentId: enrollment.id,
        studentId: studentProfile.id,
        teacherId: teacher.id,
        title: 'Practice Surah Al-Fatiha',
        description: 'Recite Surah Al-Fatiha five times daily and record any difficult letters.',
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'ASSIGNED',
      },
    });
  }

  const existingInvoice = await prisma.invoice.findFirst({ where: { enrollmentId: enrollment.id } });
  if (!existingInvoice) {
    await prisma.invoice.create({
      data: {
        invoiceNumber: `DEMO-${Date.now()}`,
        studentId: studentProfile.id,
        parentId: parentProfile.id,
        enrollmentId: enrollment.id,
        currency: 'USD',
        subtotal: 80,
        total: 80,
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'PENDING',
      },
    });
  }

  for (const [userId, title, body] of [
    [studentUser.id, 'Welcome to Hafiz Quran Tutor', 'Your first class is scheduled - check your upcoming classes.'],
    [parentUser.id, "Zara's enrollment confirmed", 'Zara has been enrolled in Quran Reading with Ahmed Khan.'],
  ] as const) {
    const existing = await prisma.notification.findFirst({ where: { userId, title } });
    if (!existing) {
      await prisma.notification.create({
        data: { userId, type: 'GENERAL', title, body, channel: 'IN_APP', status: 'SENT', sentAt: new Date() },
      });
    }
  }

  console.log('Demo accounts ready:');
  console.log('  Student: demo.student@hqt.local / ' + DEMO_PASSWORD);
  console.log('  Parent:  demo.parent@hqt.local / ' + DEMO_PASSWORD);
  console.log('  Teacher: ahmed.khan@hqt.local (pre-existing e2e fixture, password unknown) - use fatima.noor@hqt.local / ' + DEMO_PASSWORD + ' instead');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
