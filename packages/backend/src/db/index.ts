import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as artifactsSchema from './schema/artifacts.js';
import * as auditSchema from './schema/audit.js';
import * as decisionsSchema from './schema/decisions.js';
import * as runnersSchema from './schema/runners.js';
import * as usersSchema from './schema/users.js';
import * as workflowsSchema from './schema/workflows.js';
import * as workspacesSchema from './schema/workspaces.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const client = postgres(connectionString);

export const db = drizzle(client, {
  schema: {
    ...artifactsSchema,
    ...auditSchema,
    ...decisionsSchema,
    ...runnersSchema,
    ...usersSchema,
    ...workflowsSchema,
    ...workspacesSchema,
  },
});

export type DB = typeof db;
