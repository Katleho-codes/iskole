/**
 * Internal server-to-server API read for App Router pages.
 *
 * The browser cookie is forwarded to Express, which remains the authorization boundary. The
 * page never talks to Postgres directly, so an ownership rule is enforced in one place.
 */
import { headers } from "next/headers";

export type ServerApiResult<T> =
    | { ok: true; status: number; data: T }
    | { ok: false; status: number; data: null };

export async function serverApi<T>(path: string): Promise<ServerApiResult<T>> {
    const headerList = await headers();
    const cookie = headerList.get("cookie");
    const base = process.env.API_INTERNAL_URL ?? "http://localhost:8004";

    try {
        const response = await fetch(`${base}${path}`, {
            headers: cookie ? { cookie } : undefined,
            cache: "no-store",
        });
        if (!response.ok) {
            return { ok: false, status: response.status, data: null };
        }
        return {
            ok: true,
            status: response.status,
            data: (await response.json()) as T,
        };
    } catch {
        return { ok: false, status: 0, data: null };
    }
}
