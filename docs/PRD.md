# PRD: Agent Workflow Workspace for Software Teams
**Version:** 2.0 · **Updated:** 2026-04-21 · **Status:** Draft for Engineering Review
**Changelog v2:** Added execution environment ADR (§20), security model (§21), git strategy (§22), data model v2 (§14), state machine appendix (§23), artifact spec (§24), real-time protocol (§12), human approval UX flows (§8/§13), FTUE (§13), GitHub integration levels (§15).

## 1. Product Summary

Agent Workflow Workspace is a human-in-the-loop workflow system for software engineering teams. It lets a team define a repeatable software delivery workflow up front, assign individual steps to humans or specialized AI agents, and keep all artifacts, decisions, code changes, reviews, and approvals inside one shared workspace.

The initial product focuses on the flow from PRD to implementation:

1. Product owner writes or imports a PRD.
2. AI planner turns the PRD into an engineering plan.
3. Human lead reviews and approves the plan.
4. One or more coding agents implement scoped tasks serially on the workflow feature branch through the Local Runner.
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
- Local Runner-backed Git repository workspace
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

A controlled intervention point where a person can take one of five actions. Each action has a defined outcome:

**Approve**
- Step transitions to `completed`; workflow advances to the next step
- Decision recorded in audit log

**Reject**
- Step transitions to `cancelled`; WorkflowRun pauses with no automatic retry
- Use when the step output is fundamentally wrong and not salvageable

**Request Changes**
1. A Finding Selector panel opens listing all Review Agent findings (if any) plus a free-text "Additional Instructions" field
2. Human selects which findings to address and optionally adds instructions
3. On submit: the decision comment + selected findings are injected as additional context into the next AgentRun's Agent Invocation Payload; step transitions back to `running`
4. `Decision.target_step_id` defaults to the current step (re-run same agent); human may select an earlier step to rewind further
5. The previous AgentRun's artifacts are marked `superseded`

**Edit Output**
1. A split-pane editor opens: left pane shows the current Artifact content (read-only), right pane is editable; live diff is shown between panes
2. On save: a new Artifact is created with `role = HUMAN_EDIT`, `parent_artifact_id` pointing to the original, `created_by_type = human`, `status = committed`; the original Artifact is marked `superseded`
3. Step does **not** auto-advance; human must explicitly click **Approve** to push the edited artifact to the next step
4. The edit is recorded as `Decision.action = edit` with `resulting_artifact_id = new artifact ID`

**Take Over**
1. Any running AgentRun for this step is immediately cancelled; step transitions to `human_owned`
2. AWW displays a "Local Work Instructions" panel with: current feature branch name (copy button), step objective and owned file scope, and the git checkout command
3. Human works in their local IDE on the feature branch
4. AWW detects completion when new commits appear on the feature branch after the take-over timestamp (via GitHub Webhook or 60-second polling; see §22)
5. Upon detection: AWW creates a `CODE_PATCH` Artifact with `created_by_type = human`, marks step `completed`, advances the workflow
6. Human may also click "Mark as Done" in AWW UI to trigger detection immediately

**Rerun Step**
- Cancels current AgentRun (if running); creates a new AgentRun with the same inputs
- `retry_count` is not incremented (human-initiated rerun, distinct from automatic retry)
- Previous artifacts are marked `superseded`

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

4. As a team, we want agents to commit serially to the same workflow feature branch without overwriting each other, so that multi-agent implementation is coordinated.

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
- Expose a programmatic approval API endpoint (`POST /api/v1/steps/{step_id}/decision`) accepting `{ action, comment, target_step_id }` to enable automated testing and CI integration.
- Support a test mode flag (`X-AWW-Test-Mode: true` request header) that bypasses human gating for specified steps, enabling end-to-end automated test runs without manual approval.

### Agent Execution (additions)

- Validate that each AgentRun's output Artifact conforms to its role's schema before marking the step as eligible for the pass gate check (see §24).
- Emit all defined SSE events (see §12) when step and agent run statuses change.
- Record `AgentRun.input_payload_ref` and `AgentRun.output_payload_ref` to object storage for every AgentRun.

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

### Real-Time Push Protocol

The AWW web client subscribes to server-sent events (SSE) over a persistent HTTP connection.

**Protocol:** Server-Sent Events (SSE) — single direction (server → client), automatic reconnection on disconnect, compatible with standard HTTP proxies.

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

**Disconnect handling:** On SSE connection drop, the browser displays a "Reconnecting…" indicator. On reconnect, the client fetches current workspace state via REST to reconcile missed events, then resumes SSE.

**Agent timeout UX:** If an AgentRun's last heartbeat is >90 seconds ago (client-detected), the UI transitions the step icon to a `warning` state and shows "Agent may be unresponsive — Rerun or Take Over available."

### Mobile Strategy (MVP)

The primary use case for AWW is desktop (≥1180px). Mobile is not a primary use case for MVP.

**MVP mobile scope (supported):**
- Receive browser push notification when a step requires human action
- View approval gate controls (Approve / Request Changes) on a simplified single-panel view
- Submit an approval decision from mobile

**MVP mobile scope (not supported):**
- Full workflow management, code diff review, artifact editing

In the simplified mobile view, the Control Plane (approval gate) is rendered first, above the workflow step list.

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

### Primary Mental Model

The user's core question when opening AWW is: **"What do I need to do right now?"**

AWW is a **human decision router**, not a workflow visualizer. The UI prioritizes:
1. Current blocking action (approval gate or awaiting human input) — highest visual weight
2. Context needed to make the decision (diff, test results, artifacts)
3. Historical record and audit trail — accessible but not prominent

The Control Plane (approval gate buttons) must be the most visually prominent element when a human action is required, regardless of screen layout.

### Core Task Flows

#### Task Flow A: Engineering Lead Starts First Workflow

1. Opens AWW → **Empty state view** with centered "Create Workspace" CTA
2. Clicks "Create Workspace" → **3-step wizard modal:**
   - Step 1: Project name + select workflow template (MVP: one option — "PRD to PR")
   - Step 2: Connect repository — "Connect GitHub" OAuth or paste repo URL
   - Step 3: Add PRD — three tabs: Write, Paste, Upload (.md/.txt)
3. Wizard completes → workspace view opens; Step 1 (Create Workspace) marked `completed`
4. System marks Step 2 (Add PRD) `running` (human step); PRD provided in wizard
5. User clicks "Confirm PRD Ready" → Step 2 completes; Planner Agent triggered (Step 3 → `running`)
6. Planner Agent runs with animated step icon + live heartbeat log (~30–90 seconds)
7. User receives notification; returns to approve or request changes

#### Task Flow B: Request Changes → Agent Rerun → Re-review

1. Human final review step active; user reads diff + test results + review findings
2. User clicks "Request Changes" → **Finding Selector panel** slides in from right:
   - Lists Review Agent findings with severity badges (High / Medium / Low)
   - Checkboxes to select which findings to address
   - "Additional Instructions" textarea at the bottom
3. User selects findings + adds instructions; clicks "Submit Changes"
4. System creates fix tasks from selected findings; injects into next AgentRun context
5. Coding Agent and Test Agent re-run automatically (workflow rewinds to Step 5)
6. User receives notification: "Agent completed fix pass — your review is needed again"
7. User returns to Step 7 with fresh diff and updated test results

#### Task Flow C: Take Over → Local IDE → Re-enter Workflow

1. Coding Agent step has been failing repeatedly; user clicks "Take Over"
2. Step transitions to `human_owned`; **Local Work Instructions panel** appears:
   ```
   Branch: aww/shopflow-web/a1b2c3
   Task: Implement checkout cart persistence
   Files in scope: src/cart/*, src/api/cart.ts

   git checkout aww/shopflow-web/a1b2c3 && git pull
   ```
3. User works in local IDE, commits, and pushes to the branch
4. AWW detects the push via GitHub Webhook (or within 60 seconds via polling)
5. AWW creates a `CODE_PATCH` Artifact from the commit diff; step transitions to `completed`
6. Workflow automatically advances to Step 6 (Run Tests)

### First-Time User Experience (FTUE)

#### Empty State

When a user has no workspaces, the main content area shows:
- Centered illustration of a completed AWW workflow
- Headline: "Ship features with confidence"
- Subheadline: "Define the workflow once. Agents implement. You review and approve."
- Primary CTA: "Create Your First Workspace"

#### New Workspace Wizard

3-step modal with progress indicator. Each step has a single primary action:
- Step 1 "Project" → validates non-empty name → "Next"
- Step 2 "Repository" → "Connect GitHub" (via local `gh auth login`) or "Use Local Runner" (shows `aww runner register` command) → validates successful connection → "Next"
- Step 3 "PRD" → validates non-empty content → "Create Workspace"

#### Agent Running State

When an agent step is running, the step row shows an animated pulsing icon (teal) and the last 3 lines of runner output updated via SSE. Users may close the browser tab; the workflow continues running and they receive an in-app notification badge when the step completes.

### Error States

| Error | Step Icon | Control Plane Shows |
|-------|-----------|---------------------|
| Agent failed (< max_retries) | Amber | "Retrying in Xs…" + "Rerun Now" + "Take Over" |
| Agent failed (max_retries reached) | Red | "Agent could not complete" + "Take Over" + "Cancel" |
| Agent timed out | Red | "Agent is unresponsive" + "Rerun" + "Take Over" |
| Tests failed (pass gate blocked) | Red | Test report summary + "Request Changes" + "Take Over" |
| Runner offline | Gray (all agent steps) | "Runner offline — start your runner to continue" |

## 14. Data Model v2

### WorkflowTemplate *(new)*

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
- runner_id: string *(links to registered runner)*
- github_installation_id: string | null

### WorkflowRun

- id
- workspace_id
- template_id
- current_step_id
- status: enum (pending | running | paused | completed | failed | cancelled)
- started_at
- completed_at
- feature_branch: string *(e.g. aww/shopflow-web/a1b2c3)*
- base_commit_sha: string *(HEAD of default_branch at run creation)*
- trigger_type: enum (manual | webhook | scheduled)
- triggered_by: string

### WorkflowStep

- id
- workflow_run_id
- template_step_id
- name
- owner_type: enum (human | agent | approval_gate)
- agent_role: enum (planner | tasker | coder | tester | reviewer | summarizer) | null
- status: enum (pending | running | completed | failed | timed_out | retrying | cancelled | human_owned) *(see §23)*
- input_artifact_ids: string[]
- input_artifact_roles: ArtifactRole[] *(declared types expected)*
- output_artifact_ids: string[]
- approval_required: boolean
- retry_count: integer
- max_retries: integer *(default: 3)*
- retry_backoff_seconds: integer *(default: 60)*
- depends_on_step_ids: string[]
- execution_lock: { locked_by_agent_run_id, locked_at, lock_expires_at } | null
- completed_at: timestamp | null

### Artifact

- id
- workspace_id
- step_id
- role: enum (PRD | PLAN | TASK_LIST | CODE_PATCH | TEST_REPORT | REVIEW_COMMENT | PR_SUMMARY | HUMAN_EDIT) *(replaces untyped `type`)*
- title
- content: string *(structured text; never raw source code files)*
- file_refs: string[] *(changed file paths)*
- git_commit_sha: string | null
- status: enum (draft | committed | superseded)
- version: integer *(monotonically increasing within a step's artifacts of the same role)*
- parent_artifact_id: string | null *(edit lineage)*
- created_by: string
- created_by_type: enum (human | agent)
- created_at

**Immutability principle:** Artifacts are never modified after creation. An "edit" creates a new Artifact (`parent_artifact_id` → original, `status = committed`); the original becomes `superseded`. Only `committed` Artifacts are visible to downstream steps.

### Decision

- id
- step_id
- actor: string
- action: enum (approve | reject | request_changes | edit | take_over | rerun)
- comment: string | null
- created_at
- artifact_version_id: string | null *(snapshot of the Artifact version this decision was made on)*
- resulting_artifact_id: string | null *(for edit/take_over: ID of the resulting Artifact)*
- target_step_id: string | null *(for request_changes: step to rewind to; null = current step)*

### AgentRun

- id
- step_id
- agent_role
- model: string *(e.g. claude-sonnet-4-6)*
- runner_id: string
- input_summary: string *(UI display; max 500 chars)*
- input_payload_ref: string | null *(object storage key for full prompt; not stored in DB)*
- output_summary: string *(UI display; max 500 chars)*
- output_payload_ref: string | null *(object storage key for full raw output)*
- changed_files: string[]
- command_logs: string *(sanitized; secrets redacted)*
- status: enum (pending | running | completed | failed | timed_out | cancelled)
- attempt_number: integer *(1-indexed retry attempt)*
- checkpoint_data: jsonb | null *(agent-defined resume state)*
- last_heartbeat_at: timestamp | null *(updated every 30s by runner)*
- timeout_seconds: integer *(per role: coder=1800, tester=600, reviewer=900, planner=600)*
- git_branch: string | null
- head_commit_sha: string | null *(HEAD after agent commits)*
- started_at
- completed_at
- cancelled_at: timestamp | null

## 15. Integrations

### GitHub Integration Levels

AWW defines three integration levels with GitHub. MVP targets Level 2.

**Level 1 — Git Protocol Only**
- Clone, fetch, push via git
- Authentication: Personal Access Token or Deploy Key in runner local config
- No GitHub API calls; supports any git host (GitHub, GitLab, Bitbucket, self-hosted)

**Level 2 — GitHub REST API (MVP)**
- Everything in Level 1, plus:
- Read repository metadata: branch list, default branch
- Create pull requests via `POST /repos/{owner}/{repo}/pulls`
- Write PR body from `PR_SUMMARY` artifact content
- Required OAuth scope: `repo` (read + write to private repositories)
- AWW registers as a GitHub OAuth App; users authorize via browser OAuth flow

**Level 3 — GitHub App (Post-MVP)**
- Fine-grained per-repository permissions, organization-level installation, webhook events
- Not included in MVP

### MVP Integrations

- GitHub repository (Level 2)
- AWW Local Runner (see §20) — local git workspace and shell command execution
- OpenAI API (model: gpt-4o or configurable)
- Anthropic API (model: claude-sonnet-4-6 or configurable)
- Model configuration: workspace-level (one provider + model for all agent roles in MVP)
- Object storage (S3-compatible) — full prompt/output payloads and raw test logs

### Later

- Linear, Jira, Slack
- GitHub App (Level 3)
- CI providers
- SSO, Secrets manager
- Per-step model routing (different models for different agent roles)

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
2. On local machine: `aww runner register --url https://app.aww.dev --token <runner-token>`
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
| GitHub credentials | Local `gh` CLI credential store | Runner (git clone/push and PR creation) | No |
| LLM API Key | Runner local config file | Runner (direct API calls) | No |
| Runner Token | AWW Cloud (hashed) + local config | Runner registration | Hash only |
| Git credentials | Local git/gh credential store | Runner (git clone/push) | No |

### LLM API Key

The runner calls the LLM provider API directly from the user's machine using the key stored in `~/.aww/config.toml` (permissions: 600). AWW Cloud never proxies, transmits, or stores LLM API keys.

### GitHub Credentials

MVP uses the user's local GitHub credentials. The Local Runner requires `gh auth login` and uses the local `gh` CLI or git credential helper to clone, push, and create the pull request. AWW Cloud does not store GitHub OAuth tokens in MVP.

Post-MVP GitHub App integration may store encrypted installation credentials in AWW Cloud for richer repository metadata, checks, statuses, and webhook handling.

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
4. **Human final approval** → Local Runner calls the local `gh` CLI to create a PR (`feature_branch` → `default_branch`). AWW Cloud does not store GitHub credentials, merge, or delete the branch in MVP.
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
  "agent_role": "coder",
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
