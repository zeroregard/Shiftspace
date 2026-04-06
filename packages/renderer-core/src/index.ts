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
export { TreeCanvas, type LayoutNode, type LayoutEdge, type PanZoomConfig } from './TreeCanvas';
export type { NodeComponentProps } from './TreeCanvas';

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
export { UnifiedHeader } from './shared/UnifiedHeader';
export { ThemedFileIcon } from './shared/ThemedFileIcon';
export { PackageSwitcher } from './shared/PackageSwitcher';
export { InspectionHoverContext, useInspectionHover } from './shared/InspectionHoverContext';
export { FileRowButton } from './shared/FileRowButton';

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
export { useFileAnnotations, type FileAnnotations } from './hooks/useFileAnnotations';
export { useWorktreeRename } from './hooks/useWorktreeRename';

// Overlays
export { DiffPopover } from './overlays/DiffPopover';
export { BranchPicker, type StaticOption } from './overlays/BranchPicker';

// Utils
export { storeKey, storeKeyPrefix } from './utils/storeKeys';
export { filterCheckoutableBranches } from './utils/worktreeUtils';
export { deriveActionType, statusIcon, statusColor } from './utils/actionUtils';
export {
  partitionFiles,
  matchesFileFilter,
  isValidRegex,
  filterFilesByQuery,
  filterFilesByProblems,
  fileHasProblems,
  getAllFilteredFiles,
} from './utils/listSections';
export { getSourceLineFromHunks } from './utils/diffLineLookup';

// UI (additional)
export { DiagnosticTooltipContent, FindingTooltipContent } from './ui/DiagnosticTooltipContent';

// Components (shared between views)
export { ActionBar } from './components/ActionBar';
