import { describe, expect, it } from 'vitest';

import { users } from '../../src/db/schema/users.js';
import { workflowSteps } from '../../src/db/schema/workflows.js';
import { workspaces } from '../../src/db/schema/workspaces.js';

describe('Schema shapes', () => {
  it('users table has required columns', () => {
    expect(users.id).toBeDefined();
    expect(users.githubId).toBeDefined();
    expect(users.email).toBeDefined();
  });

  it('workspaces table has slug column', () => {
    expect(workspaces.slug).toBeDefined();
  });

  it('workflowSteps has status enum column', () => {
    expect(workflowSteps.status).toBeDefined();
  });
});
