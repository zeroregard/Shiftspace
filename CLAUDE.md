# Shiftspace — Product Spec & Development Guide

## Overview

A visual workspace command center for VSCode. Shiftspace replaces the clunky source control panel with a real-time, spatial node graph of your file changes across all git worktrees. Built for developers running multiple agents, branches, or tasks in parallel — but useful for anyone who wants to see what's happening in their repo instead of reading a flat file list.

**Core Concept:** A webview panel that renders a spatial node graph. Each worktree is a visual cluster. Each changed file is a node within that cluster. The graph updates in real-time via filesystem watching. One glance tells you what changed, where, and how much.

Shift+Space toggles the full-screen Shiftspace view. Hit it again to return to your previous editor layout. Also available as a normal editor tab for side-by-side use.

---

## Core Features

### 1. Toggle & Layout

- Shift+Space keybinding: toggles full-screen Shiftspace view on/off, restoring the previous editor layout on dismiss.
- Also openable as a regular editor tab (command palette: `Shiftspace: Open as Tab`).
- Webview panel with full rendering control (React).
- Dark-theme-first. Respects VSCode theme colors where practical.

### 2. Spatial Node Graph

- Each git worktree is rendered as a **dashed, rounded container** on the canvas. Containers are laid out horizontally, side by side, **top-aligned**.
- The worktree label (branch name, file count, line stats) sits at the top of its container.
- Inside each container, the file hierarchy is rendered as a **classic CS tree** (top-down dendrogram): the worktree root is at the top, children (folders and files) spread horizontally below their parent. Siblings sit side by side; the tree grows downward and outward.
- Files are grouped by their deepest containing directory (folder nodes). Intermediate directories that only contain subdirectories (not direct file changes) are collapsed into a single folder node with an abbreviated path (e.g. `src/components/ui` or `src/…/ui`).
- Root-level files (no directory) appear as direct children of the worktree root, without a folder node.
- Edges connect worktree → folder → file using smoothstep/elbow connectors to show the hierarchy clearly.
- Container width and height grow to fit the tree contents — wider for bushy trees, taller for deep ones.
- Layout uses a **custom tidy-tree algorithm**: each leaf gets a fixed-width slot, parent nodes center above their children, subtree widths accumulate bottom-up to prevent sibling overlap.
- Node sizing/weight reflects amount of change (lines added + removed + modified).
- Each node shows at a glance:
  - Filename (truncated smartly)
  - Lines added / removed / changed (compact visual indicator, not raw numbers)
  - Staged vs unstaged distinction (e.g. border style or opacity difference)
- Click a node → opens the file diff in the editor.
- Smooth animations: nodes appear, update, and disappear with transitions (not jarring pops).

#### Connector handle rules

| Node type                              | Top handle                      | Bottom handle                       |
| -------------------------------------- | ------------------------------- | ----------------------------------- |
| Worktree base node                     | No                              | No                                  |
| Root folder (direct child of worktree) | No                              | Yes (connects down to its children) |
| Root file (direct child of worktree)   | No                              | No                                  |
| Nested folder                          | Yes (connects to parent)        | Yes (connects to children)          |
| Leaf file inside a folder              | Yes (connects to parent folder) | No                                  |

Being inside the dashed worktree container already implies membership — root-level items don't need an edge up to the worktree header.

#### Folder hierarchy rules

- Folder nodes are built from a **trie** of file paths — shared parent directories always appear when they branch.
- If two changed-file paths share a common folder prefix (e.g. `src/app/*` and `src/hooks/*`), the shared `src` folder MUST appear as its own node.
- Only collapse intermediate folders when they form a **single chain** with no branching (e.g. `lib/utils/helpers/format.ts` with no other files in that subtree → one folder node `lib/utils/helpers`).
- Root-level files (`package.json`, `tsconfig.json`) appear directly in the container with no folder parent.

#### Layout model: folders fan out, files stack down

- **Folder siblings** at the same level spread **horizontally** (classic tree fan-out).
- **File nodes** within a folder stack **vertically** in a column beneath their parent folder node.
- Width is driven by folder count (typically 3-8), height is driven by the deepest file list.
- This naturally encourages good folder organization — a folder with many files produces a long column, visually signaling density.

### 3. Real-Time Filesystem Watching

- Filesystem watcher on all detected worktrees.
- Graph updates live as files are saved/changed by agents, editors, or anything else.
- "Pulse" animation on a node when a file just changed (brief glow/ripple so you can see activity).
- Data source: `git status` / `git diff --stat` per worktree, triggered by filesystem events.

### 4. Multi-Worktree Awareness

- Auto-detects all worktrees for the current repository.
- Each worktree displayed as a labeled cluster (showing branch name and worktree path).
- Works with zero configuration — if worktrees exist, they show up.

### 5. Integrated Terminal Launcher

- Each worktree cluster has a "terminal" action (icon/button).
- One click → opens a VSCode integrated terminal cd'd into that worktree's root.
- Enables quick actions like starting/stopping dev servers per worktree.

### 6. Port / Process Awareness

- Detect running processes (dev servers) per worktree and display which port they're on.
- Visual indicator on the worktree cluster: e.g. a small badge showing `:3000` or `:8080`.
- Enables you to see at a glance: "worktree feature/auth has a dev server on :3001."

---

## Visual Design Principles

- **Dark-first.** The default experience matches dark VSCode themes.
- **Information density without clutter.** Show a lot, but through visual encoding (size, color, opacity, position) rather than text labels everywhere.
- **Smooth and alive.** Animations should make the graph feel like a living system, not a static diagram. Pulse on change, gentle transitions, no hard jumps.
- **The opposite of the git panel.** If the source control sidebar is a spreadsheet, Shiftspace is a map.

---

## Explicitly Out of Scope (for now)

- Risk scoring / configurable risk indicators
- Change history / replay / timeline
- Any paid tier or licensing logic
- Settings UI / configuration panel
- Multi-repo support (only worktrees within one repo)
- Windows support (macOS/Linux first)

---

## Development Strategy: Preview-First

The renderer is built and tested outside of VSCode first, as a standalone web app deployable to Vercel. This lets us iterate on the visual design and interaction from any device (phone, laptop, tablet) without needing a VSCode dev environment running.

---

## Monorepo Structure

```
shiftspace/
├── packages/
│   ├── renderer-core/     # Engine: types, stores, canvas, nodes, layout, overlays, hooks, utils
│   │   └── src/
│   │       ├── nodes/     # WorktreeNode, FolderNode, FileNode components
│   │       ├── layout/    # Tidy-tree layout logic (custom, no external library)
│   │       ├── store/     # Zustand stores (worktree, action, insight, inspection, package)
│   │       ├── shared/    # UnifiedHeader, ThemedFileIcon, PackageSwitcher
│   │       ├── hooks/     # useFileAnnotations, usePanZoom, useCanvasGestures, useWorktreeRename
│   │       ├── overlays/  # DiffPopover, BranchPicker
│   │       ├── ui/        # ActionsContext, AnnotationBadges, DiagnosticTooltipContent
│   │       ├── utils/     # listSections, storeKeys, actionUtils, worktreeUtils, diffLineLookup
│   │       ├── components/# ActionBar (shared between grove and inspection views)
│   │       ├── TreeCanvas.tsx
│   │       └── types.ts   # Shared data interfaces (WorktreeState, FileChange, etc.)
│   ├── renderer-grove/    # Thin view: grove/tree visualization (2 files)
│   │   └── src/
│   │       ├── GroveView.tsx
│   │       └── components/WorktreeCard.tsx
│   ├── renderer-inspection/ # Thin view: file list / inspection (2 files)
│   │   └── src/
│   │       ├── InspectionView.tsx
│   │       └── components/FileListPanel.tsx
│   ├── renderer/          # Umbrella: ShiftspaceRenderer + backwards-compat re-exports
│   │   └── src/
│   │       ├── ShiftspaceRenderer.tsx  # Top-level coordinator (imports grove + inspection)
│   │       └── index.ts               # Re-exports from all sub-packages
│   └── ui/                # Shared UI component library (badge, button, codicon, tooltip, etc.)
│       └── src/           # Source-exported via package.json, no build step
├── apps/
│   ├── preview/           # Vite + React app, deployed to Vercel
│   │   ├── src/           # App shell, mock data, simulation handlers
│   │   │   └── controls/  # UI to configure simulation
│   │   └── e2e/           # Playwright E2E tests + screenshot baselines
│   └── vscode-ext/        # VSCode extension
│       └── src/
│           ├── git/       # Git interaction layer (status, diff, worktree detection)
│           ├── webview/   # React webview bridge
│           ├── mcp/       # MCP server for Claude/AI agent integration
│           ├── actions/   # Action/pipeline execution system
│           └── insights/  # Diagnostics + code smell detection
└── package.json           # Workspace root (pnpm workspaces + Nx orchestration)
```

### Renderer package architecture

The renderer is split into 4 packages to enable granular E2E test targeting:

```
ui
 ↑
renderer-core          # Engine (types, stores, canvas, nodes, layout, all shared code)
 ↑          ↑
grove    inspection    # Thin view layers (2 files each, no cross-dependencies)
 ↑          ↑
 renderer (umbrella)   # ShiftspaceRenderer coordinator + re-exports
```

**Why the split:** Nx's affected detection works at the package level. With separate grove and inspection packages, a change to `GroveView.tsx` only triggers grove-related E2E tests (controls, graph), while a change to `FileListPanel.tsx` only triggers inspection-related tests (diagnostics, inspector, search-filter). Core changes trigger all tests.

**Key rules:**

- `renderer-grove` and `renderer-inspection` must **never** depend on each other — only on `renderer-core`
- Shared components used by both views (e.g., `ActionBar`) belong in `renderer-core`
- The umbrella `renderer` is the only package that imports from both grove and inspection
- `renderer-core` and the thin view packages are **source-level** (no build step) — consumers' bundlers compile them directly
- The umbrella `renderer` has a Vite build that produces `dist/` for the vscode-ext's node16 typecheck

**Tailwind CSS:** Both `apps/preview/src/styles.css` and `apps/vscode-ext/src/webview/styles.css` must include `@source` directives for all four renderer packages. If you add a new renderer sub-package, add its `@source` path to both stylesheets.

---

## Data Interface (shared contract)

Canonical source: `packages/renderer-core/src/types.ts`

```typescript
interface WorktreeState {
  id: string;
  path: string;
  branch: string;
  files: FileChange[];
  branchFiles?: FileChange[]; // files changed relative to branch base
  process?: { port: number; command: string };
  diffMode: DiffMode; // 'working' | { type: 'branch'; branch: string }
  defaultBranch: string;
  isMainWorktree: boolean;
}

interface FileChange {
  path: string; // relative to worktree root
  status: 'added' | 'modified' | 'deleted';
  staged: boolean;
  partiallyStaged?: boolean; // git add -p support
  committed?: boolean; // for branch diffs
  linesAdded: number;
  linesRemoved: number;
  lastChangedAt: number; // timestamp, used for pulse animation
  diff?: DiffHunk[]; // parsed diff hunks
  rawDiff?: string; // unified diff string
}

type ShiftspaceEvent =
  | { type: 'file-changed'; worktreeId: string; file: FileChange }
  | { type: 'file-removed'; worktreeId: string; filePath: string }
  | { type: 'file-staged'; worktreeId: string; filePath: string }
  | { type: 'worktree-added'; worktree: WorktreeState }
  | { type: 'worktree-removed'; worktreeId: string }
  | { type: 'process-started'; worktreeId: string; port: number; command: string }
  | { type: 'process-stopped'; worktreeId: string };
```

---

## Mock Worktree Engine (`apps/preview/mock/`)

A simulation layer that generates realistic worktree activity:

- **MockWorktree:** Represents a worktree with a branch name, a file tree, and simulated change state. Initialized from a template resembling a real project (e.g. a typical Next.js or monorepo structure with `src/`, `lib/`, `components/`, `api/` etc.).
- **MockAgent:** Simulates an AI agent working in a worktree. When "running," it emits file change events at randomized but realistic intervals — creating new files, modifying existing ones, staging changes. Each agent has a persona/pattern:
  - `refactor` agent: touches many files lightly
  - `feature` agent: creates new files in one directory
  - `bugfix` agent: touches 2-3 files deeply
- **Event bus:** A simple event emitter that the mock engine pushes change events into. The renderer subscribes to this same interface that the real VSCode extension will later use.

---

## Preview App Controls (`apps/preview/controls/`)

A control panel overlay (visible on the preview app, not part of the renderer) with:

- Add/remove worktrees (pick from preset templates or create custom)
- Start/stop simulated agents per worktree (with agent persona selection)
- Speed slider (control how fast events fire — from slow-motion to chaos mode)
- Agent count (simulate 1-5 agents running in different worktrees simultaneously)
- Reset (clear all state, start fresh)
- Snapshot (freeze current state for screenshot/design review)

---

## Performance

### Performance guidelines:

- All custom node components must be wrapped in `React.memo`.
- Use Zustand selectors to avoid re-rendering nodes that didn't change.
- Debounce filesystem watcher events (batch changes within a ~500ms window before re-querying git).
- Tree layout is computed with a custom tidy-tree function (no external layout library). Each worktree is a container; folders and files are positioned as a proper CS tree within it. Leaf nodes get fixed-width slots, subtree widths accumulate bottom-up, and parent nodes center above their children to guarantee zero overlaps.
- Per-worktree layout is cached by `WorktreeState` reference in `ShiftspaceRenderer` — a file change in one worktree skips layout recomputation for all others.

---

## Tech Stack

| Layer                | Choice                                                                |
| -------------------- | --------------------------------------------------------------------- |
| Extension host       | VSCode Extension API (TypeScript) + MCP server                        |
| Webview rendering    | React 19 (bundled into webview)                                       |
| Graph rendering      | Custom `TreeCanvas` (pan/zoom, SVG edges, ~200 lines, no ext. lib)    |
| Graph layout         | Custom tidy-tree layout (tree-in-container per worktree, no ext. lib) |
| State management     | Zustand 5                                                             |
| Styling              | Tailwind CSS 4                                                        |
| UI components        | `@shiftspace/ui` (shared library) + @radix-ui + @vscode/codicons      |
| Git interaction      | Shell commands (`git worktree list`, `git status`, `git diff --stat`) |
| Filesystem watching  | VSCode FileSystemWatcher API                                          |
| Port detection       | `lsof` / `netstat` (macOS/Linux first)                                |
| Diff parsing         | @pierre/diffs                                                         |
| Build tooling        | Nx (task orchestration) + pnpm workspaces                             |
| Bundling             | Vite + esbuild                                                        |
| Testing              | Vitest (unit) + Playwright (E2E)                                      |
| Linting / formatting | oxlint + Prettier                                                     |
| Preview hosting      | Vite + Vercel                                                         |

---

## Browser Testing (E2E)

- **Framework:** Playwright (`@playwright/test`) in `apps/preview/`
- **Config:** `apps/preview/playwright.config.ts` — Chromium-only, 1280×720 viewport, animations disabled for stable screenshots
- **Tests:** `apps/preview/e2e/` — visual regression + interaction tests against the preview app
- **Screenshots:** Baselines stored in `apps/preview/e2e/__screenshots__/`, committed directly in git (no LFS — total size is small enough)
- **Running locally:**
  - Install browsers once: `bun run --filter @shiftspace/preview playwright:install`
  - Run tests: `bun run --filter @shiftspace/preview test:e2e`
  - Interactive UI mode: `bun run --filter @shiftspace/preview test:e2e:ui`
- **Updating snapshots:** `bun run --filter @shiftspace/preview test:e2e:update` locally, or open a PR — CI will auto-update and commit snapshots for you
- **CI:** `e2e.yml` runs on every PR — determines which specs are affected by the PR's changes, runs only those specs with `--update-snapshots`, auto-commits updated screenshots, and posts a before/after comparison comment
- **Adding new tests:** Put `.spec.ts` files in `apps/preview/e2e/`. Use `toHaveScreenshot('descriptive-name.png')` for visual regression. Screenshots generated on first run become the baseline.
- **Claude Code agent environment:** Playwright browsers cannot be installed in the remote agent environment. Write E2E tests, commit them, and let CI generate the baseline screenshots. CI will auto-update and commit snapshots back to the PR branch.

### Per-spec E2E targeting

Each E2E spec has a corresponding Nx target in `apps/preview/project.json` with fine-grained `inputs` that map to specific renderer sub-packages. CI uses `git diff` to determine which packages changed and only runs the affected specs:

| Spec                                | Depends on                | Triggered by                                           |
| ----------------------------------- | ------------------------- | ------------------------------------------------------ |
| `controls.spec.ts`                  | core + grove              | GroveView, WorktreeCard, layout, nodes, controls, mock |
| `graph.spec.ts`                     | core + grove + inspection | Everything (integration test)                          |
| `diagnostics.spec.ts`               | core + inspection         | InspectionView, FileListPanel, annotations, mockData   |
| `inspector-file-categories.spec.ts` | core + inspection         | FileListPanel, listSections, mockData                  |
| `search-filter.spec.ts`             | core + inspection         | FileListPanel, listSections, mock                      |

**Adding a new E2E spec:**

1. Create the `.spec.ts` file in `apps/preview/e2e/`
2. Add a corresponding `e2e:<name>` target in `apps/preview/project.json` with appropriate `inputs` (choose from `rendererCore`, `rendererGrove`, `rendererInspection` named inputs)
3. Add the target to `test:e2e.dependsOn` in the same file
4. Add the spec to the CI affected detection in `.github/workflows/e2e.yml`

---

## Commit & PR Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages and PR titles.

**Format:** `type(scope): description`

- If the change targets a single package, scope it: `fix(@shiftspace/renderer): clamp zoom level`
- If the change spans multiple packages or is repo-wide, omit the scope: `fix: resolve merge conflict in lockfile`

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`

---

## CI Hygiene

If CI is failing — even on checks unrelated to your changes — fix it. Do not dismiss failures as "pre-existing" or "not our fault." A green CI pipeline is everyone's responsibility. If you encounter a formatting issue, lint warning, or flaky test that predates your branch, fix it in your PR. Leaving broken windows makes the next person's job harder.

---

## Open Questions

1. **Filesystem watcher debounce tuning:** 500ms is a starting point. Too short = thrashing git commands. Too long = feels laggy.
2. **Windows support:** Port/process detection differs on Windows. Defer to v0.2.
3. **Naming:** Is "Shiftspace" available on the VSCode Marketplace?

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
