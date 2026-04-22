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

## 20. Positioning

Short positioning:

Agent Workflow Workspace is a controlled software delivery workspace where humans and AI agents collaborate through predefined, auditable workflows.

Long positioning:

Instead of asking a single agent to take a vague feature request and hope for the best, teams define the workflow first. Each step has an owner, expected output, approval rule, and workspace context. AI agents can plan, code, test, and review, but humans stay in control of architecture, scope, and final acceptance.

