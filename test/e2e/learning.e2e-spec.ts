import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3106;
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

describe('Learning (e2e)', () => {
  let adminToken: string;
  let courseId: string;

  let teacherAId: string;
  let teacherAToken: string;

  let teacherBToken: string;

  let studentAToken: string;
  let studentAProfileId: string;

  let studentBToken: string;

  let enrollmentId: string;
  let sessionId: string;

  let parentToken: string;
  let childTrueEnrollmentId: string;
  let childFalseEnrollmentId: string;

  async function createTeacher(): Promise<{ id: string; userId: string; token: string }> {
    const email = `e2e-learn-teacher-${randomUUID()}@example.com`;
    const password = 'TeacherPass123';
    const res = await fetch(`${BASE_URL}/api/v1/people/teachers`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        email,
        password,
        firstName: 'Learn',
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

  async function createStudent(firstName: string): Promise<{ token: string; profileId: string }> {
    const student = await registerAndLogin('STUDENT');
    const profileRes = await fetch(`${BASE_URL}/api/v1/people/students/me`, {
      method: 'POST',
      headers: authed(student.token),
      body: JSON.stringify({ firstName, countryCode: 'US', timezone: 'America/New_York' }),
    });
    const profile = (await profileRes.json()) as { id: string };
    return { token: student.token, profileId: profile.id };
  }

  async function createActiveEnrollment(studentId: string, teacherId: string): Promise<string> {
    const enrollRes = await fetch(`${BASE_URL}/api/v1/enrollments`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        studentId,
        courseId,
        teacherId,
        status: 'PENDING',
        studentTimezone: 'Asia/Karachi',
      }),
    });
    const enrollment = (await enrollRes.json()) as { id: string };
    const activateRes = await fetch(`${BASE_URL}/api/v1/enrollments/${enrollment.id}/status`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expect(activateRes.status).toBe(200);
    return enrollment.id;
  }

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');

    const courseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
    const course = (await courseRes.json()) as { id: string };
    courseId = course.id;

    const teacherA = await createTeacher();
    teacherAId = teacherA.id;
    teacherAToken = teacherA.token;

    const teacherB = await createTeacher();
    teacherBToken = teacherB.token;

    const studentA = await createStudent('Hamza');
    studentAToken = studentA.token;
    studentAProfileId = studentA.profileId;

    const studentB = await createStudent('Idris');
    studentBToken = studentB.token;

    enrollmentId = await createActiveEnrollment(studentAProfileId, teacherAId);

    // A real ClassSession row, created directly (self-contained - this spec
    // doesn't depend on the scheduling spec running first) via the one-off
    // session endpoint, which is exactly what attendance/lesson-record
    // attach to.
    const sessionRes = await fetch(`${BASE_URL}/api/v1/scheduling/sessions`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        enrollmentId,
        scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      }),
    });
    const session = (await sessionRes.json()) as { id: string };
    sessionId = session.id;

    // A parent with two children under teacher A: one where the parent is
    // allowed to view progress, one where they are explicitly not.
    const parent = await registerAndLogin('PARENT');
    parentToken = parent.token;
    await fetch(`${BASE_URL}/api/v1/people/parents/me`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({ firstName: 'Umm', lastName: 'Hamza', countryCode: 'US', timezone: 'America/New_York' }),
    });

    const childTrueRes = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({
        firstName: 'Zaid',
        countryCode: 'US',
        timezone: 'America/New_York',
        relationshipType: 'MOTHER',
        canViewProgress: true,
      }),
    });
    const childTrue = (await childTrueRes.json()) as { student: { id: string } };
    childTrueEnrollmentId = await createActiveEnrollment(childTrue.student.id, teacherAId);

    const childFalseRes = await fetch(`${BASE_URL}/api/v1/people/parents/me/children`, {
      method: 'POST',
      headers: authed(parentToken),
      body: JSON.stringify({
        firstName: 'Nusaybah',
        countryCode: 'US',
        timezone: 'America/New_York',
        relationshipType: 'MOTHER',
        canViewProgress: false,
      }),
    });
    const childFalse = (await childFalseRes.json()) as { student: { id: string } };
    childFalseEnrollmentId = await createActiveEnrollment(childFalse.student.id, teacherAId);
  }, 60_000); // this setup makes ~25 sequential HTTP round trips - well past Jest's default 5s hook timeout

  describe('attendance', () => {
    it('rejects a student trying to mark attendance', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        method: 'POST',
        headers: authed(studentAToken),
        body: JSON.stringify({ status: 'PRESENT' }),
      });
      expect(res.status).toBe(403);
    });

    it('the assigned teacher marks attendance for the session', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({ status: 'PRESENT', notes: 'On time, recited well.' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        classSessionId: string;
        studentId: string;
        status: string;
        notes: string | null;
      };
      expect(body.classSessionId).toBe(sessionId);
      expect(body.studentId).toBe(studentAProfileId);
      expect(body.status).toBe('PRESENT');
      expect(body.notes).toBe('On time, recited well.');
    });

    it('rejects marking attendance twice for the same session', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({ status: 'PRESENT' }),
      });
      expect(res.status).toBe(409);
    });

    it("an unrelated teacher and an unrelated student cannot view attendance (404, not 403)", async () => {
      const teacherBRes = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        headers: authed(teacherBToken),
      });
      expect(teacherBRes.status).toBe(404);

      const studentBRes = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        headers: authed(studentBToken),
      });
      expect(studentBRes.status).toBe(404);
    });

    it('the owning student and the assigned teacher can view attendance', async () => {
      const studentRes = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        headers: authed(studentAToken),
      });
      expect(studentRes.status).toBe(200);

      const teacherRes = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        headers: authed(teacherAToken),
      });
      expect(teacherRes.status).toBe(200);
    });

    it('the assigned teacher updates the attendance record', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/attendance`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ status: 'LATE', notes: 'Joined 10 minutes late.' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; notes: string | null };
      expect(body.status).toBe('LATE');
      expect(body.notes).toBe('Joined 10 minutes late.');
    });
  });

  describe('lesson record', () => {
    it('rejects a student trying to write a lesson record', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        method: 'POST',
        headers: authed(studentAToken),
        body: JSON.stringify({ title: 'x', content: 'y' }),
      });
      expect(res.status).toBe(403);
    });

    it('the assigned teacher creates a lesson record', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({
          title: 'Surah Al-Fatiha revision',
          content: 'Reviewed tajweed rules for madd.',
          performanceRating: 8,
          generalRemarks: 'Good progress.',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        classSessionId: string;
        studentId: string;
        title: string;
        performanceRating: number | null;
      };
      expect(body.classSessionId).toBe(sessionId);
      expect(body.studentId).toBe(studentAProfileId);
      expect(body.title).toBe('Surah Al-Fatiha revision');
      expect(body.performanceRating).toBe(8);
    });

    it('rejects creating a second lesson record for the same session', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({ title: 'x', content: 'y' }),
      });
      expect(res.status).toBe(409);
    });

    it('the assigned teacher updates the lesson record', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({
          title: 'Surah Al-Fatiha revision',
          content: 'Reviewed tajweed rules for madd and ghunnah.',
          performanceRating: 9,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { content: string; performanceRating: number | null };
      expect(body.content).toBe('Reviewed tajweed rules for madd and ghunnah.');
      expect(body.performanceRating).toBe(9);
    });

    it("an unrelated teacher and an unrelated student cannot view the lesson record (404, not 403)", async () => {
      const teacherBRes = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        headers: authed(teacherBToken),
      });
      expect(teacherBRes.status).toBe(404);

      const studentBRes = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        headers: authed(studentBToken),
      });
      expect(studentBRes.status).toBe(404);
    });

    it('the owning student can view the lesson record', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/sessions/${sessionId}/lesson`, {
        headers: authed(studentAToken),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('progress', () => {
    it('rejects a student trying to update progress', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        method: 'PATCH',
        headers: authed(studentAToken),
        body: JSON.stringify({ currentSurah: 2 }),
      });
      expect(res.status).toBe(403);
    });

    it('has no progress recorded yet', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        headers: authed(teacherAToken),
      });
      expect(res.status).toBe(404);
    });

    it('the assigned teacher records progress, upserting a StudentProgress row and appending history', async () => {
      const firstRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({
          currentLesson: 'Juz Amma - Surah An-Naba',
          currentSurah: 78,
          currentAyah: 1,
          tajweedProgress: 40,
          hifzProgress: 20,
          performance: 70,
          remarks: 'Solid start.',
        }),
      });
      expect(firstRes.status).toBe(200);
      const first = (await firstRes.json()) as { id: string; currentSurah: number | null; hifzProgress: number | null };
      expect(first.currentSurah).toBe(78);
      expect(first.hifzProgress).toBe(20);

      const secondRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({
          currentLesson: 'Juz Amma - Surah An-Naba',
          currentSurah: 78,
          currentAyah: 10,
          tajweedProgress: 55,
          hifzProgress: 30,
          performance: 75,
          remarks: 'Improving.',
        }),
      });
      expect(secondRes.status).toBe(200);
      const second = (await secondRes.json()) as { id: string; currentAyah: number | null; hifzProgress: number | null };
      // Upsert - same StudentProgress row (same id), updated fields.
      expect(second.id).toBe(first.id);
      expect(second.currentAyah).toBe(10);
      expect(second.hifzProgress).toBe(30);

      const historyRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}/history`, {
        headers: authed(teacherAToken),
      });
      expect(historyRes.status).toBe(200);
      const history = (await historyRes.json()) as Array<{ currentAyah: number | null; hifzProgress: number | null }>;
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((h) => h.currentAyah === 1 && h.hifzProgress === 20)).toBe(true);
      expect(history.some((h) => h.currentAyah === 10 && h.hifzProgress === 30)).toBe(true);
    });

    it('the owning student can view their own progress', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        headers: authed(studentAToken),
      });
      expect(res.status).toBe(200);
    });

    it("an unrelated student and an unrelated teacher cannot view progress (404, not 403)", async () => {
      const studentBRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        headers: authed(studentBToken),
      });
      expect(studentBRes.status).toBe(404);

      const teacherBRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${enrollmentId}`, {
        headers: authed(teacherBToken),
      });
      expect(teacherBRes.status).toBe(404);
    });

    it('records progress for both children so the parent-visibility check has something to see', async () => {
      const trueRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${childTrueEnrollmentId}`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ currentSurah: 1, currentAyah: 1, hifzProgress: 5 }),
      });
      expect(trueRes.status).toBe(200);

      const falseRes = await fetch(`${BASE_URL}/api/v1/learning/progress/enrollment/${childFalseEnrollmentId}`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ currentSurah: 1, currentAyah: 1, hifzProgress: 5 }),
      });
      expect(falseRes.status).toBe(200);
    });

    it('a parent can view progress only for the child where canViewProgress is true', async () => {
      const allowedRes = await fetch(
        `${BASE_URL}/api/v1/learning/progress/enrollment/${childTrueEnrollmentId}`,
        { headers: authed(parentToken) },
      );
      expect(allowedRes.status).toBe(200);

      const deniedRes = await fetch(
        `${BASE_URL}/api/v1/learning/progress/enrollment/${childFalseEnrollmentId}`,
        { headers: authed(parentToken) },
      );
      expect(deniedRes.status).toBe(404);
    });
  });

  describe('homework', () => {
    let homeworkId: string;
    let submissionId: string;

    it('rejects a student trying to assign homework', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework`, {
        method: 'POST',
        headers: authed(studentAToken),
        body: JSON.stringify({ enrollmentId, title: 'x', description: 'y' }),
      });
      expect(res.status).toBe(403);
    });

    it('the assigned teacher assigns homework', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({
          enrollmentId,
          classSessionId: sessionId,
          title: 'Memorize Surah Al-Ikhlas',
          description: 'Memorize and be ready to recite next session.',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string; studentId: string };
      expect(body.status).toBe('ASSIGNED');
      expect(body.studentId).toBe(studentAProfileId);
      homeworkId = body.id;
    });

    it('the teacher sees it under their own list, the student under theirs', async () => {
      const teacherRes = await fetch(`${BASE_URL}/api/v1/learning/homework/teacher/me`, {
        headers: authed(teacherAToken),
      });
      expect(teacherRes.status).toBe(200);
      const teacherList = (await teacherRes.json()) as { data: Array<{ id: string }> };
      expect(teacherList.data.some((h) => h.id === homeworkId)).toBe(true);

      const studentRes = await fetch(`${BASE_URL}/api/v1/learning/homework/student/me`, {
        headers: authed(studentAToken),
      });
      expect(studentRes.status).toBe(200);
      const studentList = (await studentRes.json()) as { data: Array<{ id: string }> };
      expect(studentList.data.some((h) => h.id === homeworkId)).toBe(true);
    });

    it("an unrelated student and an unrelated teacher cannot view the homework (404, not 403)", async () => {
      const studentBRes = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}`, {
        headers: authed(studentBToken),
      });
      expect(studentBRes.status).toBe(404);

      const teacherBRes = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}`, {
        headers: authed(teacherBToken),
      });
      expect(teacherBRes.status).toBe(404);
    });

    it('an unrelated student cannot submit the homework', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}/submissions`, {
        method: 'POST',
        headers: authed(studentBToken),
        body: JSON.stringify({ content: 'Not my homework.' }),
      });
      expect(res.status).toBe(404);
    });

    it('the student submits the homework, which flips its status to SUBMITTED', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}/submissions`, {
        method: 'POST',
        headers: authed(studentAToken),
        body: JSON.stringify({ content: 'Recorded my recitation.' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string; homeworkId: string };
      expect(body.status).toBe('PENDING_REVIEW');
      expect(body.homeworkId).toBe(homeworkId);
      submissionId = body.id;

      const homeworkRes = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}`, {
        headers: authed(teacherAToken),
      });
      const homework = (await homeworkRes.json()) as { status: string };
      expect(homework.status).toBe('SUBMITTED');
    });

    it("an unrelated teacher cannot review the submission", async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework/submissions/${submissionId}/review`, {
        method: 'PATCH',
        headers: authed(teacherBToken),
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      expect(res.status).toBe(404);
    });

    it('the assigned teacher approves the submission, completing the homework', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework/submissions/${submissionId}/review`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ status: 'APPROVED', teacherFeedback: 'Well recited, masha Allah.' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; teacherFeedback: string | null; reviewedAt: string | null };
      expect(body.status).toBe('APPROVED');
      expect(body.teacherFeedback).toBe('Well recited, masha Allah.');
      expect(body.reviewedAt).not.toBeNull();

      const homeworkRes = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}`, {
        headers: authed(teacherAToken),
      });
      const homework = (await homeworkRes.json()) as { status: string };
      expect(homework.status).toBe('COMPLETED');
    });

    it('rejects submitting again once the homework is completed', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/learning/homework/${homeworkId}/submissions`, {
        method: 'POST',
        headers: authed(studentAToken),
        body: JSON.stringify({ content: 'Trying again.' }),
      });
      expect(res.status).toBe(400);
    });

    it('a NEEDS_REVISION review sends the homework back to IN_PROGRESS', async () => {
      const secondHomeworkRes = await fetch(`${BASE_URL}/api/v1/learning/homework`, {
        method: 'POST',
        headers: authed(teacherAToken),
        body: JSON.stringify({
          enrollmentId,
          title: 'Memorize Surah Al-Falaq',
          description: 'Memorize and be ready to recite next session.',
        }),
      });
      const secondHomework = (await secondHomeworkRes.json()) as { id: string };

      const submitRes = await fetch(`${BASE_URL}/api/v1/learning/homework/${secondHomework.id}/submissions`, {
        method: 'POST',
        headers: authed(studentAToken),
        body: JSON.stringify({ content: 'Attempt one.' }),
      });
      const submission = (await submitRes.json()) as { id: string };

      const reviewRes = await fetch(`${BASE_URL}/api/v1/learning/homework/submissions/${submission.id}/review`, {
        method: 'PATCH',
        headers: authed(teacherAToken),
        body: JSON.stringify({ status: 'NEEDS_REVISION', teacherFeedback: 'Please redo the last ayah.' }),
      });
      expect(reviewRes.status).toBe(200);

      const homeworkRes = await fetch(`${BASE_URL}/api/v1/learning/homework/${secondHomework.id}`, {
        headers: authed(teacherAToken),
      });
      const homework = (await homeworkRes.json()) as { status: string };
      expect(homework.status).toBe('IN_PROGRESS');
    });
  });
});
