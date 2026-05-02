import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { GitWorker } from '../git-worker.js';
import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'nvidia/qwen/qwen3-next-80b-a3b-instruct';

const SYSTEM_PROMPT = `You are an expert software engineer implementing code changes.
Given a task list, write out the complete content of every file that needs to be created or modified.

Use this exact format for each file:
<file path="relative/path/from/repo/root">
complete file content here
</file>

After all files, write a conventional commit message:
<commit>feat: your descriptive commit message</commit>

Rules:
- Include COMPLETE file contents, not diffs or partial snippets
- Use relative paths from repo root (e.g. "src/index.ts", not "/src/index.ts")
- Follow existing code style and conventions
- Write at least one <file> block and exactly one <commit> block`;

interface CodeChange {
  commit_message: string;
  files: Array<{ path: string; content: string }>;
}

function parseCodeChange(raw: string): CodeChange {
  const files: Array<{ path: string; content: string }> = [];

  const filePattern = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match: RegExpExecArray | null;
  while ((match = filePattern.exec(raw)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].replace(/^\n/, '').replace(/\n$/, '');
    if (filePath) {
      files.push({ path: filePath, content });
    }
  }

  const commitMatch = /<commit>([\s\S]*?)<\/commit>/i.exec(raw);
  const commit_message = commitMatch ? commitMatch[1].trim() : 'chore: implement task list';

  if (files.length === 0) {
    // Fallback: try JSON in case some provider returns it
    const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as CodeChange;
    return parsed;
  }

  return { commit_message, files };
}

export class CoderAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const taskList =
      req.input_artifacts.find((a) => a.role === 'TASK_LIST')?.content ?? '(no task list provided)';
    const { repo_path } = req.config;

    const response = await this.registry.complete(
      {
        model: req.preferred_model ?? DEFAULT_MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Task List:\n\n${taskList}` }],
      },
      req.preferred_provider,
    );

    if (response.content === 'NO_REPLY' || response.content.trim() === '') {
      return {
        type: 'fail',
        agent_run_id: req.agent_run_id,
        error_code: 'NO_REPLY',
        error_message: 'LLM returned no content — session may have been rejected by the gateway',
        retryable: true,
      };
    }

    let change: CodeChange;
    try {
      change = parseCodeChange(response.content);
    } catch {
      return {
        type: 'fail',
        agent_run_id: req.agent_run_id,
        error_code: 'PARSE_ERROR',
        error_message: `Failed to parse LLM response: ${response.content.slice(0, 200)}`,
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
