import { simpleGit } from 'simple-git';

import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are an expert code reviewer.
Review the provided git diff and produce structured review comments.
Focus on: correctness, security vulnerabilities, performance, maintainability, and test coverage.
Format output as markdown with sections:
## Summary
## Issues (Critical / High / Medium / Low)
## Suggestions`;

async function getDiff(repoPath: string, featureBranch: string): Promise<string> {
  try {
    const git = simpleGit(repoPath);
    const diff = await git.diff([`main...${featureBranch}`]);
    if (diff) return diff;
    return await git.diff(['HEAD~1', 'HEAD']);
  } catch {
    return '(unable to generate diff)';
  }
}

export class ReviewerAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const { repo_path, feature_branch } = req.config;
    const diff = await getDiff(repo_path, feature_branch);

    const response = await this.registry.complete(
      {
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Code diff to review:\n\n${diff || '(empty diff)'}` }],
      },
      req.preferred_provider,
    );

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      tokens_used: response.tokens_used,
      output_artifacts: [{ role: 'REVIEW_COMMENT', content: response.content }],
    };
  }
}
