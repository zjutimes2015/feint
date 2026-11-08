import { execFileSync } from 'node:child_process';

/**
 * Vercel build entrypoint.
 *
 * Production builds run pending Drizzle migrations first so the database
 * always matches the deployed code (e.g. better-auth tables). Preview and
 * development builds skip migrations: a preview deploy must never reshape
 * the production database.
 *
 * Local `pnpm build` is unaffected (it does not go through vercel.json).
 */
const VERCEL_ENV = process.env.VERCEL_ENV;
const isProduction = VERCEL_ENV === 'production';

const run = (label, args) => {
  console.log(`[build] ${label}`);
  execFileSync('pnpm', args, { stdio: 'inherit', shell: true });
};

try {
  if (isProduction) {
    run('VERCEL_ENV=production → running database migrations', ['db:migrate']);
  } else {
    console.log(
      `[build] VERCEL_ENV=${VERCEL_ENV || '(unset)'} → skipping database migrations (production only)`
    );
  }
  run('next build', ['build']);
} catch (error) {
  console.error(
    '[build] build failed:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}
