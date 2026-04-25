import { sql } from 'drizzle-orm';

import { db } from '../../src/db/index.js';

export async function checkDbConnection() {
  return db.execute(sql`SELECT 1`);
}
