import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3104;
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

describe('Enrollment (e2e)', () => {
  let adminToken: string;
  let courseId: string;
  let teacherId: string;
  let studentProfileId: string;
  let studentToken: string;
  let enrollmentId: string;

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');

    const courseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
    const course = (await courseRes.json()) as { id: string };
    courseId = course.id;

    const teacherRes = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email: `e2e-enroll-teacher-${randomUUID()}@example.com`,
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
    teacherId = teacher.id;

    const student = await registerAndLogin('STUDENT');
    studentToken = student.token;
    const profileRes = await fetch(`${BASE_URL}/api/v1/people/students/me`, {
      method: 'POST',
      headers: authed(studentToken),
      body: JSON.stringify({ firstName: 'Zayd', countryCode: 'US', timezone: 'America/New_York' }),
    });
    const profile = (await profileRes.json()) as { id: string };
    studentProfileId = profile.id;
  });

  it('rejects enrollment creation without an admin token', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/enrollments`, {
      method: 'POST',
      headers: authed(studentToken),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it('admin creates a TRIAL enrollment for the student', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/enrollments`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        studentId: studentProfileId,
        courseId,
        status: 'TRIAL',
        studentTimezone: 'America/New_York',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; startedAt: string | null };
    expect(body.status).toBe('TRIAL');
    expect(body.startedAt).toBeNull();
    enrollmentId = body.id;
  });

  it('rejects an invalid status transition (TRIAL -> COMPLETED)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    expect(res.status).toBe(409);
  });

  it('allows the valid transition TRIAL -> ACTIVE and sets startedAt', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'ACTIVE', reason: 'Trial went well' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; startedAt: string | null; notes: string };
    expect(body.status).toBe('ACTIVE');
    expect(body.startedAt).not.toBeNull();
    expect(body.notes).toBe('Trial went well');
  });

  it('assigns a teacher, recording history, and rejects reassigning the same teacher', async () => {
    const assignRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/teacher`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ teacherId, reason: 'Initial assignment' }),
    });
    expect(assignRes.status).toBe(200);
    const assigned = (await assignRes.json()) as { teacherId: string };
    expect(assigned.teacherId).toBe(teacherId);

    const reassignRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/teacher`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ teacherId }),
    });
    expect(reassignRes.status).toBe(400);
  });

  it('lets the student see their own enrollment but not use admin routes', async () => {
    const listRes = await fetch(`${BASE_URL}/api/v1/enrollments/me`, { headers: authed(studentToken) });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    expect(list.data.some((e) => e.id === enrollmentId)).toBe(true);

    const detailRes = await fetch(`${BASE_URL}/api/v1/enrollments/me/${enrollmentId}`, {
      headers: authed(studentToken),
    });
    expect(detailRes.status).toBe(200);

    const adminListRes = await fetch(`${BASE_URL}/api/v1/enrollments`, { headers: authed(studentToken) });
    expect(adminListRes.status).toBe(403);
  });

  it('reaches COMPLETED, after which no further transitions are allowed', async () => {
    const pauseRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'PAUSED' }),
    });
    expect(pauseRes.status).toBe(200);

    const resumeRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expect(resumeRes.status).toBe(200);

    const completeRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    expect(completeRes.status).toBe(200);
    const completed = (await completeRes.json()) as { status: string; endedAt: string | null };
    expect(completed.status).toBe('COMPLETED');
    expect(completed.endedAt).not.toBeNull();

    const terminalRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expect(terminalRes.status).toBe(409);

    // A completed enrollment can no longer have its teacher reassigned.
    const reassignRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/teacher`, {
      method: 'PATCH',
      headers: authed(adminToken),
      body: JSON.stringify({ teacherId }),
    });
    expect(reassignRes.status).toBe(400);
  });

  it("a parent can view their own child's enrollments, but an unrelated parent cannot", async () => {
    const parentA = await registerAndLogin('PARENT');
    await fetch(`${BASE_URL}/api/v1/people/parents/me`, {
      method: 'POST',
      headers: authed(parentA.token),
      body: JSON.stringify({ firstName: 'Amina', countryCode: 'US', timezone: 'America/New_York' }),
    });
    const childRes = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentA.token),
      body: JSON.stringify({
        firstName: 'Sara',
        countryCode: 'US',
        timezone: 'America/New_York',
        relationshipType: 'MOTHER',
      }),
    });
    const child = (await childRes.json()) as { student: { id: string } };

    const childEnrollRes = await fetch(`${BASE_URL}/api/v1/enrollments`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        studentId: child.student.id,
        courseId,
        studentTimezone: 'America/New_York',
      }),
    });
    expect(childEnrollRes.status).toBe(201);

    const parentAViewRes = await fetch(
      `${BASE_URL}/api/v1/enrollments/children/${child.student.id}`,
      { headers: authed(parentA.token) },
    );
    expect(parentAViewRes.status).toBe(200);
    const parentAView = (await parentAViewRes.json()) as { meta: { total: number } };
    expect(parentAView.meta.total).toBe(1);

    const parentB = await registerAndLogin('PARENT');
    await fetch(`${BASE_URL}/api/v1/people/parents/me`, {
      method: 'POST',
      headers: authed(parentB.token),
      body: JSON.stringify({ firstName: 'Noor', countryCode: 'US', timezone: 'America/New_York' }),
    });

    const parentBViewRes = await fetch(
      `${BASE_URL}/api/v1/enrollments/children/${child.student.id}`,
      { headers: authed(parentB.token) },
    );
    expect(parentBViewRes.status).toBe(404);
  });
});
