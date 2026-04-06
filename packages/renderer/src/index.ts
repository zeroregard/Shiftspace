export { ShiftspaceRenderer, type PanZoomConfig } from './ShiftspaceRenderer';

// Re-export everything from sub-packages for backwards compatibility
export {
  // Types
  type WorktreeState,
  type FileChange,
  type ShiftspaceEvent,
  type LODLevel,
  type DiffLine,
  type DiffHunk,
  type DiffMode,
  type ActionConfig,
  type ActionState,
  type ActionStatus,
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
} from '@shiftspace/renderer-core';

export { GroveView, SidebarView, WorktreeCard } from '@shiftspace/renderer-grove';
export { TooltipProvider } from '@shiftspace/ui/tooltip';
export { InspectionView } from '@shiftspace/renderer-inspection';
