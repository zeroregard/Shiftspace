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
}

/**
 * Renders error/warning/finding badge pills with tooltips.
 * Shared annotation rendering for file rows — replaces duplicated
 * badge+tooltip patterns across components.
 *
 * Returns null if there are no annotations to show.
 */
export function AnnotationBadges({ annotations, diffHunks, iconSize = 12 }: AnnotationBadgesProps) {
  const { errors, warnings, findings, totalFindings, diagnostics, hasAnnotations } = annotations;

  if (!hasAnnotations) return null;

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
          <span data-testid="badge-error">
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
          <span data-testid="badge-warning">
            <Badge variant="warning">
              <Codicon name="warning" size={iconSize} />
              {warnings}
            </Badge>
          </span>
        </Tooltip>
      )}
      {totalFindings > 0 && (
        <Tooltip content={<FindingTooltipContent findings={findings} />} delayDuration={0}>
          <span data-testid="badge-finding">
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
