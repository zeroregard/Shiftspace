import * as fs from 'fs';
import * as path from 'path';
import { insightRegistry } from '../registry';
import type { InsightPlugin, InsightSummary, InsightDetail } from '../types';
import type { FileChange } from '@shiftspace/renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlockMatch {
  fileA: string;
  fileB: string;
  startLineA: number;
  endLineA: number;
  startLineB: number;
  endLineB: number;
}

export interface FileSimilarity {
  fileA: string;
  fileB: string;
  overallSimilarity: number;
  matchedBlocks: BlockMatch[];
}

export interface DuplicationDetail {
  pairs: FileSimilarity[];
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const SINGLE_LINE_COMMENT = /\/\/.*/g;
const MULTI_LINE_COMMENT = /\/\*[\s\S]*?\*\//g;
const COLLAPSE_WHITESPACE = /\s+/g;

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.zip',
  '.gz',
  '.tar',
  '.br',
  '.pdf',
  '.doc',
  '.docx',
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.lock',
  '.bin',
]);

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function normalizeSource(source: string): string[] {
  let text = source;
  text = text.replace(MULTI_LINE_COMMENT, '');
  text = text.replace(SINGLE_LINE_COMMENT, '');

  return text
    .split('\n')
    .map((line) => line.replace(COLLAPSE_WHITESPACE, ' ').trim().toLowerCase())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

// FNV-1a 32-bit hash
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Block fingerprinting
// ---------------------------------------------------------------------------

interface BlockLocation {
  filePath: string;
  startLine: number; // 1-based
  endLine: number; // 1-based, inclusive
}

export function fingerprintBlocks(
  filePath: string,
  normalizedLines: string[],
  windowSize: number
): Map<number, BlockLocation[]> {
  const blocks = new Map<number, BlockLocation[]>();

  for (let i = 0; i <= normalizedLines.length - windowSize; i++) {
    const blockText = normalizedLines.slice(i, i + windowSize).join('\n');
    const hash = fnv1a(blockText);
    const loc: BlockLocation = {
      filePath,
      startLine: i + 1,
      endLine: i + windowSize,
    };
    const existing = blocks.get(hash);
    if (existing) {
      existing.push(loc);
    } else {
      blocks.set(hash, [loc]);
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Merging adjacent matches
// ---------------------------------------------------------------------------

function mergeAdjacentBlocks(blocks: BlockMatch[]): BlockMatch[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort(
    (a, b) => a.startLineA - b.startLineA || a.startLineB - b.startLineB
  );
  const merged: BlockMatch[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    // Adjacent or overlapping in both files
    if (
      current.fileA === last.fileA &&
      current.fileB === last.fileB &&
      current.startLineA <= last.endLineA + 1 &&
      current.startLineB <= last.endLineB + 1
    ) {
      last.endLineA = Math.max(last.endLineA, current.endLineA);
      last.endLineB = Math.max(last.endLineB, current.endLineB);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export function detectDuplication(
  fileContents: Map<string, string>,
  threshold: number,
  minBlockLines: number
): FileSimilarity[] {
  // Normalize all files
  const normalizedFiles = new Map<string, string[]>();
  for (const [filePath, content] of fileContents) {
    normalizedFiles.set(filePath, normalizeSource(content));
  }

  // Build global hash map
  const globalBlocks = new Map<number, BlockLocation[]>();
  for (const [filePath, lines] of normalizedFiles) {
    if (lines.length < minBlockLines) continue;
    const blocks = fingerprintBlocks(filePath, lines, minBlockLines);
    for (const [hash, locations] of blocks) {
      const existing = globalBlocks.get(hash);
      if (existing) {
        existing.push(...locations);
      } else {
        globalBlocks.set(hash, [...locations]);
      }
    }
  }

  // Find cross-file matches
  const pairMatches = new Map<string, BlockMatch[]>();

  for (const locations of globalBlocks.values()) {
    if (locations.length < 2) continue;

    // Check all pairs of locations in different files
    for (let i = 0; i < locations.length; i++) {
      for (let j = i + 1; j < locations.length; j++) {
        const a = locations[i]!;
        const b = locations[j]!;
        if (a.filePath === b.filePath) continue;

        // Canonical pair key (sorted)
        const [fileA, fileB] = [a.filePath, b.filePath].sort();
        const pairKey = `${fileA}::${fileB}`;

        const match: BlockMatch = {
          fileA: fileA!,
          fileB: fileB!,
          startLineA: a.filePath === fileA ? a.startLine : b.startLine,
          endLineA: a.filePath === fileA ? a.endLine : b.endLine,
          startLineB: a.filePath === fileB ? a.startLine : b.startLine,
          endLineB: a.filePath === fileB ? a.endLine : b.endLine,
        };

        const existing = pairMatches.get(pairKey);
        if (existing) {
          existing.push(match);
        } else {
          pairMatches.set(pairKey, [match]);
        }
      }
    }
  }

  // Merge and filter
  const results: FileSimilarity[] = [];

  for (const [pairKey, matches] of pairMatches) {
    const [fileA, fileB] = pairKey.split('::') as [string, string];
    const merged = mergeAdjacentBlocks(matches);

    const linesA = normalizedFiles.get(fileA)?.length ?? 1;
    const linesB = normalizedFiles.get(fileB)?.length ?? 1;

    // Count matched lines for each file
    const matchedLinesA = new Set<number>();
    const matchedLinesB = new Set<number>();
    for (const block of merged) {
      for (let l = block.startLineA; l <= block.endLineA; l++) matchedLinesA.add(l);
      for (let l = block.startLineB; l <= block.endLineB; l++) matchedLinesB.add(l);
    }

    const overallSimilarity =
      Math.max(matchedLinesA.size, matchedLinesB.size) / Math.min(linesA, linesB);

    if (overallSimilarity >= threshold) {
      results.push({
        fileA,
        fileB,
        overallSimilarity: Math.min(overallSimilarity, 1),
        matchedBlocks: merged,
      });
    }
  }

  return results.sort((a, b) => b.overallSimilarity - a.overallSimilarity);
}

// ---------------------------------------------------------------------------
// File content reading
// ---------------------------------------------------------------------------

async function readFileContent(
  filePath: string,
  worktreeRoot: string,
  status: FileChange['status']
): Promise<string | null> {
  const fullPath = path.join(worktreeRoot, filePath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const duplicationPlugin: InsightPlugin = {
  id: 'duplication',
  label: 'Duplication',
  icon: 'copy',
  defaultSettings: {
    threshold: 0.5,
    minBlockLines: 5,
  },

  async analyze(files, repoRoot, worktreeRoot, settings, signal) {
    const threshold = (settings.threshold as number) ?? 0.5;
    const minBlockLines = (settings.minBlockLines as number) ?? 5;

    const worktreeId = ''; // filled in by runner

    // Read file contents (skip binary files and deleted files)
    const fileContents = new Map<string, string>();
    for (const file of files) {
      if (signal?.aborted) break;
      if (file.status === 'deleted') continue;
      if (isBinaryFile(file.path)) continue;

      const content = await readFileContent(file.path, worktreeRoot, file.status);
      if (content !== null) {
        fileContents.set(file.path, content);
      }
    }

    const pairs = detectDuplication(fileContents, threshold, minBlockLines);

    const score = pairs.length;
    const severity: InsightSummary['severity'] =
      score === 0 ? 'none' : score <= 2 ? 'low' : score <= 5 ? 'medium' : 'high';

    const summary: InsightSummary = {
      insightId: 'duplication',
      worktreeId,
      score,
      label: score === 1 ? '1 duplication' : `${score} duplications`,
      severity,
    };

    const detail: InsightDetail = {
      insightId: 'duplication',
      worktreeId,
      data: { pairs } as DuplicationDetail,
    };

    return { summary, detail };
  },
};

insightRegistry.register(duplicationPlugin);
