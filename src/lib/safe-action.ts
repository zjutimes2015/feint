import { createSafeActionClient } from 'next-safe-action';
import type { SessionUser } from './auth-types';
import { getSession } from './server';

// -----------------------------------------------------------------------------
// 1. Base action client – put global error handling / metadata here if needed
// -----------------------------------------------------------------------------
export const actionClient = createSafeActionClient({
  handleServerError: (e) => {
    if (e instanceof Error) {
      return {
        success: false,
        error: e.message,
      };
    }

    return {
      success: false,
      error: 'Something went wrong while executing the action',
    };
  },
});

// -----------------------------------------------------------------------------
// 2. Auth-guarded client
// -----------------------------------------------------------------------------
export const userActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  return next({ ctx: { user: session.user as SessionUser } });
});

// -----------------------------------------------------------------------------
// 3. Admin-only client (extends auth client)
//
// SECURITY: Always requires admin role, regardless of demo mode.
// -----------------------------------------------------------------------------
export const adminActionClient = userActionClient.use(async ({ next, ctx }) => {
  if (ctx.user.role !== 'admin') {
    return {
      success: false,
      error: 'Unauthorized',
    };
  }

  return next({ ctx });
});
