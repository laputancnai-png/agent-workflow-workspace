import 'dotenv/config';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { closeDb, db } from './index.js';

try {
  await migrate(db, { migrationsFolder: './drizzle' });
} finally {
  await closeDb();
}
