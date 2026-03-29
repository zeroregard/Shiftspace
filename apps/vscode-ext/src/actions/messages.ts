import type { SerializedActionState } from './types';

// Messages FROM the extension host TO the webview

export type ActionHostMessage =
  | {
      type: 'action-state-update';
      worktreeId: string;
      actionId: string;
      state: SerializedActionState;
    }
  | {
      type: 'action-log-chunk';
      worktreeId: string;
      actionId: string;
      chunk: string;
      isStderr: boolean;
    }
  | {
      type: 'action-log';
      worktreeId: string;
      actionId: string;
      content: string;
    }
  | {
      type: 'actions-config-v2';
      actions: Array<{
        id: string;
        label: string;
        type: 'check' | 'service';
        icon: string;
      }>;
      pipelines?: Record<string, { steps: string[]; stopOnFailure: boolean }>;
      selectedPackage: string;
    }
  | {
      type: 'packages-list';
      packages: string[];
    };

// Messages FROM the webview TO the extension host

export type ActionWebviewMessage =
  | { type: 'run-action'; worktreeId: string; actionId: string }
  | { type: 'stop-action'; worktreeId: string; actionId: string }
  | { type: 'run-pipeline'; worktreeId: string; pipelineId: string }
  | { type: 'cancel-pipeline'; worktreeId: string }
  | { type: 'get-log'; worktreeId: string; actionId: string }
  | { type: 'set-package'; packageName: string }
  | { type: 'detect-packages' };
