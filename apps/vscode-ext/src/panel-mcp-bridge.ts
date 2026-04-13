import type { WorktreeState } from '@shiftspace/renderer';
import type { ShiftspaceMcpHttpServer } from './mcp/http-server';
import type { GitDataProvider } from './git-data-provider';
import type { ActionCoordinator } from './actions/action-coordinator';
import type { InsightRunner } from './insights/runner';
import { collectDiagnostics } from './insights/plugins/diagnostics';
import { McpToolHandlers } from './mcp/handlers';

export interface McpBridgeOpts {
  server: ShiftspaceMcpHttpServer;
  gitProvider: GitDataProvider;
  coordinator: ActionCoordinator;
  insightRunner: InsightRunner | undefined;
  repoRoot: string;
}

export function registerMcpHandlers(opts: McpBridgeOpts): void {
  const { server, gitProvider, coordinator, insightRunner, repoRoot } = opts;

  const handlers = new McpToolHandlers({
    worktreeProvider: {
      getWorktrees(): WorktreeState[] {
        const infos = gitProvider.getWorktrees();
        return infos.map((info) => ({
          id: info.id,
          path: info.path,
          branch: info.branch,
          files: gitProvider.getWorktreeFiles(info.id),
          diffMode: { type: 'working' as const },
          defaultBranch: 'main',
          isMainWorktree: false,
          lastActivityAt: 0,
        }));
      },
    },
    configLoader: coordinator['configLoader'] as import('./actions/config-loader').ConfigLoader,
    stateManager: coordinator['stateManager'] as import('./actions/state-manager').StateManager,
    repoRoot,
    getPackageName: () => (coordinator['selectedPackage'] as string) ?? '',
    collectDiagnostics,
    insightRunner,
    getSmellRules: () => coordinator.getSmellRules(),
  });

  server.setHandlers(handlers);
}
