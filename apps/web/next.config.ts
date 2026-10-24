import type { NextConfig } from "next";

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:8004";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    // @iskole/shared ships TypeScript source (no build step), so Next compiles it with the app.
    transpilePackages: ["@iskole/shared"],
    // Do not auto-generate AGENTS.md in the repo; docs live in docs/ and SECURITY.md.
    agentRules: false,
    // Same-origin proxy: the browser only ever talks to one origin, so the better-auth
    // session cookie stays HttpOnly, Secure and SameSite=Lax without CORS. Authorization
    // is enforced in Express; this rewrite is convenience, never the security boundary.
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${apiInternalUrl}/api/:path*`,
            },
        ];
    },
    output: "standalone",
};

export default nextConfig;
