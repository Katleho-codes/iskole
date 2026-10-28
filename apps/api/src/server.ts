import { createApp } from "./app";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { startNudgeJob } from "./lib/nudges";

const app = createApp();

startNudgeJob();

const server = app.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT }, "iskole api listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        server.close(() => {
            process.exit(0);
        });
    });
}
