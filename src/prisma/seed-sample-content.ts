import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROLE_CODES } from '../modules/auth/constants/roles.constant';

// Standalone script, outside Nest's DI container - see seed.ts for why.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD_SALT_ROUNDS = 12;
const SEED_SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@hqt.local';
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const SAMPLE_MEDIA_DIR = path.resolve(process.cwd(), 'sample-media');

// ---------------------------------------------------------------------------
// Junk cleanup - this dev database doubles as the e2e test target, which
// leaves behind fixture rows (repeated "A B" / "Sched Teacher" teachers,
// "What is E2E <uuid>?" FAQs, an "E2E Tester" testimonial). Courses already
// self-clean via soft-delete; these three tables have no delete endpoint,
// so cleanup means hiding via status rather than removing rows.
// ---------------------------------------------------------------------------

const JUNK_TEACHER_NAMES: Array<[string, string]> = [
  ['Sched', 'Teacher'],
  ['A', 'B'],
  ['Learn', 'Teacher'],
  ['C', 'D'],
  ['Comm', 'Teacher'],
];

async function hideJunkTeachers(): Promise<void> {
  const result = await prisma.teacherProfile.updateMany({
    where: { OR: JUNK_TEACHER_NAMES.map(([firstName, lastName]) => ({ firstName, lastName })) },
    data: { status: 'INACTIVE' },
  });
  console.log(`Deactivated ${result.count} junk teacher fixture rows.`);

  // The e2e "Ahmed Khan" fixture gets recreated on every test run; keep the
  // oldest copy as the real curated profile and deactivate the duplicates.
  const ahmedRows = await prisma.teacherProfile.findMany({
    where: { firstName: 'Ahmed', lastName: 'Khan', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (ahmedRows.length > 1) {
    const duplicateIds = ahmedRows.slice(1).map((row) => row.id);
    await prisma.teacherProfile.updateMany({ where: { id: { in: duplicateIds } }, data: { status: 'INACTIVE' } });
    console.log(`Deduplicated Ahmed Khan: kept 1, deactivated ${duplicateIds.length} duplicates.`);
  }
}

async function hideJunkContent(): Promise<void> {
  const faqResult = await prisma.faq.updateMany({
    where: { question: { startsWith: 'What is E2E' } },
    data: { status: 'HIDDEN' },
  });
  console.log(`Hid ${faqResult.count} junk e2e FAQs.`);

  const testimonialResult = await prisma.testimonial.updateMany({
    where: { name: { startsWith: 'E2E Tester' } },
    data: { status: 'HIDDEN' },
  });
  console.log(`Hid ${testimonialResult.count} junk e2e testimonials.`);
}

// ---------------------------------------------------------------------------
// Media - generated cover/avatar PNGs (see hqt_website/generate-sample-images.js)
// get copied into local storage and registered as MediaFile rows, matching
// exactly what MediaService.upload() would have produced.
// ---------------------------------------------------------------------------

async function registerImage(sourceFileName: string, uploadedBy: string): Promise<string> {
  const sourcePath = path.join(SAMPLE_MEDIA_DIR, sourceFileName);
  const buffer = await fs.readFile(sourcePath);
  const storageKey = `${randomUUID()}.png`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, storageKey), buffer);

  const mediaFile = await prisma.mediaFile.create({
    data: {
      storageProvider: 'local',
      storageKey,
      originalName: sourceFileName,
      mimeType: 'image/png',
      sizeBytes: BigInt(buffer.byteLength),
      visibility: 'PUBLIC',
      uploadedBy,
    },
  });
  return mediaFile.id;
}

async function attachImage(mediaFileId: string, entityType: string, entityId: string): Promise<void> {
  const existing = await prisma.mediaAttachment.findFirst({ where: { entityType, entityId } });
  if (existing) return; // already has an image from a previous run
  await prisma.mediaAttachment.create({ data: { mediaFileId, entityType, entityId } });
}

// ---------------------------------------------------------------------------
// Curated teachers
// ---------------------------------------------------------------------------

interface CuratedTeacher {
  firstName: string;
  lastName: string;
  bio: string;
  shortBio: string;
  qualification: string;
  experienceYears: number;
  teachingPhilosophy: string;
  countryCode: string;
  timezone: string;
  imageFile: string;
  courseSlugs: string[];
  email: string;
}

const CURATED_TEACHERS: CuratedTeacher[] = [
  {
    firstName: 'Ahmed',
    lastName: 'Khan',
    bio: 'Ahmed has spent the last ten years teaching Quran recitation and Tajweed to students of all ages, from complete beginners to those refining advanced recitation. He is known for his patience with young children and his structured, step-by-step teaching style.',
    shortBio: 'Patient, experienced Tajweed teacher.',
    qualification: 'Ijazah in Quran recitation, Al-Azhar University',
    experienceYears: 10,
    teachingPhilosophy: 'Every student learns at their own pace - my job is to meet them where they are.',
    countryCode: 'PK',
    timezone: 'Asia/Karachi',
    imageFile: 'teacher-ahmed-khan.png',
    courseSlugs: ['quran-reading', 'tajweed'],
    email: 'ahmed.khan@hqt.local',
  },
  {
    firstName: 'Bilal',
    lastName: 'Ahmed',
    bio: "Bilal is a Hifz specialist who has personally guided over thirty students to complete memorization of the Quran. He uses a structured revision cycle so students retain what they've memorized rather than just adding new pages.",
    shortBio: 'Hifz specialist with a structured revision method.',
    qualification: 'Ijazah in Hifz and Quran recitation',
    experienceYears: 8,
    teachingPhilosophy: 'Consistency beats intensity - a little revision every day builds a Hafiz.',
    countryCode: 'PK',
    timezone: 'Asia/Karachi',
    imageFile: 'teacher-bilal-ahmed.png',
    courseSlugs: ['hifz-ul-quran'],
    email: 'bilal.ahmed@hqt.local',
  },
  {
    firstName: 'Layla',
    lastName: 'Hassan',
    bio: 'Layla is a native Arabic speaker with five years of experience teaching Quran translation and Arabic linguistics to non-native speakers. She focuses on helping students connect with the meaning of what they recite, not just the pronunciation.',
    shortBio: 'Native Arabic speaker, translation and meaning specialist.',
    qualification: 'BA Arabic Linguistics, Al-Azhar University',
    experienceYears: 5,
    teachingPhilosophy: "Reciting is the first step - understanding what you recite is what makes it stay with you.",
    countryCode: 'EG',
    timezone: 'Africa/Cairo',
    imageFile: 'teacher-layla-hassan.png',
    courseSlugs: ['quran-translation', 'islamic-studies'],
    email: 'layla.hassan@hqt.local',
  },
  {
    firstName: 'Omar',
    lastName: 'Siddiqui',
    bio: 'Omar is a Tajweed expert who trained under traditional Ijazah scholars before moving to online teaching. He specializes in correcting long-standing pronunciation habits in adult learners.',
    shortBio: 'Tajweed expert focused on adult learners.',
    qualification: 'Ijazah in Quran recitation',
    experienceYears: 7,
    teachingPhilosophy: "It's never too late to correct your recitation - adult students just need a different pace.",
    countryCode: 'PK',
    timezone: 'Asia/Karachi',
    imageFile: 'teacher-omar-siddiqui.png',
    courseSlugs: ['tajweed', 'noorani-qaida'],
    email: 'omar.siddiqui@hqt.local',
  },
  {
    firstName: 'Fatima',
    lastName: 'Noor',
    bio: "Fatima specializes in teaching young children their first steps in reading Arabic through the Noorani Qaida. Her warm, encouraging style has made her especially popular with families new to online learning.",
    shortBio: "Children's Quran teacher, Noorani Qaida specialist.",
    qualification: 'Ijazah in Quran recitation, Diploma in Early Childhood Education',
    experienceYears: 6,
    teachingPhilosophy: 'Young children learn best through encouragement, repetition, and a teacher they trust.',
    countryCode: 'EG',
    timezone: 'Africa/Cairo',
    imageFile: 'teacher-fatima-noor.png',
    courseSlugs: ['noorani-qaida', 'quran-reading'],
    email: 'fatima.noor@hqt.local',
  },
  {
    firstName: 'Yusuf',
    lastName: 'Ibrahim',
    bio: 'Yusuf teaches Islamic Studies with a focus on making classical knowledge accessible and relevant to students growing up outside the Muslim world. He holds a degree in Islamic Studies and has taught both children and adults.',
    shortBio: 'Islamic Studies teacher, classical knowledge made accessible.',
    qualification: 'BA Islamic Studies',
    experienceYears: 9,
    teachingPhilosophy: 'Islamic knowledge should be taught in a way that connects to everyday life, not just memorized.',
    countryCode: 'TR',
    timezone: 'Europe/Istanbul',
    imageFile: 'teacher-yusuf-ibrahim.png',
    courseSlugs: ['islamic-studies'],
    email: 'yusuf.ibrahim@hqt.local',
  },
  {
    firstName: 'Maryam',
    lastName: 'Ali',
    bio: 'Maryam teaches Hifz to children and teenagers, with a gentle approach tailored to younger memorizers. She has been teaching online for four years and is comfortable coordinating with parents on progress.',
    shortBio: 'Hifz teacher for children and teenagers.',
    qualification: 'Ijazah in Hifz',
    experienceYears: 4,
    teachingPhilosophy: 'Young memorizers need short, focused sessions and lots of positive reinforcement.',
    countryCode: 'MY',
    timezone: 'Asia/Kuala_Lumpur',
    imageFile: 'teacher-maryam-ali.png',
    courseSlugs: ['hifz-ul-quran'],
    email: 'maryam.ali@hqt.local',
  },
];

async function seedCuratedTeachers(uploadedBy: string): Promise<void> {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE_CODES.TEACHER } });
  const defaultPasswordHash = await bcrypt.hash('ChangeMe123!', PASSWORD_SALT_ROUNDS);

  for (const teacher of CURATED_TEACHERS) {
    let profile = await prisma.teacherProfile.findFirst({
      where: { firstName: teacher.firstName, lastName: teacher.lastName, status: 'ACTIVE' },
    });

    if (profile) {
      profile = await prisma.teacherProfile.update({
        where: { id: profile.id },
        data: {
          bio: teacher.bio,
          shortBio: teacher.shortBio,
          qualification: teacher.qualification,
          experienceYears: teacher.experienceYears,
          teachingPhilosophy: teacher.teachingPhilosophy,
          countryCode: teacher.countryCode,
          timezone: teacher.timezone,
        },
      });
    } else {
      const user = await prisma.user.upsert({
        where: { email: teacher.email },
        update: {},
        create: {
          email: teacher.email,
          password: defaultPasswordHash,
          status: 'ACTIVE',
          roles: { create: { roleId: teacherRole.id } },
        },
      });
      profile = await prisma.teacherProfile.create({
        data: {
          userId: user.id,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          bio: teacher.bio,
          shortBio: teacher.shortBio,
          qualification: teacher.qualification,
          experienceYears: teacher.experienceYears,
          teachingPhilosophy: teacher.teachingPhilosophy,
          countryCode: teacher.countryCode,
          timezone: teacher.timezone,
          status: 'ACTIVE',
        },
      });
    }

    const mediaFileId = await registerImage(teacher.imageFile, uploadedBy);
    await attachImage(mediaFileId, 'TEACHER_PROFILE', profile.id);

    for (const slug of teacher.courseSlugs) {
      const course = await prisma.course.findUnique({ where: { slug } });
      if (!course) continue;
      await prisma.teacherCourse.upsert({
        where: { teacherId_courseId: { teacherId: profile.id, courseId: course.id } },
        update: {},
        create: { teacherId: profile.id, courseId: course.id },
      });
    }

    console.log(`Seeded teacher: ${teacher.firstName} ${teacher.lastName}`);
  }
}

// ---------------------------------------------------------------------------
// Courses - cover images, curriculum sections, per-course FAQs
// ---------------------------------------------------------------------------

const COURSE_IMAGE_FILES: Record<string, string> = {
  'quran-reading': 'course-quran-reading.png',
  'noorani-qaida': 'course-noorani-qaida.png',
  tajweed: 'course-tajweed.png',
  'hifz-ul-quran': 'course-hifz-ul-quran.png',
  'quran-translation': 'course-quran-translation.png',
  'islamic-studies': 'course-islamic-studies.png',
};

const COURSE_SECTIONS: Record<string, Array<{ title: string; description: string }>> = {
  'quran-reading': [
    { title: 'Arabic Letters & Sounds', description: 'Recognizing and correctly pronouncing each Arabic letter in isolation and in words.' },
    { title: 'Connecting Words', description: 'Joining letters into words and short phrases with correct flow.' },
    { title: 'Fluent Reading', description: 'Building speed and confidence reading full pages of the Quran.' },
  ],
  'noorani-qaida': [
    { title: 'Alphabet Recognition', description: 'Learning to identify all 29 Arabic letters and their forms.' },
    { title: 'Harakat (Vowel Marks)', description: 'Understanding fatha, kasra, damma, and sukoon and how they change pronunciation.' },
    { title: 'Basic Joining Rules', description: 'Preparing for Quran reading by practicing simple letter combinations.' },
  ],
  tajweed: [
    { title: 'Makharij (Articulation Points)', description: 'Identifying exactly where each Arabic letter is pronounced from.' },
    { title: 'Letter Characteristics', description: 'Learning the distinguishing qualities (sifaat) of each letter.' },
    { title: 'Recitation Rules', description: 'Applying rules such as idgham, ikhfa, and qalqalah in live recitation.' },
  ],
  'hifz-ul-quran': [
    { title: 'New Memorization', description: 'Structured daily memorization of new verses at a pace suited to the student.' },
    { title: 'Recent Revision', description: 'Reinforcing recently memorized portions before they fade.' },
    { title: 'Long-Term Revision (Dawr)', description: 'Cycling back through previously memorized Quran to keep it fresh for life.' },
  ],
  'quran-translation': [
    { title: 'Verse-by-Verse Meaning', description: "Understanding the literal and contextual meaning of each verse recited." },
    { title: 'Historical Context', description: 'Learning the circumstances of revelation (asbab al-nuzul) behind key verses.' },
    { title: 'Practical Lessons', description: 'Connecting Quranic guidance to everyday decisions and character.' },
  ],
  'islamic-studies': [
    { title: 'Aqeedah (Beliefs)', description: 'Core Islamic beliefs about God, the Prophets, and the Hereafter.' },
    { title: 'Fiqh (Worship)', description: 'Practical knowledge of prayer, fasting, and other acts of worship.' },
    { title: 'Seerah & Akhlaq', description: "The life of Prophet Muhammad (peace be upon him) and Islamic manners." },
  ],
};

const COURSE_FAQS: Record<string, Array<{ question: string; answer: string }>> = {
  'quran-reading': [
    { question: 'Does my child need to know Arabic letters already?', answer: 'No - this course starts from the very beginning, including letter recognition, for students who have never read Arabic before.' },
    { question: 'How long until my child can read independently?', answer: 'Most students begin reading short words within a few weeks and build toward fluent page reading over several months, depending on practice between classes.' },
  ],
  'noorani-qaida': [
    { question: 'What age is this course suitable for?', answer: 'Noorani Qaida is designed for absolute beginners, especially children aged 4 and up, though beginner adults benefit from it too.' },
    { question: 'What comes after finishing the Qaida?', answer: 'Students typically move on to our Quran Reading course to apply what they have learned directly to the Quran.' },
  ],
  tajweed: [
    { question: 'Do I need to already read Quran fluently?', answer: 'Yes - Tajweed builds on existing reading ability, refining pronunciation and applying recitation rules to what you already read.' },
    { question: 'Can Tajweed correct habits I picked up years ago?', answer: "Yes. Many adult students join specifically to correct long-standing pronunciation habits, and our teachers are experienced at this." },
  ],
  'hifz-ul-quran': [
    { question: 'How much time does Hifz require each day?', answer: 'Most students memorize best with 20-40 minutes of focused daily practice between classes, in addition to class time.' },
    { question: 'What happens if we need to pause memorization?', answer: 'Your teacher will adjust the revision plan so previously memorized portions stay strong even during a temporary pause.' },
  ],
  'quran-translation': [
    { question: 'Is this course only in English?', answer: 'Classes are conducted in English by default, though some teachers can accommodate other languages - let us know your preference when booking.' },
    { question: 'Do I need to read Arabic for this course?', answer: 'Basic Quran reading ability is helpful but not required - the focus here is on meaning, not recitation.' },
  ],
  'islamic-studies': [
    { question: 'Is this course suitable for adult beginners?', answer: 'Yes - the curriculum is adapted by age and prior knowledge, so adult beginners and children both get an appropriately paced course.' },
    { question: 'Does this course include Quran memorization?', answer: 'No - Islamic Studies focuses on beliefs, worship, and character. Pair it with our Hifz-ul-Quran course for memorization.' },
  ],
};

async function seedCourseContent(uploadedBy: string): Promise<void> {
  const courses = await prisma.course.findMany({ where: { deletedAt: null } });

  for (const course of courses) {
    const imageFile = COURSE_IMAGE_FILES[course.slug];
    if (imageFile) {
      const mediaFileId = await registerImage(imageFile, uploadedBy);
      await attachImage(mediaFileId, 'COURSE', course.id);
    }

    const existingSectionCount = await prisma.courseSection.count({ where: { courseId: course.id } });
    const sections = COURSE_SECTIONS[course.slug];
    if (existingSectionCount === 0 && sections) {
      await prisma.courseSection.createMany({
        data: sections.map((section, index) => ({ ...section, courseId: course.id, sortOrder: index + 1 })),
      });
    }

    const existingFaqCount = await prisma.courseFaq.count({ where: { courseId: course.id } });
    const faqs = COURSE_FAQS[course.slug];
    if (existingFaqCount === 0 && faqs) {
      await prisma.courseFaq.createMany({
        data: faqs.map((faq, index) => ({ ...faq, courseId: course.id, sortOrder: index + 1 })),
      });
    }

    console.log(`Seeded content for course: ${course.name}`);
  }
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

const CURATED_TESTIMONIALS: Array<{
  name: string;
  countryCode: string;
  rating: number;
  review: string;
  category: 'PARENT' | 'ADULT_STUDENT' | 'HIFZ_STUDENT';
  sortOrder: number;
}> = [
  {
    name: 'Fatima K.',
    countryCode: 'US',
    rating: 5,
    review: 'Excellent teachers, my daughter loves her classes. She looks forward to every session and her reading has improved so much in just a few months.',
    category: 'PARENT',
    sortOrder: 1,
  },
  {
    name: 'Aisha Rahman',
    countryCode: 'GB',
    rating: 5,
    review: 'Both of my sons take Noorani Qaida classes and the teachers are incredibly patient with young children. Scheduling around our timezone was never an issue.',
    category: 'PARENT',
    sortOrder: 2,
  },
  {
    name: 'Khalid Mansour',
    countryCode: 'CA',
    rating: 5,
    review: 'My daughter has been memorizing Quran with her teacher for over a year now. The revision system means she actually retains what she memorizes.',
    category: 'PARENT',
    sortOrder: 3,
  },
  {
    name: 'David Thompson',
    countryCode: 'US',
    rating: 5,
    review: 'I started as a complete beginner in my 30s and was nervous about learning to read Arabic as an adult. My teacher never made me feel behind - highly recommend.',
    category: 'ADULT_STUDENT',
    sortOrder: 4,
  },
  {
    name: 'Sarah Malik',
    countryCode: 'AU',
    rating: 4,
    review: 'The Tajweed course helped me fix pronunciation habits I had for over 20 years. Wish I had started sooner.',
    category: 'ADULT_STUDENT',
    sortOrder: 5,
  },
  {
    name: 'Hamza Yousuf',
    countryCode: 'PK',
    rating: 5,
    review: "I'm currently in my final year of Hifz with Hafiz Quran Tutor. The one-to-one attention made a huge difference compared to group classes I tried before.",
    category: 'HIFZ_STUDENT',
    sortOrder: 6,
  },
  {
    name: 'Noor Abdullah',
    countryCode: 'MY',
    rating: 5,
    review: 'Memorizing the Quran online seemed impossible to me at first, but the structured daily revision plan kept me consistent. Alhamdulillah, over halfway done now.',
    category: 'HIFZ_STUDENT',
    sortOrder: 7,
  },
];

async function seedTestimonials(): Promise<void> {
  for (const testimonial of CURATED_TESTIMONIALS) {
    const existing = await prisma.testimonial.findFirst({ where: { name: testimonial.name } });
    if (existing) {
      await prisma.testimonial.update({
        where: { id: existing.id },
        data: {
          countryCode: testimonial.countryCode,
          rating: testimonial.rating,
          review: testimonial.review,
          category: testimonial.category,
          status: 'PUBLISHED',
          sortOrder: testimonial.sortOrder,
        },
      });
    } else {
      await prisma.testimonial.create({
        data: { ...testimonial, status: 'PUBLISHED' },
      });
    }
  }
  console.log(`Seeded ${CURATED_TESTIMONIALS.length} curated testimonials.`);
}

// ---------------------------------------------------------------------------
// FAQs (site-wide, not course-specific)
// ---------------------------------------------------------------------------

const CURATED_FAQS: Array<{ question: string; answer: string; category: string; sortOrder: number }> = [
  {
    question: 'How does the free trial class work?',
    answer: 'Book a free trial through our website, tell us the preferred schedule, and our team will confirm a class with a suitable teacher. There is no cost and no obligation to continue.',
    category: 'Getting Started',
    sortOrder: 1,
  },
  {
    question: 'What do I need for an online class?',
    answer: 'Just a stable internet connection, a laptop, tablet, or smartphone with a camera and microphone, and a quiet space. We use standard video calling - no special software purchase needed.',
    category: 'Getting Started',
    sortOrder: 2,
  },
  {
    question: 'Are classes one-to-one or group classes?',
    answer: 'Every class is one-to-one between the student and their teacher. We do not offer group classes, since individual attention is central to how we teach.',
    category: 'Classes',
    sortOrder: 3,
  },
  {
    question: 'Can I choose my own teacher?',
    answer: "We match you with a suitable teacher based on the student's age, level, and course after the trial class, and you're welcome to request a different teacher if it isn't the right fit.",
    category: 'Classes',
    sortOrder: 4,
  },
  {
    question: 'What ages do you teach?',
    answer: 'We teach students of all ages, from young children starting with Noorani Qaida to adults learning to read Quran for the first time.',
    category: 'Classes',
    sortOrder: 5,
  },
  {
    question: 'How is class scheduling handled across time zones?',
    answer: "Classes are scheduled in the student's own time zone. During booking, you select your preferred days and times, and we match you with a teacher whose availability fits.",
    category: 'Scheduling',
    sortOrder: 6,
  },
  {
    question: 'What if I need to reschedule or cancel a class?',
    answer: 'Rescheduling and cancellation are handled according to the scheduling policy shared with you at enrollment, generally requiring notice before the class time.',
    category: 'Scheduling',
    sortOrder: 7,
  },
  {
    question: 'How much do classes cost?',
    answer: 'Pricing depends on the package you choose - see our Pricing page for current packages and rates. All packages are for one-to-one classes with a certified teacher.',
    category: 'Pricing',
    sortOrder: 8,
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'Payment methods are confirmed with you before enrollment based on your location. Contact our team for the options available in your country.',
    category: 'Pricing',
    sortOrder: 9,
  },
  {
    question: 'How are teachers selected and qualified?',
    answer: 'All teachers hold recognized qualifications such as Ijazah in Quran recitation, and are reviewed for teaching ability before joining the platform.',
    category: 'Teachers',
    sortOrder: 10,
  },
];

async function seedFaqs(): Promise<void> {
  for (const faq of CURATED_FAQS) {
    const existing = await prisma.faq.findFirst({ where: { question: faq.question } });
    if (existing) {
      await prisma.faq.update({
        where: { id: existing.id },
        data: { answer: faq.answer, category: faq.category, sortOrder: faq.sortOrder, status: 'PUBLISHED' },
      });
    } else {
      await prisma.faq.create({ data: { ...faq, status: 'PUBLISHED' } });
    }
  }
  console.log(`Seeded ${CURATED_FAQS.length} curated FAQs.`);
}

// ---------------------------------------------------------------------------
// Website content (CMS hero/intro blocks) - see hqt_website's per-page
// getContentBlock() calls for the exact keys each page reads.
// ---------------------------------------------------------------------------

const WEBSITE_CONTENT: Array<{ key: string; title?: string; content?: string; data?: Record<string, unknown> }> = [
  {
    key: 'home.hero',
    title: 'Learn the Quran Online with Certified, One-to-One Teachers',
    content:
      'Quran Reading, Tajweed, Hifz, Translation, and Islamic Studies — personalized classes for children, adults, and families, anywhere in the world.',
    data: { ctaLabel: 'Book Free Trial' },
  },
  {
    key: 'about.intro',
    title: 'Trusted Online Quran Education, Worldwide',
    content: 'Hafiz Quran Tutor connects students and families with certified teachers for personalized, one-to-one Quran classes.',
  },
  {
    key: 'about.mission',
    title: 'Our Mission',
    content: 'To make authentic, high-quality Quran education accessible to every student, anywhere in the world, through personal, one-to-one online classes with qualified teachers.',
  },
  {
    key: 'about.vision',
    title: 'Our Vision',
    content: 'A global community of confident Quran readers, huffaz, and lifelong learners, connected to their faith no matter where they live.',
  },
  {
    key: 'contact.hero',
    title: 'Get in Touch',
    content: "Questions about courses, pricing, or scheduling? We're here to help, worldwide, every day.",
  },
  {
    key: 'contact.hours',
    title: 'Working Hours',
    content: 'Support team: Monday - Saturday, 9:00 AM - 9:00 PM (GMT+5).\nClasses run worldwide, every day of the week, in the student\'s own time zone.',
  },
  {
    key: 'courses.hero',
    title: 'Quran Courses for Every Age and Level',
    content: 'From first letters to full memorization - structured, one-to-one programs guided by qualified teachers.',
  },
  {
    key: 'faq.hero',
    title: 'Frequently Asked Questions',
    content: "Can't find your answer here? Reach out on WhatsApp or through our Contact page.",
  },
  {
    key: 'pricing.hero',
    title: 'Simple, Flexible Packages',
    content: 'Choose a package that fits your schedule and goals. Every plan is one-to-one, taught by a certified teacher.',
  },
  {
    key: 'teachers.hero',
    title: 'Learn From Qualified, Experienced Teachers',
    content: 'Every teacher is certified in Quran recitation and Tajweed, and dedicated to giving each student individual attention.',
  },
  {
    key: 'testimonials.hero',
    title: 'What Families Say About Us',
    content: 'Real feedback from students and parents learning with our teachers, worldwide.',
  },
  {
    key: 'trial.hero',
    title: 'Book Your Free Trial Class',
    content: 'Tell us about the student and preferred schedule, and our team will confirm a free trial class with a suitable teacher.',
  },
];

async function seedWebsiteContent(): Promise<void> {
  for (const block of WEBSITE_CONTENT) {
    const data = block.data as Prisma.InputJsonValue | undefined;
    await prisma.websiteContent.upsert({
      where: { key: block.key },
      update: { title: block.title, content: block.content, data, status: 'PUBLISHED' },
      create: { key: block.key, title: block.title, content: block.content, data, status: 'PUBLISHED' },
    });
  }
  console.log(`Published ${WEBSITE_CONTENT.length} website content blocks.`);
}

async function main(): Promise<void> {
  const superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: SEED_SUPER_ADMIN_EMAIL } });

  await hideJunkTeachers();
  await hideJunkContent();
  await seedCuratedTeachers(superAdmin.id);
  await seedCourseContent(superAdmin.id);
  await seedTestimonials();
  await seedFaqs();
  await seedWebsiteContent();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
