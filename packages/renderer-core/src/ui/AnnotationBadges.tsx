import { Tooltip } from '@shiftspace/ui/tooltip';
import { Badge } from '@shiftspace/ui/badge';
import { Codicon } from '@shiftspace/ui/codicon';
import { SmellIcon } from '@shiftspace/ui/smell-icon';
import type { DiffHunk } from '../types';
import type { FileAnnotations } from '../hooks/useFileAnnotations';
import { DiagnosticTooltipContent, FindingTooltipContent } from './DiagnosticTooltipContent';

interface AnnotationBadgesProps {
  annotations: FileAnnotations;
  diffHunks?: DiffHunk[];
  /** Icon size inside badges (default: 12) */
  iconSize?: number;
  /** Called when a badge is clicked, with the 1-indexed line of the first result. */
  onBadgeClick?: (line: number) => void;
}

/**
 * Renders error/warning/finding badge pills with tooltips.
 * Shared annotation rendering for file rows — replaces duplicated
 * badge+tooltip patterns across components.
 *
 * Returns null if there are no annotations to show.
 */
export function AnnotationBadges({
  annotations,
  diffHunks,
  iconSize = 12,
  onBadgeClick,
}: AnnotationBadgesProps) {
  const { errors, warnings, findings, totalFindings, diagnostics, hasAnnotations } = annotations;

  if (!hasAnnotations) return null;

  const handleBadgeClick = (line: number | undefined, e: React.MouseEvent) => {
    if (line === undefined || !onBadgeClick) return;
    e.stopPropagation();
    onBadgeClick(line);
  };

  const firstErrorLine = diagnostics?.details.find((d) => d.severity === 'error')?.line;
  const firstWarningLine = diagnostics?.details.find((d) => d.severity === 'warning')?.line;
  const firstFindingLine = findings.find((f) => f.firstLine !== undefined)?.firstLine;

  return (
    <span className="shrink-0 flex items-center gap-1">
      {errors > 0 && (
        <Tooltip
          content={
            <DiagnosticTooltipContent
              details={diagnostics!.details.filter((d) => d.severity === 'error')}
              diffHunks={diffHunks}
            />
          }
          delayDuration={0}
        >
          <span
            data-testid="badge-error"
            onClick={(e) => handleBadgeClick(firstErrorLine, e)}
            className={onBadgeClick && firstErrorLine !== undefined ? 'cursor-pointer' : undefined}
          >
            <Badge variant="error">
              <Codicon name="error" size={iconSize} />
              {errors}
            </Badge>
          </span>
        </Tooltip>
      )}
      {warnings > 0 && (
        <Tooltip
          content={
            <DiagnosticTooltipContent
              details={diagnostics!.details.filter((d) => d.severity === 'warning')}
              diffHunks={diffHunks}
            />
          }
          delayDuration={0}
        >
          <span
            data-testid="badge-warning"
            onClick={(e) => handleBadgeClick(firstWarningLine, e)}
            className={
              onBadgeClick && firstWarningLine !== undefined ? 'cursor-pointer' : undefined
            }
          >
            <Badge variant="warning">
              <Codicon name="warning" size={iconSize} />
              {warnings}
            </Badge>
          </span>
        </Tooltip>
      )}
      {totalFindings > 0 && (
        <Tooltip content={<FindingTooltipContent findings={findings} />} delayDuration={0}>
          <span
            data-testid="badge-finding"
            onClick={(e) => handleBadgeClick(firstFindingLine, e)}
            className={
              onBadgeClick && firstFindingLine !== undefined ? 'cursor-pointer' : undefined
            }
          >
            <Badge variant="finding">
              <SmellIcon width={iconSize} height={iconSize} />
              {totalFindings}
            </Badge>
          </span>
        </Tooltip>
      )}
    </span>
  );
}
