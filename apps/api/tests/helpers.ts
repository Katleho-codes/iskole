/**
 * Test helpers for building authenticated requests.
 *
 * Sessions are created by signing in through better-auth, never by hand-writing a cookie.
 * better-auth signs the session cookie (`<token>.<hmac>`), and reproducing that signature
 * here would mean duplicating production crypto in a test. If the signing scheme changed,
 * the tests would keep passing while the real app broke. Signing in exercises the real path.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

export function uniqueEmail(prefix = "learner") {
    return `${prefix}-${randomUUID()}@example.test`;
}

export const TEST_PASSWORD = "a-long-enough-passphrase";

type TestUserOptions = {
    role?: "STUDENT" | "COMPANY" | "MODERATOR" | "ADMIN";
    emailVerified?: boolean;
    banned?: boolean;
    /** Under-18 learners for the guardian-consent and company-search rules. */
    birthDate?: Date;
};

/**
 * Create a user and return a Cookie header value that better-auth will accept.
 *
 * Flow: insert with the role we need (the admin plugin would otherwise force STUDENT),
 * mark verified as needed, then sign in through better-auth to obtain a real signed cookie.
 * A user that must stay unverified gets no cookie: the sign-in step is skipped, and any
 * cookie would be rejected anyway. The caller asserts the guard behaviour for those cases.
 *
 * The sign-in always runs against a full app (createApp), because the auth handler lives
 * there. The caller's own guarded app is only used to exercise the routes.
 */
export async function createTestUser(options: TestUserOptions = {}): Promise<{
    id: string;
    email: string;
    cookie: string | null;
}> {
    const email = uniqueEmail();
    const user = await prisma.user.create({
        data: {
            id: randomUUID(),
            name: "Test User",
            email,
            emailVerified: options.emailVerified ?? true,
            role: options.role ?? "STUDENT",
            banned: options.banned ?? false,
        },
    });

    if (!(options.emailVerified ?? true)) {
        return { id: user.id, email, cookie: null };
    }

    // Set a known password through better-auth's own hasher so the sign-in below is real.
    const { hashPassword } = await import("better-auth/crypto");
    const hashed = await hashPassword(TEST_PASSWORD);
    await prisma.account.create({
        data: {
            id: randomUUID(),
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: hashed,
        },
    });

    // The rate limiter counts sign-ins per IP and all tests share 127.0.0.1, so the helper's
    // own sign-ins would trip it before the rate-limit test runs. Clear only the sign-in
    // counter, and only for this helper: the dedicated rate-limit test never calls the helper,
    // so it still sees real limiting.
    await prisma.rateLimit.deleteMany({
        where: { key: { contains: "/sign-in/email" } },
    });

    const signIn = await request(createApp())
        .post("/api/auth/sign-in/email")
        .set("Origin", "http://localhost:3004")
        .send({ email, password: TEST_PASSWORD });

    if (signIn.status !== 200) {
        throw new Error(
            `test sign-in failed with ${signIn.status}: ${JSON.stringify(signIn.body)}`,
        );
    }

    // supertest types set-cookie as string | string[], so normalise before searching.
    const rawSetCookie = signIn.headers["set-cookie"];
    const setCookies = Array.isArray(rawSetCookie)
        ? rawSetCookie
        : [rawSetCookie ?? ""];
    const sessionCookie = setCookies.find((c) =>
        c.startsWith("iskole.session_token="),
    );
    if (!sessionCookie)
        throw new Error("sign-in did not return a session cookie");

    const cookieHeader = sessionCookie.split(";")[0];
    if (!cookieHeader) throw new Error("session cookie had no value");

    return { id: user.id, email, cookie: cookieHeader };
}

/**
 * A raw session row with no valid signature. Used to prove the guard rejects unsigned
 * cookies, which is the property that stops a forged cookie from being accepted.
 */
export async function createUnsignedCookieFor(userId: string): Promise<string> {
    const token = randomUUID();
    await prisma.session.create({
        data: {
            id: randomUUID(),
            token,
            userId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });
    return `iskole.session_token=${token}`;
}
