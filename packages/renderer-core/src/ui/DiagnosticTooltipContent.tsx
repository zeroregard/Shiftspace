import type { DiffHunk, FileDiagnosticSummary, InsightFinding } from '../types';
import { getSourceLineFromHunks } from '../utils/diffLineLookup';

const MAX_ITEMS = 5;

type DiagnosticDetail = FileDiagnosticSummary['details'][number];

// ---------------------------------------------------------------------------
// Diagnostic tooltip (errors / warnings)
// ---------------------------------------------------------------------------

interface DiagnosticTooltipContentProps {
  details: DiagnosticDetail[];
  diffHunks?: DiffHunk[];
}

export function DiagnosticTooltipContent({ details, diffHunks }: DiagnosticTooltipContentProps) {
  const visible = details.slice(0, MAX_ITEMS);
  const overflow = details.length - MAX_ITEMS;

  return (
    <div className="flex flex-col gap-1.5 max-w-[320px]">
      {visible.map((d, i) => (
        <DiagnosticCard key={`${d.line}:${d.source}:${i}`} detail={d} diffHunks={diffHunks} />
      ))}
      {overflow > 0 && <span className="text-9 text-text-faint">+{overflow} more</span>}
    </div>
  );
}

function DiagnosticCard({
  detail,
  diffHunks,
}: {
  detail: DiagnosticDetail;
  diffHunks?: DiffHunk[];
}) {
  const codeLine = getSourceLineFromHunks(diffHunks, detail.line);

  return (
    <div className="flex flex-col gap-0.5">
      {/* Header: source pill + line number */}
      <div className="flex items-center gap-1.5">
        <span className="text-9 font-mono bg-white/5 rounded px-1 leading-tight text-text-muted">
          {detail.source}
        </span>
        <span className="text-9 font-mono text-text-faint">L{detail.line}</span>
      </div>

      {/* Message */}
      <p className="text-10 leading-snug text-text-primary line-clamp-2 m-0">{detail.message}</p>

      {/* Source code line (when available from diff) */}
      {codeLine !== undefined && (
        <code className="font-mono text-9 leading-snug bg-black/20 rounded px-1.5 py-0.5 block truncate text-text-muted">
          {codeLine}
        </code>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finding tooltip (code smells)
// ---------------------------------------------------------------------------

interface FindingTooltipContentProps {
  findings: InsightFinding[];
}

export function FindingTooltipContent({ findings }: FindingTooltipContentProps) {
  return (
    <div className="flex flex-col gap-1 max-w-[320px]">
      {findings.map((f) => (
        <div key={f.ruleId} className="flex flex-col gap-0.5">
          <span className="text-10 text-text-primary">{f.ruleLabel}</span>
          <span className="text-9 text-text-faint">
            {f.count} found (threshold: {f.threshold})
          </span>
        </div>
      ))}
    </div>
  );
}
