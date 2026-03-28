import type { WorktreeState, FileChange, ShiftspaceEvent } from '@shiftspace/renderer';

export const INITIAL_WORKTREES: WorktreeState[] = [
  {
    id: 'wt-main',
    path: '/home/user/project',
    branch: 'main',
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: true,
    files: [
      {
        path: 'src/app/page.tsx',
        status: 'modified',
        staged: true,
        linesAdded: 12,
        linesRemoved: 4,
        lastChangedAt: Date.now() - 5000,
      },
      {
        path: 'src/app/layout.tsx',
        status: 'modified',
        staged: false,
        linesAdded: 3,
        linesRemoved: 1,
        lastChangedAt: Date.now() - 12000,
      },
      {
        path: 'src/components/Button.tsx',
        status: 'added',
        staged: true,
        linesAdded: 45,
        linesRemoved: 0,
        lastChangedAt: Date.now() - 8000,
      },
      {
        path: 'src/components/Card.tsx',
        status: 'modified',
        staged: false,
        linesAdded: 8,
        linesRemoved: 3,
        lastChangedAt: Date.now() - 20000,
      },
      {
        path: 'src/hooks/useData.ts',
        status: 'added',
        staged: false,
        linesAdded: 28,
        linesRemoved: 0,
        lastChangedAt: Date.now() - 30000,
      },
      {
        path: 'package.json',
        status: 'modified',
        staged: true,
        linesAdded: 2,
        linesRemoved: 1,
        lastChangedAt: Date.now() - 60000,
      },
    ],
  },
  {
    id: 'wt-feature',
    path: '/home/user/project-feature-auth',
    branch: 'feature/auth',
    diffMode: { type: 'branch', branch: 'main' },
    defaultBranch: 'main',
    isMainWorktree: false,
    files: [
      {
        path: 'src/app/auth/login/page.tsx',
        status: 'added',
        staged: false,
        linesAdded: 72,
        linesRemoved: 0,
        lastChangedAt: Date.now() - 3000,
      },
      {
        path: 'src/app/auth/register/page.tsx',
        status: 'added',
        staged: false,
        linesAdded: 58,
        linesRemoved: 0,
        lastChangedAt: Date.now() - 6000,
      },
      {
        path: 'src/lib/auth.ts',
        status: 'added',
        staged: true,
        linesAdded: 120,
        linesRemoved: 0,
        lastChangedAt: Date.now() - 15000,
      },
      {
        path: 'src/middleware.ts',
        status: 'modified',
        staged: true,
        linesAdded: 18,
        linesRemoved: 5,
        lastChangedAt: Date.now() - 25000,
      },
      {
        path: 'src/components/AuthForm.tsx',
        status: 'added',
        staged: false,
        linesAdded: 89,
        linesRemoved: 0,
        lastChangedAt: Date.now() - 10000,
      },
    ],
    process: { port: 3001, command: 'pnpm dev' },
  },
];

const MAIN_FILES = [
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'src/hooks/useData.ts',
];

const FEATURE_FILES = [
  'src/app/auth/login/page.tsx',
  'src/app/auth/register/page.tsx',
  'src/lib/auth.ts',
  'src/middleware.ts',
  'src/components/AuthForm.tsx',
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type EventCallback = (event: ShiftspaceEvent) => void;

export function startMockUpdates(onEvent: EventCallback): () => void {
  let stopped = false;

  function scheduleNext() {
    if (stopped) return;
    const delay = rand(2500, 5000);
    setTimeout(() => {
      if (stopped) return;

      const worktreeId = Math.random() < 0.5 ? 'wt-main' : 'wt-feature';
      const files = worktreeId === 'wt-main' ? MAIN_FILES : FEATURE_FILES;

      const file: FileChange = {
        path: pick(files),
        status: 'modified',
        staged: Math.random() < 0.3,
        linesAdded: rand(1, 30),
        linesRemoved: rand(0, 15),
        lastChangedAt: Date.now(),
      };

      onEvent({ type: 'file-changed', worktreeId, file });
      scheduleNext();
    }, delay);
  }

  scheduleNext();
  return () => {
    stopped = true;
  };
}
