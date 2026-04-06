// Re-export the InsightRunner from core, pre-configured with VSCode settings.
import { InsightRunner as CoreInsightRunner } from '@shiftspace/core';
import { isInsightEnabled, getInsightSettings } from './settingsLoader';

/**
 * VSCode-aware InsightRunner that reads enabled/disabled state and settings
 * from vscode.workspace.getConfiguration.
 *
 * Drop-in replacement: `new InsightRunner()` just works.
 */
export class InsightRunner extends CoreInsightRunner {
  constructor() {
    super({
      isInsightEnabled,
      getInsightSettings,
    });
  }
}
