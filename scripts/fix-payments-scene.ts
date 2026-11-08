import { loadEnvConfig } from '@next/env';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { payment } from '../src/db/schema.js';
import { PaymentScenes } from '../src/payment/types.js';
loadEnvConfig(process.cwd());

export default async function fixPayments() {
  const { findPaymentPlan } = await import('../src/lib/price-plan');
  const db = await getDb();

  try {
    const payments = await db.select().from(payment);

    for (const record of payments) {
      if (record.scene) {
        continue;
      }
      const plan = findPaymentPlan(record.priceId, record.type);
      if (plan && record.paid) {
        const scene = plan.isLifetime
          ? PaymentScenes.LIFETIME
          : PaymentScenes.SUBSCRIPTION;
        console.log('Updating payment, id:', record.id, 'scene:', scene);
        await db
          .update(payment)
          .set({ scene })
          .where(eq(payment.id, record.id));
      }
    }

    console.log('Fix payments completed');
  } catch (error) {
    console.error('Fix payments error:', error);
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

fixPayments();
