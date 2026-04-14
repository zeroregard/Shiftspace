// Preset file trees for mock worktrees
export const FILE_TREE_TEMPLATES = {
  nextjs: [
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'src/app/globals.css',
    'src/components/Header.tsx',
    'src/components/Footer.tsx',
    'src/components/Button.tsx',
    'src/lib/api.ts',
    'src/lib/utils.ts',
    'src/hooks/useAuth.ts',
    'src/hooks/useData.ts',
    'public/favicon.ico',
    'package.json',
    'next.config.ts',
    'tsconfig.json',
  ],
  api: [
    'src/routes/users.ts',
    'src/routes/auth.ts',
    'src/routes/products.ts',
    'src/middleware/auth.ts',
    'src/middleware/logger.ts',
    'src/models/User.ts',
    'src/models/Product.ts',
    'src/services/database.ts',
    'src/services/email.ts',
    'src/utils/validate.ts',
    'src/index.ts',
    'package.json',
    'tsconfig.json',
  ],
  monorepo: [
    'packages/ui/src/Button.tsx',
    'packages/ui/src/Input.tsx',
    'packages/ui/src/Modal.tsx',
    'packages/core/src/store.ts',
    'packages/core/src/api.ts',
    'apps/web/src/App.tsx',
    'apps/web/src/pages/Home.tsx',
    'apps/mobile/src/App.tsx',
    'turbo.json',
    'package.json',
  ],
  // Template that exercises deep single-chain collapsing + shared parents
  deep: [
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'src/hooks/useAuth.ts',
    'src/hooks/useData.ts',
    'lib/utils/helpers/format.ts',
    'config/env/production.ts',
    'package.json',
    'tsconfig.json',
    'README.md',
  ],
} as const;

export type TemplateKey = keyof typeof FILE_TREE_TEMPLATES;

export const WORKTREE_PRESETS: Array<{
  branch: string;
  path: string;
  template: TemplateKey;
  /** Upstream tracking branch in short form (e.g. "origin/main"). */
  upstream?: string;
  ahead?: number;
  behind?: number;
  upstreamGone?: boolean;
}> = [
  // In sync with remote — badge hidden.
  { branch: 'main', path: '/projects/myapp', template: 'nextjs', upstream: 'origin/main' },
  // Ahead only — local has unpushed commits.
  {
    branch: 'feature/auth',
    path: '/projects/myapp-auth',
    template: 'api',
    upstream: 'origin/feature/auth',
    ahead: 3,
  },
  // Behind only — remote has commits the local branch doesn't.
  {
    branch: 'refactor/components',
    path: '/projects/myapp-refactor',
    template: 'deep',
    upstream: 'origin/refactor/components',
    behind: 2,
  },
  // Diverged — both ahead and behind.
  {
    branch: 'fix/perf-issues',
    path: '/projects/myapp-perf',
    template: 'monorepo',
    upstream: 'origin/fix/perf-issues',
    ahead: 2,
    behind: 4,
  },
  // No upstream — local-only branch.
  { branch: 'experiment/wip', path: '/projects/myapp-wip', template: 'nextjs' },
];
