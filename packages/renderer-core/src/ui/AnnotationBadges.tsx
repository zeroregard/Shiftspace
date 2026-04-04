import { Tooltip } from '@shiftspace/ui/tooltip';
import { Badge } from '@shiftspace/ui/badge';
import { Codicon } from '@shiftspace/ui/codicon';
import type { FileAnnotations } from '../hooks/useFileAnnotations';

interface AnnotationBadgesProps {
  annotations: FileAnnotations;
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
export function AnnotationBadges({ annotations, iconSize = 12 }: AnnotationBadgesProps) {
  const { errors, warnings, findings, totalFindings, diagnostics, hasAnnotations } = annotations;

  if (!hasAnnotations) return null;

  return (
    <span className="shrink-0 flex items-center gap-1">
      {errors > 0 && (
        <Tooltip
          content={
            <div className="flex flex-col gap-0.5">
              {diagnostics!.details
                .filter((d) => d.severity === 'error')
                .map((d) => (
                  <span key={`${d.line}:${d.source}`}>
                    L{d.line}: {d.message} ({d.source})
                  </span>
                ))}
            </div>
          }
          delayDuration={200}
        >
          <Badge variant="error">
            <Codicon name="error" size={iconSize} />
            {errors}
          </Badge>
        </Tooltip>
      )}
      {warnings > 0 && (
        <Tooltip
          content={
            <div className="flex flex-col gap-0.5">
              {diagnostics!.details
                .filter((d) => d.severity === 'warning')
                .map((d) => (
                  <span key={`${d.line}:${d.source}`}>
                    L{d.line}: {d.message} ({d.source})
                  </span>
                ))}
            </div>
          }
          delayDuration={200}
        >
          <Badge variant="warning">
            <Codicon name="warning" size={iconSize} />
            {warnings}
          </Badge>
        </Tooltip>
      )}
      {totalFindings > 0 && (
        <Tooltip
          content={
            <div className="flex flex-col gap-0.5">
              {findings.map((f) => (
                <span key={f.ruleId}>
                  {f.ruleLabel}: {f.count} found
                </span>
              ))}
            </div>
          }
          delayDuration={200}
        >
          <Badge variant="finding">
            <Codicon name="debug-breakpoint-unsupported" size={iconSize} />
            {totalFindings}
          </Badge>
        </Tooltip>
      )}
    </span>
  );
}
