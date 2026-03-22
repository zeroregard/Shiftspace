# Shiftspace — Product Spec & Development Guide

## Overview

A visual workspace command center for VSCode. Shiftspace replaces the clunky source control panel with a real-time, spatial node graph of your file changes across all git worktrees. Built for developers running multiple agents, branches, or tasks in parallel — but useful for anyone who wants to see what's happening in their repo instead of reading a flat file list.

**Core Concept:** A webview panel that renders a spatial node graph. Each worktree is a visual cluster. Each changed file is a node within that cluster. The graph updates in real-time via filesystem watching. One glance tells you what changed, where, and how much.

Shift+Space toggles the full-screen Shiftspace view. Hit it again to return to your previous editor layout. Also available as a normal editor tab for side-by-side use.

---

## v0.1 — MVP Scope

### 1. Toggle & Layout

- Shift+Space keybinding: toggles full-screen Shiftspace view on/off, restoring the previous editor layout on dismiss.
- Also openable as a regular editor tab (command palette: `Shiftspace: Open as Tab`).
- Webview panel with full rendering control (React).
- Dark-theme-first. Respects VSCode theme colors where practical.

### 2. Spatial Node Graph

- Each git worktree is a distinct visual cluster/group on the canvas.
- Each changed file is a node within its worktree cluster.
- Nodes are grouped by directory within each cluster.
- Node sizing/weight reflects amount of change (lines added + removed + modified).
- Each node shows at a glance:
  - Filename (truncated smartly)
  - Lines added / removed / changed (compact visual indicator, not raw numbers)
  - Staged vs unstaged distinction (e.g. border style or opacity difference)
- Click a node → opens the file diff in the editor.
- Smooth animations: nodes appear, update, and disappear with transitions (not jarring pops).

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

## Explicitly NOT in v0.1

- Risk scoring / configurable risk indicators (future feature)
- Change history / replay / timeline
- Any paid tier or licensing logic
- Settings UI / configuration panel
- Multi-repo support (only worktrees within one repo)
- Commit or staging actions from within Shiftspace (read-only view for now)
- Integration with any specific AI agent tooling
- Windows support (macOS/Linux first)

---

## Development Strategy: Preview-First

The renderer is built and tested outside of VSCode first, as a standalone web app deployable to Vercel. This lets us iterate on the visual design and interaction from any device (phone, laptop, tablet) without needing a VSCode dev environment running.

---

## Monorepo Structure

```
shiftspace/
├── packages/
│   └── renderer/          # The core React graph renderer (shared)
│       ├── components/    # React Flow nodes, clusters, overlays
│       ├── engine/        # Data model: worktrees, files, change events
│       ├── layout/        # ELK/dagre layout logic
│       ├── store/         # Zustand store (worktree state, zoom/LOD state)
│       └── index.ts       # Public API: <ShiftspaceRenderer data={...} />
├── apps/
│   ├── preview/           # Vite + React app, deployed to Vercel
│   │   ├── mock/          # Mock worktree engine + agent simulator
│   │   └── controls/      # UI to configure simulation
│   └── vscode-ext/        # VSCode extension (Phase 2)
│       └── ...            # Extension host that feeds real git data to renderer
├── package.json           # Workspace root (pnpm workspaces)
└── turbo.json             # Turborepo config
```

**Key architectural boundary:** `packages/renderer` accepts a data interface (worktrees, files, change events) and renders them. It has zero knowledge of where the data comes from — mock engine or real git.

---

## Data Interface (shared contract)

```typescript
interface WorktreeState {
  id: string;
  path: string;
  branch: string;
  files: FileChange[];
  process?: { port: number; command: string };
}

interface FileChange {
  path: string; // relative to worktree root
  status: 'added' | 'modified' | 'deleted';
  staged: boolean;
  linesAdded: number;
  linesRemoved: number;
  lastChangedAt: number; // timestamp, used for pulse animation
}

type ShiftspaceEvent =
  | { type: 'file-changed'; worktreeId: string; file: FileChange }
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

## Performance: Level-of-Detail (LOD) Zoom Strategy

The key to handling large repos without performance issues. The graph never renders hundreds of nodes at once — detail increases as you zoom in:

- **Zoomed out (overview):** Only worktree clusters visible as labeled nodes. See all worktrees, branch names, aggregate change counts. Max ~5-10 nodes on screen.
- **Mid zoom (directory level):** Zooming into a worktree expands it to show directory-level nodes. Each directory node shows aggregate stats (total files changed, lines added/removed). Unchanged directories hidden.
- **Zoomed in (file level):** Zooming into a directory expands it to show individual file nodes with per-file change stats, staged/unstaged indicators, and pulse animations.

React Flow's built-in virtualization handles off-screen culling; the LOD system handles on-screen density. Visible DOM node count should stay well under 100 at all times.

### Performance guidelines:

- All custom node components must be wrapped in `React.memo`.
- Use Zustand selectors to avoid re-rendering nodes that didn't change.
- Debounce filesystem watcher events (batch changes within a ~500ms window before re-querying git).
- LOD transitions should animate smoothly (expand/collapse with React Flow's built-in transitions).

---

## Tech Stack

| Layer               | Choice                                                                |
| ------------------- | --------------------------------------------------------------------- |
| Extension host      | VSCode Extension API (TypeScript)                                     |
| Webview rendering   | React (bundled into webview)                                          |
| Graph rendering     | React Flow (`@xyflow/react`)                                          |
| Graph layout        | ELK (`elkjs`), fallback to `dagre`                                    |
| State management    | Zustand                                                               |
| Git interaction     | Shell commands (`git worktree list`, `git status`, `git diff --stat`) |
| Filesystem watching | VSCode FileSystemWatcher API                                          |
| Port detection      | `lsof` / `netstat` (macOS/Linux first)                                |
| Build tooling       | Turborepo + pnpm workspaces                                           |
| Preview hosting     | Vite + Vercel                                                         |

---

## Development Phases

### Phase 1: Preview app + mock engine (build first)

- Set up monorepo with `packages/renderer` and `apps/preview`
- Implement mock worktree engine with agent simulation
- Build the renderer: React Flow graph with worktree clusters, file nodes, LOD zoom
- Deploy to Vercel — iterate on design from phone/laptop
- Goal: the preview looks and feels like the real thing

### Phase 2: VSCode extension (build second)

- Create `apps/vscode-ext` that wraps `packages/renderer` in a webview
- Replace mock data source with real git commands + filesystem watcher
- Implement Shift+Space keybinding, terminal launcher, port detection
- Goal: daily-driveable by you and colleagues

---

## Open Questions

1. **ELK vs dagre:** ELK is first choice for clustered layouts, but if bundle size or layout speed is an issue, dagre is the fallback. Prototype both early.
2. **LOD zoom thresholds:** What zoom levels trigger transitions between worktree → directory → file views? Needs prototyping.
3. **Filesystem watcher debounce tuning:** 500ms is a starting point. Too short = thrashing git commands. Too long = feels laggy.
4. **Windows support:** Port/process detection differs on Windows. Defer to v0.2.
5. **Naming:** Is "Shiftspace" available on the VSCode Marketplace?

---

## Goal

Ship something good enough that colleagues use it every day. Monetization comes later, once the product has proven itself organically. This is a craft project first.
