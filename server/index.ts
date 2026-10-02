import { createService } from "./service";
if(process.env.NODE_ENV === "production" && !/^postgres(?:ql)?:\/\//.test(process.env.SUPABASE_DB_URL ?? ""))throw new Error("SUPABASE_DB_URL is required in production. Use the Supabase Postgres connection string.");
const service = createService({
  database: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_PATH,
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
for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,async()=>{await service.close();process.exit(0);});
