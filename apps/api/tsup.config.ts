import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/server.ts"],
    format: ["esm"],
    target: "node22",
    platform: "node",
    clean: true,
    splitting: false,
    sourcemap: false,
    shims: false,
    external: ["dotenv"],
});
