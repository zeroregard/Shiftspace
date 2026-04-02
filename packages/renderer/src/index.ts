export { ShiftspaceRenderer, type PanZoomConfig } from './ShiftspaceRenderer';
export {
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  getFileFindings,
  useInspectionStore,
  usePackageStore,
} from './store';

// Views (consumers may embed them independently)
export { GroveView } from './views/grove';
export { InspectionView } from './views/inspection';

// Canvas nodes (needed by TreeCanvas NODE_TYPES map consumers)
export { WorktreeNode, FolderNode, FileNode } from './nodes';

// Overlays
export { DiffPopover } from './overlays/DiffPopover';
export { BranchPicker, type StaticOption } from './overlays/BranchPicker';

// Shared primitives
export { ThemedFileIcon } from './shared/ThemedFileIcon';
export { PackageSwitcher } from './shared/PackageSwitcher';

// Design system
export {
  AnnotationBadges,
  Badge,
  Codicon,
  IconButton,
  Input,
  ListItem,
  SectionLabel,
  Spinner,
  StatusDot,
  ActionsProvider,
  useActions,
  type ShiftspaceActions,
} from './ui';

// Hooks
export { useFileAnnotations, type FileAnnotations } from './hooks/useFileAnnotations';

// All types
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
