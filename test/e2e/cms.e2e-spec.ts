import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3108;
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

async function registerAndLogin(role: 'STUDENT' | 'PARENT'): Promise<{ email: string; token: string }> {
  const email = `e2e-${role.toLowerCase()}-${randomUUID()}@example.com`;
  const password = 'Password123';
  await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  return { email, token: await login(email, password) };
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

describe('CMS (e2e)', () => {
  let adminToken: string;
  let studentToken: string;

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');
    const student = await registerAndLogin('STUDENT');
    studentToken = student.token;
  });

  describe('testimonials', () => {
    let testimonialId: string;
    const name = `E2E Tester ${randomUUID()}`;

    it('rejects testimonial creation without an admin token', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/testimonials`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({
          name,
          countryCode: 'PK',
          rating: 5,
          review: 'Great course!',
        }),
      });
      expect(res.status).toBe(403);
    });

    it('admin creates a testimonial that defaults to DRAFT (unpublished)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/testimonials`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          name,
          countryCode: 'PK',
          rating: 5,
          review: 'Great course, my son loves it!',
          category: 'PARENT',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string };
      expect(body.status).toBe('DRAFT');
      testimonialId = body.id;
    });

    it('does not show the draft testimonial on the public listing', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/testimonials?limit=100`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string }> };
      expect(body.data.some((t) => t.id === testimonialId)).toBe(false);
    });

    it('shows the draft testimonial on the admin listing', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/testimonials/admin?limit=100`, {
        headers: authed(adminToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string; status: string }> };
      expect(body.data.some((t) => t.id === testimonialId)).toBe(true);
    });

    it('rejects publishing from a non-admin token (RBAC)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/testimonials/${testimonialId}`, {
        method: 'PATCH',
        headers: authed(studentToken),
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });
      expect(res.status).toBe(403);
    });

    it('admin publishes the testimonial, which now appears on the public listing', async () => {
      const updateRes = await fetch(`${BASE_URL}/api/v1/cms/testimonials/${testimonialId}`, {
        method: 'PATCH',
        headers: authed(adminToken),
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });
      expect(updateRes.status).toBe(200);
      const updated = (await updateRes.json()) as { status: string };
      expect(updated.status).toBe('PUBLISHED');

      const publicRes = await fetch(`${BASE_URL}/api/v1/cms/testimonials?limit=100`);
      expect(publicRes.status).toBe(200);
      const publicBody = (await publicRes.json()) as { data: Array<{ id: string }> };
      expect(publicBody.data.some((t) => t.id === testimonialId)).toBe(true);
    });

    it('admin deletes the testimonial and it disappears from both listings', async () => {
      const delRes = await fetch(`${BASE_URL}/api/v1/cms/testimonials/${testimonialId}`, {
        method: 'DELETE',
        headers: authed(adminToken),
      });
      expect(delRes.status).toBe(204);

      const publicRes = await fetch(`${BASE_URL}/api/v1/cms/testimonials?limit=100`);
      const publicBody = (await publicRes.json()) as { data: Array<{ id: string }> };
      expect(publicBody.data.some((t) => t.id === testimonialId)).toBe(false);
    });
  });

  describe('faqs (general, not course-specific)', () => {
    let faqId: string;
    const question = `What is E2E ${randomUUID()}?`;

    it('rejects FAQ creation from an unauthenticated caller', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/faqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer: 'An end-to-end test.' }),
      });
      expect(res.status).toBe(401);
    });

    it('admin creates a general FAQ as DRAFT', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/faqs`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ question, answer: 'An end-to-end test.', category: 'general' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string };
      expect(body.status).toBe('DRAFT');
      faqId = body.id;
    });

    it('is not on the public FAQ list while DRAFT', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/faqs`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Array<{ id: string }>;
      expect(body.some((f) => f.id === faqId)).toBe(false);
    });

    it('admin updates the FAQ (publishes it) and it becomes publicly listable', async () => {
      const updateRes = await fetch(`${BASE_URL}/api/v1/cms/faqs/${faqId}`, {
        method: 'PATCH',
        headers: authed(adminToken),
        body: JSON.stringify({ status: 'PUBLISHED', answer: 'An updated end-to-end test answer.' }),
      });
      expect(updateRes.status).toBe(200);
      const updated = (await updateRes.json()) as { status: string; answer: string };
      expect(updated.status).toBe('PUBLISHED');
      expect(updated.answer).toBe('An updated end-to-end test answer.');

      const publicRes = await fetch(`${BASE_URL}/api/v1/cms/faqs`);
      const publicBody = (await publicRes.json()) as Array<{ id: string }>;
      expect(publicBody.some((f) => f.id === faqId)).toBe(true);
    });

    it('rejects FAQ updates from a non-admin token (RBAC)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/faqs/${faqId}`, {
        method: 'PATCH',
        headers: authed(studentToken),
        body: JSON.stringify({ status: 'HIDDEN' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('website content (upsert by key)', () => {
    const key = `e2e_hero_${randomUUID()}`;

    it('rejects an unauthenticated upsert', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hero', content: 'Welcome', status: 'DRAFT' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 for a public GET on a key that does not exist yet', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`);
      expect(res.status).toBe(404);
    });

    it('admin creates website content via PUT (upsert) as PUBLISHED', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`, {
        method: 'PUT',
        headers: authed(adminToken),
        body: JSON.stringify({
          title: 'Homepage Hero',
          content: 'Learn Quran online with certified teachers.',
          data: { ctaText: 'Book a free trial' },
          status: 'PUBLISHED',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { key: string; status: string; title: string };
      expect(body.key).toBe(key);
      expect(body.status).toBe('PUBLISHED');
      expect(body.title).toBe('Homepage Hero');
    });

    it('is now publicly gettable by key', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { key: string; content: string };
      expect(body.key).toBe(key);
      expect(body.content).toBe('Learn Quran online with certified teachers.');
    });

    it('a second PUT with the same key updates in place rather than duplicating', async () => {
      const beforeListRes = await fetch(`${BASE_URL}/api/v1/cms/content/admin/list`, {
        headers: authed(adminToken),
      });
      const beforeList = (await beforeListRes.json()) as Array<{ key: string }>;
      const beforeCount = beforeList.filter((c) => c.key === key).length;
      expect(beforeCount).toBe(1);
      const totalBefore = beforeList.length;

      const updateRes = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`, {
        method: 'PUT',
        headers: authed(adminToken),
        body: JSON.stringify({
          title: 'Homepage Hero v2',
          content: 'Updated hero copy.',
          status: 'PUBLISHED',
        }),
      });
      expect(updateRes.status).toBe(200);
      const updated = (await updateRes.json()) as { title: string; content: string };
      expect(updated.title).toBe('Homepage Hero v2');
      expect(updated.content).toBe('Updated hero copy.');

      const afterListRes = await fetch(`${BASE_URL}/api/v1/cms/content/admin/list`, {
        headers: authed(adminToken),
      });
      const afterList = (await afterListRes.json()) as Array<{ key: string }>;
      const afterCount = afterList.filter((c) => c.key === key).length;
      expect(afterCount).toBe(1);
      expect(afterList.length).toBe(totalBefore);

      const publicRes = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`);
      const publicBody = (await publicRes.json()) as { content: string };
      expect(publicBody.content).toBe('Updated hero copy.');
    });

    it('rejects a non-admin upsert (RBAC)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/cms/content/${key}`, {
        method: 'PUT',
        headers: authed(studentToken),
        body: JSON.stringify({ title: 'Hacked', status: 'PUBLISHED' }),
      });
      expect(res.status).toBe(403);
    });

    it('a draft content key is not visible via the public getter', async () => {
      const draftKey = `e2e_draft_${randomUUID()}`;
      const putRes = await fetch(`${BASE_URL}/api/v1/cms/content/${draftKey}`, {
        method: 'PUT',
        headers: authed(adminToken),
        body: JSON.stringify({ title: 'Draft Section', status: 'DRAFT' }),
      });
      expect(putRes.status).toBe(200);

      const publicRes = await fetch(`${BASE_URL}/api/v1/cms/content/${draftKey}`);
      expect(publicRes.status).toBe(404);

      const adminGetRes = await fetch(`${BASE_URL}/api/v1/cms/content/admin/${draftKey}`, {
        headers: authed(adminToken),
      });
      expect(adminGetRes.status).toBe(200);
      const adminGet = (await adminGetRes.json()) as { status: string };
      expect(adminGet.status).toBe('DRAFT');
    });
  });
});
