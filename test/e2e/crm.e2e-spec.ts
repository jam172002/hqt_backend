import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3107;
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

describe('CRM (e2e)', () => {
  let adminToken: string;
  let adminUserId: string;
  let courseId: string;
  let teacherId: string;

  function trialRequestPayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      studentName: 'Yusuf Ali',
      studentAge: 10,
      guardianName: 'Ali Hassan',
      countryCode: 'PK',
      whatsapp: '+923001234567',
      email: `e2e-lead-${randomUUID()}@example.com`,
      courseId,
      preferredDays: ['MON', 'WED'],
      preferredTime: '18:00',
      timezone: 'Asia/Karachi',
      message: 'Interested in a trial class.',
      ...overrides,
    };
  }

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');

    const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: authed(adminToken) });
    const me = (await meRes.json()) as { id: string };
    adminUserId = me.id;

    const courseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
    const course = (await courseRes.json()) as { id: string };
    courseId = course.id;

    const teacherRes = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email: `e2e-crm-teacher-${randomUUID()}@example.com`,
        password: 'TeacherPass123',
        firstName: 'C',
        lastName: 'D',
        bio: 'Bio.',
        qualification: 'Qualification.',
        countryCode: 'PK',
        timezone: 'Asia/Karachi',
      }),
    });
    const teacher = (await teacherRes.json()) as { id: string };
    teacherId = teacher.id;
  });

  it('lets an unauthenticated visitor submit a contact inquiry', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/crm/contact-inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Visitor Person',
        email: `e2e-visitor-${randomUUID()}@example.com`,
        subject: 'Question about pricing',
        message: 'How much does the Hifz course cost?',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe('NEW');
    expect(body.id).toBeTruthy();
  });

  it('rejects an invalid contact inquiry payload (missing required fields)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/crm/contact-inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Incomplete' }),
    });
    expect(res.status).toBe(400);
  });

  it('lets an unauthenticated visitor submit a trial request', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trialRequestPayload()),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; courseId: string };
    expect(body.status).toBe('NEW');
    expect(body.courseId).toBe(courseId);
  });

  it('rejects unauthenticated access to admin CRM listing/assign/convert routes', async () => {
    const listRes = await fetch(`${BASE_URL}/api/v1/crm/trial-requests`);
    expect(listRes.status).toBe(401);

    const inquiryListRes = await fetch(`${BASE_URL}/api/v1/crm/contact-inquiries`);
    expect(inquiryListRes.status).toBe(401);
  });

  it('rejects a student/teacher token on admin CRM routes (RBAC)', async () => {
    const student = await registerAndLogin('STUDENT');

    const listRes = await fetch(`${BASE_URL}/api/v1/crm/trial-requests`, {
      headers: authed(student.token),
    });
    expect(listRes.status).toBe(403);

    const inquiryListRes = await fetch(`${BASE_URL}/api/v1/crm/contact-inquiries`, {
      headers: authed(student.token),
    });
    expect(inquiryListRes.status).toBe(403);
  });

  describe('admin trial-request pipeline: list -> assign -> schedule -> convert (new student)', () => {
    let trialRequestId: string;

    beforeAll(async () => {
      const createRes = await fetch(`${BASE_URL}/api/v1/crm/trial-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trialRequestPayload()),
      });
      const created = (await createRes.json()) as { id: string };
      trialRequestId = created.id;
    });

    it('admin lists pending trial requests and sees the created one', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests?status=NEW`, {
        headers: authed(adminToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string; status: string }> };
      expect(body.data.some((r) => r.id === trialRequestId)).toBe(true);
    });

    it('admin views a single trial request by id', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}`, {
        headers: authed(adminToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(trialRequestId);
    });

    it('admin assigns the trial request to themselves', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}`, {
        method: 'PATCH',
        headers: authed(adminToken),
        body: JSON.stringify({ assignedAdminId: adminUserId, status: 'CONTACTED' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { assignedAdminId: string; status: string };
      expect(body.assignedAdminId).toBe(adminUserId);
      expect(body.status).toBe('CONTACTED');
    });

    it('admin schedules a trial session, which moves the request to TRIAL_SCHEDULED', async () => {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}/sessions`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          teacherId,
          scheduledStartAt: start.toISOString(),
          scheduledEndAt: end.toISOString(),
          timezone: 'Asia/Karachi',
        }),
      });
      expect(res.status).toBe(201);
      const session = (await res.json()) as { id: string; teacherId: string; status: string };
      expect(session.teacherId).toBe(teacherId);
      expect(session.status).toBe('SCHEDULED');

      const listSessionsRes = await fetch(
        `${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}/sessions`,
        { headers: authed(adminToken) },
      );
      expect(listSessionsRes.status).toBe(200);
      const sessions = (await listSessionsRes.json()) as Array<{ id: string }>;
      expect(sessions.some((s) => s.id === session.id)).toBe(true);

      const trialRequestRes = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}`, {
        headers: authed(adminToken),
      });
      const trialRequest = (await trialRequestRes.json()) as { status: string };
      expect(trialRequest.status).toBe('TRIAL_SCHEDULED');

      // update the trial session directly via /crm/trial-sessions/:id
      const updateRes = await fetch(`${BASE_URL}/api/v1/crm/trial-sessions/${session.id}`, {
        method: 'PATCH',
        headers: authed(adminToken),
        body: JSON.stringify({ status: 'COMPLETED', notes: 'Went well' }),
      });
      expect(updateRes.status).toBe(200);
      const updatedSession = (await updateRes.json()) as { status: string; notes: string };
      expect(updatedSession.status).toBe('COMPLETED');
      expect(updatedSession.notes).toBe('Went well');

      const afterCompleteRes = await fetch(
        `${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}`,
        { headers: authed(adminToken) },
      );
      const afterComplete = (await afterCompleteRes.json()) as { status: string };
      expect(afterComplete.status).toBe('TRIAL_COMPLETED');
    });

    it('rejects convert from a student/teacher token (RBAC)', async () => {
      const student = await registerAndLogin('STUDENT');
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}/convert`, {
        method: 'POST',
        headers: authed(student.token),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('admin converts the trial request into a brand-new student + TRIAL enrollment', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}/convert`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        status: string;
        convertedUserId: string;
        convertedEnrollmentId: string;
      };
      expect(body.status).toBe('ENROLLED');
      expect(body.convertedUserId).toBeTruthy();
      expect(body.convertedEnrollmentId).toBeTruthy();

      // The new user should now be able to log in as a STUDENT and see the TRIAL enrollment.
      // We don't have the auto-generated user's password, but we can verify server-side
      // state via the admin enrollment lookup instead.
      const enrollmentRes = await fetch(
        `${BASE_URL}/api/v1/enrollments/${body.convertedEnrollmentId}`,
        { headers: authed(adminToken) },
      );
      expect(enrollmentRes.status).toBe(200);
      const enrollment = (await enrollmentRes.json()) as { status: string; courseId: string };
      expect(enrollment.status).toBe('TRIAL');
      expect(enrollment.courseId).toBe(courseId);
    });

    it('rejects converting the same trial request twice', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}/convert`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('admin converts a trial request by linking an existing student profile', () => {
    let trialRequestId: string;
    let existingStudentProfileId: string;

    beforeAll(async () => {
      const createRes = await fetch(`${BASE_URL}/api/v1/crm/trial-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trialRequestPayload({ studentName: 'Existing Student' })),
      });
      const created = (await createRes.json()) as { id: string };
      trialRequestId = created.id;

      const student = await registerAndLogin('STUDENT');
      const profileRes = await fetch(`${BASE_URL}/api/v1/people/students/me`, {
        method: 'POST',
        headers: authed(student.token),
        body: JSON.stringify({ firstName: 'Existing', countryCode: 'US', timezone: 'America/New_York' }),
      });
      const profile = (await profileRes.json()) as { id: string; userId?: string };
      existingStudentProfileId = profile.id;
    });

    it('links to the existing studentProfileId instead of creating a new user', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${trialRequestId}/convert`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ studentProfileId: existingStudentProfileId }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        status: string;
        convertedUserId: string;
        convertedEnrollmentId: string;
      };
      expect(body.status).toBe('ENROLLED');
      expect(body.convertedUserId).toBeTruthy();
      expect(body.convertedEnrollmentId).toBeTruthy();

      const enrollmentRes = await fetch(
        `${BASE_URL}/api/v1/enrollments/${body.convertedEnrollmentId}`,
        { headers: authed(adminToken) },
      );
      expect(enrollmentRes.status).toBe(200);
      const enrollment = (await enrollmentRes.json()) as { status: string; studentId: string };
      expect(enrollment.status).toBe('TRIAL');
      expect(enrollment.studentId).toBe(existingStudentProfileId);
    });

    it('returns 404 converting with a non-existent studentProfileId', async () => {
      const createRes = await fetch(`${BASE_URL}/api/v1/crm/trial-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trialRequestPayload({ studentName: 'Bad Link' })),
      });
      const created = (await createRes.json()) as { id: string };

      const res = await fetch(`${BASE_URL}/api/v1/crm/trial-requests/${created.id}/convert`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ studentProfileId: randomUUID() }),
      });
      expect(res.status).toBe(404);
    });
  });

  // Last in the file on purpose: ThrottleGuard's in-memory bucket is keyed by
  // (route, caller IP) for the lifetime of this spec's server process, shared
  // across every test above that also POSTs to this endpoint - running this
  // last means it only has to push past whatever count those left behind,
  // and nothing after it needs headroom back.
  it('rate-limits repeated contact-inquiry submissions from the same caller (SRS Section 46 spam protection)', async () => {
    const submit = () =>
      fetch(`${BASE_URL}/api/v1/crm/contact-inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Spam Bot',
          email: `e2e-throttle-${randomUUID()}@example.com`,
          subject: 'x',
          message: 'x',
        }),
      });

    let sawTooManyRequests = false;
    for (let i = 0; i < 30 && !sawTooManyRequests; i++) {
      const res = await submit();
      if (res.status === 429) {
        sawTooManyRequests = true;
        expect(res.headers.get('retry-after')).toBeTruthy();
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('TOO_MANY_REQUESTS');
      } else {
        expect(res.status).toBe(201);
      }
    }
    expect(sawTooManyRequests).toBe(true);
  });
});
