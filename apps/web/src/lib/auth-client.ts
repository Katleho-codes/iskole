/**
 * better-auth browser client. The only way the UI talks about authentication.
 *
 * Docs: https://better-auth.com/docs/concepts/client
 *       https://better-auth.com/docs/concepts/typescript#infer-additional-fields-on-the-client
 *
 * Notes:
 * - baseURL is same-origin on purpose. Next rewrites /api/* to the Express API, so the
 *   browser sees one origin and the session cookie is first-party. There is no CORS
 *   surface for auth, and no cross-site cookie configuration to get wrong.
 * - The admin plugin's client half is NOT added: the browser must never be able to call
 *   setRole, banUser, impersonateUser or listUsers. Those are admin APIs and we do not
 *   expose them. Role changes run server-side from moderator-only routes instead.
 * - No custom auth endpoints exist anywhere. Every call below is a better-auth method.
 */
'use client';

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
  fetchOptions: {
    // Send the session cookie with every request. First-party cookie, so credentials
    // mode 'same-origin' is correct and no cross-site allowance is needed.
    credentials: 'same-origin',
  },
});

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } = authClient;
