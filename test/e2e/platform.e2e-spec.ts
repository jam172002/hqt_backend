import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3111;
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

/** For multipart requests - deliberately omits Content-Type so fetch can set the boundary itself. */
function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function whoAmI(token: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: bearer(token) });
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function registerAndLogin(role: 'STUDENT' | 'PARENT'): Promise<{ email: string; token: string; id: string }> {
  const email = `e2e-${role.toLowerCase()}-${randomUUID()}@example.com`;
  const password = 'Password123';
  await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  const token = await login(email, password);
  const id = await whoAmI(token);
  return { email, token, id };
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

describe('Platform (e2e)', () => {
  let superAdminToken: string;
  let superAdminId: string;
  let adminOnlyToken: string;
  let courseId: string;
  let uploader: { email: string; token: string; id: string };
  let otherUser: { email: string; token: string; id: string };

  beforeAll(async () => {
    superAdminToken = await login('admin@hqt.local', 'ChangeMe123!');
    superAdminId = await whoAmI(superAdminToken);

    // A plain ADMIN can only be provisioned by a SUPER_ADMIN (people/admins module).
    const adminEmail = `e2e-admin-${randomUUID()}@example.com`;
    const adminPassword = 'AdminPass123';
    const createAdminRes = await fetch(`${BASE_URL}/api/v1/people/admins`, {
      method: 'POST',
      headers: authed(superAdminToken),
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        firstName: 'Ada',
        lastName: 'Min',
      }),
    });
    if (createAdminRes.status !== 201) {
      throw new Error(`Failed to provision plain ADMIN user: ${createAdminRes.status} ${await createAdminRes.text()}`);
    }
    adminOnlyToken = await login(adminEmail, adminPassword);

    const courseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
    const course = (await courseRes.json()) as { id: string };
    courseId = course.id;

    uploader = await registerAndLogin('STUDENT');
    otherUser = await registerAndLogin('STUDENT');
  });

  describe('Media', () => {
    let mediaId: string;
    // A minimal but valid-looking JPEG payload (magic bytes + filler).
    const fileBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    it('uploads a jpeg file and returns correct metadata with PRIVATE default visibility', async () => {
      const form = new FormData();
      form.append('file', new Blob([fileBytes], { type: 'image/jpeg' }), 'avatar.jpg');

      const res = await fetch(`${BASE_URL}/api/v1/media/upload`, {
        method: 'POST',
        headers: bearer(uploader.token),
        body: form,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        originalName: string;
        mimeType: string;
        sizeBytes: number;
        visibility: string;
        uploadedBy: string;
      };
      expect(body.originalName).toBe('avatar.jpg');
      expect(body.mimeType).toBe('image/jpeg');
      expect(body.sizeBytes).toBe(fileBytes.length);
      expect(body.uploadedBy).toBe(uploader.id);
      expect(body.visibility).toBe('PRIVATE');
      mediaId = body.id;
    });

    it('lets the uploader fetch metadata and the raw file content byte-for-byte', async () => {
      const metaRes = await fetch(`${BASE_URL}/api/v1/media/${mediaId}`, { headers: bearer(uploader.token) });
      expect(metaRes.status).toBe(200);
      const meta = (await metaRes.json()) as { id: string; sizeBytes: number };
      expect(meta.id).toBe(mediaId);
      expect(meta.sizeBytes).toBe(fileBytes.length);

      const fileRes = await fetch(`${BASE_URL}/api/v1/media/${mediaId}/file`, { headers: bearer(uploader.token) });
      expect(fileRes.status).toBe(200);
      expect(fileRes.headers.get('content-type')).toContain('image/jpeg');
      const buf = Buffer.from(await fileRes.arrayBuffer());
      expect(Buffer.compare(buf, Buffer.from(fileBytes))).toBe(0);
    });

    it('forbids a different authenticated user from reading the private file', async () => {
      const metaRes = await fetch(`${BASE_URL}/api/v1/media/${mediaId}`, { headers: bearer(otherUser.token) });
      expect(metaRes.status).toBe(403);

      const fileRes = await fetch(`${BASE_URL}/api/v1/media/${mediaId}/file`, { headers: bearer(otherUser.token) });
      expect(fileRes.status).toBe(403);
    });

    it('rejects an unsupported mime type with 400', async () => {
      const form = new FormData();
      form.append('file', new Blob([new TextEncoder().encode('just plain text')], { type: 'text/plain' }), 'notes.txt');

      const res = await fetch(`${BASE_URL}/api/v1/media/upload`, {
        method: 'POST',
        headers: bearer(uploader.token),
        body: form,
      });
      expect(res.status).toBe(400);
    });

    it('attaches the file to an allowed entity type (COURSE)', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/media/${mediaId}/attach`, {
        method: 'POST',
        headers: authed(uploader.token),
        body: JSON.stringify({ entityType: 'COURSE', entityId: courseId }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; entityType: string; entityId: string; mediaFileId: string };
      expect(body.entityType).toBe('COURSE');
      expect(body.entityId).toBe(courseId);
      expect(body.mediaFileId).toBe(mediaId);

      const listRes = await fetch(`${BASE_URL}/api/v1/media/entity/COURSE/${courseId}`, {
        headers: bearer(uploader.token),
      });
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as Array<{ id: string }>;
      expect(list.some((attachment) => attachment.id === body.id)).toBe(true);
    });

    it('rejects attaching to a disallowed entity type with 400', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/media/${mediaId}/attach`, {
        method: 'POST',
        headers: authed(uploader.token),
        body: JSON.stringify({ entityType: 'RANDOM_ENTITY', entityId: courseId }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects attaching with a malformed (non-UUID) entityId with 400', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/media/${mediaId}/attach`, {
        method: 'POST',
        headers: authed(uploader.token),
        body: JSON.stringify({ entityType: 'COURSE', entityId: 'not-a-uuid' }),
      });
      expect(res.status).toBe(400);
    });

    describe('anonymous access to PUBLIC files', () => {
      let publicMediaId: string;
      let privateMediaId: string;
      const publicBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 21, 22, 23]);
      const privateBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 31, 32, 33]);

      beforeAll(async () => {
        const publicForm = new FormData();
        publicForm.append('file', new Blob([publicBytes], { type: 'image/jpeg' }), 'course-thumb.jpg');
        publicForm.append('visibility', 'PUBLIC');
        const publicRes = await fetch(`${BASE_URL}/api/v1/media/upload`, {
          method: 'POST',
          headers: bearer(uploader.token),
          body: publicForm,
        });
        publicMediaId = ((await publicRes.json()) as { id: string }).id;

        const privateForm = new FormData();
        privateForm.append('file', new Blob([privateBytes], { type: 'image/jpeg' }), 'private-doc.jpg');
        const privateRes = await fetch(`${BASE_URL}/api/v1/media/upload`, {
          method: 'POST',
          headers: bearer(uploader.token),
          body: privateForm,
        });
        privateMediaId = ((await privateRes.json()) as { id: string }).id;
      });

      it('lets an unauthenticated caller read a PUBLIC file - metadata and raw bytes', async () => {
        const metaRes = await fetch(`${BASE_URL}/api/v1/media/${publicMediaId}`);
        expect(metaRes.status).toBe(200);
        const meta = (await metaRes.json()) as { visibility: string };
        expect(meta.visibility).toBe('PUBLIC');

        const fileRes = await fetch(`${BASE_URL}/api/v1/media/${publicMediaId}/file`);
        expect(fileRes.status).toBe(200);
        const buf = Buffer.from(await fileRes.arrayBuffer());
        expect(Buffer.compare(buf, Buffer.from(publicBytes))).toBe(0);
      });

      it('still forbids an unauthenticated caller from reading a PRIVATE file', async () => {
        const metaRes = await fetch(`${BASE_URL}/api/v1/media/${privateMediaId}`);
        expect(metaRes.status).toBe(403);

        const fileRes = await fetch(`${BASE_URL}/api/v1/media/${privateMediaId}/file`);
        expect(fileRes.status).toBe(403);
      });

      it('an authenticated non-owner still cannot read the PRIVATE file (optional auth does not relax ownership)', async () => {
        const res = await fetch(`${BASE_URL}/api/v1/media/${privateMediaId}`, {
          headers: bearer(otherUser.token),
        });
        expect(res.status).toBe(403);
      });

      it('the owner can still read the PRIVATE file when authenticated on the now-public route', async () => {
        const res = await fetch(`${BASE_URL}/api/v1/media/${privateMediaId}`, {
          headers: bearer(uploader.token),
        });
        expect(res.status).toBe(200);
      });

      it('entity listing shows only the PUBLIC attachment to an anonymous caller, but all attachments to an admin', async () => {
        const scopedCourseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
        const scopedCourse = (await scopedCourseRes.json()) as { id: string };

        await fetch(`${BASE_URL}/api/v1/media/${publicMediaId}/attach`, {
          method: 'POST',
          headers: authed(uploader.token),
          body: JSON.stringify({ entityType: 'COURSE', entityId: scopedCourse.id }),
        });
        await fetch(`${BASE_URL}/api/v1/media/${privateMediaId}/attach`, {
          method: 'POST',
          headers: authed(uploader.token),
          body: JSON.stringify({ entityType: 'COURSE', entityId: scopedCourse.id }),
        });

        const anonRes = await fetch(`${BASE_URL}/api/v1/media/entity/COURSE/${scopedCourse.id}`);
        expect(anonRes.status).toBe(200);
        const anonList = (await anonRes.json()) as Array<{ mediaFileId: string; file: { visibility: string } }>;
        expect(anonList.every((a) => a.file.visibility === 'PUBLIC')).toBe(true);
        expect(anonList.some((a) => a.mediaFileId === publicMediaId)).toBe(true);
        expect(anonList.some((a) => a.mediaFileId === privateMediaId)).toBe(false);

        const adminRes = await fetch(`${BASE_URL}/api/v1/media/entity/COURSE/${scopedCourse.id}`, {
          headers: authed(superAdminToken),
        });
        const adminList = (await adminRes.json()) as Array<{ mediaFileId: string }>;
        expect(adminList.some((a) => a.mediaFileId === publicMediaId)).toBe(true);
        expect(adminList.some((a) => a.mediaFileId === privateMediaId)).toBe(true);
      });
    });
  });

  describe('Audit', () => {
    it('rejects non-SUPER_ADMIN callers (both an unprivileged user and a plain ADMIN) with 403', async () => {
      const studentRes = await fetch(`${BASE_URL}/api/v1/audit/logs`, { headers: authed(uploader.token) });
      expect(studentRes.status).toBe(403);

      const adminRes = await fetch(`${BASE_URL}/api/v1/audit/logs`, { headers: authed(adminOnlyToken) });
      expect(adminRes.status).toBe(403);
    });

    it('records the earlier media upload with the correct actor, action and entityType', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/audit/logs?limit=100`, { headers: authed(superAdminToken) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: Array<{ actorUserId: string | null; action: string; entityType: string }>;
      };
      const entry = body.data.find(
        (row) => row.actorUserId === uploader.id && row.action === 'POST /api/v1/media/upload',
      );
      expect(entry).toBeDefined();
      // Regression check for a real bug found while writing this spec: AuditInterceptor used to
      // read the route path's first segment as entityType, but that path includes the global
      // "api/v1" prefix, so entityType was always the literal string "api" for every audit row
      // in the system. Fixed in audit.interceptor.ts to skip the "api"/"v<n>" prefix segments.
      expect(entry!.entityType).toBe('media');
    });

    // The redaction path in AuditInterceptor.redact() (audit.interceptor.ts) strips
    // "password"/"refreshToken"/"accessToken" fields from the logged request body. No mutating,
    // authenticated endpoint in this codebase accepts a body containing any of those field names
    // (password-bearing routes like register/login are @Public() and thus never audited - see
    // the interceptor's own header comment), so this can't be exercised end-to-end through the
    // HTTP API. Verified by reading the code instead: REDACTED_FIELDS covers exactly those three
    // keys, and redact() replaces each present key's value with '[REDACTED]' before the body is
    // persisted as newValues.
  });

  describe('Settings', () => {
    const settingKey = `e2e-setting-${randomUUID()}`;

    it('forbids a plain ADMIN from writing a setting (403) but allows reading (200)', async () => {
      const putRes = await fetch(`${BASE_URL}/api/v1/settings/${settingKey}`, {
        method: 'PUT',
        headers: authed(adminOnlyToken),
        body: JSON.stringify({ value: { shouldNotPersist: true } }),
      });
      expect(putRes.status).toBe(403);

      const getRes = await fetch(`${BASE_URL}/api/v1/settings`, { headers: authed(adminOnlyToken) });
      expect(getRes.status).toBe(200);
    });

    it('lets SUPER_ADMIN create a setting, and GET by key returns exactly what was PUT', async () => {
      const putRes = await fetch(`${BASE_URL}/api/v1/settings/${settingKey}`, {
        method: 'PUT',
        headers: authed(superAdminToken),
        body: JSON.stringify({ value: { enabled: true, threshold: 5 }, description: 'e2e test setting' }),
      });
      expect(putRes.status).toBe(200);
      const putBody = (await putRes.json()) as {
        key: string;
        value: unknown;
        description: string | null;
        updatedBy: string | null;
      };
      expect(putBody.key).toBe(settingKey);
      expect(putBody.value).toEqual({ enabled: true, threshold: 5 });
      expect(putBody.description).toBe('e2e test setting');
      expect(putBody.updatedBy).toBe(superAdminId);

      // A plain ADMIN has read access per the controller's class-level @Roles.
      const getRes = await fetch(`${BASE_URL}/api/v1/settings/${settingKey}`, { headers: authed(adminOnlyToken) });
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as { key: string; value: unknown };
      expect(getBody.key).toBe(settingKey);
      expect(getBody.value).toEqual({ enabled: true, threshold: 5 });
    });
  });
});
