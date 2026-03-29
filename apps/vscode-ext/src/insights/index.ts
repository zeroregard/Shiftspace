export { InsightRegistry, insightRegistry } from './registry';
export { InsightRunner } from './runner';
export { loadInsightConfigs } from './settingsLoader';
export type {
  InsightConfig,
  InsightSummary,
  InsightDetail,
  InsightPlugin,
  InsightSeverity,
} from './types';

// Register all plugins (side-effect imports)
import './plugins/duplication';
