# AWW PRD v2 修订实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AWW PRD 从 v1 修订为 v2，填补 5 Agent 审查报告中识别的 8 个架构级空白，解决所有跨角色共识问题，使 PRD 达到可指导 MVP 工程实施的精度。

**Architecture:** 直接修订 `docs/PRD.md`（保留 v1 内容在 git 历史中）。按逻辑依赖顺序写入：先写架构决策（地基），再写数据模型（结构），再写 UX 流程（交互），最后更新现有章节（集成、NFR）。

**Tech Stack:** Markdown 文档编辑，无代码依赖。

---

## 文件变更地图

| 文件 | 操作 | 内容 |
|------|------|------|
| `docs/PRD.md` | 修改 | 全文修订，新增 §20–§25，更新 §8 §11 §12 §13 §14 §15 §18 |

---

## Task 1：PRD 文件头部 → 标记 v2 + 解决 §18 Open Questions

**Files:**
- Modify: `docs/PRD.md` 第 1 行 + §18 章节

- [ ] **Step 1：更新标题行标记版本**

将第 1 行：
```
# PRD: Agent Workflow Workspace for Software Teams
```
替换为：
```
# PRD: Agent Workflow Workspace for Software Teams
**Version:** 2.0 · **Updated:** 2026-04-21 · **Status:** Draft for Engineering Review
**Changelog v2:** Added execution environment ADR (§20), security model (§21), git strategy (§22), data model v2 (§14), state machine appendix (§23), artifact spec (§24), real-time protocol (§12), human approval UX flows (§8/§13), FTUE (§13), GitHub integration levels (§15).
```

- [ ] **Step 2：用决策替换 §18 Open Questions**

将 §18 章节完整替换为以下内容（用已做决策 + 保留真实未决问题）：

```markdown
## 18. Resolved Questions and Remaining Open Questions

### Resolved in v2

- **Agent execution environment:** Local Runner model (see §20). Code stays in user environment.
- **Branch strategy:** One feature branch per WorkflowRun; coding agents serialize commits to that branch (see §22).
- **Default workflow:** Fixed PRD-to-PR template in MVP; not configurable.
- **PRD editing:** Built-in (write, paste, or upload .md/.txt in new workspace wizard).
- **GitHub integration level:** Level 2 — git + GitHub REST API for PR creation (see §15).

### Still Open

- Which LLM providers to support at launch beyond OpenAI and Anthropic (e.g., Google Gemini, local Ollama).
- Whether to target individual power users or small engineering teams first for pricing and GTM.
- Notification channel for human approval gate alerts (email? Slack? browser push?).
- Retention policy for artifact content stored in AWW Cloud.
```

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): mark v2, resolve open questions in §18"
```

---

## Task 2：新增 §20 — 执行环境架构决策 (C1)

**Files:**
- Modify: `docs/PRD.md`（在 §19 MVP Milestone Plan 之后追加）

- [ ] **Step 1：在文件末尾追加 §20**

```markdown
## 20. Execution Environment Architecture

### Decision: Local Runner Model

AWW uses the **Local Runner model**. The AWW Cloud service handles the web UI, workflow scheduling, and artifact storage. Agent execution happens on user-controlled infrastructure via a lightweight runner process. Raw source code files never transit through or are stored on AWW Cloud servers.

This choice satisfies three constraints simultaneously:
1. Enables "basic shell command execution" (tests, lint, typecheck) without a cloud sandbox.
2. Satisfies the NFR "sensitive repo data should not be exposed outside configured model/tool boundaries."
3. Passes enterprise security reviews that prohibit code upload to third-party services.

### System Components

**AWW Cloud Service**
- Serves the web UI
- Stores workspace state, workflow runs, steps, artifacts, decisions, and audit logs
- Schedules AgentRun jobs (polling-based in MVP, event-driven post-MVP)
- Exposes REST API consumed by the runner and browser
- Never stores raw source code file contents

**AWW Local Runner**
- Lightweight daemon installed by the user (`npm install -g @aww/runner` or binary download)
- Registers with AWW Cloud using a one-time Runner Token
- Polls AWW Cloud every 5 seconds for pending AgentRun jobs assigned to this runner
- Executes agent steps: clones/checks out the repo, calls the LLM API directly, runs shell commands, writes files
- Reports AgentRun status, changed files, command logs, and artifact content back to AWW Cloud
- Sends heartbeat to AWW Cloud every 30 seconds; a missed heartbeat for 120 seconds marks the runner as offline

### Runner Registration

1. User opens AWW Settings → Runners → "Add Runner" → copies runner token
2. On local machine: `aww-runner register --url https://app.aww.dev --token <runner-token>`
3. Runner appears as "Online" in Workspace Settings within 10 seconds
4. MVP: one runner per workspace. Post-MVP: multiple runners for parallelism.

### Data Flow

```
[Browser] ←—REST API—→ [AWW Cloud]
                              ↕ (job queue + artifact upload)
                        [AWW Runner] (local machine)
                              ↕ (git clone/push, file R/W)
                        [Git Repo] (local or remote)
                              ↕ (direct LLM API calls)
                        [LLM Provider] (OpenAI / Anthropic)
```

### MVP Constraints

- Runner must be online for any agent step to execute; human steps do not require runner.
- Runner must have `git` installed and credentials to clone and push to the configured repository.
- Runner must have outbound network access to the LLM provider endpoint and AWW Cloud API.
- One runner handles one AgentRun at a time in MVP (no intra-runner parallelism).
```

- [ ] **Step 2：自查**

确认以下问题在本节中已回答：
- [ ] 三条执行路径已说明，选择了哪条并给出理由
- [ ] Runner 注册流程有具体步骤
- [ ] 代码文件是否经过 AWW Cloud 已明确（否）
- [ ] Heartbeat 频率已定义（30s 发送，120s 未收视为 offline）

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): add §20 execution environment ADR — local runner model"
```

---

## Task 3：新增 §21 — 安全与凭证模型 (C7)

**Files:**
- Modify: `docs/PRD.md`（在 §20 之后追加）

- [ ] **Step 1：追加 §21**

```markdown
## 21. Security and Credential Model

### Credential Ownership Table

| Credential | Stored By | Used By | AWW Cloud Holds It? |
|-----------|-----------|---------|-------------------|
| GitHub OAuth Token | AWW Cloud (AES-256 encrypted) | AWW Cloud (PR creation API) | Yes, encrypted |
| LLM API Key | Runner local config file | Runner (direct API calls) | No |
| Runner Token | AWW Cloud (hashed) + local config | Runner registration | Hash only |
| Git credentials | Runner local config | Runner (git clone/push) | No |

### LLM API Key

The runner calls the LLM provider API directly from the user's machine using the key stored in `~/.aww/runner.config` (permissions: 600). AWW Cloud never proxies, transmits, or stores LLM API keys.

### GitHub OAuth Token

GitHub OAuth uses the server-side authorization code flow. The resulting access token is encrypted with AES-256-GCM and stored in the AWW Cloud database. It is used server-side exclusively for:
- Reading repository metadata (branch list, default branch)
- Creating pull requests via GitHub REST API

The token is never sent to the browser or to the runner in plaintext.

### Code File Privacy

AWW Cloud stores:
- Artifact content: structured text (plan, task list, review summary, PR description)
- Changed file paths (strings)
- Git commit SHAs
- Code diff text (when the Review Agent produces a diff artifact)

AWW Cloud does not store:
- Raw source code files
- Full repository contents
- LLM prompt payloads (stored only in runner-local logs, not uploaded)

### Command Log Sanitization

Before uploading `command_logs` from a runner to AWW Cloud, the runner redacts strings matching known secret patterns (API key formats, token formats defined in a configurable redaction list). Redacted values are replaced with `[REDACTED]`.

### Agent Execution Isolation (MVP)

In MVP, each AgentRun is a subprocess of the runner process, inheriting the runner's filesystem permissions. Users are responsible for scoping the runner's environment to the repository only.

**Post-MVP target:** Docker container isolation per AgentRun with network policy restricting outbound to `git remote` and `AWW Cloud API` only.

### Workspace-Level Permission Scope

Each workspace is associated with a GitHub OAuth token that has `repo` scope (read + write to private repositories). Post-MVP, AWW will migrate to GitHub Apps with per-repository, per-permission installation for a least-privilege model.
```

- [ ] **Step 2：自查**

- [ ] GitHub Token 存储位置已明确（AWW Cloud，加密）
- [ ] LLM API Key 归属已明确（用户/Runner 本地，AWW 不经手）
- [ ] 代码文件隐私边界已明确（差异文本存储 OK，原始文件不存）
- [ ] MVP 沙箱局限已承认，Post-MVP 路径已给出

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): add §21 security and credential model"
```

---

## Task 4：新增 §22 — Git 工作区策略 (C8)

**Files:**
- Modify: `docs/PRD.md`（在 §21 之后追加）

- [ ] **Step 1：追加 §22**

```markdown
## 22. Git Workspace Strategy

### Branch Model

Each WorkflowRun creates and owns exactly one feature branch for the duration of the run.

**Naming convention:** `aww/{workspace-slug}/{run-id-short}`  
Example: `aww/shopflow-web/a1b2c3`

### Branch Lifecycle

1. **WorkflowRun created** → Runner creates feature branch from `Workspace.default_branch` HEAD. Records `WorkflowRun.base_commit_sha`.
2. **Coding Agent steps** → Each AgentRun commits to the feature branch. Commits are sequential (MVP: no parallel coding agents within one run).
3. **Review Agent step** → Diffs `feature_branch` vs `Workspace.default_branch`.
4. **Human final approval** → AWW Cloud calls GitHub REST API to create a PR (`feature_branch` → `default_branch`). AWW does not merge or delete the branch.
5. **Post-merge cleanup** → Managed by the team outside AWW.

### Commit Convention

Each AgentRun writes commits with the following message format:

```
aww({agent_role}): {step_name}

AgentRun-Id: {agent_run_id}
WorkflowRun-Id: {workflow_run_id}
```

This makes AWW-generated commits identifiable in `git log` and distinguishable from human commits.

### Multi-Agent Serialization

In MVP, at most one Coding Agent step runs at a time per WorkflowRun. The AWW scheduler enforces this by only marking a step `running` when no other step in the same WorkflowRun has `status = running`. This prevents concurrent writes without file-level locking.

### Take Over Commit Detection

When a human takes over a step, they work in their local IDE on the same feature branch. AWW detects completion by:
1. Polling the feature branch HEAD every 60 seconds for new commits authored after the Take Over was triggered, OR
2. Receiving a GitHub Webhook push event for the feature branch (preferred; requires Webhook setup in Workspace Settings).

When new commits are detected, AWW marks the Take Over step as `completed` and creates a human-authored Artifact from the commit diff.

### New Fields Required in Data Model (see §14)

- `WorkflowRun.feature_branch` — branch name, set at run creation
- `WorkflowRun.base_commit_sha` — HEAD of default_branch at run creation
- `AgentRun.git_branch` — branch the agent committed to
- `AgentRun.head_commit_sha` — HEAD after agent commits; null if no commits made
```

- [ ] **Step 2：自查**

- [ ] Feature branch 命名规则已定义
- [ ] 分支生命周期 5 个阶段已明确
- [ ] 多 Agent 串行化机制已描述（调度层保证，不需要文件锁）
- [ ] Take Over 完成检测机制已定义（polling + webhook 双保险）
- [ ] AWW 不执行 merge/delete 已明确

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): add §22 git workspace strategy — branch model and agent serialization"
```

---

## Task 5：更新 §14 数据模型 → v2 版本（含所有新字段）(C4, C5)

**Files:**
- Modify: `docs/PRD.md`，§14 Data Model Draft 章节

- [ ] **Step 1：替换整个 §14 章节**

用以下内容完整替换 `## 14. Data Model Draft` 至下一个 `##` 之间的内容：

```markdown
## 14. Data Model v2

### WorkflowTemplate *(new entity)*

- id
- name
- description
- steps: WorkflowStepTemplate[]
- version: integer
- created_by
- created_at

### Workspace

- id
- name
- repo_url
- default_branch
- created_by
- created_at
- status: enum (active | archived)
- runner_id: string *(new — links to registered runner)*
- github_installation_id: string | null *(new — GitHub OAuth/App installation)*

### WorkflowRun

- id
- workspace_id
- template_id
- current_step_id
- status: enum (pending | running | paused | completed | failed | cancelled)
- started_at
- completed_at
- feature_branch: string *(new — e.g. aww/shopflow-web/a1b2c3)*
- base_commit_sha: string *(new — HEAD of default_branch at run creation)*
- trigger_type: enum (manual | webhook | scheduled) *(new)*
- triggered_by: string *(new — user ID or system)*

### WorkflowStep

- id
- workflow_run_id
- template_step_id
- name
- owner_type: enum (human | agent | approval_gate)
- agent_role: enum (planner | task_breakdown | coding | test | review | summarizer) | null
- status: enum (pending | running | completed | failed | timed_out | retrying | cancelled | human_owned) *(v2 — full state machine, see §23)*
- input_artifact_ids: string[] *(IDs of Artifacts this step consumes)*
- input_artifact_roles: ArtifactRole[] *(new — declared types expected, e.g. [PLAN, TASK_LIST])*
- output_artifact_ids: string[] *(IDs of Artifacts this step produced)*
- approval_required: boolean
- retry_count: integer *(current attempt number)*
- max_retries: integer *(new — default: 3)*
- retry_backoff_seconds: integer *(new — default: 60)*
- depends_on_step_ids: string[] *(new — explicit dependencies for future DAG support)*
- execution_lock: { locked_by_agent_run_id: string, locked_at: timestamp, lock_expires_at: timestamp } | null *(new)*
- completed_at: timestamp | null *(new — for time-to-PR metric)*

### Artifact

- id
- workspace_id
- step_id
- role: enum (PRD | PLAN | TASK_LIST | CODE_PATCH | TEST_REPORT | REVIEW_COMMENT | PR_SUMMARY | HUMAN_EDIT) *(new — replaces untyped `type` field)*
- title
- content: string *(structured text; never raw source code files)*
- file_refs: string[] *(changed file paths, as strings)*
- git_commit_sha: string | null *(new — links artifact to a git commit)*
- status: enum (draft | committed | superseded) *(new — immutability lifecycle)*
- version: integer *(new — monotonically increasing within a step's artifacts of the same role)*
- parent_artifact_id: string | null *(new — points to artifact this was derived from, for edit lineage)*
- created_by: string *(user ID or agent_run_id)*
- created_by_type: enum (human | agent) *(new — for metrics: % agent diffs passing tests)*
- created_at

**Immutability principle:** Artifacts are never modified after creation. An "edit" creates a new Artifact with `parent_artifact_id` pointing to the original and `status = committed`; the original is updated to `status = superseded`. Only `status = committed` Artifacts are visible to downstream steps.

### Decision

- id
- step_id
- actor: string *(user ID)*
- action: enum (approve | reject | request_changes | edit | take_over | rerun) *(clarified enum)*
- comment: string | null
- created_at
- artifact_version_id: string | null *(new — snapshot of the Artifact version this decision was made on)*
- resulting_artifact_id: string | null *(new — for edit/take_over: ID of the new Artifact created as a result)*
- target_step_id: string | null *(new — for request_changes: step to rerun; null = current step)*

**Action semantics:**
- `approve` — step is accepted; workflow advances to next step
- `reject` — step is rejected; workflow run is paused pending human direction
- `request_changes` — workflow rewinds to `target_step_id` (or current step if null); a new AgentRun is triggered with the decision comment injected as additional context
- `edit` — human modifies artifact; a new Artifact is created (parent_artifact_id set); workflow does not advance until a subsequent `approve` decision
- `take_over` — human takes ownership of an agent step; any running AgentRun is cancelled; step status becomes `human_owned`; human works in local IDE (see §22); upon commit detection, a human-authored Artifact is created and step completes
- `rerun` — current step is restarted from scratch; previous AgentRun artifacts are marked `superseded`

### AgentRun

- id
- step_id
- agent_role
- model: string *(e.g. claude-sonnet-4-6, gpt-4o)*
- runner_id: string *(new — which runner executed this)*
- input_summary: string *(truncated prompt preview for UI display; max 500 chars)*
- input_payload_ref: string | null *(new — object storage key for full prompt payload; not stored in DB)*
- output_summary: string *(truncated output preview for UI display; max 500 chars)*
- output_payload_ref: string | null *(new — object storage key for full raw output)*
- changed_files: string[] *(file paths modified)*
- command_logs: string *(sanitized shell output; secrets redacted)*
- status: enum (pending | running | completed | failed | timed_out | cancelled)
- attempt_number: integer *(new — which retry attempt, 1-indexed)*
- checkpoint_data: jsonb | null *(new — agent-defined resume state for mid-run recovery)*
- last_heartbeat_at: timestamp | null *(new — updated every 30s by runner; null = not yet started)*
- timeout_seconds: integer *(new — per agent_role default; coding=1800, test=600, review=900, planner=600)*
- git_branch: string | null *(new — branch agent committed to)*
- head_commit_sha: string | null *(new — HEAD after agent commits)*
- started_at
- completed_at
- cancelled_at: timestamp | null *(new)*
```

- [ ] **Step 2：自查**

- [ ] WorkflowTemplate 实体已添加（前端 Agent 发现缺失）
- [ ] WorkflowStep 含 status 完整枚举（含 human_owned）
- [ ] Artifact 不可变原则已写入（edit = 新建版本，旧版改为 superseded）
- [ ] Artifact.role 枚举已定义，取代无类型的 type 字段
- [ ] Decision.action 语义已逐条定义
- [ ] AgentRun 心跳字段已加（last_heartbeat_at, timeout_seconds）
- [ ] AgentRun 完整 prompt 存对象存储引用，不入 DB（隐私）

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): data model v2 — full entity revision with artifact versioning, state enums, agent heartbeat"
```

---

## Task 6：新增 §23 — WorkflowStep 状态机附录 (C5)

**Files:**
- Modify: `docs/PRD.md`（在 §22 之后追加）

- [ ] **Step 1：追加 §23**

```markdown
## 23. WorkflowStep State Machine (Appendix)

### States

| State | Meaning |
|-------|---------|
| `pending` | Step is defined but prerequisites not yet met |
| `running` | An AgentRun is actively executing (or human step is in progress) |
| `completed` | Step produced all required output artifacts and passed any approval gate |
| `failed` | AgentRun failed or was rejected; retry limit not yet reached |
| `timed_out` | AgentRun did not complete within `timeout_seconds` and was killed by Watchdog |
| `retrying` | Retry is scheduled; waiting for backoff period |
| `cancelled` | Step was explicitly cancelled by a human decision |
| `human_owned` | Human took over an agent step; waiting for human to complete and push |

### State Transitions

```
pending
  → running        [trigger: scheduler finds all depends_on_step_ids completed AND step not locked]

running
  → completed      [trigger: AgentRun status = completed AND approval not required]
                   [trigger: AgentRun status = completed AND approval_required = true → wait for Decision]
  → completed      [trigger: Decision.action = approve]
  → failed         [trigger: AgentRun status = failed]
  → timed_out      [trigger: Watchdog detects last_heartbeat_at > now - 120s]
  → human_owned    [trigger: Decision.action = take_over]
  → cancelled      [trigger: Decision.action = reject AND no retry attempted]

failed / timed_out
  → retrying       [trigger: retry_count < max_retries]
  → cancelled      [trigger: retry_count >= max_retries → human must decide]

retrying
  → running        [trigger: backoff period elapsed; new AgentRun created]

human_owned
  → completed      [trigger: new commit on feature_branch detected after take_over timestamp]

running (with request_changes)
  → running        [trigger: Decision.action = request_changes → target step rewound → new AgentRun]
```

### Watchdog

A scheduled process (cron, every 60 seconds) scans all AgentRuns with `status = running` and `last_heartbeat_at < now - 120s`. For each match:
1. Sets `AgentRun.status = timed_out`
2. Sets parent `WorkflowStep.status = timed_out`
3. Triggers retry logic (if `retry_count < max_retries`) or marks step `cancelled` and notifies workspace members

### Scheduler

A scheduled process (cron, every 5 seconds) scans all WorkflowSteps with `status = pending` where all `depends_on_step_ids` have `status = completed` and the parent WorkflowRun has no other step with `status = running`. For each match:
1. Acquires execution_lock (database row lock)
2. Sets `WorkflowStep.status = running`
3. Creates a new AgentRun with `attempt_number = retry_count + 1`
4. Enqueues the AgentRun for the workspace runner to pick up

### Retry Protocol

When a step transitions to `retrying`:
1. All `draft` Artifacts from the previous AgentRun are marked `status = superseded`
2. Only `committed` Artifacts remain visible to the new AgentRun
3. The new AgentRun receives the previous `checkpoint_data` (if set) to enable mid-run resumption
4. `WorkflowStep.retry_count` is incremented
```

- [ ] **Step 2：自查**

- [ ] 8 个状态全部定义
- [ ] 每个转换都有明确的触发条件
- [ ] Watchdog 扫描频率已定义（60s）
- [ ] Scheduler 扫描频率已定义（5s）
- [ ] Retry protocol 明确了旧制品如何处理（superseded）

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): add §23 workflowstep state machine with watchdog and scheduler specs"
```

---

## Task 7：新增 §24 — 制品规范（Artifact Spec）(C4, T1)

**Files:**
- Modify: `docs/PRD.md`（在 §23 之后追加）

- [ ] **Step 1：追加 §24**

```markdown
## 24. Artifact Specification

### Artifact Roles

Each Artifact has a `role` that defines its type and what downstream agents expect:

| Role | Produced By | Consumed By |
|------|-------------|-------------|
| `PRD` | Human (paste/upload) | Planner Agent |
| `PLAN` | Planner Agent | Task Breakdown Agent, human review |
| `TASK_LIST` | Task Breakdown Agent | Coding Agents, human review |
| `CODE_PATCH` | Coding Agent | Review Agent, human review (diff view) |
| `TEST_REPORT` | Test Agent | Review Agent, human review |
| `REVIEW_COMMENT` | Review Agent | Human final review |
| `PR_SUMMARY` | Summarizer Agent | Human final review, GitHub PR body |
| `HUMAN_EDIT` | Human | Next step (same as the artifact being edited) |

### TestResultArtifact Schema

When the Test Agent produces an Artifact with `role = TEST_REPORT`, the `content` field must be valid JSON conforming to:

```json
{
  "passed": true,
  "summary": {
    "total": 42,
    "passed": 41,
    "failed": 0,
    "skipped": 1
  },
  "coverage_pct": 84.2,
  "lint_errors": 0,
  "type_errors": 0,
  "exit_code": 0,
  "raw_output_ref": "s3://aww-artifacts/runs/{run_id}/test-raw.txt"
}
```

Fields:
- `passed: boolean` — overall pass/fail verdict
- `summary.total/passed/failed/skipped: integer`
- `coverage_pct: number | null` — null if coverage tooling not configured
- `lint_errors: integer` — 0 means clean
- `type_errors: integer` — 0 means clean
- `exit_code: integer` — raw process exit code
- `raw_output_ref: string` — object storage key for full command output (not stored in DB)

### Step Pass Gates

A WorkflowStep may not auto-advance to the next step unless its pass gate conditions are met. Pass gates are checked after an AgentRun completes, before any human approval gate.

| Step | Pass Gate Conditions |
|------|---------------------|
| Generate Engineering Plan | `PLAN` artifact exists AND `content` is non-empty |
| Break Into Tasks | `TASK_LIST` artifact exists AND at least 1 task defined |
| Implement Scoped Tasks | `CODE_PATCH` artifact exists for each assigned task |
| Run Tests | `TEST_REPORT` artifact exists AND `passed = true` AND `lint_errors = 0` |
| Agent Code Review | `REVIEW_COMMENT` artifact exists |
| Generate PR Summary | `PR_SUMMARY` artifact exists |

If a pass gate fails, the step transitions to `failed` and the retry protocol activates.

### Agent Invocation Payload

Each AgentRun is invoked with a structured payload. This payload is logged to object storage (referenced by `AgentRun.input_payload_ref`) for auditability.

```json
{
  "agent_role": "coding",
  "system_prompt": "...",
  "workspace_context": {
    "repo_url": "...",
    "default_branch": "...",
    "feature_branch": "..."
  },
  "step_instructions": "...",
  "input_artifacts": [
    { "role": "PLAN", "content": "...(full)" },
    { "role": "TASK_LIST", "content": "...(full)" }
  ],
  "tools_allowed": ["read_file", "write_file", "run_shell"],
  "token_budget": 100000
}
```

Context inclusion rules (MVP):
- Artifacts with `role = PRD` and `role = PLAN`: always full content
- `TASK_LIST`: full content
- `CODE_PATCH` and `TEST_REPORT`: full content if < 8000 tokens; summarized otherwise
- Source code files: only files listed in the task's owned file scope; truncated to 2000 tokens per file

When total token estimate exceeds 80% of the model's context window, the runner logs a warning and proceeds with the most recent artifacts only. Future: vector retrieval for large context.
```

- [ ] **Step 2：自查**

- [ ] Artifact roles 枚举完整（8 种）
- [ ] TestResultArtifact JSON schema 完整（6 个字段）
- [ ] Step pass gates 矩阵覆盖所有 agent 步骤
- [ ] Agent Invocation Payload 结构已定义
- [ ] 上下文裁剪策略已写明（80% 阈值 + 截断规则）

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): add §24 artifact spec — roles, test schema, pass gates, invocation payload"
```

---

## Task 8：更新 §12 NFR — 实时推送协议 + 移动端策略 (C6, D4)

**Files:**
- Modify: `docs/PRD.md`，§12 Non-Functional Requirements 章节

- [ ] **Step 1：在 §12 现有内容后追加以下内容**

```markdown
### Real-Time Push Protocol

The AWW web client subscribes to server-sent events (SSE) over a persistent HTTP connection to receive real-time updates without polling.

**Protocol:** Server-Sent Events (SSE)
- Single direction (server → client); no bidirectional channel needed for status updates
- Automatic reconnection on disconnect (browser native)
- Compatible with standard HTTP proxies and firewalls

**Minimum event types the server must emit:**

| Event Type | Payload |
|-----------|---------|
| `step.status_changed` | `{ step_id, new_status, timestamp }` |
| `agent_run.started` | `{ agent_run_id, step_id, agent_role }` |
| `agent_run.heartbeat` | `{ agent_run_id, progress_note: string \| null }` |
| `agent_run.completed` | `{ agent_run_id, step_id, head_commit_sha \| null }` |
| `agent_run.failed` | `{ agent_run_id, step_id, error_summary }` |
| `artifact.created` | `{ artifact_id, step_id, role }` |
| `runner.status_changed` | `{ runner_id, new_status: online \| offline }` |

**Client disconnect handling:** When the SSE connection drops, the browser displays a non-intrusive "Reconnecting…" indicator in the top bar. On reconnect, the client fetches the current workspace state via REST to reconcile any missed events, then resumes SSE.

**Agent timeout UX:** If an AgentRun's last heartbeat is >90 seconds ago (client-detected via timestamp on `agent_run.heartbeat` events), the UI transitions the step icon to a `warning` state and shows "Agent may be unresponsive — Rerun or Take Over available."

### Mobile Strategy (MVP)

The primary use case for AWW is desktop (≥1180px): engineering leads doing code review and approval. Mobile is not a primary use case for MVP.

**MVP mobile scope (supported):**
- Receive browser push notification when a workflow step requires human action
- View the approval gate controls (Approve / Request Changes) on a simplified single-panel view (≤480px)
- Submit an approval decision from mobile

**MVP mobile scope (not supported):**
- Full workflow management
- Code diff review
- Artifact editing

The existing `@media (max-width: 900px)` responsive layout serves as a degraded-but-functional fallback. In the simplified mobile view, the Control Plane (approval gate) is rendered first, above the workflow step list.
```

- [ ] **Step 2：自查**

- [ ] SSE 选型理由已说明
- [ ] 7 种最小事件类型已枚举
- [ ] 客户端断连处理已定义
- [ ] Agent 超时 UX 触发条件已量化（90s）
- [ ] 移动端：支持哪些 / 不支持哪些已明确区分

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): expand §12 NFR — SSE real-time protocol and mobile strategy"
```

---

## Task 9：更新 §8 — 补充人工审批门完整 UX 语义 (C3)

**Files:**
- Modify: `docs/PRD.md`，§8 核心概念中 Human Step-In 段落；§9 Step 8 Final Human Review

- [ ] **Step 1：替换 §8 Human Step-In 段落**

将 `### Human Step-In` 段落替换为：

```markdown
### Human Step-In

A controlled intervention point where a person can take one of five actions. Each action has a defined outcome in the workflow:

**Approve**
- Step transitions to `completed`
- Workflow advances to the next step
- Decision recorded in audit log

**Reject**
- Step transitions to `cancelled`
- WorkflowRun pauses; no retry is attempted
- Human must manually re-trigger or abandon the run
- Use when the step output is fundamentally wrong and not salvageable

**Request Changes**
1. A Finding Selector panel opens listing all Review Agent findings (if any) plus a free-text "Additional Instructions" field
2. Human selects which findings to address and optionally adds instructions
3. On submit: each selected finding becomes a fix task linked to the next AgentRun's context; the unselected free-text instructions are injected as a system prompt addendum
4. Step transitions back to `running`; a new AgentRun is created with `Decision.comment` + selected findings as additional context injected into the Agent Invocation Payload
5. `Decision.target_step_id` defaults to the current step (re-run same agent); human may select an earlier step to rewind further
6. The original AgentRun's artifacts are marked `superseded`; only the new run's artifacts are visible to downstream steps

**Edit Output**
1. A split-pane editor opens: left pane shows the current Artifact content (read-only), right pane is editable
2. Human edits the right pane; a live diff is shown between panes
3. On save: a new Artifact is created with `role = HUMAN_EDIT`, `parent_artifact_id` pointing to the original, `created_by_type = human`, `status = committed`; the original Artifact is marked `superseded`
4. The step does **not** auto-advance; human must explicitly click **Approve** to push the edited artifact to the next step
5. The edit is recorded as `Decision.action = edit` with `resulting_artifact_id = new artifact ID`

**Take Over**
1. Any running AgentRun for this step is immediately cancelled
2. Step transitions to `human_owned`
3. AWW displays a "Local Work Instructions" panel:
   - Current feature branch name (copy button)
   - Step objective and owned file scope
   - Command: `git checkout {feature_branch} && git pull`
4. Human works in their local IDE on the feature branch
5. AWW detects completion when new commits appear on the feature branch after the take-over timestamp (via GitHub Webhook or 60-second polling; see §22)
6. Upon detection: AWW creates a `CODE_PATCH` Artifact from the commit diff with `created_by_type = human`, marks step `completed`, and advances the workflow
7. Human may also click "Mark as Done" in AWW UI to trigger detection immediately

**Rerun Step**
- Cancels current AgentRun (if running)
- Creates a new AgentRun with the same inputs (no changes to instructions)
- `retry_count` is not incremented (this is a human-initiated rerun, distinct from automatic retry)
- Previous artifacts are marked `superseded`
```

- [ ] **Step 2：自查**

- [ ] 5 个审批操作都有完整的操作流程（触发 → 执行 → 状态变化 → 审计记录）
- [ ] Request Changes：Finding Selector 已描述，target_step_id 语义已定义
- [ ] Edit Output：分屏编辑器已描述，不自动推进（需再点 Approve）已明确
- [ ] Take Over：本地工作指引已描述，完成检测机制（webhook + polling）已定义

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): expand §8 human step-in — complete UX flow for all 5 approval actions"
```

---

## Task 10：更新 §13 — 新增核心 Task Flow + FTUE (C2, D2, D3)

**Files:**
- Modify: `docs/PRD.md`，§13 UX Requirements（在现有内容后追加）

- [ ] **Step 1：在 §13 Human Approval UI 之后追加以下内容**

```markdown
### Primary Mental Model

The user's core question when opening AWW is: **"What do I need to do right now?"**

AWW is a **human decision router**, not a workflow visualizer. The UI prioritizes:
1. Current blocking action (approval gate or awaiting human input) — highest visual weight
2. Context needed to make the decision (diff, test results, artifacts)
3. Historical record and audit trail — accessible but not prominent

Implication: The Control Plane (approval gate buttons) must be the most visually prominent element when a human action is required, regardless of screen layout.

### Core Task Flows

#### Task Flow A: Engineering Lead Starts First Workflow

1. Opens AWW → **Empty state view** with centered "Create Workspace" CTA and a short illustration of what a completed workflow looks like
2. Clicks "Create Workspace" → **3-step wizard modal:**
   - **Step 1:** Project name + select workflow template (MVP: one option — "PRD to PR")
   - **Step 2:** Connect repository — "Connect GitHub" button (OAuth flow) or paste repo URL for local runner
   - **Step 3:** Add PRD — three tabs: Write (textarea), Paste (textarea with clear button), Upload (.md/.txt)
3. Wizard completes → workspace view opens with Step 1 (Create Workspace) marked `completed`
4. System immediately marks Step 2 (Add PRD) as `running` (human step); PRD content already provided in wizard
5. User clicks "Confirm PRD Ready" → Step 2 completes; Planner Agent is triggered (Step 3 transitions to `running`)
6. Planner Agent runs (animated step icon, heartbeat log visible in step detail); takes ~30–90 seconds
7. Notification and step status update when plan is ready; user returns to approve or request changes

#### Task Flow B: Request Changes → Agent Rerun → Re-review

1. Human final review step is active; user reads diff + test results + review findings
2. User clicks "Request Changes" → **Finding Selector panel** slides in from right:
   - Lists all Review Agent findings with severity badges (High / Medium / Low)
   - Checkboxes to select which findings to address
   - "Additional Instructions" textarea at the bottom
3. User selects 2 findings + adds "Also refactor the utils module for clarity"
4. Clicks "Submit Changes" → panel closes; step status updates to "Changes Requested"
5. System creates fix tasks from selected findings + injects additional instructions into next AgentRun context
6. Coding Agent and Test Agent re-run automatically (workflow rewinds to Step 5)
7. User receives notification: "Agent completed fix pass — your review is needed again"
8. User returns to Step 7 with fresh diff and updated test results

#### Task Flow C: Take Over → Local IDE → Re-enter Workflow

1. Coding Agent step has been retrying for 20 minutes without a satisfactory result
2. User clicks "Take Over" → step transitions to `human_owned`
3. **Local Work Instructions panel** appears:
   ```
   Branch: aww/shopflow-web/a1b2c3
   Task: Implement checkout cart persistence
   Files in scope: src/cart/*, src/api/cart.ts

   Commands:
   git checkout aww/shopflow-web/a1b2c3 && git pull
   ```
4. User copies branch name, switches to local IDE (VS Code, Cursor, etc.)
5. User implements the feature, commits, and pushes to the branch
6. AWW detects the push via GitHub Webhook (or within 60 seconds via polling)
7. AWW creates a `CODE_PATCH` Artifact from the commit diff; step transitions to `completed`
8. Workflow automatically advances to Step 6 (Run Tests); Test Agent executes against the human-authored code

### First-Time User Experience (FTUE)

#### Empty State

When a user has no workspaces, the main content area shows:
- Centered illustration of a completed AWW workflow (static image)
- Headline: "Ship features with confidence"
- Subheadline: "Define the workflow once. Agents implement. You review and approve."
- Primary CTA button: "Create Your First Workspace"

#### New Workspace Wizard

The 3-step wizard is a modal with a progress indicator. Each step has a single primary action:
- Step 1 "Project" → "Next"
- Step 2 "Repository" → "Connect GitHub" (triggers OAuth) or "Use Local Runner" (shows runner setup command)
- Step 3 "PRD" → "Create Workspace"

The wizard validates before advancing: Step 1 requires a non-empty name; Step 2 requires a successful connection test; Step 3 requires non-empty PRD content.

#### Agent Running State

When an Agent step is running, the step row in the workflow list shows:
- An animated pulsing icon (teal color)
- Real-time heartbeat log: last 3 lines of runner output, updated via SSE

Users may close the browser tab; the workflow continues running. Users receive a browser notification (if granted) and an in-app notification badge when the step completes and requires their attention.

### Error States

Every agent step has defined error state representations:

| Error | Step Icon Color | Control Plane Shows |
|-------|----------------|---------------------|
| Agent failed (< max_retries) | Amber (warning) | "Retrying in Xs…" + "Rerun Now" + "Take Over" |
| Agent failed (max_retries reached) | Red | "Agent could not complete" + "Take Over" + "Cancel" |
| Agent timed out | Red | "Agent is unresponsive" + "Rerun" + "Take Over" |
| Tests failed (pass gate blocked) | Red | Test report + "Request Changes" + "Take Over" |
| Runner offline | Gray (all agent steps) | "Runner offline — start your runner to continue" |
```

- [ ] **Step 2：自查**

- [ ] 心智模型声明已写入（人工决策路由器）
- [ ] 3 个 Task Flow 都有完整的步骤编号（不是数据流，是操作流）
- [ ] 空状态视图已描述（CTA + 插图）
- [ ] 3 步向导的每步验证条件已定义
- [ ] Agent 运行中状态的 UI 反馈已定义（pulsing icon + heartbeat log）
- [ ] 错误状态矩阵：5 种错误场景、图标颜色、控制面板操作已定义

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): expand §13 — mental model, core task flows A/B/C, FTUE, error states"
```

---

## Task 11：更新 §15 — GitHub 集成分级 + Agent 上下文传递 (I1, I2)

**Files:**
- Modify: `docs/PRD.md`，§15 Integrations 章节

- [ ] **Step 1：替换 §15 MVP 集成列表**

将 `### MVP` 下的内容替换为：

```markdown
### GitHub Integration Levels

AWW defines three integration levels with GitHub. MVP targets Level 2.

**Level 1 — Git Protocol Only**
- Clone, fetch, push via git
- Authentication: Personal Access Token or Deploy Key stored in runner local config
- No GitHub API calls
- Supports any git host (GitHub, GitLab, Bitbucket, self-hosted)

**Level 2 — GitHub REST API (MVP)**
- Everything in Level 1, plus:
- Read repository metadata: branch list, default branch, collaborators
- Create pull requests via `POST /repos/{owner}/{repo}/pulls`
- Write PR body from `PR_SUMMARY` artifact content
- Required OAuth scope: `repo` (read + write to private repositories)
- AWW registers as a GitHub OAuth App; users authorize via browser OAuth flow

**Level 3 — GitHub App (Post-MVP)**
- Fine-grained per-repository permissions
- Organization-level installation
- Webhook events for push, PR, and review events
- No Level 3 in MVP

### MVP Integrations (Level 2 GitHub + Runner)

- GitHub repository (Level 2)
- AWW Local Runner (see §20) — handles local git workspace and shell command execution
- OpenAI API (model: gpt-4o or configurable)
- Anthropic API (model: claude-sonnet-4-6 or configurable)
- Model configuration: workspace-level (one provider + model for all agent roles in MVP)
- Object storage for full prompt/output payloads and raw test logs (S3-compatible; self-hosted MinIO or AWS S3)
```

- [ ] **Step 2：自查**

- [ ] Level 1/2/3 三级已定义，MVP = Level 2 已明确
- [ ] OAuth scope 已列出（`repo`）
- [ ] 模型配置粒度已明确（workspace 级，非 step 级）
- [ ] 对象存储说明已加入（prompt payload + test logs 落地）

- [ ] **Step 3：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): expand §15 — GitHub integration levels 1/2/3, model config, object storage"
```

---

## Task 12：更新 §11 — 补充功能需求（可编程审批 API + 测试可测性）(T2)

**Files:**
- Modify: `docs/PRD.md`，§11 Functional Requirements → Human Review 子章节

- [ ] **Step 1：在 §11 Human Review 列表末尾追加**

```markdown
- Expose a programmatic approval API endpoint (`POST /api/v1/steps/{step_id}/decision`) accepting `{ action, comment, target_step_id }` to enable automated testing and CI integration.
- Support a test mode flag (`X-AWW-Test-Mode: true` header) that bypasses human gating for specified steps, enabling end-to-end automated test runs without manual approval.
```

- [ ] **Step 2：在 §11 Agent Execution 列表末尾追加**

```markdown
- Validate that each AgentRun's output Artifact conforms to its role's schema before marking the step as eligible for the pass gate check (see §24).
- Emit all defined SSE events (see §12) when step and agent run statuses change.
```

- [ ] **Step 3：自查**

- [ ] 可编程审批 API 端点已定义（路径 + 请求体结构）
- [ ] Test mode 标志已定义（允许 CI 跳过人工审批）
- [ ] Artifact schema 验证已列入功能需求

- [ ] **Step 4：提交**

```bash
git add docs/PRD.md
git commit -m "docs(prd): expand §11 functional requirements — programmatic approval API, test mode, artifact validation"
```

---

## 自查清单（Self-Review vs 审查报告）

在所有任务完成后，逐项确认跨角色共识问题是否已在 PRD 中解决：

| 问题 | 章节 | 已解决？ |
|------|------|---------|
| C1 Agent 执行环境 | §20 | ☐ |
| C2 Take Over 闭环 | §13 Task Flow C + §8 Take Over + §22 | ☐ |
| C3 审批门语义 | §8 全部 5 个操作 | ☐ |
| C4 Artifact 版本化 | §14 + §24 | ☐ |
| C5 WorkflowStep 状态机 | §23 | ☐ |
| C6 实时推送机制 | §12 | ☐ |
| C7 安全与凭证 | §21 | ☐ |
| C8 Git 分支策略 | §22 | ☐ |
| T1 TestResultArtifact schema | §24 | ☐ |
| D2 Task Flow（用户操作路径） | §13 | ☐ |
| D3 FTUE + 空状态 | §13 | ☐ |
| F1 错误态 UI | §13 Error States | ☐ |
| T2 可编程审批 API | §11 | ☐ |
| I1 GitHub 集成粒度 | §15 | ☐ |
| I2 Agent 上下文传递 | §24 Agent Invocation Payload | ☐ |

---

## 最终提交

- [ ] **全部 12 个任务完成后，推送到远端**（如已初始化 git remote）

```bash
git log --oneline docs/PRD.md
```

预期：12 条提交，每个任务对应一条，message 格式统一。
