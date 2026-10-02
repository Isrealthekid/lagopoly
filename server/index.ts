import { createService } from "./service";
const service = createService({
  database: process.env.DATABASE_PATH,
  origin:
    process.env.APP_ORIGIN ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "http://localhost:5173"),
  production: process.env.NODE_ENV === "production",
  staticDir: process.env.NODE_ENV === "production" ? "dist" : undefined,
});
const port = Number(process.env.PORT ?? 3001);
service.server.listen(port, "0.0.0.0", () =>
  console.log(`Account and multiplayer server: http://localhost:${port}`),
);
process.on("SIGINT", () => {
  service.close();
  process.exit(0);
});
