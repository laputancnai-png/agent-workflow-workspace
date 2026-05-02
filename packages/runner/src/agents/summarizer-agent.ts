import { simpleGit } from 'simple-git';

import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'nvidia/qwen/qwen3-next-80b-a3b-instruct';

const SYSTEM_PROMPT = `You are an expert at writing clear, concise pull request descriptions.
Given a git diff, write a PR description explaining:
1. What changed (bullet points)
2. Why (motivation / context)
3. How to test (checklist)

Use GitHub-flavored markdown. Be specific and developer-friendly.`;

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

export class SummarizerAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const { repo_path, feature_branch } = req.config;
    const diff = await getDiff(repo_path, feature_branch);

    const response = await this.registry.complete(
      {
        model: req.preferred_model ?? DEFAULT_MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Changes to summarize:\n\n${diff || '(empty diff)'}` }],
      },
      req.preferred_provider,
    );

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      tokens_used: response.tokens_used,
      output_artifacts: [{ role: 'PR_SUMMARY', content: response.content }],
    };
  }
}
