import type { WorktreeState, FileChange, ShiftspaceEvent } from '@shiftspace/renderer';
import type { AgentConfig, AgentPersona } from './types';
import { FILE_TREE_TEMPLATES, WORKTREE_PRESETS, type TemplateKey } from './templates';

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

  return {
    path,
    status: pick(statuses),
    staged,
    linesAdded,
    linesRemoved,
    lastChangedAt: Date.now(),
  };
}

export class MockEngine {
  private worktrees = new Map<string, WorktreeState>();
  private agents = new Map<string, AgentConfig & { timer?: ReturnType<typeof setTimeout> }>();
  private handlers = new Set<EventHandler>();
  private paused = false;
  private speedMultiplier = 1;

  constructor() {
    // Initialize with first two preset worktrees
    WORKTREE_PRESETS.slice(0, 2).forEach((preset, i) => {
      this.addWorktree(`wt-${i}`, preset.branch, preset.path, preset.template);
    });
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: ShiftspaceEvent) {
    this.handlers.forEach((h) => h(event));
  }

  getWorktrees(): WorktreeState[] {
    return Array.from(this.worktrees.values());
  }

  private templateMap = new Map<string, TemplateKey>();

  addWorktree(id: string, branch: string, path: string, template: TemplateKey) {
    const wt: WorktreeState = { id, path, branch, files: [] };
    this.worktrees.set(id, wt);
    this.templateMap.set(id, template);
    this.emit({ type: 'worktree-added', worktree: wt });
  }

  addPresetWorktree(presetIndex: number) {
    const preset = WORKTREE_PRESETS[presetIndex % WORKTREE_PRESETS.length];
    const id = `wt-${Date.now()}`;
    this.addWorktree(id, preset.branch, preset.path, preset.template);
    return id;
  }

  removeWorktree(id: string) {
    this.stopAgent(id);
    this.worktrees.delete(id);
    this.emit({ type: 'worktree-removed', worktreeId: id });
  }

  startAgent(worktreeId: string, persona: AgentPersona) {
    const agentId = `agent-${worktreeId}`;
    this.stopAgent(agentId);

    const wt = this.worktrees.get(worktreeId);
    if (!wt) return;

    const templateKey = this.templateMap.get(worktreeId) ?? 'nextjs';
    const template = FILE_TREE_TEMPLATES[templateKey];
    const agentConfig: AgentConfig & { timer?: ReturnType<typeof setTimeout> } = {
      id: agentId,
      persona,
      worktreeId,
      speed: persona === 'refactor' ? 800 : persona === 'feature' ? 1500 : 2000,
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
        setTimeout(
          () => {
            this.emit({ type: 'file-staged', worktreeId, filePath });
          },
          rand(200, 800)
        );
      }

      // Occasionally simulate a dev server
      if (Math.random() < 0.05 && !wt.process) {
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
    if (agent?.timer) clearTimeout(agent.timer);
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
    });
    this.agents.clear();
    this.worktrees.forEach((wt) => {
      this.emit({ type: 'worktree-removed', worktreeId: wt.id });
    });
    this.worktrees.clear();

    // Re-initialize
    WORKTREE_PRESETS.slice(0, 2).forEach((preset, i) => {
      this.addWorktree(`wt-${i}`, preset.branch, preset.path, preset.template);
    });
  }

  destroy() {
    this.agents.forEach((agent) => {
      if (agent.timer) clearTimeout(agent.timer);
    });
    this.agents.clear();
    this.handlers.clear();
  }
}
