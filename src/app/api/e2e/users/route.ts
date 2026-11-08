import { account, apikey, payment, session, user } from '@/db/schema';
import { getDb } from '@/db';
import { isValidE2ETestRequest } from '@/lib/e2e';
import { PaymentTypes } from '@/payment/types';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { NextResponse } from 'next/server';

const TEST_EMAIL_PATTERN = 'e2e-%@example.test';

function isE2EEmail(email: string) {
  return email.startsWith('e2e-') && email.endsWith('@example.test');
}

function notFound() {
  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export async function GET(request: Request) {
  if (!isValidE2ETestRequest(request)) {
    return notFound();
  }

  const url = new URL(request.url);
  const email = url.searchParams.get('email') ?? '';
  if (!isE2EEmail(email)) {
    return NextResponse.json({ error: 'Invalid test email' }, { status: 400 });
  }

  const db = await getDb();
  const [testUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!testUser) {
    return NextResponse.json({
      paymentCount: 0,
      latestPayment: null,
      subscription: null,
    });
  }

  const paidOnly = url.searchParams.get('paid') === 'true';
  const sessionId = url.searchParams.get('session_id');
  const paymentWhere = and(
    eq(payment.userId, testUser.id),
    paidOnly ? eq(payment.paid, true) : undefined,
    sessionId ? eq(payment.sessionId, sessionId) : undefined
  );
  const rows = await db
    .select({
      id: payment.id,
      priceId: payment.priceId,
      subscriptionId: payment.subscriptionId,
      sessionId: payment.sessionId,
      invoiceId: payment.invoiceId,
      type: payment.type,
      scene: payment.scene,
      status: payment.status,
      paid: payment.paid,
      interval: payment.interval,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
      cancelAtPeriodEnd: payment.cancelAtPeriodEnd,
      trialStart: payment.trialStart,
      trialEnd: payment.trialEnd,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    })
    .from(payment)
    .where(paymentWhere)
    .orderBy(desc(payment.createdAt))
    .limit(100);

  const latestPayment = rows[0] ?? null;
  const subscription = paidOnly
    ? (rows.find((row) => row.type === PaymentTypes.SUBSCRIPTION) ?? null)
    : null;

  return NextResponse.json({
    paymentCount: rows.length,
    latestPayment,
    subscription: subscription
      ? {
          ...subscription,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
        }
      : null,
  });
}

export async function PATCH(request: Request) {
  if (!isValidE2ETestRequest(request)) {
    return notFound();
  }

  const body = (await request.json()) as {
    email?: unknown;
    emailVerified?: unknown;
    role?: unknown;
  };
  const email = typeof body.email === 'string' ? body.email : '';

  if (!isE2EEmail(email)) {
    return NextResponse.json({ error: 'Invalid test email' }, { status: 400 });
  }

  const updates: {
    emailVerified?: boolean;
    role?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (typeof body.emailVerified === 'boolean') {
    updates.emailVerified = body.emailVerified;
  }
  if (body.role === null || body.role === 'admin' || body.role === 'user') {
    updates.role = body.role === 'user' ? null : body.role;
  }

  const db = await getDb();
  const [updatedUser] = await db
    .update(user)
    .set(updates)
    .where(eq(user.email, email))
    .returning({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    });

  if (!updatedUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user: updatedUser });
}

export async function DELETE(request: Request) {
  if (!isValidE2ETestRequest(request)) {
    return notFound();
  }

  const db = await getDb();
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(like(user.email, TEST_EMAIL_PATTERN));
  const userIds = rows.map((row) => row.id);

  if (userIds.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  await db.delete(apikey).where(inArray(apikey.referenceId, userIds));
  await db.delete(session).where(inArray(session.userId, userIds));
  await db.delete(account).where(inArray(account.userId, userIds));
  await db.delete(payment).where(inArray(payment.userId, userIds));
  await db.delete(user).where(inArray(user.id, userIds));

  return NextResponse.json({ deleted: userIds.length });
}
