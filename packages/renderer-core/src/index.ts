// Types
export type {
  WorktreeState,
  FileChange,
  ShiftspaceEvent,
  LODLevel,
  DiffLine,
  DiffHunk,
  DiffMode,
  ActionConfig,
  ActionState,
  ActionStatus,
  AppMode,
  IconEntry,
  IconMap,
  PipelineConfig,
  LogEntry,
  InsightFinding,
  FileInsight,
  InsightDetail,
  FileDiagnosticSummary,
} from './types';

// Canvas
export { TreeCanvas, type LayoutNode, type LayoutEdge, type PanZoomConfig } from './tree-canvas';
export type { NodeComponentProps } from './tree-canvas';

// Store
export {
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  getFileFindings,
  useInspectionStore,
  usePackageStore,
} from './store';

// Nodes
export { WorktreeNode, FolderNode, FileNode, NODE_TYPES } from './nodes';

// Layout
export { computeSingleWorktreeLayout, computeFullLayout } from './layout';

// Shared
export { UnifiedHeader } from './shared/unified-header';
export { ThemedFileIcon } from './shared/themed-file-icon';
export { PackageSwitcher } from './shared/package-switcher';
export { InspectionHoverContext, useInspectionHover } from './shared/inspection-hover-context';
export { FileRowButton } from './shared/file-row-button';

// UI
export {
  AnnotationBadges,
  Badge,
  Codicon,
  IconButton,
  Input,
  ListItem,
  SectionLabel,
  Spinner,
  ActionsProvider,
  useActions,
  type ShiftspaceActions,
} from './ui';

// Hooks
export { useFileAnnotations, type FileAnnotations } from './hooks/use-file-annotations';
export { useWorktreeRename } from './hooks/use-worktree-rename';

// Overlays
export { DiffPopover } from './overlays/diff-popover';
export { BranchPicker, type StaticOption } from './overlays/branch-picker';

// Utils
export { storeKey, storeKeyPrefix } from './utils/store-keys';
export { filterCheckoutableBranches } from './utils/worktree-utils';
export { deriveActionType, statusIcon, statusColor } from './utils/action-utils';
export {
  partitionFiles,
  matchesFileFilter,
  isValidRegex,
  filterFilesByQuery,
  filterFilesByProblems,
  fileHasProblems,
  getAllFilteredFiles,
} from './utils/list-sections';
export { getSourceLineFromHunks } from './utils/diff-line-lookup';

// UI (additional)
export { DiagnosticTooltipContent, FindingTooltipContent } from './ui/diagnostic-tooltip-content';

// Components (shared between views)
export { ActionBar } from './components/action-bar';
