import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3109;
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

describe('Communication (e2e)', () => {
  let adminToken: string;
  let teacherUserId: string;
  let teacherToken: string;
  let studentUserId: string;
  let studentToken: string;

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');

    const teacherEmail = `e2e-comm-teacher-${randomUUID()}@example.com`;
    const teacherPassword = 'TeacherPass123';
    const teacherRes = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email: teacherEmail,
        password: teacherPassword,
        firstName: 'Comm',
        lastName: 'Teacher',
        bio: 'Bio.',
        qualification: 'Qualification.',
        countryCode: 'PK',
        timezone: 'Asia/Karachi',
      }),
    });
    const teacher = (await teacherRes.json()) as { userId: string };
    teacherUserId = teacher.userId;
    teacherToken = await login(teacherEmail, teacherPassword);

    const student = await registerAndLogin('STUDENT');
    studentToken = student.token;
    const profileRes = await fetch(`${BASE_URL}/api/v1/people/students/me`, {
      method: 'POST',
      headers: authed(studentToken),
      body: JSON.stringify({ firstName: 'Comm', countryCode: 'US', timezone: 'America/New_York' }),
    });
    const profile = (await profileRes.json()) as { userId: string };
    studentUserId = profile.userId;
  });

  describe('Messaging', () => {
    let conversationId: string;
    let messageBody: string;

    it('lets a teacher start a conversation with a student', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/messaging/conversations`, {
        method: 'POST',
        headers: authed(teacherToken),
        body: JSON.stringify({ participantUserIds: [studentUserId] }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; type: string; participantUserIds: string[] };
      expect(body.type).toBe('DIRECT');
      expect(body.participantUserIds.sort()).toEqual([studentUserId, teacherUserId].sort());
      conversationId = body.id;
    });

    it('lets the teacher send a message, and the student see it in their conversation list', async () => {
      messageBody = `Hello from teacher ${randomUUID()}`;
      const sendRes = await fetch(
        `${BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: authed(teacherToken),
          body: JSON.stringify({ body: messageBody }),
        },
      );
      expect(sendRes.status).toBe(201);
      const sent = (await sendRes.json()) as { id: string; senderId: string; body: string };
      expect(sent.senderId).toBe(teacherUserId);
      expect(sent.body).toBe(messageBody);

      const listRes = await fetch(`${BASE_URL}/api/v1/messaging/conversations/me`, {
        headers: authed(studentToken),
      });
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as Array<{ id: string }>;
      expect(list.some((c) => c.id === conversationId)).toBe(true);

      const messagesRes = await fetch(
        `${BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages`,
        { headers: authed(studentToken) },
      );
      expect(messagesRes.status).toBe(200);
      const messages = (await messagesRes.json()) as { data: Array<{ body: string }> };
      expect(messages.data.some((m) => m.body === messageBody)).toBe(true);
    });

    it('triggers a notification fan-out to the recipient', async () => {
      const notifRes = await fetch(`${BASE_URL}/api/v1/notifications/me`, {
        headers: authed(studentToken),
      });
      expect(notifRes.status).toBe(200);
      const notifs = (await notifRes.json()) as {
        data: Array<{ type: string; body: string; readAt: string | null }>;
      };
      const match = notifs.data.find((n) => n.type === 'NEW_MESSAGE' && n.body === messageBody);
      expect(match).toBeDefined();
      expect(match?.readAt).toBeNull();
    });

    it('lets the student mark the conversation as read', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/messaging/conversations/${conversationId}/read`, {
        method: 'PATCH',
        headers: authed(studentToken),
      });
      expect(res.status).toBe(204);
    });

    it('rejects a non-participant from reading or acting on the conversation', async () => {
      const outsider = await registerAndLogin('STUDENT');

      const messagesRes = await fetch(
        `${BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages`,
        { headers: authed(outsider.token) },
      );
      expect(messagesRes.status).toBe(403);

      const sendRes = await fetch(
        `${BASE_URL}/api/v1/messaging/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: authed(outsider.token),
          body: JSON.stringify({ body: 'sneaky' }),
        },
      );
      expect(sendRes.status).toBe(403);

      const readRes = await fetch(`${BASE_URL}/api/v1/messaging/conversations/${conversationId}/read`, {
        method: 'PATCH',
        headers: authed(outsider.token),
      });
      expect(readRes.status).toBe(403);

      const listRes = await fetch(`${BASE_URL}/api/v1/messaging/conversations/me`, {
        headers: authed(outsider.token),
      });
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as Array<{ id: string }>;
      expect(list.some((c) => c.id === conversationId)).toBe(false);
    });
  });

  describe('Announcements', () => {
    let announcementId: string;
    let announcementTitle: string;

    it('rejects a non-admin from creating an announcement', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/announcements`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({
          title: 'Should fail',
          body: 'Should fail',
          targets: [{ targetType: 'ALL_STUDENTS' }],
        }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects a malformed nested target instead of erroring at the database', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/announcements`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          title: 'Malformed target',
          body: 'Malformed target',
          targets: [{ targetType: 'NOT_A_REAL_TYPE' }],
        }),
      });
      expect(res.status).toBe(400);
    });

    it('lets an admin create a draft announcement targeted at ALL_STUDENTS', async () => {
      announcementTitle = `Ramadan schedule ${randomUUID()}`;
      const res = await fetch(`${BASE_URL}/api/v1/announcements`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          title: announcementTitle,
          body: 'New schedule details inside.',
          targets: [{ targetType: 'ALL_STUDENTS' }],
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string };
      expect(body.status).toBe('DRAFT');
      announcementId = body.id;
    });

    it('does not show an unpublished announcement in the student feed', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/announcements/me`, { headers: authed(studentToken) });
      expect(res.status).toBe(200);
      const list = (await res.json()) as Array<{ id: string }>;
      expect(list.some((a) => a.id === announcementId)).toBe(false);
    });

    it('publishes the announcement and fans out notifications', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/announcements/${announcementId}`, {
        method: 'PATCH',
        headers: authed(adminToken),
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; publishedAt: string | null };
      expect(body.status).toBe('PUBLISHED');
      expect(body.publishedAt).not.toBeNull();
    });

    it('shows the published announcement in the student feed, but not the teacher feed', async () => {
      const studentFeedRes = await fetch(`${BASE_URL}/api/v1/announcements/me`, {
        headers: authed(studentToken),
      });
      expect(studentFeedRes.status).toBe(200);
      const studentFeed = (await studentFeedRes.json()) as Array<{ id: string }>;
      expect(studentFeed.some((a) => a.id === announcementId)).toBe(true);

      const teacherFeedRes = await fetch(`${BASE_URL}/api/v1/announcements/me`, {
        headers: authed(teacherToken),
      });
      expect(teacherFeedRes.status).toBe(200);
      const teacherFeed = (await teacherFeedRes.json()) as Array<{ id: string }>;
      expect(teacherFeed.some((a) => a.id === announcementId)).toBe(false);
    });

    it('recorded a notification for the student referencing the announcement', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/notifications/me?limit=100`, {
        headers: authed(studentToken),
      });
      expect(res.status).toBe(200);
      const notifs = (await res.json()) as { data: Array<{ type: string; title: string }> };
      expect(
        notifs.data.some((n) => n.type === 'ANNOUNCEMENT' && n.title === announcementTitle),
      ).toBe(true);
    });

    it('did not notify the teacher, who was not targeted', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/notifications/me?limit=100`, {
        headers: authed(teacherToken),
      });
      expect(res.status).toBe(200);
      const notifs = (await res.json()) as { data: Array<{ type: string; title: string }> };
      expect(
        notifs.data.some((n) => n.type === 'ANNOUNCEMENT' && n.title === announcementTitle),
      ).toBe(false);
    });
  });

  describe('Notifications', () => {
    it('lets a user mark their own notification as read, and rejects marking another user\'s notification', async () => {
      const listRes = await fetch(`${BASE_URL}/api/v1/notifications/me?limit=100`, {
        headers: authed(studentToken),
      });
      const list = (await listRes.json()) as { data: Array<{ id: string; readAt: string | null }> };
      const unread = list.data.find((n) => n.readAt === null);
      expect(unread).toBeDefined();

      const markRes = await fetch(`${BASE_URL}/api/v1/notifications/${unread!.id}/read`, {
        method: 'PATCH',
        headers: authed(studentToken),
      });
      expect(markRes.status).toBe(200);
      const marked = (await markRes.json()) as { readAt: string | null };
      expect(marked.readAt).not.toBeNull();

      // A different user cannot mark someone else's notification as read.
      const outsider = await registerAndLogin('STUDENT');
      const otherMarkRes = await fetch(`${BASE_URL}/api/v1/notifications/${unread!.id}/read`, {
        method: 'PATCH',
        headers: authed(outsider.token),
      });
      expect(otherMarkRes.status).toBe(404);
    });

    it("only lists a user's own notifications", async () => {
      const outsider = await registerAndLogin('STUDENT');
      const res = await fetch(`${BASE_URL}/api/v1/notifications/me?limit=100`, {
        headers: authed(outsider.token),
      });
      expect(res.status).toBe(200);
      const list = (await res.json()) as { data: Array<{ id: string }> };
      expect(list.data.length).toBe(0);
    });

    it('marks all remaining notifications as read', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/notifications/read-all`, {
        method: 'PATCH',
        headers: authed(studentToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { updated: number };
      expect(body.updated).toBeGreaterThanOrEqual(0);

      const listRes = await fetch(`${BASE_URL}/api/v1/notifications/me?limit=100`, {
        headers: authed(studentToken),
      });
      const list = (await listRes.json()) as { data: Array<{ readAt: string | null }> };
      expect(list.data.every((n) => n.readAt !== null)).toBe(true);
    });
  });
});
