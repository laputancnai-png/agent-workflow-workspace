import 'dotenv/config';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from './index.js';

await migrate(db, { migrationsFolder: './drizzle' });
