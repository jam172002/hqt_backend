import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  SITE_PAGES,
  sectionDefaults,
  sectionStorageKey,
  type ListItem,
} from '../modules/cms/site-content/site-content.schema';

// Writes the website's current wording into the database, one row per
// section, so it can be edited from the admin panel's "Site Content" screens.
// Idempotent: sections that already have a saved row are left untouched.
// Wording that was previously edited under the old raw "Website Content" keys
// (home.hero, about.mission, contact.hours, ...) is carried over.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface Legacy {
  title: string | null;
  content: string | null;
  data: unknown;
}

/** legacy content key -> how it maps onto a new section's fields */
const LEGACY_MAP: Array<{
  key: string;
  page: string;
  section: string;
  apply: (legacy: Legacy, values: Record<string, string | ListItem[]>) => void;
}> = [
  ...['home', 'courses', 'teachers', 'pricing', 'trial', 'testimonials', 'faq', 'contact'].map((page) => ({
    key: `${page}.hero`,
    page,
    section: 'hero',
    apply: (l: Legacy, v: Record<string, string | ListItem[]>) => {
      if (l.title) v.title = l.title;
      if (l.content) v.description = l.content;
      const cta = (l.data as { ctaLabel?: string } | null)?.ctaLabel;
      if (page === 'home' && cta) v.primaryButton = cta;
    },
  })),
  { key: 'about.intro', page: 'about', section: 'hero', apply: (l, v) => { if (l.title) v.title = l.title; if (l.content) v.description = l.content; } },
  { key: 'about.mission', page: 'about', section: 'mission', apply: (l, v) => { if (l.title) v.title = l.title; if (l.content) v.text = l.content; } },
  { key: 'about.vision', page: 'about', section: 'vision', apply: (l, v) => { if (l.title) v.title = l.title; if (l.content) v.text = l.content; } },
  { key: 'legal.privacy.hero', page: 'privacy', section: 'hero', apply: (l, v) => { if (l.title) v.title = l.title; if (l.content) v.description = l.content; } },
  { key: 'legal.terms.hero', page: 'terms', section: 'hero', apply: (l, v) => { if (l.title) v.title = l.title; if (l.content) v.description = l.content; } },
  {
    key: 'contact.hours',
    page: 'contact',
    section: 'info',
    apply: (l, v) => {
      if (l.title) v.hoursTitle = l.title;
      if (l.content) v.hours = l.content.split('\n').filter((x) => x.trim()).map((text) => ({ text }));
    },
  },
];

async function main(): Promise<void> {
  const legacyRows = await prisma.websiteContent.findMany({ where: { NOT: { key: { startsWith: 'site.' } } } });
  const legacyByKey = new Map(legacyRows.map((r) => [r.key, r]));

  let created = 0;
  let skipped = 0;
  let carried = 0;

  for (const page of SITE_PAGES) {
    for (const sec of page.sections) {
      const key = sectionStorageKey(page.key, sec.key);
      const existing = await prisma.websiteContent.findUnique({ where: { key } });
      if (existing) {
        skipped += 1;
        continue;
      }
      const values = sectionDefaults(sec);
      for (const map of LEGACY_MAP.filter((m) => m.page === page.key && m.section === sec.key)) {
        const legacy = legacyByKey.get(map.key);
        if (legacy && legacy.status === 'PUBLISHED') {
          map.apply({ title: legacy.title, content: legacy.content, data: legacy.data }, values);
          carried += 1;
        }
      }
      await prisma.websiteContent.create({
        data: { key, title: sec.title, data: values, status: 'PUBLISHED' },
      });
      created += 1;
    }
  }
  console.log(`Site content: ${created} sections written, ${skipped} already existed, ${carried} carried over from older edits.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
