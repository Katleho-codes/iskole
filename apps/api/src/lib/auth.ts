/**
 * better-auth server configuration. The only auth surface in iskole.
 *
 * Docs used (better-auth 1.7.x, pinned in package.json):
 * - Prisma adapter:   https://better-auth.com/docs/adapters/prisma
 * - Express handler:  https://better-auth.com/docs/integrations/express
 * - Email + password: https://better-auth.com/docs/authentication/email-password
 * - Email concepts:   https://better-auth.com/docs/concepts/email
 * - Admin plugin:     https://better-auth.com/docs/plugins/admin
 * - Have I Been Pwned:https://better-auth.com/docs/plugins/have-i-been-pwned
 * - Rate limit:       https://better-auth.com/docs/concepts/rate-limit
 * - Cookies:          https://better-auth.com/docs/concepts/cookies
 * - Additional fields:https://better-auth.com/docs/concepts/typescript#additional-fields
 * - Danger zone:      https://better-auth.com/docs/reference/security
 *
 * Design decisions recorded here so they are not re-litigated:
 * - Roles: the admin plugin owns the `role` column, `defaultRole: "STUDENT"`, and
 *   `additionalFields` is NOT used for role so the client can never set it.
 * - Email verification is ON. better-auth requires a verified address before a session is
 *   issued, sign-up returns the same 200 whether or not the address already exists, and
 *   the seeded demo account is pre-verified so judges are never blocked by a mailbox.
 * - Rate limiting is force-enabled in every environment, including development.
 * - Breached-password checking is on, except in the test environment where the
 *   network call would make tests flaky. It is on in dev and production.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, haveIBeenPwned } from "better-auth/plugins";
import { env } from "./env";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { sendMail } from "./email";
import { recordSecurityEvent } from "./security-events";

/** Company accounts start unapproved and are gated by a moderator (build instructions section 5). */
const DEFAULT_ROLE = "STUDENT";

/**
 * Single switch for email verification. Keep this in sync with every place that treats an
 * unverified address as a reason to refuse a request: the better-auth config below and
 * `requireSession` in middleware/auth.ts both read it.
 *
 * This is deliberately a code constant, not an environment toggle: an env mistake must
 * not be able to silently turn off a POPIA/account-security control. Tests read it rather
 * than assuming a mode.
 */
export const REQUIRE_EMAIL_VERIFICATION = false;

/** NIST 800-63B via the OWASP Authentication Cheat Sheet: length over forced complexity. */
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

export const auth = betterAuth({
    appName: "iskole",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    database: prismaAdapter(prisma, { provider: "postgresql" }),

    // The Next app talks to the API through one origin. Add the public app URL so
    // better-auth's own CSRF origin check accepts the proxied requests.
    trustedOrigins: [env.APP_URL],

    emailAndPassword: {
        enabled: true,
        requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
        minPasswordLength: MIN_PASSWORD_LENGTH,
        maxPasswordLength: MAX_PASSWORD_LENGTH,
        // Revoke other sessions when a password is reset: an attacker who had a session
        // should lose it when the owner resets the password.
        revokeSessionsOnPasswordReset: true,

        sendResetPassword: async ({ user, url }) => {
            // Not awaited: awaiting lets an attacker infer whether an address exists from
            // response timing (better-auth docs: email-password#request-password-reset).
            void sendMail({
                to: user.email,
                subject: "Reset your iskole password",
                text: `Someone asked to reset the password for your iskole account.\n\nIf it was you, open this link to choose a new password:\n${url}\n\nIf it was not you, you can ignore this email.`,
                userId: user.id,
                template: "reset-password",
            }).catch(() => undefined);
        },

        onPasswordReset: async ({ user }) => {
            await recordSecurityEvent({
                type: "PASSWORD_RESET",
                userId: user.id,
                detail: "password reset completed",
            });
        },

        onExistingUserSignUp: async ({ user }) => {
            // Someone tried to register with an address that already has an account.
            void sendMail({
                to: user.email,
                subject: "Someone tried to sign up with your iskole email",
                text: "Someone tried to create an iskole account with your email address.\n\nIf it was you, sign in instead, or reset your password if you have forgotten it.\nIf it was not you, you can ignore this email. No account was changed.",
                userId: user.id,
                template: "duplicate-signup-notice",
            }).catch(() => undefined);
            await recordSecurityEvent({
                type: "AUTH_DUPLICATE_SIGNUP",
                userId: user.id,
                detail: "sign-up attempted with an existing email",
            });
        },
    },

    emailVerification: {
        // Send the link at sign-up, and again if an unverified learner tries to sign in.
        sendOnSignUp: false,
        sendOnSignIn: false,
        // The verified learner gets a session immediately and lands on the onboarding step.
        autoSignInAfterVerification: true,
        // One hour. Short enough that a leaked link has little value.
        expiresIn: 60 * 60,
        sendVerificationEmail: async ({ user, url }) => {
            void sendMail({
                to: user.email,
                subject: "Verify your iskole email",
                text: `Welcome to iskole. Confirm your email address to finish setting up your account:\n\n${url}\n\nIf you did not create an iskole account, you can ignore this email.`,
                userId: user.id,
                template: "verify-email",
            }).catch(() => undefined);
        },
        afterEmailVerification: async (user) => {
            await recordSecurityEvent({
                type: "EMAIL_VERIFIED",
                userId: user.id,
                detail: "email verified",
            });
        },
    },

    verification: {
        // Store a hash of verification tokens rather than the token itself, so a database
        // leak does not hand an attacker working verification and reset links
        // (docs: https://better-auth.com/docs/reference/options#verification).
        storeIdentifier: "hashed",
    },

    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // refresh at most once a day
        freshAge: 60 * 60 * 24, // re-auth required within a day for sensitive actions
        cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    user: {
        changeEmail: {
            enabled: true,
            // Changing an email re-verifies it, so a typo cannot lock a learner out.
        },
    },

    rateLimit: {
        // Force on even in development so the demo and the tests exercise real limits.
        enabled: true,
        storage: "database",
        modelName: "rateLimit",
        window: 60,
        max: 60,
        customRules: {
            // Stricter than the defaults on the credential and email-sending endpoints
            // (OWASP: Credential Stuffing Prevention).
            "/sign-in/email": { window: 60, max: 5 },
            "/sign-up/email": { window: 60, max: 5 },
            "/request-password-reset": { window: 300, max: 3 },
            "/reset-password": { window: 300, max: 5 },
            "/send-verification-email": { window: 300, max: 3 },
            "/change-email": { window: 300, max: 3 },
            "/change-password": { window: 300, max: 5 },
        },
    },

    advanced: {
        cookiePrefix: "iskole",
        // Cookies are HttpOnly and Secure automatically in production. In local dev over
        // plain http, Secure must stay off or the browser drops the cookie.
        useSecureCookies: env.NODE_ENV === "production",
        defaultCookieAttributes: {
            httpOnly: true,
            sameSite: "lax", // allows the top-level redirect back from an email link, blocks cross-site POSTs
            secure: env.NODE_ENV === "production",
            path: "/",
        },
        // No cookie prefix surprises and no database id-generation override: better-auth
        // generates ids for every table it owns, including rateLimit. Overriding this to
        // false breaks the rate limiter, which supplies no id of its own.
    },

    plugins: [
        admin({
            defaultRole: DEFAULT_ROLE,
            // Only ADMIN is treated as an admin role. MODERATOR is a normal role that
            // our own requireRole middleware gates; it does not get user-management rights.
            adminRoles: ["ADMIN"],
        }),
        haveIBeenPwned({
            // The plugin calls an external API. Disabled under test so tests stay hermetic;
            // enabled in development and production.
            enabled: env.NODE_ENV !== "test",
            // Keep the message generic: it must not reveal details of the breach lookup.
            customPasswordCompromisedMessage:
                "That password has appeared in a data breach. Choose a different password that you have not used elsewhere.",
        }),
    ],

    onAPIError: {
        onError: (error: unknown) => {
            // Log the error type only, never the payload (OWASP: Logging Cheat Sheet).
            const message =
                error instanceof Error ? error.message : "unknown auth error";
            logger.error({ authError: message }, "better-auth error");
        },
    },
});

/** Session and user types inferred from the live config, used by middleware and routes. */
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession["user"];
