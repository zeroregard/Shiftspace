import type { InsightDetail, FileDiagnosticSummary } from '@shiftspace/renderer';

// ---------------------------------------------------------------------------
// Mock insight data — seeded so insight pills are always visible in the
// preview app's inspection mode, covering all files from each template.
// ---------------------------------------------------------------------------

function smellDetail(
  worktreeId: string,
  entries: Array<[string, Array<[string, string, number, number]>]>
): InsightDetail {
  return {
    insightId: 'codeSmells',
    worktreeId,
    fileInsights: entries.map(([filePath, findings]) => ({
      filePath,
      findings: findings.map(([ruleId, ruleLabel, count, threshold]) => ({
        ruleId,
        ruleLabel,
        count,
        threshold,
      })),
    })),
  };
}

// nextjs template — wt-0
export const MOCK_CODE_SMELL_DETAIL_WT0 = smellDetail('wt-0', [
  ['src/app/page.tsx', [['console-log', 'Console Log', 2, 1]]],
  ['src/components/Header.tsx', [['eslint-disable', 'ESLint Disable', 1, 1]]],
  ['src/components/Button.tsx', [['console-log', 'Console Log', 1, 1]]],
  ['src/lib/api.ts', [['console-log', 'Console Log', 3, 1]]],
  [
    'src/lib/utils.ts',
    [
      ['todo-comment', 'TODO Comment', 4, 3],
      ['console-log', 'Console Log', 1, 1],
    ],
  ],
  ['src/hooks/useData.ts', [['use-effect-overuse', 'useEffect Overuse', 6, 5]]],
  ['src/hooks/useAuth.ts', [['console-log', 'Console Log', 1, 1]]],
]);

// api template — wt-1
export const MOCK_CODE_SMELL_DETAIL_WT1 = smellDetail('wt-1', [
  [
    'src/routes/users.ts',
    [
      ['console-log', 'Console Log', 2, 1],
      ['eslint-disable', 'ESLint Disable', 1, 1],
    ],
  ],
  ['src/routes/auth.ts', [['console-log', 'Console Log', 1, 1]]],
  ['src/routes/products.ts', [['todo-comment', 'TODO Comment', 3, 3]]],
  ['src/middleware/auth.ts', [['console-log', 'Console Log', 1, 1]]],
  ['src/models/User.ts', [['console-log', 'Console Log', 1, 1]]],
  ['src/models/Product.ts', [['eslint-disable', 'ESLint Disable', 2, 1]]],
  [
    'src/services/database.ts',
    [
      ['console-log', 'Console Log', 4, 1],
      ['todo-comment', 'TODO Comment', 3, 3],
    ],
  ],
  ['src/services/email.ts', [['console-log', 'Console Log', 2, 1]]],
  ['src/utils/validate.ts', [['todo-comment', 'TODO Comment', 4, 3]]],
  ['src/index.ts', [['console-log', 'Console Log', 1, 1]]],
]);

// ---------------------------------------------------------------------------
// Mock diagnostic data — simulates VSCode diagnostics (TS errors, lint warnings)
// ---------------------------------------------------------------------------

export const MOCK_DIAGNOSTICS_WT0: FileDiagnosticSummary[] = [
  {
    filePath: 'src/app/page.tsx',
    errors: 1,
    warnings: 1,
    info: 0,
    hints: 0,
    details: [
      {
        severity: 'error',
        message: "Property 'onClick' does not exist on type 'IntrinsicAttributes'",
        source: 'ts',
        line: 12,
      },
      {
        severity: 'warning',
        message: "'useState' is defined but never used",
        source: 'eslint',
        line: 3,
      },
    ],
  },
  {
    filePath: 'src/lib/api.ts',
    errors: 0,
    warnings: 2,
    info: 0,
    hints: 0,
    details: [
      {
        severity: 'warning',
        message: 'Unexpected console.log statement',
        source: 'oxlint',
        line: 15,
      },
      {
        severity: 'warning',
        message: "Variable 'response' is never reassigned. Use 'const' instead of 'let'",
        source: 'oxlint',
        line: 22,
      },
    ],
  },
  {
    filePath: 'src/hooks/useAuth.ts',
    errors: 2,
    warnings: 0,
    info: 0,
    hints: 0,
    details: [
      {
        severity: 'error',
        message: "Cannot find module '@/lib/auth' or its corresponding type declarations",
        source: 'ts',
        line: 1,
      },
      {
        severity: 'error',
        message: "Type 'string | undefined' is not assignable to type 'string'",
        source: 'ts',
        line: 44,
      },
    ],
  },
];

export const MOCK_DIAGNOSTICS_WT1: FileDiagnosticSummary[] = [
  {
    filePath: 'src/routes/users.ts',
    errors: 0,
    warnings: 1,
    info: 0,
    hints: 0,
    details: [
      { severity: 'warning', message: "'req' is defined but never used", source: 'ts', line: 8 },
    ],
  },
  {
    filePath: 'src/services/database.ts',
    errors: 1,
    warnings: 1,
    info: 0,
    hints: 0,
    details: [
      {
        severity: 'error',
        message: "Property 'connect' does not exist on type 'DatabasePool'",
        source: 'ts',
        line: 31,
      },
      {
        severity: 'warning',
        message: 'Unexpected console.log statement',
        source: 'oxlint',
        line: 45,
      },
    ],
  },
];
