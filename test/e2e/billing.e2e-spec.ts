import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

/** Same approach as the other e2e specs - see auth.e2e-spec.ts header comment. */

const PORT = 3110;
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

describe('Billing (e2e)', () => {
  let adminToken: string;
  let courseId: string;
  let studentToken: string;
  let studentProfileId: string;
  let enrollmentId: string;
  let packageId: string;

  beforeAll(async () => {
    adminToken = await login('admin@hqt.local', 'ChangeMe123!');

    const courseRes = await fetch(`${BASE_URL}/api/v1/courses/hifz-ul-quran`);
    const course = (await courseRes.json()) as { id: string };
    courseId = course.id;

    const student = await registerAndLogin('STUDENT');
    studentToken = student.token;
    const profileRes = await fetch(`${BASE_URL}/api/v1/people/students/me`, {
      method: 'POST',
      headers: authed(studentToken),
      body: JSON.stringify({ firstName: 'Bill', countryCode: 'US', timezone: 'America/New_York' }),
    });
    const profile = (await profileRes.json()) as { id: string };
    studentProfileId = profile.id;

    const enrollRes = await fetch(`${BASE_URL}/api/v1/enrollments`, {
      method: 'POST',
      headers: authed(adminToken),
      body: JSON.stringify({
        studentId: studentProfileId,
        courseId,
        studentTimezone: 'America/New_York',
      }),
    });
    const enrollment = (await enrollRes.json()) as { id: string };
    enrollmentId = enrollment.id;
  });

  describe('Packages', () => {
    it('rejects a non-admin from creating a package', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/billing/packages`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({ name: 'Should fail', billingPeriod: 'MONTHLY', price: 10, currency: 'USD' }),
      });
      expect(res.status).toBe(403);
    });

    it('lets an admin create a package, visible on the public pricing list', async () => {
      const name = `10 sessions ${randomUUID()}`;
      const res = await fetch(`${BASE_URL}/api/v1/billing/packages`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          name,
          description: '10 one-on-one sessions',
          classesPerPeriod: 10,
          classDurationMin: 30,
          billingPeriod: 'MONTHLY',
          price: 100,
          currency: 'USD',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; name: string; status: string };
      expect(body.name).toBe(name);
      expect(body.status).toBe('ACTIVE');
      packageId = body.id;

      const publicRes = await fetch(`${BASE_URL}/api/v1/billing/packages`);
      expect(publicRes.status).toBe(200);
      const publicList = (await publicRes.json()) as Array<{ id: string }>;
      expect(publicList.some((p) => p.id === packageId)).toBe(true);
    });
  });

  describe('Invoices and payments', () => {
    let invoiceId: string;
    let invoiceTotal: number;

    it('rejects a non-admin from creating an invoice', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/billing/invoices`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({
          enrollmentId,
          packageId,
          currency: 'USD',
          items: [{ description: 'Should fail', quantity: 1, unitPrice: 100 }],
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        }),
      });
      expect(res.status).toBe(403);
    });

    it('lets an admin create an invoice with a generated invoice number and correct total', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/billing/invoices`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          enrollmentId,
          packageId,
          currency: 'USD',
          items: [
            { description: '10-session package', quantity: 1, unitPrice: 100 },
            { description: 'Registration fee', quantity: 1, unitPrice: 20 },
          ],
          discount: 5,
          tax: 0,
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          notes: 'First invoice',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        invoiceNumber: string;
        status: string;
        subtotal: number;
        total: number;
        studentId: string;
      };
      expect(body.invoiceNumber).toMatch(/^INV-\d{8}-[0-9A-F]{6}$/);
      expect(body.status).toBe('PENDING');
      expect(body.subtotal).toBe(120);
      expect(body.total).toBe(115);
      expect(body.studentId).toBe(studentProfileId);
      invoiceId = body.id;
      invoiceTotal = body.total;
    });

    it('rejects invoice creation with malformed nested items', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/billing/invoices`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({
          enrollmentId,
          currency: 'USD',
          items: [{ description: '', quantity: 0, unitPrice: -5 }],
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        }),
      });
      expect(res.status).toBe(400);
    });

    it('records a partial payment, leaving the invoice unpaid', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/billing/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ amount: 50, paymentMethod: 'BANK_TRANSFER', notes: 'Partial payment' }),
      });
      expect(res.status).toBe(201);
      const payment = (await res.json()) as { status: string; amount: number };
      expect(payment.status).toBe('COMPLETED');
      expect(payment.amount).toBe(50);

      const invoiceRes = await fetch(`${BASE_URL}/api/v1/billing/invoices/${invoiceId}`, {
        headers: authed(adminToken),
      });
      const invoice = (await invoiceRes.json()) as { status: string; paidAt: string | null };
      expect(invoice.status).toBe('PENDING');
      expect(invoice.paidAt).toBeNull();
    });

    it('records a second payment reaching the total, auto-marking the invoice PAID', async () => {
      const remaining = invoiceTotal - 50;
      const res = await fetch(`${BASE_URL}/api/v1/billing/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: authed(adminToken),
        body: JSON.stringify({ amount: remaining, paymentMethod: 'BANK_TRANSFER' }),
      });
      expect(res.status).toBe(201);

      const invoiceRes = await fetch(`${BASE_URL}/api/v1/billing/invoices/${invoiceId}`, {
        headers: authed(adminToken),
      });
      const invoice = (await invoiceRes.json()) as { status: string; paidAt: string | null };
      expect(invoice.status).toBe('PAID');
      expect(invoice.paidAt).not.toBeNull();

      const paymentsRes = await fetch(`${BASE_URL}/api/v1/billing/invoices/${invoiceId}/payments`, {
        headers: authed(adminToken),
      });
      const payments = (await paymentsRes.json()) as Array<{ amount: number }>;
      expect(payments.length).toBe(2);
    });

    it('lets the student view their own invoices, but not another student\'s, and not create invoices', async () => {
      const ownRes = await fetch(`${BASE_URL}/api/v1/billing/invoices/me`, {
        headers: authed(studentToken),
      });
      expect(ownRes.status).toBe(200);
      const own = (await ownRes.json()) as { data: Array<{ id: string }> };
      expect(own.data.some((i) => i.id === invoiceId)).toBe(true);

      const other = await registerAndLogin('STUDENT');
      await fetch(`${BASE_URL}/api/v1/people/students/me`, {
        method: 'POST',
        headers: authed(other.token),
        body: JSON.stringify({ firstName: 'Other', countryCode: 'US', timezone: 'America/New_York' }),
      });
      const otherRes = await fetch(`${BASE_URL}/api/v1/billing/invoices/me`, {
        headers: authed(other.token),
      });
      expect(otherRes.status).toBe(200);
      const otherList = (await otherRes.json()) as { data: Array<{ id: string }> };
      expect(otherList.data.some((i) => i.id === invoiceId)).toBe(false);

      const detailRes = await fetch(`${BASE_URL}/api/v1/billing/invoices/${invoiceId}`, {
        headers: authed(studentToken),
      });
      expect(detailRes.status).toBe(403);

      const createRes = await fetch(`${BASE_URL}/api/v1/billing/invoices`, {
        method: 'POST',
        headers: authed(studentToken),
        body: JSON.stringify({
          enrollmentId,
          currency: 'USD',
          items: [{ description: 'Self-invoice', quantity: 1, unitPrice: 1 }],
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        }),
      });
      expect(createRes.status).toBe(403);

      const paymentsListRes = await fetch(`${BASE_URL}/api/v1/billing/payments`, {
        headers: authed(studentToken),
      });
      expect(paymentsListRes.status).toBe(403);
    });
  });
});
