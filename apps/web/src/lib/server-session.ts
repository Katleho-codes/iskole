/**
 * Server-side session read for App Router pages.
 *
 * This is a rendering convenience, never the security boundary. Every API route re-checks
 * the signed cookie through better-auth's own handler. Here we only forward the browser's
 * cookie to the internal API and read the user, so pages can choose between a signed-in
 * shell and a signed-out prompt without flashing the wrong state.
 */
import { headers } from "next/headers";

export type SessionUser = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role?: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
    const headerList = await headers();
    const cookie = headerList.get("cookie");
    if (!cookie) return null;

    try {
        // Read through to the database so a just-verified account is not held back by the
        // five-minute session cookie cache. The cache still protects the auth endpoints.
        const response = await fetch(
            `${process.env.API_INTERNAL_URL ?? "http://localhost:8004"}/api/auth/get-session?disableCookieCache=true`,
            {
                headers: { cookie },
                // A stale session would show the wrong name or a signed-out state.
                cache: "no-store",
            },
        );
        if (!response.ok) return null;
        const data = (await response.json()) as { user?: SessionUser } | null;
        return data?.user ?? null;
    } catch {
        // The API being unreachable is not a reason to crash the page.
        return null;
    }
}
