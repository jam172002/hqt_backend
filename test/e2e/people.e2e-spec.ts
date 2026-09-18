import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/**
 * Same approach as auth.e2e-spec.ts: drives the real built server over
 * plain HTTP rather than importing @nestjs/testing into the Jest-executed
 * file (see that file's header comment for why).
 */

const PORT = 3102;
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

describe('People (e2e)', () => {
  // Seeded by `prisma db seed` - see src/prisma/seed.ts.
  const superAdminEmail = 'admin@hqt.local';
  const superAdminPassword = 'ChangeMe123!';

  let adminToken: string;

  const teacherEmail = `e2e-teacher-${randomUUID()}@example.com`;
  const teacherPassword = 'TeacherPass123';
  let teacherProfileId: string;

  const parentEmail = `e2e-parent-${randomUUID()}@example.com`;
  const parentPassword = 'ParentPass123';
  let parentToken: string;

  beforeAll(async () => {
    adminToken = await login(superAdminEmail, superAdminPassword);
  });

  it('lets the seeded super admin fetch their own admin profile', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/people/admins/me`, {
      headers: authed(adminToken),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { firstName: string };
    expect(body.firstName).toBe('Super');
  });

  it('admin creates a teacher account, which appears in the public listing', async () => {
    const createRes = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email: teacherEmail,
        password: teacherPassword,
        firstName: 'Ahmed',
        lastName: 'Khan',
        bio: 'Ten years teaching Quran recitation and Tajweed.',
        qualification: 'Ijazah in Quran recitation',
        experienceYears: 10,
        countryCode: 'PK',
        timezone: 'Asia/Karachi',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; status: string };
    expect(created.status).toBe('ACTIVE');
    teacherProfileId = created.id;

    const listRes = await fetch(`${BASE_URL}/api/v1/people/teachers`);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    expect(list.data.some((t) => t.id === teacherProfileId)).toBe(true);

    const detailRes = await fetch(`${BASE_URL}/api/v1/people/teachers/${teacherProfileId}`);
    expect(detailRes.status).toBe(200);
  });

  it('the new teacher can log in, view and update their own profile', async () => {
    const teacherToken = await login(teacherEmail, teacherPassword);

    const meRes = await fetch(`${BASE_URL}/api/v1/people/teachers/me`, {
      headers: authed(teacherToken),
    });
    expect(meRes.status).toBe(200);

    const updateRes = await fetch(`${BASE_URL}/api/v1/people/teachers/me`, {
      method: 'PATCH',
      headers: authed(teacherToken),
      body: JSON.stringify({ shortBio: 'Patient, experienced Tajweed teacher.' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as { shortBio: string };
    expect(updated.shortBio).toBe('Patient, experienced Tajweed teacher.');

    // Role guard: a teacher must not reach an admin-only route.
    const forbiddenRes = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(teacherToken),
      body: JSON.stringify({}),
    });
    expect(forbiddenRes.status).toBe(403);
  });

  it('a parent can create their profile and manage multiple children', async () => {
    await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: parentEmail, password: parentPassword, role: 'PARENT' }),
    });
    parentToken = await login(parentEmail, parentPassword);

    const profileRes = await fetch(`${BASE_URL}/api/v1/people/parents/me`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({ firstName: 'Fatima', lastName: 'Ali', countryCode: 'AE', timezone: 'Asia/Dubai' }),
    });
    expect(profileRes.status).toBe(201);

    const child1 = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({
        firstName: 'Yusuf',
        countryCode: 'AE',
        timezone: 'Asia/Dubai',
        relationshipType: 'FATHER',
      }),
    });
    expect(child1.status).toBe(201);

    const child2 = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({
        firstName: 'Maryam',
        countryCode: 'AE',
        timezone: 'Asia/Dubai',
        relationshipType: 'FATHER',
      }),
    });
    expect(child2.status).toBe(201);

    const listRes = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      headers: authed(parentToken),
    });
    expect(listRes.status).toBe(200);
    const children = (await listRes.json()) as Array<{ student: { firstName: string } }>;
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.student.firstName).sort()).toEqual(['Maryam', 'Yusuf']);
  });

  it('rejects an invalid IANA timezone, country code, and relationship type', async () => {
    const base = { firstName: 'X', relationshipType: 'FATHER' };

    const badTimezone = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({ ...base, countryCode: 'AE', timezone: 'Not/AZone' }),
    });
    expect(badTimezone.status).toBe(400);

    const badCountry = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({ ...base, countryCode: 'UAE', timezone: 'Asia/Dubai' }),
    });
    expect(badCountry.status).toBe(400);

    const badRelationship = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({
        firstName: 'X',
        countryCode: 'AE',
        timezone: 'Asia/Dubai',
        relationshipType: 'UNCLE',
      }),
    });
    expect(badRelationship.status).toBe(400);
  });

  it('admin can list students and parents', async () => {
    const studentsRes = await fetch(`${BASE_URL}/api/v1/people/students`, {
      headers: authed(adminToken),
    });
    expect(studentsRes.status).toBe(200);
    const students = (await studentsRes.json()) as { meta: { total: number } };
    expect(students.meta.total).toBeGreaterThanOrEqual(2);

    const parentsRes = await fetch(`${BASE_URL}/api/v1/people/parents`, {
      headers: authed(adminToken),
    });
    expect(parentsRes.status).toBe(200);
  });
});
