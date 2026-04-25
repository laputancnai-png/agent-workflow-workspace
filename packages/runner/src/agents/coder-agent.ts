import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { GitWorker } from '../git-worker.js';
import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are an expert software engineer implementing code changes.
Given a task list, generate ALL necessary file changes.

Respond ONLY with valid JSON matching this exact schema (no markdown, no explanation):
{
  "commit_message": "<conventional commit message, e.g. feat: add user auth>",
  "files": [
    { "path": "<relative path from repo root>", "content": "<complete file content>" }
  ]
}

Rules:
- Include COMPLETE file contents (not diffs or partial snippets)
- Use relative paths from repo root (e.g. "src/index.ts", not "/src/index.ts")
- Follow existing code style and conventions`;

interface CodeChange {
  commit_message: string;
  files: Array<{ path: string; content: string }>;
}

function parseCodeChange(raw: string): CodeChange {
  const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
  return JSON.parse(cleaned) as CodeChange;
}

export class CoderAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const taskList =
      req.input_artifacts.find((a) => a.role === 'TASK_LIST')?.content ?? '(no task list provided)';
    const { repo_path } = req.config;

    const response = await this.registry.complete(
      {
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Task List:\n\n${taskList}` }],
      },
      req.preferred_provider,
    );

    let change: CodeChange;
    try {
      change = parseCodeChange(response.content);
    } catch {
      return {
        type: 'fail',
        agent_run_id: req.agent_run_id,
        error_code: 'PARSE_ERROR',
        error_message: `Failed to parse LLM response as JSON: ${response.content.slice(0, 200)}`,
        retryable: true,
      };
    }

    const repoRoot = resolve(repo_path);
    for (const file of change.files) {
      const safePath = resolve(repoRoot, file.path);
      if (!safePath.startsWith(repoRoot + '/')) {
        continue; // path traversal prevention
      }
      await mkdir(dirname(safePath), { recursive: true });
      await writeFile(safePath, file.content, 'utf8');
    }

    const gitWorker = new GitWorker(repoRoot, req.agent_run_id);
    const sha = await gitWorker.commitAll(change.commit_message);

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      tokens_used: response.tokens_used,
      output_artifacts: [{ role: 'CODE_PATCH', content: change.commit_message, git_commit_sha: sha }],
    };
  }
}
