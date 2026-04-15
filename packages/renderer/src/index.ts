export { ShiftspaceRenderer, type PanZoomConfig } from './shiftspace-renderer';

// Re-export everything from sub-packages for backwards compatibility
export {
  // Types
  type WorktreeState,
  type WorktreeBadge,
  type WorktreeBadgeColor,
  type FileChange,
  type ShiftspaceEvent,
  type LODLevel,
  type DiffLine,
  type DiffHunk,
  type DiffMode,
  type ActionConfig,
  type ActionState,
  type ActionStatus,
  type WorktreeSortMode,
  type AppMode,
  type IconEntry,
  type IconMap,
  type PipelineConfig,
  type LogEntry,
  type InsightFinding,
  type FileInsight,
  type InsightDetail,
  type FileDiagnosticSummary,
  // Store
  useWorktreeStore,
  useActionStore,
  useInsightStore,
  getFileFindings,
  useInspectionStore,
  usePackageStore,
  // Canvas
  TreeCanvas,
  // Nodes
  WorktreeNode,
  FolderNode,
  FileNode,
  NODE_TYPES,
  // Shared
  UnifiedHeader,
  ThemedFileIcon,
  PackageSwitcher,
  SortPicker,
  sortWorktrees,
  // UI
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
  // Hooks
  useFileAnnotations,
  type FileAnnotations,
  // Overlays
  DiffPopover,
  BranchPicker,
  type StaticOption,
  // Protocol
  MessageRouter,
  type WebviewMessage,
  registerGitProviderHandlers,
  type GitProviderHandlers,
} from '@shiftspace/renderer-core';

export { GroveView, SidebarView, WorktreeCard } from '@shiftspace/renderer-grove';
export { TooltipProvider } from '@shiftspace/ui/tooltip';
export { setComponentErrorReporter } from '@shiftspace/ui/error-boundary';
export { InspectionView } from '@shiftspace/renderer-inspection';
