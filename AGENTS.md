# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains product documentation and static HTML prototypes for Agent Workflow Workspace.

- `docs/PRD.md` contains the main product requirements.
- `docs/CONTRACTS.md` defines API and data contracts.
- `docs/TODOLIST.md` tracks planned work.
- `docs/AWW Prototype_v2.html` is the current static UI prototype.
- `docs/superpowers/specs/` stores design/specification notes.
- `docs/superpowers/plans/` stores implementation plans.
- `tmp/` contains earlier prototype snapshots and generated scratch files; treat it as non-source unless a task explicitly references it.
- `CLAUDE.md` contains agent-facing project context.

There is no application source tree, package manifest, or build system yet.

## Build, Test, and Development Commands

No build or install step is required for the current static prototype.

- `open "docs/AWW Prototype_v2.html"` previews the latest prototype in a browser on macOS.
- `open tmp/index.html` previews the older scratch prototype.
- `rg "WorkflowStep" docs` searches documentation quickly.
- `git status --short` checks local changes before editing or committing.

If a future implementation adds a package manager, document the exact setup and test commands here.

## Coding Style & Naming Conventions

Use Markdown for documentation and keep sections short, concrete, and linkable. Prefer sentence-case headings unless the document already follows another convention.

For HTML prototypes, keep styles and scripts readable, preserve existing CSS custom properties, and use semantic class names such as `workflow-step`, `artifact-list`, or `approval-panel`. File names for dated plans/specs should follow the existing pattern: `YYYY-MM-DD-topic-name.md`.

## Testing Guidelines

There is no automated test suite yet. For prototype changes, manually open the relevant HTML file and verify layout, scrolling, and key interactions at desktop and mobile widths. For documentation changes, check links, headings, and terminology consistency against `docs/PRD.md` and `docs/CONTRACTS.md`.

## Commit & Pull Request Guidelines

Recent commits use concise Conventional Commit-style messages with a scope, for example:

- `docs(prd): v1 baseline`
- `docs(prd): add §20-§24 — execution env ADR, security, git strategy, state machine, artifact spec`

Use the same pattern: `type(scope): summary`. Common types for this repo are `docs`, `proto`, and `chore`.

Pull requests should include a short summary, changed files or areas, validation performed, and screenshots for prototype UI changes. Link related issues or plans when available.

## Agent-Specific Instructions

Do not overwrite user changes. Before editing, inspect `git status --short`. Keep generated or exploratory artifacts in `tmp/` unless they are intended to become maintained documentation under `docs/`.
