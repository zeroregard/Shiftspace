export { ShiftspaceRenderer, type PanZoomConfig } from './ShiftspaceRenderer';
export { useShiftspaceStore } from './store';

// Views (consumers may embed them independently)
export { GroveView } from './views/grove';
export { InspectionView } from './views/inspection';

// Canvas nodes (needed by TreeCanvas NODE_TYPES map consumers)
export { WorktreeNode, FolderNode, FileNode } from './nodes';

// Overlays
export { DiffPopover, DiffHoverCard } from './overlays/DiffPopover';
export { BranchPickerPopover } from './overlays/BranchPickerPopover';

// Shared primitives
export { ThemedFileIcon } from './shared/ThemedFileIcon';
export { PackageSwitcher } from './shared/PackageSwitcher';

// Design system primitives
export {
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
