import {
  PRIVACY_NOTICE,
  PRIVACY_SECTIONS,
  TERMS_NOTICE,
  TERMS_SECTIONS,
} from './legal-defaults';

/**
 * Describes every editable piece of text on the public website, grouped by
 * page and section. It is the single source of truth for:
 *  - the admin panel's editing forms (labels, help text, field types),
 *  - the default wording (what the site says until an admin changes it),
 *  - validation of what an admin may save.
 * Adding a field here makes it editable in the admin panel automatically.
 */
export type FieldType = 'text' | 'textarea' | 'list';

export interface ListItem {
  [key: string]: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  /** Text/textarea: a string. List: an array of items. */
  default: string | ListItem[];
  required?: boolean;
  maxLength?: number;
  /** list only */
  itemFields?: FieldDef[];
  itemLabel?: string;
  maxItems?: number;
}

export interface SectionDef {
  key: string;
  title: string;
  /** Plain-English description of where this appears on the website. */
  where: string;
  fields: FieldDef[];
}

export interface PageDef {
  key: string;
  title: string;
  /** Website address of the page (used for "view on website" hints). */
  path: string;
  description: string;
  sections: SectionDef[];
}

const text = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({
  key,
  label,
  type: 'text',
  default: def,
  maxLength: 200,
  ...o,
});
const area = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({
  key,
  label,
  type: 'textarea',
  default: def,
  maxLength: 3000,
  ...o,
});
const list = (
  key: string,
  label: string,
  itemLabel: string,
  itemFields: FieldDef[],
  def: ListItem[],
  o: Partial<FieldDef> = {},
): FieldDef => ({ key, label, type: 'list', itemLabel, itemFields, default: def, maxItems: 20, ...o });
const section = (key: string, title: string, where: string, fields: FieldDef[]): SectionDef => ({
  key,
  title,
  where,
  fields,
});

const seo = (title: string, description: string): SectionDef =>
  section('seo', 'Google search appearance', 'Not visible on the page - the title and description Google shows in search results and browser tabs.', [
    text('metaTitle', 'Page title', title, { required: true, maxLength: 70, help: 'Shown in the browser tab and Google (keep under 60 characters).' }),
    area('metaDescription', 'Page description', description, { maxLength: 200, help: 'One or two sentences shown under the title in Google results (about 150 characters).' }),
  ]);

const hero = (eyebrow: string, title: string, description: string, where: string): SectionDef =>
  section('hero', 'Top banner', where, [
    text('eyebrow', 'Small label above the heading', eyebrow, { maxLength: 40 }),
    text('title', 'Main heading', title, { required: true }),
    area('description', 'Introduction text', description, { maxLength: 500 }),
  ]);

export const SITE_PAGES: PageDef[] = [
  // -------------------------------------------------------------------------
  {
    key: 'global',
    title: 'Whole website (all pages)',
    path: '/',
    description: 'Contact details, menu, footer and other things that appear on every page.',
    sections: [
      section('brand', 'Name and slogan', 'The website name and the short description shown in the footer and when the site is shared.', [
        text('siteName', 'Website name', 'Hafiz Quran Tutor', { required: true, maxLength: 60 }),
        area('tagline', 'Short description (footer)', 'One-to-one online Quran classes with certified teachers, for students of every age, anywhere in the world.', { maxLength: 300 }),
        area('siteDescription', 'Description for search engines and social sharing', 'Learn to read, recite, and memorize the Quran with certified teachers through personalized, one-to-one online classes - available worldwide.', { maxLength: 300 }),
      ]),
      section('contact', 'Contact details', 'Phone, WhatsApp and email used on the Contact page and by the floating green WhatsApp button.', [
        text('whatsappNumber', 'WhatsApp number', '923001234567', { required: true, maxLength: 20, help: 'Digits only, with country code and no + or spaces. Example: 923001234567' }),
        text('phoneNumber', 'Phone number', '+923001234567', { required: true, maxLength: 25, help: 'As it should be displayed, for example +92 300 1234567.' }),
        text('email', 'Email address', 'info@hafizqurantutor.com', { required: true, maxLength: 100 }),
        area('whatsappMessage', 'Message pre-filled in WhatsApp', 'Assalamu Alaikum, I would like to book a free Quran trial class.', { maxLength: 300, help: 'This text is typed for the visitor when they tap the WhatsApp button.' }),
      ]),
      section('header', 'Menu (top of every page)', 'The navigation menu at the top of every page.', [
        text('navHome', 'Menu: Home', 'Home', { required: true, maxLength: 24 }),
        text('navAbout', 'Menu: About', 'About', { required: true, maxLength: 24 }),
        text('navCourses', 'Menu: Courses', 'Courses', { required: true, maxLength: 24 }),
        text('navTeachers', 'Menu: Teachers', 'Teachers', { required: true, maxLength: 24 }),
        text('navPricing', 'Menu: Pricing', 'Pricing', { required: true, maxLength: 24 }),
        text('navFaq', 'Menu: FAQ', 'FAQ', { required: true, maxLength: 24 }),
        text('navContact', 'Menu: Contact', 'Contact', { required: true, maxLength: 24 }),
        text('trialButton', 'Green button in the menu', 'Book Free Trial', { required: true, maxLength: 30 }),
      ]),
      section('footer', 'Footer (bottom of every page)', 'The dark green area at the bottom of every page.', [
        text('exploreTitle', 'First column title', 'Explore', { maxLength: 30 }),
        text('supportTitle', 'Second column title', 'Support', { maxLength: 30 }),
        text('legalTitle', 'Third column title', 'Legal', { maxLength: 30 }),
        text('copyright', 'Copyright line (year is added automatically)', 'Hafiz Quran Tutor. All rights reserved.', { maxLength: 120 }),
        text('bottomLine', 'Line next to the copyright', 'Worldwide online classes · Available every day of the week', { maxLength: 150 }),
      ]),
      section('notFound', 'Page-not-found message', 'Shown when a visitor opens an address that does not exist.', [
        text('title', 'Heading', 'Page Not Found', { required: true }),
        area('text', 'Message', "The page you're looking for doesn't exist or may have been moved.", { maxLength: 300 }),
        text('homeButton', 'First button', 'Back to Home', { maxLength: 30 }),
        text('coursesButton', 'Second button', 'Browse Courses', { maxLength: 30 }),
      ]),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'home',
    title: 'Home page',
    path: '/',
    description: 'The first page visitors see.',
    sections: [
      section('hero', 'Top banner', 'The large headline area at the very top of the Home page.', [
        text('eyebrow', 'Small label above the heading', 'Online Quran Learning Platform', { maxLength: 60 }),
        text('title', 'Main heading', 'Learn the Quran Online with Certified, One-to-One Teachers', { required: true }),
        area('description', 'Introduction text', 'Quran Reading, Tajweed, Hifz, Translation, and Islamic Studies — personalized classes for children, adults, and families, anywhere in the world.', { maxLength: 500 }),
        text('primaryButton', 'Green button', 'Book Free Trial', { required: true, maxLength: 30 }),
        text('whatsappButton', 'WhatsApp button', 'Chat on WhatsApp', { required: true, maxLength: 30 }),
      ]),
      section('trust', 'Four highlights strip', 'The row of four short highlights right under the banner.', [
        list('items', 'Highlights', 'Highlight', [text('title', 'Title', '', { required: true, maxLength: 60 }), area('text', 'Short text', '', { maxLength: 200 })], [
          { title: 'Qualified Quran Teachers', text: 'Certified, experienced teachers of Quran and Tajweed.' },
          { title: 'One-to-One Classes', text: 'Every class is individual, personalized attention only.' },
          { title: 'Flexible Timings', text: 'Choose a schedule that fits your timezone, any day.' },
          { title: 'Students Worldwide', text: 'Trusted by families across dozens of countries.' },
        ], { maxItems: 4 }),
      ]),
      section('courses', 'Courses area', 'The heading above the course cards on the Home page. (The courses themselves are edited under Courses.)', [
        text('heading', 'Heading', 'Our Courses', { required: true }),
        text('subheading', 'Text under the heading', 'Structured programs for every stage of the Quran learning journey.', { maxLength: 200 }),
        text('viewAll', 'Link under the cards', 'View All Courses', { maxLength: 40 }),
      ]),
      section('whyUs', 'Why choose us', 'The green band listing reasons to choose the institute.', [
        text('heading', 'Heading', 'Why Choose Us', { required: true }),
        list('items', 'Reasons', 'Reason', [text('text', 'Reason', '', { required: true, maxLength: 120 })], [
          { text: 'Individual attention in every class' },
          { text: 'Experienced, certified teachers' },
          { text: 'Flexible scheduling across time zones' },
          { text: 'Fully online, learn from anywhere' },
          { text: 'Available to students worldwide' },
        ], { maxItems: 10 }),
      ]),
      section('howItWorks', 'How it works', 'The numbered steps explaining how to get started.', [
        text('heading', 'Heading', 'How It Works', { required: true }),
        list('steps', 'Steps (numbered automatically)', 'Step', [text('title', 'Step title', '', { required: true, maxLength: 60 }), area('text', 'Step description', '', { maxLength: 200 })], [
          { title: 'Register', text: 'Tell us a little about the student and preferred schedule.' },
          { title: 'Book Free Trial', text: 'Try a class with no cost and no obligation.' },
          { title: 'Meet Your Teacher', text: 'Get matched with a qualified teacher for your goals.' },
          { title: 'Start Learning', text: 'Begin regular one-to-one classes on your schedule.' },
        ], { maxItems: 6 }),
      ]),
      section('teachers', 'Teachers area', 'The heading above the teacher cards. (Teachers themselves are edited under Teachers.)', [
        text('heading', 'Heading', 'Meet Our Teachers', { required: true }),
        text('subheading', 'Text under the heading', 'Experienced, certified, and dedicated to every student.', { maxLength: 200 }),
        text('viewAll', 'Link under the cards', 'View All Teachers', { maxLength: 40 }),
      ]),
      section('testimonials', 'Testimonials area', 'The heading above the family reviews. (Reviews are edited under Testimonials.)', [
        text('heading', 'Heading', 'What Families Say', { required: true }),
      ]),
      section('faq', 'Questions area', 'The heading above the frequently asked questions. (Questions are edited under FAQs.)', [
        text('heading', 'Heading', 'Frequently Asked Questions', { required: true }),
        text('viewAll', 'Link under the questions', 'View All FAQs', { maxLength: 40 }),
      ]),
      section('finalCta', 'Closing call to action', 'The dark green band at the bottom of the Home page.', [
        text('heading', 'Heading', 'Start Your Quran Learning Journey Today', { required: true }),
        text('primaryButton', 'Green/gold button', 'Book Free Trial', { maxLength: 30 }),
        text('whatsappButton', 'WhatsApp button', 'Chat on WhatsApp', { maxLength: 30 }),
      ]),
      seo('Hafiz Quran Tutor - Online Quran Learning Platform', 'Learn to read, recite, and memorize the Quran with certified teachers through personalized, one-to-one online classes - available worldwide.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'about',
    title: 'About Us page',
    path: '/about',
    description: 'Who the institute is, its mission and approach.',
    sections: [
      hero('About Us', 'Trusted Online Quran Education, Worldwide', 'Hafiz Quran Tutor connects students and families with certified teachers for personalized, one-to-one Quran classes.', 'The banner at the top of the About page.'),
      section('mission', 'Our Mission', 'First block under the banner.', [
        text('title', 'Heading', 'Our Mission', { required: true, maxLength: 80 }),
        area('text', 'Text', 'To make authentic, high-quality Quran education accessible to every student, anywhere in the world, through personal, one-to-one online classes with qualified teachers.', { maxLength: 800 }),
      ]),
      section('vision', 'Our Vision', 'Second block, next to the mission.', [
        text('title', 'Heading', 'Our Vision', { required: true, maxLength: 80 }),
        area('text', 'Text', 'A global community of confident Quran readers, huffaz, and lifelong learners, connected to their faith no matter where they live.', { maxLength: 800 }),
      ]),
      section('approach', 'Our Teaching Approach', 'Third block.', [
        text('title', 'Heading', 'Our Teaching Approach', { required: true, maxLength: 80 }),
        area('text', 'Text', "Every class is one-to-one. Teachers adapt pace and method to each student's age, ability, and goals - whether that's learning to read for the first time or completing Hifz.", { maxLength: 800 }),
      ]),
      section('whyOnline', 'Why Online Quran Learning', 'Fourth block.', [
        text('title', 'Heading', 'Why Online Quran Learning', { required: true, maxLength: 80 }),
        area('text', 'Text', 'Online classes remove the barrier of distance and give families the flexibility to schedule around school, work, and time zones - without compromising on quality or individual attention.', { maxLength: 800 }),
      ]),
      section('teachers', 'Our Teachers', 'Shows three featured teachers with a link to all teachers.', [
        text('heading', 'Heading', 'Our Teachers', { required: true }),
        text('subheading', 'Text under the heading', 'Meet some of the certified, experienced teachers who guide our students.', { maxLength: 200 }),
        text('viewAll', 'Link under the cards', 'View All Teachers', { maxLength: 40 }),
      ]),
      section('countries', 'Countries We Serve', 'The light green box at the bottom of the About page.', [
        text('heading', 'Heading', 'Countries We Serve', { required: true }),
        area('text', 'Text', 'We teach students across dozens of countries, with flexible timing designed around every time zone.', { maxLength: 500 }),
        text('button', 'Button', 'Book Free Trial', { maxLength: 30 }),
      ]),
      seo('About Us', "Learn about Hafiz Quran Tutor's mission, teaching approach, and commitment to online Quran education."),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'courses',
    title: 'Courses pages',
    path: '/courses',
    description: 'The course list and every individual course page.',
    sections: [
      hero('Courses', 'Quran Courses for Every Age and Level', 'From first letters to full memorization - structured, one-to-one programs guided by qualified teachers.', 'The banner at the top of the Courses page.'),
      section('list', 'Course list wording', 'Small texts on the course cards and when there are no courses.', [
        text('cardButton', 'Link at the bottom of each course card', 'Learn More', { maxLength: 30 }),
        text('empty', 'Message when no courses are published', 'Courses are currently unavailable. Please check back soon.', { maxLength: 200 }),
      ]),
      section('detail', 'Single course page wording', 'Headings and labels used on every individual course page.', [
        text('eyebrow', 'Small label above the course name', 'Course', { maxLength: 40 }),
        text('aboutHeading', 'Heading: about the course', 'About This Course', { maxLength: 60 }),
        text('curriculumHeading', 'Heading: curriculum', 'Curriculum', { maxLength: 60 }),
        text('faqHeading', 'Heading: course questions', 'Frequently Asked Questions', { maxLength: 60 }),
        text('detailsHeading', 'Heading: details box', 'Course Details', { maxLength: 60 }),
        text('suitableLabel', 'Label: suitable for', 'Suitable For', { maxLength: 40 }),
        text('ageLabel', 'Label: age group', 'Age Group', { maxLength: 40 }),
        text('methodLabel', 'Label: teaching method', 'Teaching Method', { maxLength: 40 }),
        text('formatLabel', 'Label: class format', 'Class Format', { maxLength: 40 }),
        text('teachersHeading', 'Heading: teachers box', 'Teachers', { maxLength: 60 }),
        text('trialButton', 'Trial button', 'Book Free Trial', { maxLength: 30 }),
      ]),
      seo('Courses', 'Explore our Quran Reading, Noorani Qaida, Tajweed, Hifz-ul-Quran, Quran Translation, and Islamic Studies courses.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'teachers',
    title: 'Teachers pages',
    path: '/teachers',
    description: 'The teacher list and every teacher profile.',
    sections: [
      hero('Our Teachers', 'Learn From Qualified, Experienced Teachers', 'Every teacher is certified in Quran recitation and Tajweed, and dedicated to giving each student individual attention.', 'The banner at the top of the Teachers page.'),
      section('list', 'Teacher list wording', 'Small texts on the teacher cards and when there are no teachers.', [
        text('experienceCard', 'Experience text on cards', '{years}+ years experience', { maxLength: 60, help: 'Use {years} where the number should appear.' }),
        text('empty', 'Message when no teachers are listed', 'Teacher profiles are currently unavailable. Please check back soon.', { maxLength: 200 }),
      ]),
      section('detail', 'Single teacher page wording', 'Headings used on every teacher profile page.', [
        text('experienceLine', 'Experience line', '{years}+ years of teaching experience', { maxLength: 80, help: 'Use {years} where the number should appear.' }),
        text('aboutHeading', 'Heading: about', 'About', { maxLength: 60 }),
        text('philosophyHeading', 'Heading: teaching philosophy', 'Teaching Philosophy', { maxLength: 60 }),
        text('qualificationsHeading', 'Heading: qualifications', 'Qualifications', { maxLength: 60 }),
        text('trialButton', 'Trial button', 'Book Free Trial', { maxLength: 30 }),
      ]),
      seo('Teachers', 'Meet our certified, experienced Quran teachers available for one-to-one online classes.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'pricing',
    title: 'Pricing page',
    path: '/pricing',
    description: 'Packages and prices. (The packages and prices themselves are set in the Pricing screen.)',
    sections: [
      hero('Pricing', 'Simple, Flexible Packages', 'Choose a package that fits your schedule and goals. Every plan is one-to-one, taught by a certified teacher.', 'The banner at the top of the Pricing page.'),
      section('cards', 'Package card wording', 'Small texts on each price card.', [
        text('classesLine', 'Classes line', '{count} classes per {period}', { maxLength: 80, help: 'Use {count} for the number of classes and {period} for week/month/etc.' }),
        text('minutesLine', 'Minutes line', '{minutes} minutes per class', { maxLength: 80, help: 'Use {minutes} for the class length.' }),
        list('features', 'Extra bullet points on every package', 'Bullet point', [text('text', 'Bullet point', '', { required: true, maxLength: 120 })], [
          { text: 'One-to-one with a certified teacher' },
        ], { maxItems: 8 }),
        text('button', 'Button on each package', 'Book Free Trial', { maxLength: 30 }),
        area('empty', 'Message when there are no packages', 'Pricing details are being finalized. Contact us for the latest package information.', { maxLength: 300 }),
      ]),
      seo('Pricing', 'Simple, flexible pricing packages for one-to-one online Quran classes.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'trial',
    title: 'Free Trial page',
    path: '/trial',
    description: 'The trial class booking form.',
    sections: [
      hero('Free Trial', 'Book Your Free Trial Class', 'Tell us about the student and preferred schedule, and our team will confirm a free trial class with a suitable teacher.', 'The banner at the top of the Free Trial page.'),
      section('form', 'Form wording', 'Button and confirmation message of the trial form.', [
        text('submitButton', 'Submit button', 'Book Free Trial', { maxLength: 30 }),
        text('submittingText', 'Button text while sending', 'Submitting...', { maxLength: 30 }),
        text('successTitle', 'Confirmation heading', 'Thank you! Your trial request has been received.', { required: true }),
        area('successText', 'Confirmation text', 'Our team will contact you on WhatsApp or email shortly to confirm your free trial class.', { maxLength: 400 }),
        text('whatsappButton', 'WhatsApp button on the confirmation', 'Continue on WhatsApp', { maxLength: 40 }),
        area('whatsappMessage', 'Message pre-filled for WhatsApp after booking', 'Assalamu Alaikum, I have just submitted a free trial request on your website.', { maxLength: 300 }),
      ]),
      seo('Book Free Trial', 'Book a free, no-obligation trial Quran class with one of our certified teachers.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'testimonials',
    title: 'Testimonials page',
    path: '/testimonials',
    description: 'What students and parents say. (Reviews themselves are edited under Testimonials.)',
    sections: [
      hero('Testimonials', 'What Families Say About Us', 'Real feedback from students and parents learning with our teachers, worldwide.', 'The banner at the top of the Testimonials page.'),
      section('groups', 'Group headings', 'Headings that group the reviews by who wrote them.', [
        text('parents', 'Reviews from parents', 'From Parents', { maxLength: 60 }),
        text('adults', 'Reviews from adult students', 'From Adult Students', { maxLength: 60 }),
        text('hifz', 'Reviews from Hifz students', 'From Hifz Students', { maxLength: 60 }),
        text('other', 'Other reviews', 'More Reviews', { maxLength: 60 }),
        text('empty', 'Message when there are no reviews', 'No testimonials to show yet - check back soon.', { maxLength: 200 }),
      ]),
      seo('Testimonials', 'Read what students and parents say about learning with Hafiz Quran Tutor.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'faq',
    title: 'FAQ page',
    path: '/faq',
    description: 'Frequently asked questions. (Questions themselves are edited under FAQs.)',
    sections: [
      hero('FAQ', 'Frequently Asked Questions', "Can't find your answer here? Reach out on WhatsApp or through our Contact page.", 'The banner at the top of the FAQ page.'),
      section('list', 'List wording', 'Message shown when there are no questions.', [
        text('empty', 'Message when there are no questions', 'FAQs are being updated - check back soon.', { maxLength: 200 }),
      ]),
      seo('FAQ', 'Answers to common questions about our online Quran classes.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'contact',
    title: 'Contact page',
    path: '/contact',
    description: 'How visitors can reach you. (The phone, WhatsApp and email are set under Whole website > Contact details.)',
    sections: [
      hero('Contact', 'Get in Touch', "Questions about courses, pricing, or scheduling? We're here to help, worldwide, every day.", 'The banner at the top of the Contact page.'),
      section('info', 'Contact boxes', 'The small boxes on the left of the Contact page.', [
        text('whatsappLabel', 'WhatsApp box title', 'WhatsApp', { maxLength: 30 }),
        text('phoneLabel', 'Phone box title', 'Phone', { maxLength: 30 }),
        text('emailLabel', 'Email box title', 'Email', { maxLength: 30 }),
        text('hoursTitle', 'Working hours box title', 'Working Hours', { maxLength: 40 }),
        list('hours', 'Working hours lines', 'Line', [text('text', 'Line of text', '', { required: true, maxLength: 200 })], [
          { text: 'Support team: Monday - Saturday, 9:00 AM - 9:00 PM (GMT+5).' },
          { text: "Classes run worldwide, every day of the week, in the student's own time zone." },
        ], { maxItems: 8 }),
      ]),
      section('form', 'Message form wording', 'Button and confirmation of the contact form.', [
        text('submitButton', 'Submit button', 'Send Message', { maxLength: 30 }),
        text('sendingText', 'Button text while sending', 'Sending...', { maxLength: 30 }),
        text('successTitle', 'Confirmation heading', 'Message sent!', { required: true }),
        area('successText', 'Confirmation text', "We'll get back to you as soon as possible.", { maxLength: 300 }),
      ]),
      seo('Contact Us', 'Get in touch with Hafiz Quran Tutor by WhatsApp, email, or our contact form.'),
    ],
  },
  // -------------------------------------------------------------------------
  {
    key: 'privacy',
    title: 'Privacy Policy page',
    path: '/privacy-policy',
    description: 'The privacy policy text.',
    sections: [
      section('hero', 'Top banner', 'The banner at the top of the Privacy Policy page.', [
        text('title', 'Main heading', 'Privacy Policy', { required: true }),
        area('description', 'Introduction text (optional)', '', { maxLength: 500 }),
      ]),
      section('notice', 'Notice at the top', 'A short italic note above the policy. Clear it to hide the note.', [
        area('text', 'Notice text', PRIVACY_NOTICE, { maxLength: 500, help: 'Remove this text once your legal review is finished, or replace it with the real "last updated" date.' }),
      ]),
      section('body', 'Policy sections', 'The numbered sections of the policy.', [
        list('items', 'Sections', 'Section', [text('heading', 'Section heading', '', { required: true, maxLength: 120 }), area('text', 'Section text', '', { maxLength: 3000 })], PRIVACY_SECTIONS, { maxItems: 30 }),
      ]),
      seo('Privacy Policy', 'How Hafiz Quran Tutor collects, uses, and protects your information.'),
    ],
  },
  {
    key: 'terms',
    title: 'Terms & Conditions page',
    path: '/terms',
    description: 'The terms and conditions text.',
    sections: [
      section('hero', 'Top banner', 'The banner at the top of the Terms page.', [
        text('title', 'Main heading', 'Terms & Conditions', { required: true }),
        area('description', 'Introduction text (optional)', '', { maxLength: 500 }),
      ]),
      section('notice', 'Notice at the top', 'A short italic note above the terms. Clear it to hide the note.', [
        area('text', 'Notice text', TERMS_NOTICE, { maxLength: 500, help: 'Remove this text once your legal review is finished, or replace it with the real "last updated" date.' }),
      ]),
      section('body', 'Terms sections', 'The numbered sections of the terms.', [
        list('items', 'Sections', 'Section', [text('heading', 'Section heading', '', { required: true, maxLength: 120 }), area('text', 'Section text', '', { maxLength: 3000 })], TERMS_SECTIONS, { maxItems: 30 }),
      ]),
      seo('Terms & Conditions', "The terms and conditions governing use of Hafiz Quran Tutor's services."),
    ],
  },
];

export const SECTION_KEY_PREFIX = 'site';

export function sectionStorageKey(page: string, sectionKey: string): string {
  return `${SECTION_KEY_PREFIX}.${page}.${sectionKey}`;
}

export function findSection(page: string, sectionKey: string): { page: PageDef; section: SectionDef } | undefined {
  const pageDef = SITE_PAGES.find((p) => p.key === page);
  const sectionDef = pageDef?.sections.find((s) => s.key === sectionKey);
  return pageDef && sectionDef ? { page: pageDef, section: sectionDef } : undefined;
}

/** Default values of one section as a plain { field: value } object. */
export function sectionDefaults(def: SectionDef): Record<string, string | ListItem[]> {
  const out: Record<string, string | ListItem[]> = {};
  for (const f of def.fields) {
    out[f.key] = f.type === 'list' ? (f.default as ListItem[]).map((i) => ({ ...i })) : (f.default);
  }
  return out;
}
