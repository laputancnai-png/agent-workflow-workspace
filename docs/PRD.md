# PRD: Agent Workflow Workspace for Software Teams
**Version:** 2.0 · **Updated:** 2026-04-21 · **Status:** Draft for Engineering Review
**Changelog v2:** Added execution environment ADR (§20), security model (§21), git strategy (§22), data model v2 (§14), state machine appendix (§23), artifact spec (§24), real-time protocol (§12), human approval UX flows (§8/§13), FTUE (§13), GitHub integration levels (§15).

## 1. Product Summary

Agent Workflow Workspace is a human-in-the-loop workflow system for software engineering teams. It lets a team define a repeatable software delivery workflow up front, assign individual steps to humans or specialized AI agents, and keep all artifacts, decisions, code changes, reviews, and approvals inside one shared workspace.

The initial product focuses on the flow from PRD to implementation:

1. Product owner writes or imports a PRD.
2. AI planner turns the PRD into an engineering plan.
3. Human lead reviews and approves the plan.
4. One or more coding agents implement scoped tasks in the same repo workspace.
5. Test agent runs checks and reports failures.
6. Review agent performs a code review.
7. Human reviewer approves, edits, redirects, or takes over.
8. The system produces a final audit trail and PR summary.

The product is not a generic automation canvas. It is a controlled software delivery runtime where AI can act, but humans can define boundaries, inspect work, and step in at critical points.

## 2. Problem

Software teams are experimenting with coding agents, but current workflows are often ad hoc:

- Requirements live in one tool, plans in another, code changes in a terminal, reviews in GitHub, and agent context in chat transcripts.
- Agents can produce useful work, but teams struggle to trust what happened, why it happened, and whether the work meets the original requirements.
- Human review is usually bolted on after agent output instead of being designed into the workflow.
- Multi-agent work is difficult to coordinate because agents share context poorly and can overwrite or duplicate each other's work.
- Engineering leaders need repeatability, auditability, and control before allowing agents to handle larger tasks.

The gap is not just model capability. The gap is the harness around the agents: workflow definition, workspace state, permissions, checkpoints, review, and recovery.

## 3. Target Users

### Primary User

Engineering leads at small to mid-sized software teams who want to delegate implementation work to AI agents while keeping control over planning, architecture, and final approval.

### Secondary Users

- Product managers who want PRDs to become scoped engineering tasks faster.
- Senior engineers who review AI-generated plans and code.
- Startup founders who need a repeatable AI-assisted product development workflow.
- Platform teams evaluating agentic engineering systems for internal use.

## 4. User Personas

### Engineering Lead

Wants to turn a PRD into a safe, reviewable implementation workflow. Cares about architecture, task breakdown, code quality, and avoiding uncontrolled agent changes.

### Product Manager

Wants visibility into how the PRD maps to implementation tasks and acceptance criteria. Cares about progress, scope changes, and whether the delivered feature matches the original intent.

### AI Coding Agent Operator

Wants to run agents in bounded steps with clear inputs and expected outputs. Cares about context quality, workspace state, retry behavior, and debug traces.

## 5. Product Goals

- Make human approval and intervention a first-class part of AI software workflows.
- Let teams define reusable software delivery workflows before execution begins.
- Allow multiple specialized agents to work in one shared workspace without losing context.
- Preserve a complete audit trail from PRD to final pull request.
- Reduce the time from PRD approval to reviewable implementation.

## 6. Non-Goals for MVP

- General-purpose no-code automation across every business function.
- Fully autonomous software development with no human checkpoints.
- Replacing GitHub, Linear, Jira, or Slack.
- Building a new IDE from scratch.
- Supporting every programming language and build system on day one.

## 7. MVP Scope

The MVP should support one end-to-end workflow:

PRD -> Plan -> Human Approval -> Task Breakdown -> Agent Implementation -> Test -> Agent Review -> Human Final Review -> Pull Request Summary

### Included

- Project workspace
- PRD document input
- Workflow template for software feature delivery
- Step ownership: human, agent, or human approval
- Agent role assignment
- Shared artifacts per step
- Human approval gates
- Git repository workspace
- Execution log
- Basic retry and rerun from checkpoint
- Final PR summary

### Excluded

- Marketplace of agents
- Custom visual workflow builder
- Enterprise RBAC
- Advanced compliance reporting
- Full CI/CD orchestration
- Long-running autonomous background agents

## 8. Core Concepts

### Workspace

A persistent project area that contains:

- PRD
- engineering plan
- tasks
- agent outputs
- code diffs
- test results
- review comments
- human decisions
- execution logs

### Workflow

A predefined sequence of steps. Each step has:

- owner type: human, agent, or approval gate
- input artifacts
- output artifacts
- acceptance criteria
- allowed tools
- retry policy
- required approval status

### Agent Role

A specialized AI worker assigned to a step. MVP roles:

- Planner Agent
- Task Breakdown Agent
- Coding Agent
- Test Agent
- Review Agent
- Summarizer Agent

### Human Step-In

A controlled intervention point where a person can:

- approve
- reject
- edit
- request changes
- redirect the agent
- take over the step manually

### Artifact

A durable output from a workflow step, such as:

- plan
- task list
- code diff
- test log
- review finding
- approval decision
- PR description

## 9. MVP Workflow

### Step 1: Create Project Workspace

User creates a new workspace and connects or initializes a Git repository.

Required fields:

- project name
- repo source
- default branch
- workflow template

Output:

- workspace created
- repository available to agents
- workflow initialized

### Step 2: Add PRD

User writes, uploads, or pastes a PRD.

Output:

- PRD artifact
- extracted feature goals
- extracted acceptance criteria
- open questions

Human step-in:

- user confirms PRD is ready for planning

### Step 3: Generate Engineering Plan

Planner Agent reads the PRD and repository context, then creates an engineering plan.

Plan includes:

- implementation approach
- files/modules likely affected
- risks
- dependencies
- test strategy
- unresolved questions

Human step-in:

- engineering lead approves, edits, or rejects the plan

### Step 4: Break Plan Into Tasks

Task Breakdown Agent converts the approved plan into scoped implementation tasks.

Each task includes:

- objective
- owned files or modules
- inputs
- expected output
- acceptance criteria
- assigned agent

Human step-in:

- lead can split, merge, reorder, or manually assign tasks

### Step 5: Agent Implementation

Coding Agent executes one task at a time inside the shared repo workspace.

Rules:

- agent only works within assigned task scope
- agent must not modify unrelated files without escalation
- agent records changed files
- agent links code changes back to task acceptance criteria

Output:

- code diff
- implementation notes
- changed file list

Human step-in:

- optional mid-task pause if agent detects ambiguity, risky migration, destructive operation, or broad refactor

### Step 6: Test and Verify

Test Agent runs configured checks.

Examples:

- unit tests
- typecheck
- lint
- build
- targeted smoke tests

Output:

- test result artifact
- failure summary
- suggested fix path

Human step-in:

- if tests fail repeatedly, human can redirect, approve partial completion, or take over

### Step 7: Agent Code Review

Review Agent examines the final diff against the PRD, engineering plan, and acceptance criteria.

Review focuses on:

- correctness
- regressions
- missing tests
- scope creep
- security risks
- maintainability

Output:

- review findings
- severity
- file references
- recommended changes

Human step-in:

- user chooses which findings become fix tasks

### Step 8: Final Human Review

Human reviewer sees:

- PRD
- approved plan
- completed tasks
- code diff
- test results
- agent review
- unresolved risks

Actions:

- approve
- request changes
- create follow-up tasks
- take over manually

### Step 9: Generate PR Summary

Summarizer Agent creates a pull request summary.

Includes:

- what changed
- why it changed
- how it was tested
- known risks
- links to workflow artifacts

## 10. Key User Stories

1. As an engineering lead, I want to approve the AI-generated engineering plan before any code changes happen, so that agent work follows the intended architecture.

2. As a product manager, I want to see how PRD requirements map to implementation tasks, so that I can verify scope coverage.

3. As a senior engineer, I want each agent step to show its inputs, outputs, and changed files, so that I can review work efficiently.

4. As a team, we want agents to work in the same repo workspace without overwriting each other, so that multi-agent implementation is coordinated.

5. As a reviewer, I want to replay the workflow history from PRD to PR, so that I can understand how the final code was produced.

## 11. Functional Requirements

### Workspace Management

- Create workspace.
- Connect Git repository.
- Display workflow state.
- Store artifacts by step.
- Show current owner and next required action.

### Workflow Definition

- Provide a default PRD-to-PR workflow template.
- Define step owner type.
- Define required inputs and outputs.
- Define approval gates.
- Allow rerun from checkpoint.

### Agent Execution

- Assign an agent role to a step.
- Provide the agent with scoped context.
- Capture agent output as artifacts.
- Capture changed files and command results.
- Prevent parallel agents from writing to the same owned files in MVP.

### Human Review

- Approve, reject, edit, or request changes.
- Add comments to any artifact.
- Convert review feedback into follow-up tasks.
- Take over a step manually.

### Audit Trail

- Log every workflow transition.
- Log every approval decision.
- Record agent inputs and outputs.
- Record changed files.
- Record test commands and results.

## 12. Non-Functional Requirements

- Workflow state must be durable.
- Agent actions must be inspectable.
- Human approvals must be explicit.
- The system should recover from failed agent runs without losing workspace state.
- The MVP should support local or GitHub-based repositories.
- Sensitive repo data should not be exposed outside configured model/tool boundaries.

## 13. UX Requirements

### Main Workspace View

The first screen should show the active workflow, not a marketing dashboard.

Required sections:

- workflow timeline
- current blocking step
- artifacts
- repo diff
- comments and decisions
- next action

### Step Detail View

Each step should show:

- owner
- status
- inputs
- outputs
- logs
- related files
- approval controls

### Human Approval UI

Approval controls:

- Approve
- Request Changes
- Edit Output
- Take Over
- Rerun Step

## 14. Data Model Draft

### Workspace

- id
- name
- repo_url
- default_branch
- created_by
- created_at
- status

### WorkflowRun

- id
- workspace_id
- template_id
- current_step_id
- status
- started_at
- completed_at

### WorkflowStep

- id
- workflow_run_id
- name
- owner_type
- agent_role
- status
- input_artifact_ids
- output_artifact_ids
- approval_required
- retry_count

### Artifact

- id
- workspace_id
- step_id
- type
- title
- content
- file_refs
- created_by
- created_at

### Decision

- id
- step_id
- actor
- action
- comment
- created_at

### AgentRun

- id
- step_id
- agent_role
- model
- input_summary
- output_summary
- changed_files
- command_logs
- status
- started_at
- completed_at

## 15. Integrations

### MVP

- GitHub repository
- Local git workspace
- OpenAI or Anthropic model provider
- Basic shell command execution for tests

### Later

- Linear
- Jira
- Slack
- GitHub pull requests
- CI providers
- SSO
- Secrets manager

## 16. Success Metrics

### Activation

- User creates workspace.
- User imports or writes PRD.
- User completes first approved plan.

### Workflow Completion

- Percentage of workflows reaching final human review.
- Percentage of workflows resulting in a PR-ready diff.

### Quality

- Percentage of agent-created diffs passing tests.
- Number of human-requested changes per workflow.
- Number of unresolved review findings at final approval.

### Efficiency

- Time from PRD to approved engineering plan.
- Time from approved plan to reviewable diff.
- Human minutes spent per completed workflow.

### Trust

- Percentage of steps with explicit human approval.
- Percentage of agent actions with complete audit logs.
- Frequency of human takeover.

## 17. Risks

- The product may be perceived as another generic workflow builder.
- Multi-agent execution can create merge conflicts or inconsistent assumptions.
- Users may not trust agent-generated plans without strong review UX.
- Too much process can make the tool feel slower than using a coding agent directly.
- Integrating safely with arbitrary repositories is complex.

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

## 19. MVP Milestone Plan

### Milestone 1: Static Workflow Prototype

- Create workspace.
- Paste PRD.
- Generate plan.
- Human approve/reject.
- Store artifacts.

### Milestone 2: Repo-Aware Agent Execution

- Connect repo.
- Generate task list.
- Run one coding agent step.
- Capture diff and changed files.

### Milestone 3: Verification and Review

- Run tests.
- Generate review findings.
- Create fix tasks from findings.
- Produce final PR summary.

### Milestone 4: Team Workflow

- Add comments.
- Add assignees.
- Add approval history.
- Export PR summary to GitHub.

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
- Schedules AgentRun jobs (polling-based in MVP)
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
[Browser] <—REST API—> [AWW Cloud]
                             ↕ (job queue + artifact upload)
                       [AWW Runner] (local machine)
                             ↕ (git clone/push, file R/W)
                       [Git Repo] (local or remote)
                             ↕ (direct LLM API calls)
                       [LLM Provider] (OpenAI / Anthropic)
```

Raw code files flow: local repo → runner memory → LLM prompt → never persisted on AWW Cloud.

### MVP Constraints

- Runner must be online for any agent step to execute; human steps do not require runner.
- Runner must have `git` installed and credentials to clone and push to the configured repository.
- Runner must have outbound network access to the LLM provider endpoint and AWW Cloud API.
- One runner handles one AgentRun at a time in MVP (no intra-runner parallelism).

---

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

GitHub OAuth uses the server-side authorization code flow. The resulting access token is encrypted with AES-256-GCM and stored in the AWW Cloud database. It is used server-side exclusively for reading repository metadata and creating pull requests. The token is never sent to the browser or to the runner in plaintext.

### Code File Privacy

AWW Cloud stores only structured artifact content (plan text, task descriptions, review summaries, PR descriptions), changed file paths, git commit SHAs, and code diff text (when the Review Agent produces a diff artifact). AWW Cloud does not store raw source code files, full repository contents, or LLM prompt payloads.

### Command Log Sanitization

Before uploading `command_logs` from a runner to AWW Cloud, the runner redacts strings matching known secret patterns (API key formats, token formats defined in a configurable redaction list). Redacted values are replaced with `[REDACTED]`.

### Agent Execution Isolation

**MVP:** Each AgentRun is a subprocess of the runner process, inheriting the runner's filesystem permissions. Users are responsible for scoping the runner's environment to the repository only.

**Post-MVP target:** Docker container isolation per AgentRun with network policy restricting outbound to `git remote` and `AWW Cloud API` only.

---

## 22. Git Workspace Strategy

### Branch Model

Each WorkflowRun creates and owns exactly one feature branch.

**Naming:** `aww/{workspace-slug}/{run-id-short}`
Example: `aww/shopflow-web/a1b2c3`

### Branch Lifecycle

1. **WorkflowRun created** → Runner creates feature branch from `Workspace.default_branch` HEAD. Records `WorkflowRun.base_commit_sha`.
2. **Coding Agent steps** → Each AgentRun commits to the feature branch sequentially (MVP: no parallel coding agents within one run).
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

This makes AWW-generated commits identifiable in `git log`.

### Multi-Agent Serialization

In MVP, at most one Coding Agent step runs at a time per WorkflowRun. The AWW scheduler enforces this by only marking a step `running` when no other step in the same WorkflowRun has `status = running`.

### Take Over Commit Detection

When a human takes over a step, AWW detects completion by:
1. Polling the feature branch HEAD every 60 seconds for new commits authored after the Take Over was triggered, OR
2. Receiving a GitHub Webhook push event for the feature branch (preferred; requires Webhook setup in Workspace Settings).

When new commits are detected, AWW marks the Take Over step as `completed` and creates a human-authored Artifact from the commit diff.

---

## 23. WorkflowStep State Machine

### States

| State | Meaning |
|-------|---------|
| `pending` | Step is defined but prerequisites not yet met |
| `running` | An AgentRun is actively executing (or human step is in progress) |
| `completed` | Step produced all required output artifacts and passed any approval gate |
| `failed` | AgentRun failed; retry limit not yet reached |
| `timed_out` | AgentRun did not complete within `timeout_seconds` and was killed by Watchdog |
| `retrying` | Retry is scheduled; waiting for backoff period |
| `cancelled` | Step was explicitly cancelled by a human decision |
| `human_owned` | Human took over an agent step; waiting for human to complete and push |

### State Transitions

```
pending
  → running       [scheduler: all depends_on_step_ids completed AND no other step in run is running]

running
  → completed     [AgentRun status=completed AND approval not required]
  → completed     [AgentRun status=completed AND approval_required AND Decision.action=approve]
  → failed        [AgentRun status=failed]
  → timed_out     [Watchdog: last_heartbeat_at > now - 120s]
  → human_owned   [Decision.action=take_over]
  → cancelled     [Decision.action=reject]
  → running       [Decision.action=request_changes → target step rewound → new AgentRun]

failed / timed_out
  → retrying      [retry_count < max_retries]
  → cancelled     [retry_count >= max_retries → human must intervene]

retrying
  → running       [backoff period elapsed; new AgentRun created]

human_owned
  → completed     [new commit on feature_branch detected after take_over timestamp]
```

### Watchdog

Runs every 60 seconds. For each AgentRun with `status = running` and `last_heartbeat_at < now - 120s`:
1. Sets `AgentRun.status = timed_out`
2. Sets parent `WorkflowStep.status = timed_out`
3. Triggers retry if `retry_count < max_retries`, otherwise marks `cancelled` and notifies workspace members

### Scheduler

Runs every 5 seconds. For each WorkflowStep with `status = pending` where all `depends_on_step_ids` have `status = completed` and the parent WorkflowRun has no other step with `status = running`:
1. Acquires execution_lock (database row lock)
2. Sets `WorkflowStep.status = running`
3. Creates a new AgentRun with `attempt_number = retry_count + 1`
4. Enqueues the AgentRun for the workspace runner

### Retry Protocol

When a step transitions to `retrying`:
1. All `draft` Artifacts from the previous AgentRun are marked `status = superseded`
2. Only `committed` Artifacts remain visible to the new AgentRun
3. The new AgentRun receives the previous `checkpoint_data` (if set) to enable mid-run resumption
4. `WorkflowStep.retry_count` is incremented

---

## 24. Artifact Specification

### Artifact Roles

| Role | Produced By | Consumed By |
|------|-------------|-------------|
| `PRD` | Human (paste/upload) | Planner Agent |
| `PLAN` | Planner Agent | Task Breakdown Agent, human review |
| `TASK_LIST` | Task Breakdown Agent | Coding Agents, human review |
| `CODE_PATCH` | Coding Agent | Review Agent, human review (diff view) |
| `TEST_REPORT` | Test Agent | Review Agent, human review |
| `REVIEW_COMMENT` | Review Agent | Human final review |
| `PR_SUMMARY` | Summarizer Agent | Human final review, GitHub PR body |
| `HUMAN_EDIT` | Human | Next step (same role as the edited artifact) |

### TestResultArtifact Schema

When the Test Agent produces an Artifact with `role = TEST_REPORT`, the `content` field must be valid JSON:

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

- `passed: boolean` — overall pass/fail verdict
- `coverage_pct: number | null` — null if coverage tooling not configured
- `raw_output_ref: string` — object storage key for full command output (not stored in DB)

### Step Pass Gates

A WorkflowStep may not auto-advance unless its pass gate conditions are met (checked after AgentRun completes, before any human approval gate):

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

Each AgentRun is invoked with a structured payload logged to object storage (referenced by `AgentRun.input_payload_ref`):

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
- `PRD`, `PLAN`, `TASK_LIST`: always full content
- `CODE_PATCH`, `TEST_REPORT`: full content if < 8000 tokens; summarized otherwise
- Source code files: only files in the task's owned scope; truncated to 2000 tokens per file
- When total token estimate exceeds 80% of the model's context window, the runner logs a warning and uses the most recent artifacts only

---

## 25. Positioning

Short positioning:

Agent Workflow Workspace is a controlled software delivery workspace where humans and AI agents collaborate through predefined, auditable workflows.

Long positioning:

Instead of asking a single agent to take a vague feature request and hope for the best, teams define the workflow first. Each step has an owner, expected output, approval rule, and workspace context. AI agents can plan, code, test, and review, but humans stay in control of architecture, scope, and final acceptance.

