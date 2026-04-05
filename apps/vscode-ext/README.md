# Shiftspace

A visual workspace command center for VS Code. See your git changes as a real-time spatial node graph instead of a flat file list.

## Features

**Spatial node graph** — Every changed file is a node. Folders form a tree hierarchy. One glance tells you what changed, where, and how much.

**Multi-worktree support** — Each git worktree is a visual cluster on the canvas. If you run multiple branches or agents in parallel, you see all of them at once.

**Real-time updates** — The graph updates live as files change. A pulse animation highlights recent activity so you can follow what's happening.

**Diff at a glance** — Nodes show lines added, removed, and modified. Click any file node to jump straight to its diff.

**Integrated terminal** — Launch a terminal pre-cd'd into any worktree with one click.

**Port/process awareness** — See which worktrees have dev servers running and on which port.

**Actions & insights** — Run linters, tests, or custom commands per worktree. See diagnostics and code smells overlaid on file nodes.

## Usage

- Press `Shift+Space` to toggle the full-screen Shiftspace view
- Or open the command palette and run `Shiftspace: Open as Tab`
- Shiftspace also appears in the activity bar sidebar

## Configuration

| Setting                                   | Description                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `shiftspace.ignorePatterns`               | Glob patterns for files to hide (e.g. `*.lock`, `**/lang/*.json`) |
| `shiftspace.additionalActions`            | Custom action buttons per worktree                                |
| `shiftspace.insights.diagnostics.enabled` | Show compiler errors/warnings on file nodes                       |
| `shiftspace.insights.codeSmells.enabled`  | Show code smell detection results on file nodes                   |

You can also define shared actions and code smell rules in a `.shiftspace.json` file at the root of your project.

## Requirements

- VS Code 1.85+
- Git
- macOS or Linux (Windows support coming later)
