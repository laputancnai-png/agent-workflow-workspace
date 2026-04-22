import { describe, expect, it } from 'vitest';

import { artifacts } from '../../src/db/schema/artifacts.js';
import { auditEvents } from '../../src/db/schema/audit.js';
import { decisions } from '../../src/db/schema/decisions.js';
import { agentRuns, runners } from '../../src/db/schema/runners.js';
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

  it('artifacts table has role and status columns', () => {
    expect(artifacts.role).toBeDefined();
    expect(artifacts.status).toBeDefined();
  });

  it('decisions table has action column', () => {
    expect(decisions.action).toBeDefined();
  });

  it('runners and agentRuns tables have status columns', () => {
    expect(runners.status).toBeDefined();
    expect(agentRuns.status).toBeDefined();
  });

  it('auditEvents table has hash columns', () => {
    expect(auditEvents.selfHash).toBeDefined();
    expect(auditEvents.prevHash).toBeDefined();
  });
});
