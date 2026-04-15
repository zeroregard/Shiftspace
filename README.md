# Shiftspace

Worktree manager and code review tool for VS Code. Keep tabs on multiple branches, inspect changes, and catch problems before you open a PR.

> **Preview release** — Shiftspace is under active development. Expect rough edges and frequent updates.

![Grove view — worktree cards with check status and insights](https://github.com/user-attachments/assets/416be536-148f-4e2d-b33b-bd7c8a6df726)

## What it does

Shiftspace gives you two views:

**Grove** — a dashboard of all your git worktrees as cards. Each card shows the branch, file count, lines changed, check results (lint, typecheck, test, etc.), and code smell counts. One glance tells you which worktree needs your attention.

**Inspection** — click a card to drill in. A file list and tree view of every change in that branch. Pick a diff mode (working changes, vs main, vs any ref) and browse files with inline insight badges.

![Inspection view — file list, tree hierarchy, and diff details](https://github.com/user-attachments/assets/16dace98-a738-446b-bc5b-1e7166226dd7)

## Key features

**Worktree management** — Rename worktrees, swap branches, switch your primary worktree. Access everything from the sidebar or the full-screen panel.

![Sidebar worktree view](https://github.com/user-attachments/assets/9e3688bf-7bb7-48ea-b7b5-dbcbf5fb3111)

**Worktree badges** — Drop a `.shiftspace-worktree.json` at a worktree's root and Shiftspace renders a pill badge next to its name. Handy for marking a worktree as `stale`, `in progress`, `in review`, etc. — great for AI agents to tag the worktree they're working on so you know which ones are safe to delete. Add `.shiftspace-worktree.json` to your `.gitignore` so badges stay local to each checkout.

```json
{
  "badge": {
    "label": "stale",
    "color": "warning"
  }
}
```

`label` is free-form text; `color` (optional) is one of `neutral`, `info`, `success`, `warning`, `danger` — each backed by a VSCode theme token so badges stay coherent across themes. Defaults to `neutral`.

**Checks & pipelines** — Define lint, typecheck, test, build, or any custom command in `.shiftspace.json`. Run them per worktree. Chain them into pipelines (e.g., fmt → lint → typecheck → test). Results show pass/fail badges on each card and go stale automatically when files change.

**Code smell detection** — Define regex patterns in `.shiftspace.json` to flag things linters won't catch: `eslint-disable` comments, LLM-generated separators, TODO counts, whatever matters to your team. Findings appear as badges on file nodes in Inspection mode.

![Code smell badges on file nodes](https://github.com/user-attachments/assets/a52c1cf2-ced9-44a9-bae8-3c6b6a1c30b7)

**MCP server** — Built-in Model Context Protocol server so AI agents can query insights, check status, run checks, and list changed files programmatically.

**Bundled themes** — Ships with Shiftspace Dark and Shiftspace Light color themes.

## Getting started

1. Install the extension
2. Press `Shift+Space` to open Shiftspace (or run `Shiftspace: Open as Tab` from the command palette)
3. Your worktrees appear automatically — click one to inspect it
4. Drop a `.shiftspace.json` in your repo root to configure checks and code smell rules:

```json
{
  "actions": [
    { "id": "lint", "label": "Lint", "command": "npm run lint", "type": "check", "icon": "search" },
    { "id": "test", "label": "Test", "command": "npm test", "type": "check", "icon": "beaker" }
  ],
  "pipelines": [
    { "id": "verify", "label": "Verify", "steps": ["lint", "test"], "stopOnFailure": true }
  ],
  "smells": [
    {
      "id": "eslint-disable",
      "label": "ESLint Disable",
      "pattern": "eslint-disable",
      "threshold": 1,
      "fileTypes": [".ts", ".tsx"]
    }
  ]
}
```

## Configuration

| Setting                                   | Description                                                        |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `shiftspace.ignorePatterns`               | Glob patterns for files to hide (e.g., `*.lock`, `**/lang/*.json`) |
| `shiftspace.additionalActions`            | Personal action buttons beyond what `.shiftspace.json` defines     |
| `shiftspace.insights.codeSmells.enabled`  | Enable/disable code smell detection (default: on)                  |
| `shiftspace.insights.diagnostics.enabled` | Show compiler errors and lint warnings on file nodes (default: on) |

## Requirements

- VS Code 1.85+
- Git

## Links

- [GitHub](https://github.com/zeroregard/Shiftspace)
- [Report an issue](https://github.com/zeroregard/Shiftspace/issues)
- [License (MIT)](https://github.com/zeroregard/Shiftspace/blob/main/LICENSE)
