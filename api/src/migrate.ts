import { loadConfig } from "./config";
import { createDatabase, migrate } from "./db";

async function main() {
  const db = createDatabase(loadConfig().databaseUrl);
  await migrate(db);
  console.log("[migrate] schema is up to date");
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
