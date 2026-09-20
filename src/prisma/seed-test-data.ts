import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_CODES } from '../modules/auth/constants/roles.constant';

// Complete QA data set: one login per role plus records in every status so
// each website/admin/mobile use case has something to act on. Idempotent -
// re-running refreshes the time-relative records (sessions, homework, ...)
// and never duplicates accounts. All test logins share TEST_ACCOUNTS_PASSWORD.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = process.env.TEST_ACCOUNTS_PASSWORD;
const SALT_ROUNDS = 12;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const at = (offsetMs: number): Date => new Date(Date.now() + offsetMs);
const timeOnly = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00.000Z`);

async function upsertUser(email: string, roleCode: string, passwordHash: string): Promise<string> {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: passwordHash, status: 'ACTIVE' },
    create: { email, password: passwordHash, status: 'ACTIVE', roles: { create: { roleId: role.id } } },
  });
  return user.id;
}

// ---------------------------------------------------------------------------
// Pricing packages (public Pricing page)
// ---------------------------------------------------------------------------
async function seedPackages(): Promise<Record<string, string>> {
  const defs = [
    { name: 'Basic', description: '2 one-to-one classes per week - ideal for beginners.', classes: 8, minutes: 30, price: 40, status: 'ACTIVE', period: 'MONTHLY' },
    { name: 'Standard', description: '3 one-to-one classes per week with monthly progress report.', classes: 12, minutes: 30, price: 60, status: 'ACTIVE', period: 'MONTHLY' },
    { name: 'Premium', description: '5 one-to-one classes per week, priority scheduling and weekly parent report.', classes: 20, minutes: 45, price: 110, status: 'ACTIVE', period: 'MONTHLY' },
    { name: 'Premium Yearly (retired)', description: 'Legacy yearly plan - kept inactive to test hiding packages.', classes: 240, minutes: 45, price: 1000, status: 'INACTIVE', period: 'YEARLY' },
  ] as const;
  const ids: Record<string, string> = {};
  for (const d of defs) {
    const existing = await prisma.package.findFirst({ where: { name: d.name } });
    const data = {
      name: d.name,
      description: d.description,
      classesPerPeriod: d.classes,
      classDurationMin: d.minutes,
      billingPeriod: d.period,
      price: d.price,
      currency: 'USD',
      status: d.status,
    } as const;
    const pkg = existing
      ? await prisma.package.update({ where: { id: existing.id }, data })
      : await prisma.package.create({ data });
    ids[d.name] = pkg.id;
  }
  console.log(`Packages: ${Object.keys(ids).length}`);
  return ids;
}

// ---------------------------------------------------------------------------
// Teachers: known password + weekly availability + one unavailable window
// ---------------------------------------------------------------------------
async function seedTeacherAccessAndAvailability(passwordHash: string): Promise<Record<string, string>> {
  const teachers = await prisma.teacherProfile.findMany({
    where: { status: 'ACTIVE' },
    include: { user: true },
  });
  const byFirstName: Record<string, string> = {};
  for (const t of teachers) {
    if (!t.user.email?.endsWith('@hqt.local')) continue;
    // The curated teachers were first seeded with the public default
    // password - replace it so they aren't guessable on a live server.
    await prisma.user.update({ where: { id: t.userId }, data: { password: passwordHash } });
    byFirstName[t.firstName] = t.id;

    await prisma.teacherAvailabilityRule.deleteMany({ where: { teacherId: t.id } });
    for (const dayOfWeek of [1, 2, 3, 4, 5]) {
      await prisma.teacherAvailabilityRule.create({
        data: {
          teacherId: t.id,
          dayOfWeek,
          startTime: timeOnly('16:00'),
          endTime: timeOnly('21:00'),
          timezone: t.timezone,
          isActive: true,
        },
      });
    }
    await prisma.teacherAvailabilityRule.create({
      data: { teacherId: t.id, dayOfWeek: 6, startTime: timeOnly('10:00'), endTime: timeOnly('14:00'), timezone: t.timezone, isActive: false },
    });
    await prisma.teacherAvailabilityException.deleteMany({ where: { teacherId: t.id } });
    await prisma.teacherAvailabilityException.create({
      data: { teacherId: t.id, startsAt: at(10 * DAY), endsAt: at(12 * DAY), type: 'UNAVAILABLE', reason: 'Annual leave' },
    });
  }
  console.log(`Teacher logins refreshed + availability set: ${Object.keys(byFirstName).join(', ')}`);
  return byFirstName;
}

// ---------------------------------------------------------------------------
// Students / parents / enrollments
// ---------------------------------------------------------------------------
interface StudentDef {
  email: string;
  first: string;
  last: string;
  country: string;
  tz: string;
  gender: 'MALE' | 'FEMALE';
  dob: string;
  status?: 'ACTIVE' | 'INACTIVE';
}
interface ParentDef {
  email: string;
  first: string;
  last: string;
  country: string;
  tz: string;
  children: Array<{ student: string; relation: 'MOTHER' | 'FATHER' | 'GUARDIAN'; canViewPayments?: boolean }>;
}

const STUDENTS: StudentDef[] = [
  { email: 'test.student1@hqt.local', first: 'Zara', last: 'Malik', country: 'US', tz: 'America/New_York', gender: 'FEMALE', dob: '2015-04-12' },
  { email: 'test.student2@hqt.local', first: 'Yusuf', last: 'Rahman', country: 'GB', tz: 'Europe/London', gender: 'MALE', dob: '1994-09-03' },
  { email: 'test.student3@hqt.local', first: 'Aisha', last: 'Siddiqui', country: 'CA', tz: 'America/Toronto', gender: 'FEMALE', dob: '2012-01-25' },
  { email: 'test.student4@hqt.local', first: 'Hamza', last: 'Siddiqui', country: 'CA', tz: 'America/Toronto', gender: 'MALE', dob: '2016-07-08' },
  { email: 'test.student5@hqt.local', first: 'Mariam', last: 'Khalid', country: 'AU', tz: 'Australia/Sydney', gender: 'FEMALE', dob: '2010-11-30' },
  { email: 'test.student6@hqt.local', first: 'Inactive', last: 'Learner', country: 'PK', tz: 'Asia/Karachi', gender: 'MALE', dob: '2011-02-14', status: 'INACTIVE' },
];

const PARENTS: ParentDef[] = [
  { email: 'test.parent1@hqt.local', first: 'Hassan', last: 'Malik', country: 'US', tz: 'America/New_York', children: [{ student: 'Zara', relation: 'FATHER' }] },
  { email: 'test.parent2@hqt.local', first: 'Sana', last: 'Siddiqui', country: 'CA', tz: 'America/Toronto', children: [{ student: 'Aisha', relation: 'MOTHER' }, { student: 'Hamza', relation: 'MOTHER', canViewPayments: false }] },
  { email: 'test.parent3@hqt.local', first: 'Khalid', last: 'Mahmood', country: 'AU', tz: 'Australia/Sydney', children: [{ student: 'Mariam', relation: 'GUARDIAN' }] },
];

interface EnrollmentDef {
  student: string;
  courseSlug: string;
  teacher: string;
  status: 'ACTIVE' | 'TRIAL' | 'PENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  pkg?: string;
  withActivity: boolean;
}

const ENROLLMENTS: EnrollmentDef[] = [
  { student: 'Zara', courseSlug: 'quran-reading', teacher: 'Ahmed', status: 'ACTIVE', pkg: 'Standard', withActivity: true },
  { student: 'Zara', courseSlug: 'noorani-qaida', teacher: 'Bilal', status: 'COMPLETED', pkg: 'Basic', withActivity: true },
  { student: 'Yusuf', courseSlug: 'tajweed', teacher: 'Layla', status: 'ACTIVE', pkg: 'Premium', withActivity: true },
  { student: 'Aisha', courseSlug: 'hifz-ul-quran', teacher: 'Omar', status: 'ACTIVE', pkg: 'Premium', withActivity: true },
  { student: 'Hamza', courseSlug: 'noorani-qaida', teacher: 'Bilal', status: 'ACTIVE', pkg: 'Basic', withActivity: true },
  { student: 'Mariam', courseSlug: 'quran-translation', teacher: 'Fatima', status: 'TRIAL', withActivity: false },
  { student: 'Mariam', courseSlug: 'islamic-studies', teacher: 'Yusuf', status: 'PAUSED', pkg: 'Basic', withActivity: false },
  { student: 'Inactive', courseSlug: 'quran-reading', teacher: 'Maryam', status: 'CANCELLED', withActivity: false },
  { student: 'Yusuf', courseSlug: 'islamic-studies', teacher: 'Yusuf', status: 'PENDING', withActivity: false },
];

async function seedPeople(passwordHash: string): Promise<{
  students: Record<string, { id: string; userId: string; tz: string }>;
  parents: Record<string, { id: string; userId: string }>;
}> {
  const students: Record<string, { id: string; userId: string; tz: string }> = {};
  for (const s of STUDENTS) {
    const userId = await upsertUser(s.email, ROLE_CODES.STUDENT, passwordHash);
    const data = {
      firstName: s.first,
      lastName: s.last,
      dateOfBirth: new Date(s.dob),
      gender: s.gender,
      countryCode: s.country,
      timezone: s.tz,
      status: s.status ?? 'ACTIVE',
    } as const;
    const profile = await prisma.studentProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    if (s.status === 'INACTIVE') {
      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    }
    students[s.first] = { id: profile.id, userId, tz: s.tz };
  }

  const parents: Record<string, { id: string; userId: string }> = {};
  for (const p of PARENTS) {
    const userId = await upsertUser(p.email, ROLE_CODES.PARENT, passwordHash);
    const data = { firstName: p.first, lastName: p.last, countryCode: p.country, timezone: p.tz };
    const profile = await prisma.parentProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    parents[p.first] = { id: profile.id, userId };
    for (const c of p.children) {
      await prisma.parentStudentRelationship.upsert({
        where: { parentId_studentId: { parentId: profile.id, studentId: students[c.student].id } },
        update: { relationshipType: c.relation, canViewPayments: c.canViewPayments ?? true },
        create: {
          parentId: profile.id,
          studentId: students[c.student].id,
          relationshipType: c.relation,
          isPrimary: true,
          canViewPayments: c.canViewPayments ?? true,
        },
      });
    }
  }
  console.log(`Students: ${STUDENTS.length}, parents: ${PARENTS.length}`);
  return { students, parents };
}

// ---------------------------------------------------------------------------
// Learning activity: sessions, attendance, lessons, progress, homework, billing
// ---------------------------------------------------------------------------
type Ctx = Awaited<ReturnType<typeof seedPeople>> & {
  teachers: Record<string, string>;
  packages: Record<string, string>;
};

async function seedEnrollmentsAndActivity(ctx: Ctx): Promise<Record<string, string>> {
  const enrollmentIds: Record<string, string> = {};

  for (const def of ENROLLMENTS) {
    const student = ctx.students[def.student];
    const course = await prisma.course.findUniqueOrThrow({ where: { slug: def.courseSlug } });
    const teacherId = ctx.teachers[def.teacher];

    let enrollment = await prisma.enrollment.findFirst({ where: { studentId: student.id, courseId: course.id } });
    const data = {
      teacherId,
      packageId: def.pkg ? ctx.packages[def.pkg] : null,
      status: def.status,
      startedAt: def.status === 'PENDING' ? null : at(-45 * DAY),
      endedAt: def.status === 'COMPLETED' || def.status === 'CANCELLED' ? at(-3 * DAY) : null,
      studentTimezone: student.tz,
    };
    enrollment = enrollment
      ? await prisma.enrollment.update({ where: { id: enrollment.id }, data })
      : await prisma.enrollment.create({ data: { studentId: student.id, courseId: course.id, ...data } });
    enrollmentIds[`${def.student}:${def.courseSlug}`] = enrollment.id;

    if (!def.withActivity) continue;
    await seedActivity({ enrollmentId: enrollment.id, studentId: student.id, teacherId, courseId: course.id, def, ctx });
  }
  console.log(`Enrollments: ${ENROLLMENTS.length}`);
  return enrollmentIds;
}

async function seedActivity(args: {
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  def: EnrollmentDef;
  ctx: Ctx;
}): Promise<void> {
  const { enrollmentId, studentId, teacherId, courseId, def, ctx } = args;
  const completedEnrollment = def.status === 'COMPLETED';

  // Wipe time-relative records for this enrollment so re-runs stay tidy.
  await prisma.homeworkSubmission.deleteMany({ where: { homework: { enrollmentId } } });
  await prisma.homework.deleteMany({ where: { enrollmentId } });
  await prisma.attendanceRecord.deleteMany({ where: { classSession: { enrollmentId } } });
  await prisma.lessonRecord.deleteMany({ where: { classSession: { enrollmentId } } });
  await prisma.classSession.deleteMany({ where: { enrollmentId } });
  await prisma.progressHistory.deleteMany({ where: { enrollmentId } });
  await prisma.studentProgress.deleteMany({ where: { enrollmentId } });

  const session = async (offsetMs: number, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'RESCHEDULED') =>
    prisma.classSession.create({
      data: {
        enrollmentId,
        studentId,
        teacherId,
        courseId,
        scheduledStartAt: at(offsetMs),
        scheduledEndAt: at(offsetMs + 30 * 60 * 1000),
        status,
        meetingProvider: 'ZOOM',
        meetingUrl: `https://zoom.us/j/${Math.floor(100000000 + Math.random() * 899999999)}`,
        ...(status === 'CANCELLED' ? { cancelledAt: at(offsetMs - DAY), cancellationReason: 'Teacher unavailable' } : {}),
      },
    });

  // Past completed classes with a mix of attendance outcomes.
  const attendanceMix = ['PRESENT', 'PRESENT', 'LATE', 'EXCUSED', 'ABSENT'] as const;
  const lessonTitles = ['Makharij review', 'Surah Al-Fatiha recitation', 'Rules of Noon Sakinah', 'Short surahs revision', 'Tajweed practice'];
  const pastSessions = [];
  for (let i = 0; i < attendanceMix.length; i++) {
    const s = await session(-(i + 1) * 2 * DAY, 'COMPLETED');
    pastSessions.push(s);
    await prisma.attendanceRecord.create({
      data: {
        classSessionId: s.id,
        studentId,
        status: attendanceMix[i],
        markedByTeacherId: teacherId,
        notes: attendanceMix[i] === 'EXCUSED' ? 'Family event - informed in advance' : null,
      },
    });
    if (attendanceMix[i] !== 'ABSENT') {
      await prisma.lessonRecord.create({
        data: {
          classSessionId: s.id,
          studentId,
          teacherId,
          enrollmentId,
          title: lessonTitles[i],
          content: `Covered: ${lessonTitles[i]}. Student practised reading with correct pronunciation.`,
          teacherNotes: 'Keep practising 10 minutes daily.',
          performanceRating: 6 + (i % 4),
          generalRemarks: i === 0 ? 'Very attentive and eager to learn.' : null,
        },
      });
    }
  }
  await session(-9 * DAY, 'NO_SHOW');
  await session(-11 * DAY, 'CANCELLED');

  if (!completedEnrollment) {
    // Joinable-soon class, plus upcoming, cancelled and rescheduled ones.
    await session(15 * 60 * 1000, 'SCHEDULED');
    await session(DAY, 'SCHEDULED');
    await session(3 * DAY, 'SCHEDULED');
    await session(5 * DAY, 'SCHEDULED');
    await session(7 * DAY, 'CANCELLED');
    await session(8 * DAY, 'RESCHEDULED');
  }

  // Progress + history (Quran/tajweed/hifz numbers).
  const progress = await prisma.studentProgress.create({
    data: {
      enrollmentId,
      currentLesson: 'Surah Al-Baqarah - Ayah 1 to 5',
      currentSurah: 2,
      currentAyah: 5,
      tajweedProgress: 62.5,
      hifzProgress: def.courseSlug === 'hifz-ul-quran' ? 35 : 20,
      performance: 78,
      remarks: 'Steady improvement; focus on elongation (madd) rules.',
      updatedByTeacherId: teacherId,
    },
  });
  for (const [i, pct] of [40, 50, 62.5].entries()) {
    await prisma.progressHistory.create({
      data: {
        studentProgressId: progress.id,
        enrollmentId,
        currentLesson: `Checkpoint ${i + 1}`,
        currentSurah: 1 + i,
        currentAyah: 3 + i,
        tajweedProgress: pct,
        hifzProgress: 10 + i * 5,
        performance: 60 + i * 8,
        remarks: `Progress snapshot ${i + 1}`,
        changedByTeacherId: teacherId,
      },
    });
  }

  // Homework in every state.
  const hw = async (
    title: string,
    dueOffset: number,
    status: 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED' | 'OVERDUE',
    submission?: { status: 'PENDING_REVIEW' | 'APPROVED' | 'NEEDS_REVISION'; feedback?: string },
  ) => {
    const h = await prisma.homework.create({
      data: {
        enrollmentId,
        studentId,
        teacherId,
        title,
        description: `${title}: complete and be ready to recite in the next class.`,
        dueAt: at(dueOffset),
        status,
      },
    });
    if (submission) {
      await prisma.homeworkSubmission.create({
        data: {
          homeworkId: h.id,
          studentId,
          content: 'I practised daily and recorded my recitation.',
          status: submission.status,
          teacherFeedback: submission.feedback ?? null,
          reviewedAt: submission.status === 'PENDING_REVIEW' ? null : at(-DAY),
        },
      });
    }
  };
  await hw('Practise Surah Al-Fatiha', 3 * DAY, 'ASSIGNED');
  await hw('Memorise Surah Al-Ikhlas', 5 * DAY, 'IN_PROGRESS');
  await hw('Recite Ayat al-Kursi', -1 * DAY, 'SUBMITTED', { status: 'PENDING_REVIEW' });
  await hw('Noon Sakinah worksheet', -4 * DAY, 'COMPLETED', { status: 'APPROVED', feedback: 'Excellent work, mashaAllah!' });
  await hw('Makharij drill', -2 * DAY, 'SUBMITTED', { status: 'NEEDS_REVISION', feedback: 'Please retry the letters Qaf and Kaf.' });
  await hw('Surah Al-Asr translation', -6 * DAY, 'OVERDUE');

  // Invoices in every status (student's primary parent gets them too).
  const link = await prisma.parentStudentRelationship.findFirst({ where: { studentId, isPrimary: true } });
  const invoice = async (
    number: string,
    status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED',
    dueOffset: number,
    items: Array<{ description: string; quantity: number; unitPrice: number }>,
    extras: { discount?: number; tax?: number } = {},
  ) => {
    const existing = await prisma.invoice.findUnique({ where: { invoiceNumber: number } });
    if (existing) {
      await prisma.payment.deleteMany({ where: { invoiceId: existing.id } });
      await prisma.invoice.delete({ where: { id: existing.id } });
    }
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const discount = extras.discount ?? 0;
    const tax = extras.tax ?? 0;
    const total = subtotal - discount + tax;
    const created = await prisma.invoice.create({
      data: {
        invoiceNumber: number,
        studentId,
        parentId: link?.parentId ?? null,
        enrollmentId,
        packageId: def.pkg ? ctx.packages[def.pkg] : null,
        currency: 'USD',
        subtotal,
        discount,
        tax,
        total,
        issuedAt: at(dueOffset - 7 * DAY),
        dueAt: at(dueOffset),
        paidAt: status === 'PAID' || status === 'REFUNDED' ? at(dueOffset - 5 * DAY) : null,
        status,
        notes: status === 'CANCELLED' ? 'Cancelled - duplicate invoice' : null,
        items: { create: items.map((i) => ({ ...i, amount: i.quantity * i.unitPrice })) },
      },
    });
    if (status === 'PAID' || status === 'REFUNDED') {
      await prisma.payment.create({
        data: {
          invoiceId: created.id,
          studentId,
          parentId: link?.parentId ?? null,
          amount: total,
          currency: 'USD',
          status: status === 'PAID' ? 'COMPLETED' : 'REFUNDED',
          paymentMethod: 'BANK_TRANSFER',
          paidAt: at(dueOffset - 5 * DAY),
        },
      });
    }
  };
  const tag = enrollmentId.slice(0, 8).toUpperCase();
  await invoice(`TST-${tag}-1`, 'PENDING', 6 * DAY, [{ description: 'Monthly tuition', quantity: 1, unitPrice: 60 }]);
  await invoice(`TST-${tag}-2`, 'PAID', -20 * DAY, [{ description: 'Monthly tuition', quantity: 1, unitPrice: 60 }, { description: 'Registration fee', quantity: 1, unitPrice: 10 }], { discount: 5 });
  await invoice(`TST-${tag}-3`, 'OVERDUE', -8 * DAY, [{ description: 'Monthly tuition', quantity: 1, unitPrice: 60 }], { tax: 3 });
  await invoice(`TST-${tag}-4`, 'CANCELLED', -30 * DAY, [{ description: 'Extra classes', quantity: 4, unitPrice: 8 }]);
  await invoice(`TST-${tag}-5`, 'REFUNDED', -40 * DAY, [{ description: 'Monthly tuition', quantity: 1, unitPrice: 60 }]);
  void pastSessions;
}

// ---------------------------------------------------------------------------
// CRM: trial requests + contact inquiries in every status
// ---------------------------------------------------------------------------
async function seedCrm(teachers: Record<string, string>): Promise<void> {
  const admin = await prisma.user.findFirst({ where: { roles: { some: { role: { code: ROLE_CODES.SUPER_ADMIN } } } } });
  const course = async (slug: string) => (await prisma.course.findUniqueOrThrow({ where: { slug } })).id;

  await prisma.trialSession.deleteMany({ where: { trialRequest: { source: 'qa-seed' } } });
  await prisma.trialRequest.deleteMany({ where: { source: 'qa-seed' } });

  const defs = [
    { name: 'Amina Yusuf', age: 8, guardian: 'Yusuf Ali', country: 'US', wa: '+12025550111', email: 'amina.parent@example.com', slug: 'noorani-qaida', days: ['Mon', 'Wed'], time: '17:00', tz: 'America/Chicago', status: 'NEW', msg: 'My daughter is a complete beginner.' },
    { name: 'Omar Farooq', age: 35, guardian: null, country: 'GB', wa: '+447700900123', email: 'omar.f@example.com', slug: 'quran-reading', days: ['Sat', 'Sun'], time: '10:00', tz: 'Europe/London', status: 'CONTACTED', msg: 'Adult learner - want to fix my recitation.' },
    { name: 'Hana Ibrahim', age: 11, guardian: 'Ibrahim Saeed', country: 'AE', wa: '+971500000123', email: null, slug: 'tajweed', days: ['Tue', 'Thu'], time: '18:30', tz: 'Asia/Dubai', status: 'TRIAL_SCHEDULED', msg: null },
    { name: 'Bilal Chaudhry', age: 14, guardian: 'Nadia Chaudhry', country: 'CA', wa: '+14165550188', email: 'nadia.c@example.com', slug: 'hifz-ul-quran', days: ['Fri'], time: '19:00', tz: 'America/Toronto', status: 'TRIAL_COMPLETED', msg: 'Interested in the full Hifz programme.' },
    { name: 'Sara Ahmed', age: 9, guardian: 'Ahmed Raza', country: 'AU', wa: '+61400000777', email: 'raza@example.com', slug: 'quran-translation', days: ['Mon', 'Tue', 'Wed'], time: '16:00', tz: 'Australia/Sydney', status: 'ENROLLED', msg: null },
    { name: 'Test Rejected', age: 40, guardian: null, country: 'DE', wa: '+491700000000', email: null, slug: 'islamic-studies', days: ['Sun'], time: '12:00', tz: 'Europe/Berlin', status: 'REJECTED', msg: 'Outside supported schedule.' },
    { name: 'Closed Lead', age: 12, guardian: 'Parent Closed', country: 'PK', wa: '+923001112233', email: 'closed@example.com', slug: 'quran-reading', days: ['Mon'], time: '20:00', tz: 'Asia/Karachi', status: 'CLOSED', msg: 'No response after 3 attempts.' },
    { name: 'Ismail Noor', age: 7, guardian: 'Noor Hassan', country: 'ZA', wa: '+27820000123', email: 'noor.h@example.com', slug: 'noorani-qaida', days: ['Thu'], time: '15:00', tz: 'Africa/Johannesburg', status: 'NEW', msg: 'Special requirement: prefers a female teacher.' },
  ] as const;

  for (const d of defs) {
    const courseId = await course(d.slug);
    const request = await prisma.trialRequest.create({
      data: {
        studentName: d.name,
        studentAge: d.age,
        guardianName: d.guardian,
        countryCode: d.country,
        whatsapp: d.wa,
        email: d.email,
        courseId,
        preferredDays: [...d.days] as Prisma.InputJsonValue,
        preferredTime: timeOnly(d.time),
        timezone: d.tz,
        message: d.msg,
        specialRequirements: d.msg?.startsWith('Special') ? d.msg : null,
        status: d.status,
        assignedAdminId: d.status === 'NEW' ? null : (admin?.id ?? null),
        source: 'qa-seed',
      },
    });
    if (d.status === 'TRIAL_SCHEDULED' || d.status === 'TRIAL_COMPLETED' || d.status === 'ENROLLED') {
      const start = d.status === 'TRIAL_SCHEDULED' ? at(2 * DAY) : at(-3 * DAY);
      await prisma.trialSession.create({
        data: {
          trialRequestId: request.id,
          teacherId: teachers['Ahmed'] ?? null,
          courseId,
          scheduledStartAt: start,
          scheduledEndAt: new Date(start.getTime() + 20 * 60 * 1000),
          timezone: d.tz,
          meetingProvider: 'ZOOM',
          meetingUrl: 'https://zoom.us/j/trial-demo',
          status: d.status === 'TRIAL_SCHEDULED' ? 'SCHEDULED' : 'COMPLETED',
          notes: 'Free trial class',
        },
      });
    }
  }

  await prisma.contactInquiry.deleteMany({ where: { subject: { startsWith: '[QA]' } } });
  const inquiries = [
    { name: 'Fatima Zahra', email: 'fatima.z@example.com', whatsapp: '+15551230001', subject: '[QA] Class timings for adults', message: 'Do you offer weekend evening classes for adults in the UK?', status: 'NEW' },
    { name: 'Ali Hassan', email: 'ali.h@example.com', phone: '+15551230002', subject: '[QA] Fee structure', message: 'Could you send the fee details for two siblings?', status: 'IN_PROGRESS' },
    { name: 'Noor Jahan', email: 'noor.j@example.com', subject: '[QA] Teacher gender', message: 'Can my daughter be taught by a female teacher only?', status: 'RESOLVED' },
    { name: 'Ibrahim Khan', email: 'ibrahim.k@example.com', whatsapp: '+15551230004', subject: '[QA] Technical issue', message: 'The trial form showed an error on my phone.', status: 'CLOSED' },
    { name: 'Layla Karim', email: 'layla.k@example.com', subject: '[QA] Certificate', message: 'Do you provide completion certificates?', status: 'NEW' },
  ] as const;
  for (const i of inquiries) {
    await prisma.contactInquiry.create({ data: { ...i, assignedAdminId: i.status === 'NEW' ? null : (admin?.id ?? null) } });
  }
  console.log(`Trial requests: ${defs.length}, contact inquiries: ${inquiries.length}`);
}

// ---------------------------------------------------------------------------
// Extra CMS states (hidden / draft) so publish-unpublish flows can be tested
// ---------------------------------------------------------------------------
async function seedCmsStates(): Promise<void> {
  const extraTestimonials = [
    { name: 'Draft Reviewer (QA)', countryCode: 'US', rating: 4, review: 'A draft testimonial used to test publishing.', category: 'PARENT', status: 'DRAFT' },
    { name: 'Hidden Reviewer (QA)', countryCode: 'GB', rating: 5, review: 'A hidden testimonial used to test unhiding.', category: 'ADULT_STUDENT', status: 'HIDDEN' },
    { name: 'Hifz Parent (QA)', countryCode: 'CA', rating: 5, review: 'My son completed Juz Amma with Ustadh Omar, alhamdulillah.', category: 'HIFZ_STUDENT', status: 'PUBLISHED' },
  ] as const;
  for (const t of extraTestimonials) {
    const existing = await prisma.testimonial.findFirst({ where: { name: t.name } });
    if (existing) await prisma.testimonial.update({ where: { id: existing.id }, data: t });
    else await prisma.testimonial.create({ data: { ...t, sortOrder: 90 } });
  }
  const extraFaqs = [
    { question: 'Draft FAQ (QA) - not visible on the website', answer: 'Used to test publishing an FAQ.', status: 'DRAFT' },
    { question: 'Hidden FAQ (QA) - not visible on the website', answer: 'Used to test unhiding an FAQ.', status: 'HIDDEN' },
  ] as const;
  for (const f of extraFaqs) {
    const existing = await prisma.faq.findFirst({ where: { question: f.question } });
    if (existing) await prisma.faq.update({ where: { id: existing.id }, data: f });
    else await prisma.faq.create({ data: { ...f, sortOrder: 90 } });
  }
  console.log('CMS: draft/hidden testimonials and FAQs added');
}

// ---------------------------------------------------------------------------
// Messaging, announcements and notifications
// ---------------------------------------------------------------------------
async function seedCommunication(teachers: Record<string, string>): Promise<void> {
  const admin = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { code: ROLE_CODES.SUPER_ADMIN } } } } });
  const userOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const ahmed = await userOf('ahmed.khan@hqt.local');
  const parent1 = await userOf('test.parent1@hqt.local');
  const student1 = await userOf('test.student1@hqt.local');

  const titles = ['QA: Ahmed <-> Zara family', 'QA: Ahmed <-> Zara'];
  await prisma.conversation.deleteMany({ where: { title: { in: titles } } });
  const talk = async (title: string, users: string[], messages: Array<[string, string]>) => {
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        title,
        participants: { create: users.map((userId) => ({ userId })) },
      },
    });
    for (const [i, [senderId, body]] of messages.entries()) {
      await prisma.message.create({ data: { conversationId: conv.id, senderId, body, createdAt: at(-(messages.length - i) * HOUR) } });
    }
  };
  await talk(titles[0], [ahmed, parent1], [
    [ahmed, "Assalamu alaikum, Zara did very well in today's class, mashaAllah."],
    [parent1, 'Jazakallah khair! Should she revise Surah Al-Ikhlas this week?'],
    [ahmed, 'Yes please, ten minutes daily. I have added homework.'],
  ]);
  await talk(titles[1], [ahmed, student1], [
    [ahmed, 'Zara, please record your recitation of Ayat al-Kursi before Friday.'],
    [student1, 'InshaAllah, I will send it tomorrow.'],
  ]);

  const announcements = [
    { title: 'Welcome to Hafiz Quran Tutor', body: 'We are glad to have you. Classes run on the schedule shown in your dashboard.', status: 'PUBLISHED', targets: ['ALL_USERS'] },
    { title: 'Ramadan class timings', body: 'During Ramadan, evening classes start 30 minutes earlier. Check your schedule.', status: 'PUBLISHED', targets: ['ALL_STUDENTS', 'ALL_PARENTS'] },
    { title: 'Teachers: monthly progress reports', body: 'Please submit monthly progress updates by the 25th.', status: 'PUBLISHED', targets: ['ALL_TEACHERS'] },
    { title: 'Draft: Eid holiday notice', body: 'Draft only - not yet published.', status: 'DRAFT', targets: ['ALL_USERS'] },
  ] as const;
  await prisma.announcementTarget.deleteMany({ where: { announcement: { title: { in: announcements.map((a) => a.title) } } } });
  await prisma.announcement.deleteMany({ where: { title: { in: announcements.map((a) => a.title) } } });
  for (const a of announcements) {
    await prisma.announcement.create({
      data: {
        title: a.title,
        body: a.body,
        status: a.status,
        publishedAt: a.status === 'PUBLISHED' ? at(-DAY) : null,
        createdBy: admin.id,
        targets: { create: a.targets.map((targetType) => ({ targetType })) },
      },
    });
  }

  const emails = ['test.student1@hqt.local', 'test.parent1@hqt.local', 'ahmed.khan@hqt.local'];
  for (const email of emails) {
    const userId = await userOf(email);
    await prisma.notification.deleteMany({ where: { userId, type: 'QA' } });
    const rows = [
      ['New homework assigned', 'Practise Surah Al-Fatiha is due in 3 days.', null],
      ['Class reminder', 'Your class starts in 15 minutes.', null],
      ['Payment received', 'Thank you - your invoice has been marked paid.', at(-2 * DAY)],
    ] as const;
    for (const [title, body, readAt] of rows) {
      await prisma.notification.create({
        data: { userId, type: 'QA', title, body, channel: 'IN_APP', status: 'SENT', sentAt: at(-HOUR), readAt },
      });
    }
  }
  void teachers;
  console.log('Communication: 2 conversations, 4 announcements, notifications');
}

async function main(): Promise<void> {
  if (!PASSWORD || PASSWORD.length < 10) {
    throw new Error('Set TEST_ACCOUNTS_PASSWORD (min 10 chars) - it becomes the password of every test login.');
  }
  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  const packages = await seedPackages();
  const teachers = await seedTeacherAccessAndAvailability(passwordHash);
  const people = await seedPeople(passwordHash);
  await seedEnrollmentsAndActivity({ ...people, teachers, packages });
  await seedCrm(teachers);
  await seedCmsStates();
  await seedCommunication(teachers);

  console.log('\nTest logins (all use TEST_ACCOUNTS_PASSWORD):');
  console.log('  Teachers : ahmed.khan | bilal.ahmed | layla.hassan | omar.siddiqui | fatima.noor | yusuf.ibrahim | maryam.ali  @hqt.local');
  console.log('  Students : test.student1 ... test.student6 @hqt.local');
  console.log('  Parents  : test.parent1 ... test.parent3 @hqt.local');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
