import { BaseAgent, runAgentMain } from './base-agent.js';
import { CoderAgent } from './coder-agent.js';
import { PlannerAgent } from './planner-agent.js';
import { ReviewerAgent } from './reviewer-agent.js';
import { SummarizerAgent } from './summarizer-agent.js';
import { TaskerAgent } from './tasker-agent.js';
import { TesterAgent } from './tester-agent.js';

function createAgent(role: string): BaseAgent {
  switch (role) {
    case 'planner':
      return new PlannerAgent();
    case 'tasker':
      return new TaskerAgent();
    case 'coder':
      return new CoderAgent();
    case 'tester':
      return new TesterAgent();
    case 'reviewer':
      return new ReviewerAgent();
    case 'summarizer':
      return new SummarizerAgent();
    default:
      return new ReviewerAgent();
  }
}

void runAgentMain(createAgent);
