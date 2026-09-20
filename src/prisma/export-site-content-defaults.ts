import * as fs from 'node:fs';
import * as path from 'node:path';
import { SITE_PAGES, sectionDefaults } from '../modules/cms/site-content/site-content.schema';

// Usage: npx tsx src/prisma/export-site-content-defaults.ts <output.json>
// Writes the default wording as { page: { section: { field: value } } } - the
// website bundles this as its fallback for when the API is unreachable.
const target = process.argv[2];
if (!target) {
  console.error('Pass the output file path as the first argument.');
  process.exit(1);
}
const out: Record<string, Record<string, unknown>> = {};
for (const page of SITE_PAGES) {
  out[page.key] = {};
  for (const sec of page.sections) out[page.key][sec.key] = sectionDefaults(sec);
}
fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote defaults for ${SITE_PAGES.length} pages to ${target}`);
