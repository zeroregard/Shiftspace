import type { FileChange } from '@shiftspace/renderer-core';
import { useFileAnnotations, FileRowButton, DiffPopover } from '@shiftspace/renderer-core';
import { Codicon } from '@shiftspace/ui/codicon';
import { SectionLabel as SectionLabelPrimitive } from '@shiftspace/ui/section-label';

interface InspectionFileRowProps {
  file: FileChange;
  worktreeId: string;
  onFileClick?: (worktreeId: string, filePath: string, line?: number) => void;
  onHoverFile?: (filePath: string | null) => void;
}

export function InspectionFileRow({
  file,
  worktreeId,
  onFileClick,
  onHoverFile,
}: InspectionFileRowProps) {
  const annotations = useFileAnnotations(worktreeId, file.path);

  const handleBadgeClick = onFileClick
    ? (line: number) => onFileClick(worktreeId, file.path, line)
    : undefined;

  return (
    <DiffPopover file={file} worktreeId={worktreeId}>
      <FileRowButton
        file={file}
        annotations={annotations}
        onClick={onFileClick ? () => onFileClick(worktreeId, file.path) : undefined}
        onMouseEnter={onHoverFile ? () => onHoverFile(file.path) : undefined}
        onMouseLeave={onHoverFile ? () => onHoverFile(null) : undefined}
        onBadgeClick={handleBadgeClick}
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
