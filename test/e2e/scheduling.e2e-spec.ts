import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { DateTime } from 'luxon';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3105;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let server: ChildProcess;

async function waitForHealth(timeoutMs = 60_000): Promise<void> {
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
}, 70_000);

afterAll(() => {
  server?.kill();
});

describe('Scheduling (e2e)', () => {
  let adminToken: string;
  let courseId: string;

  let teacherAId: string;
  let teacherAUserId: string;
  let teacherAToken: string;

  let teacherBToken: string;

  let studentToken: string;
  let studentProfileId: string;

  let enrollmentId: string;

  // The schedule lives in this (non-UTC) IANA zone, matching how the service
  // resolves a recurring local weekday/time into a UTC instant. "Today" in
  // this zone is used as the first occurrence, so the math works regardless
  // of which weekday the suite happens to run on.
  const SCHEDULE_ZONE = 'Asia/Karachi';
  let scheduleDayOfWeek: number;
  let effectiveFromDate: string; // YYYY-MM-DD, "today" in SCHEDULE_ZONE
  let firstOccurrenceUtc: DateTime;
  let secondOccurrenceUtc: DateTime;

  async function createTeacher(): Promise<{ id: string; userId: string; token: string }> {
    const email = `e2e-sched-teacher-${randomUUID()}@example.com`;
    const password = 'TeacherPass123';
    const res = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email,
        password,
        firstName: 'Sched',
        lastName: 'Teacher',
        bio: 'Bio.',
        qualification: 'Qualification.',
        countryCode: 'PK',
        timezone: 'Asia/Karachi',
      }),
    });
    const body = (await res.json()) as { id: string; userId: string };
    const token = await login(email, password);
    return { id: body.id, userId: body.userId, token };
  }

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');

    const courseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
    const course = (await courseRes.json()) as { id: string };
    courseId = course.id;

    const teacherA = await createTeacher();
    teacherAId = teacherA.id;
    teacherAUserId = teacherA.userId;
    teacherAToken = teacherA.token;

    const teacherB = await createTeacher();
    teacherBToken = teacherB.token;

    const student = await registerAndLogin('STUDENT');
    studentToken = student.token;
    const profileRes = await fetch(`${BASE_URL}/api/v1/people/students/me`, {
      method: 'POST',
      headers: authed(studentToken),
      body: JSON.stringify({ firstName: 'Bilal', countryCode: 'US', timezone: 'America/New_York' }),
    });
    const profile = (await profileRes.json()) as { id: string };
    studentProfileId = profile.id;

    // Create the enrollment already assigned to teacher A, then activate it -
    // class schedules can only be created for an ACTIVE (or otherwise
    // non-terminal) enrollment that has a teacher.
    const enrollRes = await fetch(`${BASE_URL}/api/v1/enrollments`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        studentId: studentProfileId,
        courseId,
        teacherId: teacherAId,
        status: 'PENDING',
        studentTimezone: 'Asia/Karachi',
      }),
    });
    const enrollment = (await enrollRes.json()) as { id: string };
    enrollmentId = enrollment.id;

    const activateRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollmentId}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expect(activateRes.status).toBe(200);

    const todayLocal = DateTime.now().setZone(SCHEDULE_ZONE).startOf('day');
    scheduleDayOfWeek = todayLocal.weekday % 7; // Luxon: 1=Monday..7=Sunday -> 0=Sunday..6=Saturday
    effectiveFromDate = todayLocal.toISODate()!;
    firstOccurrenceUtc = todayLocal.set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toUTC();
    secondOccurrenceUtc = firstOccurrenceUtc.plus({ days: 7 });
  }, 30_000); // several sequential HTTP round trips - past Jest's default 5s hook timeout under load

  describe('teacher availability', () => {
    let ruleId: string;
    let exceptionId: string;

    it('rejects a student trying to add an availability rule', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'Asia/Karachi' }),
      });
      expect(res.status).toBe(403);
    });

    it('lets a teacher add a weekly recurring availability rule', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'Asia/Karachi' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      };
      expect(body.dayOfWeek).toBe(1);
      expect(body.startTime).toBe('09:00');
      expect(body.endTime).toBe('17:00');
      expect(body.isActive).toBe(true);
      ruleId = body.id;
    });

    it('rejects a rule where startTime is not before endTime', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({ dayOfWeek: 1, startTime: '17:00', endTime: '09:00', timezone: 'Asia/Karachi' }),
      });
      expect(res.status).toBe(400);
    });

    it('lists the rule under the owning teacher', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules/me`, {
        headers: authed(teacherAToken),
      });
      expect(res.status).toBe(200);
      const rules = (await res.json()) as Array<{ id: string }>;
      expect(rules.some((r) => r.id === ruleId)).toBe(true);
    });

    it('adds an unavailability exception and lists it', async () => {
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/exceptions`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({ startsAt, endsAt, type: 'UNAVAILABLE', reason: 'Doctor appointment' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; type: string; reason: string | null };
      expect(body.type).toBe('UNAVAILABLE');
      expect(body.reason).toBe('Doctor appointment');
      exceptionId = body.id;

      const listRes = await fetch(`${BASE_URL}/api/v1/scheduling/availability/exceptions/me`, {
        headers: authed(teacherAToken),
      });
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as Array<{ id: string }>;
      expect(list.some((e) => e.id === exceptionId)).toBe(true);
    });

    it('lets an admin view the combined rules + exceptions for a teacher', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/teachers/${teacherAId}`, {
        headers: authed(adminToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        rules: Array<{ id: string }>;
        exceptions: Array<{ id: string }>;
      };
      expect(body.rules.some((r) => r.id === ruleId)).toBe(true);
      expect(body.exceptions.some((e) => e.id === exceptionId)).toBe(true);
    });

    it("a teacher cannot update or delete another teacher's availability rule", async () => {
      const updateRes = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules/${ruleId}`, {
        method: 'PATCH',
        headers: authed(teacherBToken),
        body: JSON.stringify({ isActive: false }),
      });
      expect(updateRes.status).toBe(404);

      const deleteRes = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules/${ruleId}`, {
        method: 'DELETE',
        headers: authed(teacherBToken),
      });
      expect(deleteRes.status).toBe(404);
    });

    it('lets the owning teacher deactivate their own rule', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/availability/rules/${ruleId}`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ isActive: false }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { isActive: boolean };
      expect(body.isActive).toBe(false);
    });
  });

  describe('class schedules and generated sessions', () => {
    let scheduleId: string;
    let firstSessionId: string;
    let secondSessionId: string;

    it('rejects a student trying to create a class schedule', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/schedules`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('rejects a plain teacher trying to create a class schedule (admin-only)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/schedules`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(403);
    });

    it('admin creates a recurring class schedule for the enrollment', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/schedules`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          enrollmentId,
          dayOfWeek: scheduleDayOfWeek,
          localStartTime: '10:00',
          durationMinutes: 30,
          timezone: SCHEDULE_ZONE,
          effectiveFrom: effectiveFromDate,
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        dayOfWeek: number;
        localStartTime: string;
        status: string;
        teacherId: string;
        studentId: string;
      };
      expect(body.dayOfWeek).toBe(scheduleDayOfWeek);
      expect(body.localStartTime).toBe('10:00');
      expect(body.status).toBe('ACTIVE');
      expect(body.teacherId).toBe(teacherAId);
      expect(body.studentId).toBe(studentProfileId);
      scheduleId = body.id;
    });

    it('generates sessions landing on the correct weekday/time, and is idempotent on re-run', async () => {
      const rangeStart = effectiveFromDate;
      const rangeEnd = DateTime.fromISO(effectiveFromDate, { zone: SCHEDULE_ZONE })
        .plus({ days: 13 }) // covers two occurrences, one week apart
        .toISODate()!;

      const firstRes = await fetch(`${BASE_URL}/api/v1/scheduling/schedules/${scheduleId}/generate-sessions`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ from: rangeStart, to: rangeEnd }),
      });
      expect(firstRes.status).toBe(201);
      const created = (await firstRes.json()) as Array<{
        id: string;
        scheduledStartAt: string;
        status: string;
      }>;
      expect(created).toHaveLength(2);

      for (const session of created) {
        const startLocal = DateTime.fromISO(session.scheduledStartAt, { zone: 'utc' }).setZone(SCHEDULE_ZONE);
        expect(startLocal.weekday % 7).toBe(scheduleDayOfWeek);
        expect(startLocal.hour).toBe(10);
        expect(startLocal.minute).toBe(0);
        expect(session.status).toBe('SCHEDULED');
      }

      const sorted = [...created].sort(
        (a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime(),
      );
      firstSessionId = sorted[0].id;
      secondSessionId = sorted[1].id;
      expect(new Date(sorted[0].scheduledStartAt).toISOString()).toBe(firstOccurrenceUtc.toJSDate().toISOString());
      expect(new Date(sorted[1].scheduledStartAt).toISOString()).toBe(secondOccurrenceUtc.toJSDate().toISOString());
      const gapDays =
        (new Date(sorted[1].scheduledStartAt).getTime() - new Date(sorted[0].scheduledStartAt).getTime()) /
        (24 * 60 * 60 * 1000);
      expect(gapDays).toBe(7);

      // Re-running generate-sessions over the same range must not create duplicates.
      const secondRes = await fetch(`${BASE_URL}/api/v1/scheduling/schedules/${scheduleId}/generate-sessions`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ from: rangeStart, to: rangeEnd }),
      });
      expect(secondRes.status).toBe(201);
      const secondBatch = (await secondRes.json()) as unknown[];
      expect(secondBatch).toHaveLength(0);

      const listRes = await fetch(
        `${BASE_URL}/api/v1/scheduling/sessions?enrollmentId=${enrollmentId}&limit=50`,
        { headers: authed(adminToken) },
      );
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as { meta: { total: number } };
      expect(list.meta.total).toBe(2);
    });

    it('admin updates the schedule', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: authed(adminToken),
        body: JSON.stringify({ durationMinutes: 45 }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { durationMinutes: number };
      expect(body.durationMinutes).toBe(45);
    });

    it("a teacher cannot reschedule or cancel another teacher's session", async () => {
      const rescheduleRes = await fetch(`${BASE_URL}/api/v1/scheduling/sessions/${firstSessionId}/reschedule`, {
        method: 'PATCH',
        headers: authed(teacherBToken),
        body: JSON.stringify({ newStartAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
      });
      expect(rescheduleRes.status).toBe(404);

      const cancelRes = await fetch(`${BASE_URL}/api/v1/scheduling/sessions/${secondSessionId}/cancel`, {
        method: 'PATCH',
        headers: authed(teacherBToken),
        body: JSON.stringify({ reason: 'Not mine to cancel' }),
      });
      expect(cancelRes.status).toBe(404);
    });

    it('the assigned teacher reschedules a session: old one becomes RESCHEDULED, a new row is created', async () => {
      const newStartAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/sessions/${firstSessionId}/reschedule`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ newStartAt, reason: 'Student requested a later time' }),
      });
      expect(res.status).toBe(200);
      const created = (await res.json()) as {
        id: string;
        status: string;
        rescheduledFromId: string | null;
        scheduledStartAt: string;
      };
      expect(created.status).toBe('SCHEDULED');
      expect(created.rescheduledFromId).toBe(firstSessionId);
      expect(new Date(created.scheduledStartAt).toISOString()).toBe(new Date(newStartAt).toISOString());

      const oldRes = await fetch(`${BASE_URL}/api/v1/scheduling/sessions/${firstSessionId}`, {
        headers: authed(adminToken),
      });
      expect(oldRes.status).toBe(200);
      const old = (await oldRes.json()) as { status: string };
      expect(old.status).toBe('RESCHEDULED');
    });

    it('the assigned teacher cancels a session, recording cancelledBy and cancellationReason', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/sessions/${secondSessionId}/cancel`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ reason: 'Teacher unavailable' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        cancelledAt: string | null;
        cancelledBy: string | null;
        cancellationReason: string | null;
      };
      expect(body.status).toBe('CANCELLED');
      expect(body.cancelledAt).not.toBeNull();
      expect(body.cancellationReason).toBe('Teacher unavailable');
      // cancelledBy records the actor's user id, not their teacher-profile id.
      expect(body.cancelledBy).toBe(teacherAUserId);
    });

    it('cannot cancel a session that is already cancelled', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/scheduling/sessions/${secondSessionId}/cancel`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ reason: 'Again' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
