import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/server.ts"],
    format: ["esm"],
    outDir: "dist",
    clean: true,
    target: "node22",
    noExternal: ["@iskole/shared"],
    banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
});
