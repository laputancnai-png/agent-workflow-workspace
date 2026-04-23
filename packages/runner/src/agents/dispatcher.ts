import { BaseAgent, runAgentMain } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

class StubAgent extends BaseAgent {
  constructor(private readonly role: 'CODE_PATCH' | 'TEST_REPORT' | 'REVIEW_COMMENT' | 'PR_SUMMARY' | 'PLAN' | 'TASK_LIST') {
    super();
  }

  async execute(req: AgentRequest): Promise<AgentResponse> {
    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      output_artifacts: [{ role: this.role, content: `[Stub: ${this.role} output]` }],
    };
  }
}

class PlannerAgent extends StubAgent {
  constructor() {
    super('PLAN');
  }
}

class TaskerAgent extends StubAgent {
  constructor() {
    super('TASK_LIST');
  }
}

function createAgent(role: string) {
  switch (role) {
    case 'planner':
      return new PlannerAgent();
    case 'tasker':
      return new TaskerAgent();
    case 'coder':
      return new StubAgent('CODE_PATCH');
    case 'tester':
      return new StubAgent('TEST_REPORT');
    case 'reviewer':
      return new StubAgent('REVIEW_COMMENT');
    case 'summarizer':
      return new StubAgent('PR_SUMMARY');
    default:
      return new StubAgent('REVIEW_COMMENT');
  }
}

void runAgentMain(createAgent);
