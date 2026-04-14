/* eslint-disable max-lines -- TODO: decompose in a follow-up PR */
import type {
  WorktreeState,
  FileChange,
  ShiftspaceEvent,
  DiffHunk,
  DiffLine,
  DiffMode,
} from '@shiftspace/renderer';
import type { AgentConfig, AgentPersona } from './types';
import { FILE_TREE_TEMPLATES, WORKTREE_PRESETS, type TemplateKey } from './templates';

const SAMPLE_LINES: Record<string, string[]> = {
  ts: [
    "import { useEffect, useState } from 'react';",
    'export function useData(id: string) {',
    '  const [data, setData] = useState(null);',
    '  useEffect(() => { fetchData(id).then(setData); }, [id]);',
    '  return data;',
    '}',
    'async function fetchData(id: string) {',
    '  return fetch(`/api/data/${id}`).then(r => r.json());',
  ],
  tsx: [
    "import React from 'react';",
    'export const Card = ({ title, children }: Props) => (',
    '  <div className="card">',
    '    <h2>{title}</h2>',
    '    <div className="content">{children}</div>',
    '  </div>',
    ');',
    'Card.displayName = "Card";',
  ],
  css: [
    '.container { display: flex; flex-direction: column; }',
    '.header { font-size: 1.25rem; font-weight: 600; }',
    '.body { padding: 1rem; }',
    '@media (max-width: 768px) { .container { flex-direction: row; } }',
    '.footer { border-top: 1px solid var(--border); }',
    '.button { cursor: pointer; border-radius: 0.25rem; }',
    '.button:hover { opacity: 0.8; }',
    '.icon { width: 1rem; height: 1rem; }',
  ],
  json: [
    '{',
    '  "name": "shiftspace",',
    '  "version": "0.1.0",',
    '  "type": "module",',
    '  "scripts": {',
    '    "dev": "vite",',
    '    "build": "tsc && vite build"',
    '  }',
  ],
};

const FALLBACK_LINES = [
  'function init() {',
  '  const config = loadConfig();',
  '  setup(config);',
  '  return run();',
  '}',
  'module.exports = { init };',
  '// end of file',
  'const VERSION = "0.1.0";',
];

function getSampleLines(path: string): string[] {
  const ext = path.split('.').pop() ?? '';
  return SAMPLE_LINES[ext] ?? FALLBACK_LINES;
}

function hunksToRawDiff(filePath: string, hunks: DiffHunk[], status: FileChange['status']): string {
  const oldPath = status === 'added' ? '/dev/null' : `a/${filePath}`;
  const newPath = status === 'deleted' ? '/dev/null' : `b/${filePath}`;
  const lines: string[] = [`--- ${oldPath}`, `+++ ${newPath}`];
  for (const hunk of hunks) {
    lines.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      lines.push(`${prefix}${line.content}`);
    }
  }
  return lines.join('\n');
}

function makeDiff(
  path: string,
  linesAdded: number,
  linesRemoved: number,
  status: FileChange['status']
): DiffHunk[] {
  const lines = getSampleLines(path);
  const cap = (n: number) => Math.min(n, 8);

  if (status === 'added') {
    const count = cap(linesAdded);
    const diffLines: DiffLine[] = lines
      .slice(0, count)
      .map((content) => ({ type: 'added', content }));
    return [{ header: `@@ -0,0 +1,${count} @@`, lines: diffLines }];
  }

  if (status === 'deleted') {
    const count = cap(linesRemoved);
    const diffLines: DiffLine[] = lines
      .slice(0, count)
      .map((content) => ({ type: 'removed', content }));
    return [{ header: `@@ -1,${count} +0,0 @@`, lines: diffLines }];
  }

  // modified: 1–2 hunks
  const total = linesAdded + linesRemoved;
  const addCount = cap(linesAdded);
  const removeCount = cap(linesRemoved);

  const hunk1Lines: DiffLine[] = [
    { type: 'context', content: lines[0] ?? '' },
    { type: 'context', content: lines[1] ?? '' },
    ...lines.slice(2, 2 + removeCount).map<DiffLine>((content) => ({ type: 'removed', content })),
    ...lines.slice(2, 2 + addCount).map<DiffLine>((content) => ({ type: 'added', content })),
    { type: 'context', content: lines[lines.length - 1] ?? '' },
  ];

  if (total <= 10) {
    return [
      { header: `@@ -1,${2 + removeCount + 1} +1,${2 + addCount + 1} @@`, lines: hunk1Lines },
    ];
  }

  const hunk2Lines: DiffLine[] = [
    { type: 'context', content: lines[3] ?? '' },
    { type: 'context', content: lines[4] ?? '' },
    { type: 'removed', content: lines[5] ?? '' },
    { type: 'added', content: lines[6] ?? '' },
    { type: 'context', content: lines[7] ?? '' },
  ];

  return [
    { header: `@@ -1,${2 + removeCount + 1} +1,${2 + addCount + 1} @@`, lines: hunk1Lines },
    { header: '@@ -20,5 +20,5 @@', lines: hunk2Lines },
  ];
}

type EventHandler = (event: ShiftspaceEvent) => void;

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeFile(path: string, persona: AgentPersona, staged = false): FileChange {
  const linesAdded =
    persona === 'refactor' ? rand(1, 20) : persona === 'feature' ? rand(10, 80) : rand(5, 50);
  const linesRemoved =
    persona === 'refactor' ? rand(1, 20) : persona === 'bugfix' ? rand(5, 40) : rand(0, 10);
  const statuses: FileChange['status'][] =
    persona === 'feature'
      ? ['added', 'modified', 'modified']
      : persona === 'refactor'
        ? ['modified', 'modified', 'deleted']
        : ['modified', 'modified'];

  const status = pick(statuses);
  const diff = makeDiff(path, linesAdded, linesRemoved, status);
  return {
    path,
    status,
    staged,
    linesAdded,
    linesRemoved,
    lastChangedAt: Date.now(),
    diff,
    rawDiff: hunksToRawDiff(path, diff, status),
  };
}

/** Mock branches for the diff mode selector. */
export const MOCK_BRANCHES = [
  'main',
  'feature/auth',
  'refactor/components',
  'fix/perf-issues',
  'develop',
  'feature/dashboard',
  'feature/settings',
  'hotfix/login',
];

const DEFAULT_BRANCH = 'main';

export class MockEngine {
  private worktrees = new Map<string, WorktreeState>();
  private agents = new Map<
    string,
    AgentConfig & {
      timer?: ReturnType<typeof setTimeout>;
      pendingTimers: Set<ReturnType<typeof setTimeout>>;
    }
  >();
  private handlers = new Set<EventHandler>();
  private paused = false;
  private speedMultiplier = 1;

  constructor() {
    // Initialize with first two preset worktrees
    WORKTREE_PRESETS.slice(0, 2).forEach((preset, i) => {
      this.addWorktree({
        id: `wt-${i}`,
        branch: preset.branch,
        path: preset.path,
        template: preset.template,
        isMainWorktree: i === 0,
        upstream: preset.upstream,
        ahead: preset.ahead,
        behind: preset.behind,
        upstreamGone: preset.upstreamGone,
      });
    });
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: ShiftspaceEvent) {
    this.handlers.forEach((h) => h(event));
  }

  /**
   * Exposed for the test-only `MockGitProvider` so it can emit lifecycle
   * events (e.g. `worktree-removal-failed`) that don't map to an existing
   * engine mutation. Keep callers to the mock layer — production code paths
   * should use the typed mutation methods.
   */
  publicEmit(event: ShiftspaceEvent): void {
    this.emit(event);
  }

  /** Used by the mock git provider to simulate `handleCheckoutBranch`. */
  setBranch(worktreeId: string, branch: string): void {
    const wt = this.worktrees.get(worktreeId);
    if (!wt) return;
    const updated: WorktreeState = { ...wt, branch };
    this.worktrees.set(worktreeId, updated);
    this.emit({ type: 'worktree-added', worktree: updated });
  }

  getWorktrees(): WorktreeState[] {
    return Array.from(this.worktrees.values());
  }

  private templateMap = new Map<string, TemplateKey>();

  addWorktree(opts: {
    id: string;
    branch: string;
    path: string;
    template: TemplateKey;
    isMainWorktree?: boolean;
    upstream?: string;
    ahead?: number;
    behind?: number;
    upstreamGone?: boolean;
  }) {
    const {
      id,
      branch,
      path,
      template,
      isMainWorktree = false,
      upstream,
      ahead,
      behind,
      upstreamGone,
    } = opts;
    const isDefault = branch === DEFAULT_BRANCH;
    const diffMode: DiffMode = isDefault
      ? { type: 'working' }
      : { type: 'branch', branch: DEFAULT_BRANCH };
    // Register template before generating files (getMock* reads it)
    this.templateMap.set(id, template);
    const files = this.getMockWorkingFiles(id);
    const branchFiles = isDefault ? undefined : this.getMockBranchFiles(id);
    const wt: WorktreeState = {
      id,
      path,
      branch,
      files,
      branchFiles,
      diffMode,
      defaultBranch: DEFAULT_BRANCH,
      isMainWorktree,
      lastActivityAt: Date.now(),
      upstream,
      ahead,
      behind,
      upstreamGone,
    };
    this.worktrees.set(id, wt);
    this.emit({ type: 'worktree-added', worktree: wt });
  }

  addPresetWorktree(presetIndex: number) {
    const preset = WORKTREE_PRESETS[presetIndex % WORKTREE_PRESETS.length];
    const id = `wt-${Date.now()}`;
    this.addWorktree({
      id,
      branch: preset.branch,
      path: preset.path,
      template: preset.template,
      upstream: preset.upstream,
      ahead: preset.ahead,
      behind: preset.behind,
      upstreamGone: preset.upstreamGone,
    });
    return id;
  }

  removeWorktree(id: string) {
    if (!this.worktrees.has(id)) return;
    // Emit pending immediately so the card shows a spinner. Keep the delay
    // short (< the controls.spec.ts 500ms post-click wait) so the e2e
    // snapshot captures the final "worktree gone" state deterministically
    // — an animate-pulse/spinner frame would be non-deterministic between
    // runs and fail the `maxDiffPixelRatio: 0.0001` threshold.
    this.emit({ type: 'worktree-removal-pending', worktreeId: id });
    setTimeout(() => {
      if (!this.worktrees.has(id)) return;
      this.stopAgent(id);
      this.worktrees.delete(id);
      this.emit({ type: 'worktree-removed', worktreeId: id });
    }, 250);
  }

  renameWorktree(id: string, newPath: string) {
    const wt = this.worktrees.get(id);
    if (!wt) return;
    const updated = { ...wt, path: newPath };
    this.worktrees.set(id, updated);
    this.emit({ type: 'worktree-added', worktree: updated });
  }

  /** Generate mock files for a working diff (staged + unstaged mix). */
  getMockWorkingFiles(worktreeId: string): FileChange[] {
    const templateKey = this.templateMap.get(worktreeId) ?? 'nextjs';
    const template = FILE_TREE_TEMPLATES[templateKey];
    const count = Math.max(2, Math.floor(template.length * (0.3 + Math.random() * 0.3)));
    const shuffled = [...template].sort(() => Math.random() - 0.5);
    // Reserve one well-known path for the partially staged entry (added below).
    const partialPath = template[0];
    const selected = shuffled.filter((p) => p !== partialPath).slice(0, count);
    const now = Date.now();
    const files: FileChange[] = selected.map((filePath, i) => {
      const linesAdded = rand(1, 40);
      const linesRemoved = rand(0, 20);
      const statuses: FileChange['status'][] = ['added', 'modified', 'modified', 'modified'];
      const status = pick(statuses);
      const diff = makeDiff(filePath, linesAdded, linesRemoved, status);
      // Alternate staged/unstaged so both sections are visible
      const staged = i % 3 !== 0;
      return {
        path: filePath,
        status,
        staged,
        linesAdded,
        linesRemoved,
        lastChangedAt: now,
        diff,
        rawDiff: hunksToRawDiff(filePath, diff, status),
      };
    });

    // Always include one partially staged file (simulates `git add -p`) so
    // the Inspector list view demonstrates that a file can appear in both
    // the Staged and Unstaged sections simultaneously.
    const partialDiff = makeDiff(partialPath, 8, 3, 'modified');
    files.unshift({
      path: partialPath,
      status: 'modified',
      staged: true,
      partiallyStaged: true,
      linesAdded: 8,
      linesRemoved: 3,
      lastChangedAt: now,
      diff: partialDiff,
      rawDiff: hunksToRawDiff(partialPath, partialDiff, 'modified'),
    });

    return files;
  }

  /** Generate mock files for a branch diff (different subset from working diff). */
  getMockBranchFiles(worktreeId: string): FileChange[] {
    const templateKey = this.templateMap.get(worktreeId) ?? 'nextjs';
    const template = FILE_TREE_TEMPLATES[templateKey];
    // Pick a random subset of ~40-60% of files to simulate branch diff
    const count = Math.max(2, Math.floor(template.length * (0.4 + Math.random() * 0.2)));
    const shuffled = [...template].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    const now = Date.now();

    return selected.map((filePath) => {
      const linesAdded = rand(5, 60);
      const linesRemoved = rand(0, 30);
      const statuses: FileChange['status'][] = ['added', 'modified', 'modified', 'modified'];
      const status = pick(statuses);
      const diff = makeDiff(filePath, linesAdded, linesRemoved, status);
      return {
        path: filePath,
        status,
        staged: false,
        committed: true,
        linesAdded,
        linesRemoved,
        lastChangedAt: now,
        diff,
        rawDiff: hunksToRawDiff(filePath, diff, status),
      };
    });
  }

  /** Generate mock files representing all tracked files in the repo (for "All files" mode). */
  getMockRepoFiles(worktreeId: string): FileChange[] {
    const templateKey = this.templateMap.get(worktreeId) ?? 'nextjs';
    const template = FILE_TREE_TEMPLATES[templateKey];
    const now = Date.now();

    return template.map((filePath) => {
      const diff = makeDiff(filePath, 0, 0, 'modified');
      return {
        path: filePath,
        status: 'modified' as const,
        staged: false,
        committed: true,
        linesAdded: 0,
        linesRemoved: 0,
        lastChangedAt: now,
        diff,
        rawDiff: hunksToRawDiff(filePath, diff, 'modified'),
      };
    });
  }

  /**
   * Returns committed (branch diff) + staged/unstaged (working tree) files combined.
   * Used for branch-mode worktrees so all three list sections are populated.
   */
  getMockAllBranchFiles(worktreeId: string): FileChange[] {
    const templateKey = this.templateMap.get(worktreeId) ?? 'nextjs';
    const template = FILE_TREE_TEMPLATES[templateKey];
    const shuffled = [...template].sort(() => Math.random() - 0.5);
    // First ~40% → committed, next ~25% → staged/unstaged working changes
    const committedCount = Math.max(2, Math.floor(shuffled.length * 0.4));
    const workingCount = Math.max(1, Math.floor(shuffled.length * 0.25));
    const committedPaths = shuffled.slice(0, committedCount);
    const workingPaths = shuffled.slice(committedCount, committedCount + workingCount);
    const now = Date.now();

    const committedFiles: FileChange[] = committedPaths.map((filePath) => {
      const linesAdded = rand(5, 60);
      const linesRemoved = rand(0, 30);
      const status = pick<FileChange['status']>(['added', 'modified', 'modified', 'modified']);
      const diff = makeDiff(filePath, linesAdded, linesRemoved, status);
      return {
        path: filePath,
        status,
        staged: false,
        committed: true,
        linesAdded,
        linesRemoved,
        lastChangedAt: now,
        diff,
        rawDiff: hunksToRawDiff(filePath, diff, status),
      };
    });

    const workingFiles: FileChange[] = workingPaths.map((filePath, i) => {
      const linesAdded = rand(1, 30);
      const linesRemoved = rand(0, 15);
      const status = pick<FileChange['status']>(['modified', 'modified', 'added']);
      const diff = makeDiff(filePath, linesAdded, linesRemoved, status);
      const staged = i % 2 === 0;
      return {
        path: filePath,
        status,
        staged,
        committed: false,
        linesAdded,
        linesRemoved,
        lastChangedAt: now,
        diff,
        rawDiff: hunksToRawDiff(filePath, diff, status),
      };
    });

    return [...committedFiles, ...workingFiles];
  }

  startAgent(worktreeId: string, persona: AgentPersona) {
    this.stopAgent(worktreeId);

    if (!this.worktrees.has(worktreeId)) return;

    const templateKey = this.templateMap.get(worktreeId) ?? 'nextjs';
    const template = FILE_TREE_TEMPLATES[templateKey];
    const agentId = `agent-${worktreeId}`;
    const agentConfig: AgentConfig & {
      timer?: ReturnType<typeof setTimeout>;
      pendingTimers: Set<ReturnType<typeof setTimeout>>;
    } = {
      id: agentId,
      persona,
      worktreeId,
      speed: persona === 'refactor' ? 800 : persona === 'feature' ? 1500 : 2000,
      pendingTimers: new Set(),
    };

    const tick = () => {
      if (this.paused) {
        agentConfig.timer = setTimeout(tick, 500);
        return;
      }

      const filePath = pick(template);
      const file = makeFile(filePath, persona);
      this.emit({ type: 'file-changed', worktreeId, file });

      // Occasionally stage a file
      if (Math.random() < 0.3) {
        const stageTimer = setTimeout(
          () => {
            agentConfig.pendingTimers.delete(stageTimer);
            this.emit({ type: 'file-staged', worktreeId, filePath });
          },
          rand(200, 800)
        );
        agentConfig.pendingTimers.add(stageTimer);
      }

      // Occasionally simulate a dev server — read live worktree state
      const currentWt = this.worktrees.get(worktreeId);
      if (currentWt && Math.random() < 0.05 && !currentWt.process) {
        const port = pick([3000, 3001, 8080, 5173]);
        this.emit({ type: 'process-started', worktreeId, port, command: 'pnpm dev' });
      }

      const interval = (agentConfig.speed / this.speedMultiplier) * (0.5 + Math.random());
      agentConfig.timer = setTimeout(tick, interval);
    };

    agentConfig.timer = setTimeout(tick, rand(100, 500));
    this.agents.set(agentId, agentConfig);
  }

  stopAgent(agentIdOrWorktreeId: string) {
    // Accept either agent ID or worktree ID
    const agentId = agentIdOrWorktreeId.startsWith('agent-')
      ? agentIdOrWorktreeId
      : `agent-${agentIdOrWorktreeId}`;
    const agent = this.agents.get(agentId);
    if (agent) {
      if (agent.timer) clearTimeout(agent.timer);
      for (const t of agent.pendingTimers) clearTimeout(t);
      agent.pendingTimers.clear();
    }
    this.agents.delete(agentId);
  }

  isAgentRunning(worktreeId: string): boolean {
    return this.agents.has(`agent-${worktreeId}`);
  }

  setSpeed(multiplier: number) {
    this.speedMultiplier = multiplier;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  reset() {
    this.agents.forEach((agent) => {
      if (agent.timer) clearTimeout(agent.timer);
      for (const t of agent.pendingTimers) clearTimeout(t);
    });
    this.agents.clear();
    this.worktrees.forEach((wt) => {
      this.emit({ type: 'worktree-removed', worktreeId: wt.id });
    });
    this.worktrees.clear();

    // Re-initialize
    WORKTREE_PRESETS.slice(0, 2).forEach((preset, i) => {
      this.addWorktree({
        id: `wt-${i}`,
        branch: preset.branch,
        path: preset.path,
        template: preset.template,
        isMainWorktree: i === 0,
        upstream: preset.upstream,
        ahead: preset.ahead,
        behind: preset.behind,
        upstreamGone: preset.upstreamGone,
      });
    });
  }

  destroy() {
    this.agents.forEach((agent) => {
      if (agent.timer) clearTimeout(agent.timer);
      for (const t of agent.pendingTimers) clearTimeout(t);
    });
    this.agents.clear();
    this.handlers.clear();
  }
}
