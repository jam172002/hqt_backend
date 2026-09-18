import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/**
 * Drives the real, built server as a child process over plain HTTP
 * (fetch), rather than importing @nestjs/testing + supertest into the
 * Jest-executed file. @nestjs/* packages ship ESM-only as of v12, and
 * that combination doesn't yet interoperate cleanly with ts-jest/Jest's
 * CJS test execution - spawning the real process sidesteps the whole
 * problem while still exercising the actual compiled app end-to-end.
 */

const PORT = 3101;
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

describe('Auth (e2e)', () => {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'SuperSecret123';

  it('rejects self-registration with an admin-only role', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'TEACHER' }),
    });
    const body = (await res.json()) as { error: { fieldErrors: Array<{ field: string }> } };

    expect(res.status).toBe(400);
    expect(body.error.fieldErrors[0].field).toBe('role');
  });

  it('registers a new PARENT account', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'PARENT' }),
    });
    const body = (await res.json()) as { id: string; email: string; phone: string | null };

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ email, phone: null });
    expect(typeof body.id).toBe('string');
  });

  it('rejects a duplicate registration', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'PARENT' }),
    });
    expect(res.status).toBe(409);
  });

  it('rejects login with the wrong password', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated access to a protected route', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/me`);
    expect(res.status).toBe(401);
  });

  it('supports the full login -> me -> refresh (rotated) -> logout lifecycle', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, deviceId: 'e2e-device' }),
    });
    expect(loginRes.status).toBe(200);
    const { accessToken, refreshToken } = (await loginRes.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toMatch(/^[0-9a-f-]{36}\..+$/);

    const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status).toBe(200);
    const me = (await meRes.json()) as { email: string; status: string; roles: string[] };
    expect(me).toMatchObject({ email, status: 'ACTIVE', roles: ['PARENT'] });

    const refreshRes = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(refreshRes.status).toBe(200);
    const refreshed = (await refreshRes.json()) as { refreshToken: string };
    expect(refreshed.refreshToken).not.toBe(refreshToken);

    // Old refresh token must be dead after rotation.
    const reuseRes = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(reuseRes.status).toBe(401);

    const logoutRes = await fetch(`${BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshed.refreshToken }),
    });
    expect(logoutRes.status).toBe(204);

    // Session must be dead after logout too.
    const postLogoutRefresh = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshed.refreshToken }),
    });
    expect(postLogoutRefresh.status).toBe(401);
  });

  it('exposes liveness and readiness without authentication', async () => {
    const live = await fetch(`${BASE_URL}/health/live`);
    expect(live.status).toBe(200);

    const ready = await fetch(`${BASE_URL}/health/ready`);
    expect(ready.status).toBe(200);
    const body = (await ready.json()) as { status: string; database: string };
    expect(body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
