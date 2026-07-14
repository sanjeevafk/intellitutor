import { createClient } from "@libsql/client";
import { requireEnv } from "../app/api/_lib/env";
import * as fs from "fs";
import * as path from "path";

let dbClient: ReturnType<typeof createClient> | null = null;
let lastUrl = "";
let lastToken = "";
let initialized = false;

async function runSchemaInitialization(client: ReturnType<typeof createClient>) {
  try {
    const schemaPath = path.join(process.cwd(), "lib/schema.sql");
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, "utf8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await client.execute(statement);
      }
    }
  } catch (err) {
    console.error("Schema initialization failed:", err);
  }
}

export function getDb() {
  const env = requireEnv();

  if (!dbClient || env.tursoDatabaseUrl !== lastUrl || env.tursoAuthToken !== lastToken) {
    dbClient = createClient({
      url: env.tursoDatabaseUrl,
      authToken: env.tursoAuthToken || undefined
    });
    lastUrl = env.tursoDatabaseUrl;
    lastToken = env.tursoAuthToken;
    initialized = false;
  }

  if (!initialized) {
    initialized = true;
    runSchemaInitialization(dbClient);
  }

  return dbClient;
}

