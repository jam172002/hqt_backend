import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as auth/people e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3103;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let server: ChildProcess;

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health/ready`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Server did not become healthy in time');
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

function authed(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

beforeAll(async () => {
  server = spawn('node', ['dist/main.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, APP_PORT: String(PORT) },
    stdio: 'pipe',
  });

  let startupLog = '';
  server.stdout?.on('data', (chunk: Buffer) => (startupLog += chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => (startupLog += chunk.toString()));

  try {
    await waitForHealth();
  } catch (error) {
    console.error('Server startup log:\n', startupLog);
    throw error;
  }
}, 40_000);

afterAll(() => {
  server?.kill();
});

describe('Courses (e2e)', () => {
  // Seeded by `prisma db seed` - see src/prisma/seed.ts.
  let adminToken: string;
  const slug = `e2e-course-${randomUUID().slice(0, 8)}`;
  let courseId: string;

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');
  });

  it('lists the seeded published courses publicly, with no auth', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/courses`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ slug: string }>; meta: { total: number } };
    expect(body.meta.total).toBeGreaterThanOrEqual(6);
    expect(body.data.some((c) => c.slug === 'hifz-ul-quran')).toBe(true);
  });

  it('rejects course creation without an admin token', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid slug format', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/courses`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        slug: 'Not A Valid Slug!',
        name: 'X',
        shortDescription: 'X',
        description: 'X',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('admin creates a course as DRAFT, invisible on the public routes', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/courses`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        slug,
        name: 'E2E Test Course',
        shortDescription: 'Short description.',
        description: 'Full description.',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe('DRAFT');
    courseId = body.id;

    const publicRes = await fetch(`${BASE_URL}/api/v1/courses/${slug}`);
    expect(publicRes.status).toBe(404);

    const adminListRes = await fetch(`${BASE_URL}/api/v1/courses/admin/list`, {
      headers: authed(adminToken),
    });
    const adminList = (await adminListRes.json()) as { data: Array<{ slug: string }> };
    expect(adminList.data.some((c) => c.slug === slug)).toBe(true);
  });

  it('rejects creating a second course with the same slug', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/courses`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ slug, name: 'X', shortDescription: 'X', description: 'X' }),
    });
    expect(res.status).toBe(409);
  });

  it('publishing makes it visible publicly, and it can carry sections, FAQs, and a teacher', async () => {
    const publishRes = await fetch(`${BASE_URL}/api/v1/courses/${courseId}`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'PUBLISHED' }),
    });
    expect(publishRes.status).toBe(200);

    const sectionRes = await fetch(`${BASE_URL}/api/v1/courses/${courseId}/sections`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ title: 'Week 1', description: 'Intro week.' }),
    });
    expect(sectionRes.status).toBe(201);

    const faqRes = await fetch(`${BASE_URL}/api/v1/courses/${courseId}/faqs`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ question: 'Q?', answer: 'A.' }),
    });
    expect(faqRes.status).toBe(201);

    const teacherRes = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email: `e2e-teacher-${randomUUID()}@example.com`,
        password: 'TeacherPass123',
        firstName: 'A',
        lastName: 'B',
        bio: 'Bio.',
        qualification: 'Qualification.',
        countryCode: 'PK',
        timezone: 'Asia/Karachi',
      }),
    });
    const teacher = (await teacherRes.json()) as { id: string };

    const assignRes = await fetch(
      `${BASE_URL}/api/v1/courses/${courseId}/teachers/${teacher.id}`,
      { method: 'POST', headers: authed(adminToken) },
    );
    expect(assignRes.status).toBe(204);

    // Duplicate assignment must be rejected.
    const reassignRes = await fetch(
      `${BASE_URL}/api/v1/courses/${courseId}/teachers/${teacher.id}`,
      { method: 'POST', headers: authed(adminToken) },
    );
    expect(reassignRes.status).toBe(409);

    const detailRes = await fetch(`${BASE_URL}/api/v1/courses/${slug}`);
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      sections: unknown[];
      faqs: unknown[];
      teachers: Array<{ id: string }>;
    };
    expect(detail.sections).toHaveLength(1);
    expect(detail.faqs).toHaveLength(1);
    expect(detail.teachers.map((t) => t.id)).toContain(teacher.id);
  });

  it('hiding removes it from public view again; removing (soft delete) removes it from admin view too', async () => {
    const hideRes = await fetch(`${BASE_URL}/api/v1/courses/${courseId}`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'HIDDEN' }),
    });
    expect(hideRes.status).toBe(200);

    const publicRes = await fetch(`${BASE_URL}/api/v1/courses/${slug}`);
    expect(publicRes.status).toBe(404);

    const deleteRes = await fetch(`${BASE_URL}/api/v1/courses/${courseId}`, {
      method: 'DELETE',
      headers: authed(adminToken),
    });
    expect(deleteRes.status).toBe(204);

    const adminGetRes = await fetch(`${BASE_URL}/api/v1/courses/admin/${courseId}`, {
      headers: authed(adminToken),
    });
    expect(adminGetRes.status).toBe(404);
  });
});
