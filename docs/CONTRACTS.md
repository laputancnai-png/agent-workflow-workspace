# AWW Canonical Contracts

**Status:** Canonical for MVP implementation  
**Updated:** 2026-04-22  
**Source of truth:** This document overrides older wording in PRD, architecture, prototype, or implementation plans when string values conflict.

This file exists to prevent P1 Backend, P2 Runner, and P3 Frontend from drifting on shared string contracts.

## 1. WorkflowRun

### Status

```text
pending | running | paused | completed | failed | cancelled
```

### Branch

Each `WorkflowRun` owns exactly one feature branch:

```text
aww/{workspace-slug}/{run-id-short}
```

Example:

```text
aww/shopflow-web/a1b2c3
```

MVP implementation serializes all coding commits to this branch. No parallel coding agents write to the same run branch in MVP.

## 2. WorkflowStep

### Owner Type

```text
human | agent | approval_gate
```

### Status

```text
pending | running | completed | failed | timed_out | retrying | cancelled | human_owned
```

Do not use these as `WorkflowStep.status` values:

```text
approved | rejected | changes_requested | in_progress | awaiting_approval | human_taking_over
```

Those may appear as UI copy or decision descriptions only, not persisted step statuses.

### Decision Effects

| Decision action | Step status effect | Run effect |
|---|---|---|
| `approve` | `completed` | advance to next step |
| `reject` | `cancelled` | fail or pause run according to service policy |
| `request_changes` | `retrying`, then `running` | create a new AgentRun for the target step |
| `edit` | unchanged | create `HUMAN_EDIT` artifact; explicit approve still required |
| `take_over` | `human_owned` | cancel active AgentRun and wait for human commit |
| `rerun` | `retrying`, then `running` | create new AgentRun without incrementing automatic retry count |

## 3. Agent Roles

Persisted `agent_role` values:

```text
planner | tasker | coder | tester | reviewer | summarizer
```

Display labels may use friendlier names:

| Value | Display label |
|---|---|
| `planner` | Planner Agent |
| `tasker` | Task Breakdown Agent |
| `coder` | Coding Agent |
| `tester` | Test Agent |
| `reviewer` | Review Agent |
| `summarizer` | Summarizer Agent |

Do not persist old prototype role names:

```text
task_breakdown | coding | test | review
```

## 4. AgentRun

### Status

```text
pending | running | completed | failed | timed_out | cancelled
```

### Heartbeat

- AgentRun heartbeat interval: 30 seconds.
- Watchdog timeout threshold: 120 seconds since last heartbeat.
- Runner-level heartbeat interval: 60 seconds.

## 5. Artifacts

### Role

```text
PRD | PLAN | TASK_LIST | CODE_PATCH | TEST_REPORT | REVIEW_COMMENT | PR_SUMMARY | HUMAN_EDIT
```

Do not use `CUSTOM` for MVP artifact roles.

### Status

```text
draft | committed | superseded
```

Artifacts are immutable after creation. Human edits create a new `HUMAN_EDIT` artifact with `parent_artifact_id` pointing to the original artifact; the original artifact becomes `superseded`.

## 6. Runner

### CLI

Use:

```bash
aww runner register --url https://app.aww.dev --token <runner-token>
aww runner start
aww runner status
```

Do not use `aww-runner` as the MVP binary name in docs or UI copy.

### Local Files

```text
~/.aww/config.toml
~/.aww/runner.json
~/.aww/state/
```

- `config.toml`: cloud URL, runner config, and LLM provider keys.
- `runner.json`: registered runner identity and secret; permissions should be `600`.
- `state/`: local checkpoint/recovery state.

## 7. GitHub Credentials

MVP uses local credentials only:

```bash
gh auth login
```

The Local Runner uses local git credentials and the local `gh` CLI to clone, push, and create PRs.

AWW Cloud does not store GitHub OAuth tokens in MVP and does not send plaintext GitHub credentials to the browser or runner.

GitHub App / OAuth token storage is Post-MVP.

## 8. Pull Request Creation

MVP PR creation happens from the Local Runner:

```bash
gh pr create --base <default_branch> --head <feature_branch>
```

AWW Cloud may store PR metadata after creation, but it does not create the PR directly in MVP.

## 9. Source Code Privacy

AWW Cloud may store:

- Artifact text such as plans, task lists, review summaries, test summaries, and PR summaries.
- Changed file paths.
- Commit SHAs.
- Sanitized command logs.
- Diff text or diff summaries when explicitly produced as artifacts.

AWW Cloud must not store full raw repository source files or full LLM prompt payloads in MVP.

## 10. Implementation Rule

If P1 Backend, P2 Runner, or P3 Frontend needs a string enum listed here, use the exact value from this file. If a new value is needed, update this file first, then update PRD, architecture, plans, prototype, tests, and implementation together.
