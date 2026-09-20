import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  findSection,
  SITE_PAGES,
  sectionDefaults,
  sectionStorageKey,
  SECTION_KEY_PREFIX,
  type FieldDef,
  type ListItem,
  type PageDef,
  type SectionDef,
} from './site-content.schema';

export type FieldValue = string | ListItem[];
export type SectionValues = Record<string, FieldValue>;

export interface AdminSectionView {
  key: string;
  title: string;
  where: string;
  fields: FieldDef[];
  values: SectionValues;
  /** true when the section's wording differs from the original text. */
  customised: boolean;
  updatedAt: Date | null;
}

export interface AdminPageView {
  key: string;
  title: string;
  path: string;
  description: string;
  sections: AdminSectionView[];
}

interface StoredRow {
  data: Prisma.JsonValue;
  updatedAt: Date;
}

@Injectable()
export class SiteContentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: effective content (saved wording over defaults) for the requested pages. */
  async getPublic(pageKeys: string[]): Promise<Record<string, Record<string, SectionValues>>> {
    const pages = pageKeys.length
      ? SITE_PAGES.filter((p) => pageKeys.includes(p.key))
      : SITE_PAGES;
    if (pages.length === 0) {
      throw new NotFoundException('Unknown page');
    }
    const stored = await this.loadStored();
    const out: Record<string, Record<string, SectionValues>> = {};
    for (const page of pages) {
      out[page.key] = {};
      for (const sec of page.sections) {
        out[page.key][sec.key] = this.merge(sec, stored.get(sectionStorageKey(page.key, sec.key))?.data);
      }
    }
    return out;
  }

  /** Admin: every page and section with its fields, current values and edit state. */
  async adminGetAll(): Promise<AdminPageView[]> {
    const stored = await this.loadStored();
    return SITE_PAGES.map((page) => this.toPageView(page, stored));
  }

  async save(pageKey: string, sectionKey: string, input: Record<string, unknown>): Promise<AdminSectionView> {
    const found = findSection(pageKey, sectionKey);
    if (!found) {
      throw new NotFoundException('Unknown section');
    }
    const key = sectionStorageKey(pageKey, sectionKey);
    const existing = await this.prisma.websiteContent.findUnique({ where: { key } });
    const current = this.merge(found.section, existing?.data ?? undefined);
    const clean = this.validate(found.section, input, current);

    const row = await this.prisma.websiteContent.upsert({
      where: { key },
      update: { title: found.section.title, data: clean, status: 'PUBLISHED' },
      create: { key, title: found.section.title, data: clean, status: 'PUBLISHED' },
    });
    return this.toSectionView(found.section, { data: row.data, updatedAt: row.updatedAt });
  }

  /** Remove the saved wording so the section shows its original default text again. */
  async reset(pageKey: string, sectionKey: string): Promise<AdminSectionView> {
    const found = findSection(pageKey, sectionKey);
    if (!found) {
      throw new NotFoundException('Unknown section');
    }
    await this.prisma.websiteContent.deleteMany({ where: { key: sectionStorageKey(pageKey, sectionKey) } });
    return this.toSectionView(found.section, undefined);
  }

  // --------------------------------------------------------------------------

  private async loadStored(): Promise<Map<string, StoredRow>> {
    const rows = await this.prisma.websiteContent.findMany({
      where: { key: { startsWith: `${SECTION_KEY_PREFIX}.` }, status: 'PUBLISHED' },
      select: { key: true, data: true, updatedAt: true },
    });
    return new Map(rows.map((r) => [r.key, { data: r.data, updatedAt: r.updatedAt }]));
  }

  private toPageView(page: PageDef, stored: Map<string, StoredRow>): AdminPageView {
    return {
      key: page.key,
      title: page.title,
      path: page.path,
      description: page.description,
      sections: page.sections.map((sec) => this.toSectionView(sec, stored.get(sectionStorageKey(page.key, sec.key)))),
    };
  }

  private toSectionView(sec: SectionDef, row: StoredRow | undefined): AdminSectionView {
    const values = this.merge(sec, row?.data);
    // A section only counts as "edited" when its wording differs from the original
    // (the seed stores the original text too, which is not an edit).
    const customised = row !== undefined && JSON.stringify(values) !== JSON.stringify(sectionDefaults(sec));
    return {
      key: sec.key,
      title: sec.title,
      where: sec.where,
      fields: sec.fields,
      values,
      customised,
      updatedAt: customised ? (row?.updatedAt ?? null) : null,
    };
  }

  /** Saved values win field-by-field; anything missing falls back to the default. */
  private merge(sec: SectionDef, saved: Prisma.JsonValue | undefined): SectionValues {
    const defaults = sectionDefaults(sec);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      return defaults;
    }
    const obj = saved as Record<string, unknown>;
    const out: SectionValues = {};
    for (const f of sec.fields) {
      const v = obj[f.key];
      if (f.type === 'list') {
        out[f.key] = Array.isArray(v) ? this.cleanItems(f, v) : defaults[f.key];
      } else {
        out[f.key] = typeof v === 'string' ? v : defaults[f.key];
      }
    }
    return out;
  }

  private cleanItems(f: FieldDef, raw: unknown[]): ListItem[] {
    const itemFields = f.itemFields ?? [];
    return raw
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
      .map((i) => Object.fromEntries(itemFields.map((sf) => [sf.key, typeof i[sf.key] === 'string' ? (i[sf.key] as string) : ''])));
  }

  private validate(sec: SectionDef, input: Record<string, unknown>, current: SectionValues): SectionValues {
    const out: SectionValues = {};
    for (const f of sec.fields) {
      if (!(f.key in input)) {
        out[f.key] = current[f.key];
        continue;
      }
      const v = input[f.key];
      if (f.type === 'list') {
        out[f.key] = this.validateList(f, v);
      } else {
        out[f.key] = this.validateText(f, v);
      }
    }
    return out;
  }

  private validateText(f: FieldDef, v: unknown, prefix = ''): string {
    if (typeof v !== 'string') {
      throw new BadRequestException(`${prefix}${f.label} must be text.`);
    }
    const value = v.trim();
    if (f.required && value.length === 0) {
      throw new BadRequestException(`${prefix}${f.label} cannot be empty.`);
    }
    if (f.maxLength && value.length > f.maxLength) {
      throw new BadRequestException(`${prefix}${f.label} is too long (maximum ${f.maxLength} characters).`);
    }
    return value;
  }

  private validateList(f: FieldDef, v: unknown): ListItem[] {
    if (!Array.isArray(v)) {
      throw new BadRequestException(`${f.label} must be a list.`);
    }
    const itemFields = f.itemFields ?? [];
    const items: ListItem[] = [];
    v.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestException(`${f.label}: item ${index + 1} is not valid.`);
      }
      const rec = raw as Record<string, unknown>;
      const isBlank = itemFields.every((sf) => typeof rec[sf.key] !== 'string' || (rec[sf.key] as string).trim() === '');
      if (isBlank) return; // silently drop completely empty rows
      const item: ListItem = {};
      for (const sf of itemFields) {
        item[sf.key] = this.validateText(sf, rec[sf.key] ?? '', `${f.itemLabel ?? 'Item'} ${index + 1}: `);
      }
      items.push(item);
    });
    if (f.maxItems && items.length > f.maxItems) {
      throw new BadRequestException(`${f.label}: at most ${f.maxItems} items are allowed.`);
    }
    return items;
  }
}
