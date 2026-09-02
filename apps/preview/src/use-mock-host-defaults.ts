import { useEffect } from 'react';
import {
  useActionStore,
  useSettingsStore,
  DEFAULT_WORKTREE_VISIBILITY,
} from '@shiftspace/renderer';
import { MOCK_ACTION_CONFIGS, MOCK_PIPELINES } from './mock/actions';

/**
 * Seeds the stores with everything the extension host pushes on webview open:
 * the action/pipeline config and the `settings-update` payload. Re-runs on
 * reset so the preview always starts from the extension's defaults.
 */
export function useMockHostDefaults(resetKey: number): void {
  const setActionConfigs = useActionStore((s) => s.setActionConfigs);
  const setPipelines = useActionStore((s) => s.setPipelines);
  const setTicketUrlTemplate = useSettingsStore((s) => s.setTicketUrlTemplate);
  const setWorktreeDiffCount = useSettingsStore((s) => s.setWorktreeDiffCount);
  const setWorktreeVisibility = useSettingsStore((s) => s.setWorktreeVisibility);

  useEffect(() => {
    setActionConfigs(MOCK_ACTION_CONFIGS);
    setPipelines(MOCK_PIPELINES);
    // The ticket template is empty by default so the ticket link stays hidden
    // until a control-panel input / test hook sets it.
    setTicketUrlTemplate('');
    setWorktreeDiffCount('working');
    setWorktreeVisibility(DEFAULT_WORKTREE_VISIBILITY);
  }, [
    resetKey,
    setActionConfigs,
    setPipelines,
    setTicketUrlTemplate,
    setWorktreeDiffCount,
    setWorktreeVisibility,
  ]);
}
