import { readFileSync } from "fs";
import path from "path";
import { Pool } from "pg";

/** The small slice of a pg Pool / PoolClient the repository needs. */
export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface Database extends Queryable {
  /** Run `fn` inside a transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 10 });

  return {
    query: (text, params) => pool.query(text, params as any[]) as any,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client as unknown as Queryable);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export const schemaSql = (): string =>
  readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");

export async function migrate(db: Queryable): Promise<void> {
  await db.query(schemaSql());
}
