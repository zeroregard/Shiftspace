import type { FileChange, DiffHunk } from '@shiftspace/renderer-core';

export function createMockFile(overrides?: Partial<FileChange>): FileChange {
  return {
    path: 'src/components/Button.tsx',
    status: 'modified',
    staged: false,
    linesAdded: 10,
    linesRemoved: 3,
    lastChangedAt: 0,
    ...overrides,
  };
}

export function createDeletedFile(overrides?: Partial<FileChange>): FileChange {
  return createMockFile({
    path: 'src/old-module.ts',
    status: 'deleted',
    linesAdded: 0,
    linesRemoved: 45,
    ...overrides,
  });
}

export function createAddedFile(overrides?: Partial<FileChange>): FileChange {
  return createMockFile({
    path: 'src/components/NewFeature.tsx',
    status: 'added',
    linesAdded: 80,
    linesRemoved: 0,
    ...overrides,
  });
}

export function createStagedFile(overrides?: Partial<FileChange>): FileChange {
  return createMockFile({
    path: 'src/utils/helpers.ts',
    status: 'modified',
    staged: true,
    linesAdded: 5,
    linesRemoved: 2,
    ...overrides,
  });
}

export function createPartiallyStagedFile(overrides?: Partial<FileChange>): FileChange {
  return createMockFile({
    path: 'src/app/page.tsx',
    status: 'modified',
    staged: true,
    partiallyStaged: true,
    linesAdded: 15,
    linesRemoved: 8,
    ...overrides,
  });
}

export function createPulsingFile(overrides?: Partial<FileChange>): FileChange {
  return createMockFile({
    path: 'src/components/Button.tsx',
    lastChangedAt: Date.now(),
    ...overrides,
  });
}

export function createFileWithDiff(overrides?: Partial<FileChange>): FileChange {
  const hunks: DiffHunk[] = [
    {
      header: '@@ -1,5 +1,8 @@',
      lines: [
        { type: 'context', content: "import React from 'react';" },
        { type: 'removed', content: "import { useState } from 'react';" },
        { type: 'added', content: "import { useState, useEffect } from 'react';" },
        { type: 'added', content: "import { useCallback } from 'react';" },
        { type: 'context', content: '' },
        { type: 'context', content: 'export function Button() {' },
      ],
    },
  ];

  return createMockFile({
    path: 'src/components/Button.tsx',
    diff: hunks,
    rawDiff: [
      '--- a/src/components/Button.tsx',
      '+++ b/src/components/Button.tsx',
      '@@ -1,5 +1,8 @@',
      " import React from 'react';",
      "-import { useState } from 'react';",
      "+import { useState, useEffect } from 'react';",
      "+import { useCallback } from 'react';",
      ' ',
      ' export function Button() {',
    ].join('\n'),
    ...overrides,
  });
}
