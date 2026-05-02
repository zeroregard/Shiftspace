# Shiftspace

Worktree manager and code review tool for VS Code. Keep tabs on multiple branches, inspect changes, and catch problems before you open a PR.

> **Preview release.** Shiftspace is under active development. Expect rough edges and frequent updates.

![Grove view: worktree cards with check status and insights](https://github.com/user-attachments/assets/416be536-148f-4e2d-b33b-bd7c8a6df726)

## What it does

Shiftspace gives you two views.

**Grove** is a dashboard of all your git worktrees as cards. Each card shows the branch, file count, lines changed, check results (lint, typecheck, test, and so on), and code smell counts. One glance tells you which worktree needs your attention.

**Inspection** is what you get when you click a card. A file list and tree view of every change in that branch. Pick a diff mode (working changes, vs main, vs any ref) and browse files with inline insight badges.

![Inspection view: file list, tree hierarchy, and diff details](https://github.com/user-attachments/assets/16dace98-a738-446b-bc5b-1e7166226dd7)

## Key features

**Worktree management.** Rename worktrees, swap branches, switch your primary worktree. Everything's reachable from the sidebar or the full-screen panel.

![Sidebar worktree view](https://github.com/user-attachments/assets/9e3688bf-7bb7-48ea-b7b5-dbcbf5fb3111)

**Per-worktree config (`.shiftspace-worktree.json`).** Drop this file at a worktree's root to attach a badge and/or a plan file to that specific worktree. Add it to your `.gitignore` so it stays local to each checkout instead of getting committed onto the branch.

```json
{
  "badge": {
    "label": "in review",
    "color": "info",
    "description": "PR open, waiting on approval."
  },
  "planPath": "PLAN.md"
}
```

The `badge` block renders a pill next to the worktree's name. Useful for marking a worktree `stale`, `in progress`, `in review`, or whatever you want. Agents can set this too, which makes it easier to tell at a glance which worktrees are still being worked on and which are safe to delete. `label` is required and free-form. `color` is optional and must be one of `neutral`, `info`, `success`, `warning`, or `danger`. Each maps to a VSCode theme token so badges stay readable across themes. It defaults to `neutral`. `description` is optional and shows as a tooltip when you hover the badge.

`planPath` points at a plan or notes file relative to the worktree root (`PLAN.md`, `TODO.txt`, that kind of thing). When it's set, a book icon shows up on the worktree card. Click it to open the file. Hold Shift while hovering to preview the contents inline without leaving the Shiftspace panel.

**Checks and pipelines.** Define lint, typecheck, test, build, or any custom command in `.shiftspace.json`. Run them per worktree. Chain them into pipelines (fmt, lint, typecheck, test). Results show up as pass/fail badges on each card, and they go stale automatically when files change.

**Code smell detection.** Regex patterns in `.shiftspace.json` flag things linters won't catch: `eslint-disable` comments, LLM-generated separators, TODO counts, whatever matters to your team. Findings appear as badges on file nodes in Inspection mode.

![Code smell badges on file nodes](https://github.com/user-attachments/assets/a52c1cf2-ced9-44a9-bae8-3c6b6a1c30b7)

**MCP server.** Built-in Model Context Protocol server so AI agents can query insights, check status, run checks, and list changed files programmatically.

**Bundled themes.** Ships with Shiftspace Dark and Shiftspace Light.

## Getting started

1. Install the extension.
2. Press `Shift+Space` to open Shiftspace, or run `Shiftspace: Open as Tab` from the command palette.
3. Your worktrees show up automatically. Click one to inspect it.
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

| Setting                                   | Description                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `shiftspace.ignorePatterns`               | Glob patterns for files to hide (e.g., `*.lock`, `**/lang/*.json`)                          |
| `shiftspace.additionalActions`            | Personal action buttons beyond what `.shiftspace.json` defines                              |
| `shiftspace.insights.codeSmells.enabled`  | Enable/disable code smell detection (default: on)                                           |
| `shiftspace.insights.diagnostics.enabled` | Show compiler errors and lint warnings on file nodes (default: on)                          |
| `shiftspace.telemetry.enabled`            | Send anonymous error reports to help improve Shiftspace (default: off, opt-in on first run) |

## Privacy and telemetry

Shiftspace ships with optional, opt-in anonymous error reporting through Sentry. It's off by default. The first time the extension activates you'll see a one-time prompt asking whether to turn it on. Pick "No thanks" and you won't be asked again. No code, file contents, or personally identifiable info is ever sent. You can flip the toggle any time via `shiftspace.telemetry.enabled`, and VS Code's global `telemetry.telemetryLevel` always wins over it.

## Requirements

VS Code 1.85+ and git.

## Links

- [GitHub](https://github.com/zeroregard/Shiftspace)
- [Report an issue](https://github.com/zeroregard/Shiftspace/issues)
- [License (MIT)](https://github.com/zeroregard/Shiftspace/blob/main/LICENSE)
