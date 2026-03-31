import * as fs from 'fs';
import * as path from 'path';
import type { InsightPlugin, InsightFinding, FileInsight } from '../types';
import { insightRegistry } from '../registry';
import type { SmellRule } from '../../actions/types';

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

  async analyze(files, _repoRoot, worktreeRoot, settings, signal) {
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

    const fileInsights: FileInsight[] = [];

    for (const file of files) {
      if (signal?.aborted) break;

      const ext = path.extname(file.path).toLowerCase();
      const applicableRules = rules.filter((r) => !r.fileTypes || r.fileTypes.includes(ext));
      if (applicableRules.length === 0) continue;

      const content = readFileContent(worktreeRoot, file.path);
      if (!content) continue;

      const lines = content.split('\n');
      const findings: InsightFinding[] = [];

      for (const rule of applicableRules) {
        const regex = new RegExp(rule.pattern, 'g');
        let count = 0;
        for (const line of lines) {
          const matches = line.match(regex);
          if (matches) count += matches.length;
        }
        if (count >= rule.threshold) {
          findings.push({
            ruleId: rule.id,
            ruleLabel: rule.label,
            count,
            threshold: rule.threshold,
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
