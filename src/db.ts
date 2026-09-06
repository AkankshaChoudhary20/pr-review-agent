import { Pool } from "pg";
import { config } from "./config.js";

export const pool = new Pool({ connectionString: config.databaseUrl });

pool.on("error", (err) => {
  // Errors on idle clients in the pool — log but don't crash the process,
  // pg will discard the bad client and create a new one on next checkout.
  console.error("[db] Unexpected error on idle Postgres client:", err);
});
