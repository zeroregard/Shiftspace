import * as fs from 'fs';
import * as path from 'path';
import type { InsightPlugin, InsightFinding, FileInsight, AnalyzeContext } from '../types';
import { insightRegistry } from '../registry';
import type { SmellRule } from '../../actions/types';
import { log } from '../../logger';

/** Simple glob match supporting leading `*` (e.g. `*.test.ts` matches `foo.test.ts`). */
function matchesGlob(filePath: string, pattern: string): boolean {
  if (pattern.startsWith('*')) {
    return filePath.endsWith(pattern.slice(1));
  }
  return filePath === pattern;
}

function readFileContent(worktreeRoot: string, filePath: string): string | null {
  try {
    return fs.readFileSync(path.join(worktreeRoot, filePath), 'utf8');
  } catch {
    return null;
  }
}

const codeSmellsPlugin: InsightPlugin = {
  id: 'codeSmells',
  label: 'Code Smells',
  icon: 'bug',
  defaultSettings: {},

  async analyze(ctx: AnalyzeContext) {
    const { files, worktreeRoot, settings, signal } = ctx;
    const rules = (settings['smellRules'] as SmellRule[] | undefined) ?? [];

    const empty = {
      summary: {
        insightId: 'codeSmells',
        worktreeId: '',
        score: 0,
        label: '0 smells',
        severity: 'none' as const,
      },
      detail: { insightId: 'codeSmells', worktreeId: '', fileInsights: [] },
    };

    if (rules.length === 0) return empty;

    // Pre-compile regexes once with per-rule error handling
    const compiledRules: Array<{ rule: SmellRule; regex: RegExp; negRegex: RegExp | null }> = [];
    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'g');
        let negRegex: RegExp | null = null;
        if (rule.negativePattern) {
          try {
            negRegex = new RegExp(rule.negativePattern);
          } catch (err) {
            log.warn(
              `Code smell rule "${rule.id}" has invalid negativePattern "${rule.negativePattern}", ignoring: ${err}`
            );
          }
        }
        compiledRules.push({ rule, regex, negRegex });
      } catch (err) {
        log.warn(
          `Code smell rule "${rule.id}" has invalid pattern "${rule.pattern}", skipping: ${err}`
        );
      }
    }

    if (compiledRules.length === 0) return empty;

    const fileInsights: FileInsight[] = [];

    for (const file of files) {
      if (signal?.aborted) break;
      if (file.path === '.shiftspace.json') continue;

      const ext = path.extname(file.path).toLowerCase();
      const applicable = compiledRules.filter(({ rule }) => {
        if (rule.fileTypes && !rule.fileTypes.includes(ext)) return false;
        if (rule.excludePatterns?.some((p) => matchesGlob(file.path, p))) return false;
        return true;
      });
      if (applicable.length === 0) continue;

      const content = readFileContent(worktreeRoot, file.path);
      if (!content) continue;

      const lines = content.split('\n');
      const findings: InsightFinding[] = [];

      for (const { rule, regex, negRegex } of applicable) {
        let count = 0;
        let firstLine: number | undefined;
        for (let i = 0; i < lines.length; i++) {
          const matches = lines[i].match(regex);
          if (matches) {
            // If negativePattern is set, skip lines that ALSO match it
            if (negRegex && negRegex.test(lines[i])) continue;
            count += matches.length;
            if (firstLine === undefined) firstLine = i + 1; // 1-indexed
          }
        }
        if (count >= rule.threshold) {
          findings.push({
            ruleId: rule.id,
            ruleLabel: rule.label,
            count,
            threshold: rule.threshold,
            firstLine,
            ...(rule.hint ? { hint: rule.hint } : {}),
          });
        }
      }

      if (findings.length > 0) {
        fileInsights.push({ filePath: file.path, findings });
      }
    }

    const totalSmells = fileInsights.reduce((sum, fi) => sum + fi.findings.length, 0);
    const severity =
      totalSmells === 0
        ? ('none' as const)
        : totalSmells <= 3
          ? ('low' as const)
          : totalSmells <= 8
            ? ('medium' as const)
            : ('high' as const);

    return {
      summary: {
        insightId: 'codeSmells',
        worktreeId: '',
        score: totalSmells,
        label: `${totalSmells} smell${totalSmells !== 1 ? 's' : ''}`,
        severity,
      },
      detail: { insightId: 'codeSmells', worktreeId: '', fileInsights },
    };
  },
};

insightRegistry.register(codeSmellsPlugin);

export { codeSmellsPlugin };
