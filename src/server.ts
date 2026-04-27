import { buildApp } from "./app.js";
import { createRuntimeServices } from "./bootstrap/runtime-services.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();

startServer().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});

async function startServer() {
  const { host, port } = config.server;
  const runtime = await createRuntimeServices(config);
  const app = buildApp({
    config,
    services: {
      ...runtime.services,
      loginRateLimiter: runtime.loginRateLimiter,
      runtimeConfigStore: runtime.runtimeConfigStore,
      sessionArchiveRepository: runtime.sessionArchiveRepository,
    },
  });

  app.addHook("onClose", async () => {
    await runtime.close();
  });

  try {
    await app.listen({ port, host });
    app.log.info({ host, port }, "gateway listening");
  } catch (error) {
    app.log.error(error, "failed to start gateway");
    await app.close();
    process.exit(1);
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, "received shutdown signal");
      app.close().then(
        () => process.exit(0),
        (err) => {
          app.log.error(err, "error during graceful shutdown");
          process.exit(1);
        },
      );
    });
  }
}
