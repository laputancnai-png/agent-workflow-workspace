import { beforeAll, describe, expect, it } from 'vitest';

import { checkDbConnection } from '../helpers/db.js';

describe('DB', () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= 'postgres://aww:aww@localhost:5432/aww';
  });

  it('connects to postgres', async () => {
    const result = await checkDbConnection();

    expect(result).toBeDefined();
  });
});
