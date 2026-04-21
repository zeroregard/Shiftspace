import type { FileChange } from '@shiftspace/renderer-core';
import {
  useFileAnnotations,
  FileRowButton,
  DiffPopover,
  useInspectionHover,
} from '@shiftspace/renderer-core';
import { Codicon } from '@shiftspace/ui/codicon';
import { SectionLabel as SectionLabelPrimitive } from '@shiftspace/ui/section-label';

interface InspectionFileRowProps {
  file: FileChange;
  worktreeId: string;
}

export function InspectionFileRow({ file, worktreeId }: InspectionFileRowProps) {
  const annotations = useFileAnnotations(worktreeId, file.path);
  const { onFileClick, setHoveredFilePath } = useInspectionHover();

  return (
    <DiffPopover file={file} worktreeId={worktreeId}>
      <FileRowButton
        file={file}
        annotations={annotations}
        onClick={() => onFileClick(worktreeId, file.path)}
        onMouseEnter={() => setHoveredFilePath(file.path)}
        onMouseLeave={() => setHoveredFilePath(null)}
        onBadgeClick={(line) => onFileClick(worktreeId, file.path, line)}
      />
    </DiffPopover>
  );
}

export function FileSectionLabel({ label, icon }: { label: string; icon?: string }) {
  return (
    <div className="ml-2.5 flex items-center gap-2 pt-2 pb-0.5">
      {icon && <Codicon name={icon} size={16} className="text-text-faint -translate-y-px" />}
      <SectionLabelPrimitive>{label}</SectionLabelPrimitive>
    </div>
  );
}
