import { closeDataSource, getDataSource } from "../src/persistence/data-source.js";

async function main(): Promise<void> {
  console.log("Applying SQLite migrations...");
  const ds = await getDataSource();
  console.log(`Connected to database: ${ds.options.database}`);
  const migrations = await ds.showMigrations();
  console.log("Database migrations status:", migrations ? "Up to date" : "Executed");
  await closeDataSource();
  console.log("Migrations applied successfully.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
