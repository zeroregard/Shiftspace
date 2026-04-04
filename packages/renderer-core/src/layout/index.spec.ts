import { describe, it, expect } from 'vitest';
import type { WorktreeState, FileChange } from '../types';
import { buildTree } from '../layout/tree';
import { layoutFolder, layoutWorktreeContents } from '../layout/algorithm';
import { computeFullLayout } from '../layout/index';
import {
  FILE_NODE_BASE_H,
  FILE_NODE_W,
  FILE_V_GAP,
  FILES_TOP_GAP,
  FOLDER_NODE_H,
  FOLDER_NODE_W,
  FOLDER_V_GAP,
  WT_HEADER_H,
  CONTAINER_PAD_X,
  CONTAINER_PAD_TOP,
  CONTAINER_PAD_BOTTOM,
  CONTAINER_GAP,
} from '../layout/config';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function f(path: string, overrides: Partial<FileChange> = {}): FileChange {
  return {
    path,
    status: 'modified',
    staged: false,
    linesAdded: 1,
    linesRemoved: 0,
    lastChangedAt: 0,
    ...overrides,
  };
}

function wt(id: string, files: FileChange[]): WorktreeState {
  return {
    id,
    path: `/repo/${id}`,
    branch: id,
    files,
    diffMode: { type: 'working' },
    defaultBranch: 'main',
    isMainWorktree: false,
  };
}

/** Run computeFullLayout against a single worktree and return {nodes, edges}. */
function layout(files: FileChange[]) {
  return computeFullLayout([wt('wt1', files)]);
}

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

describe('buildTree', () => {
  it('returns an empty array for no files', () => {
    expect(buildTree('wt', [])).toEqual([]);
  });

  it('creates a root-level file node (no directory prefix)', () => {
    const tree = buildTree('wt', [f('package.json')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      id: 'file-wt-package.json',
      kind: 'file',
      name: 'package.json',
      children: [],
    });
  });

  it('wraps a file in a folder node for a single-level path', () => {
    const tree = buildTree('wt', [f('src/App.tsx')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'folder-wt-src', kind: 'folder', name: 'src' });
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({
      id: 'file-wt-src/App.tsx',
      kind: 'file',
      name: 'App.tsx',
    });
  });

  it('collapses a two-level single-chain into one folder node', () => {
    // lib → utils → format.ts  (no branching, no direct files at lib level)
    const tree = buildTree('wt', [f('lib/utils/format.ts')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      id: 'folder-wt-lib/utils',
      kind: 'folder',
      name: 'lib/utils',
    });
    expect(tree[0].children[0]).toMatchObject({ kind: 'file', name: 'format.ts' });
  });

  it('collapses a deep single-chain into one folder node', () => {
    // a → b → c → file.ts  (three intermediate levels, all single children)
    const tree = buildTree('wt', [f('a/b/c/file.ts')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: 'a/b/c' });
  });

  it('does NOT collapse when a folder has two or more child folders', () => {
    const tree = buildTree('wt', [f('src/app/page.tsx'), f('src/hooks/useAuth.ts')]);
    expect(tree).toHaveLength(1);
    const src = tree[0];
    expect(src).toMatchObject({ id: 'folder-wt-src', name: 'src' });
    // src branches → no collapse
    expect(src.children).toHaveLength(2);
    const names = src.children.map((c) => c.name).sort();
    expect(names).toEqual(['app', 'hooks']);
  });

  it('does NOT collapse when the folder has both a subfolder and direct files', () => {
    // src has a direct file (index.ts) and a sub-folder (utils) → must NOT collapse
    const tree = buildTree('wt', [f('src/index.ts'), f('src/utils/helper.ts')]);
    const src = tree[0];
    expect(src.name).toBe('src');
    const folderKids = src.children.filter((c) => c.kind === 'folder');
    const fileKids = src.children.filter((c) => c.kind === 'file');
    expect(folderKids).toHaveLength(1);
    expect(fileKids).toHaveLength(1);
  });

  it('sorts child folders alphabetically', () => {
    const tree = buildTree('wt', [f('src/z/a.ts'), f('src/a/b.ts'), f('src/m/c.ts')]);
    const src = tree[0];
    expect(src.children.map((c) => c.name)).toEqual(['a', 'm', 'z']);
  });

  it('handles mixed root-level files and folder-scoped files', () => {
    const tree = buildTree('wt', [f('package.json'), f('src/App.tsx')]);
    const folder = tree.find((n) => n.kind === 'folder');
    const rootFile = tree.find((n) => n.kind === 'file');
    expect(folder).toBeDefined();
    expect(rootFile).toMatchObject({ name: 'package.json' });
  });
});

// ---------------------------------------------------------------------------
// layoutFolder
// ---------------------------------------------------------------------------

describe('layoutFolder', () => {
  it('places the first file below the folder node by FILES_TOP_GAP', () => {
    const [srcNode] = buildTree('wt', [f('src/A.ts')]);
    const rect = layoutFolder(srcNode, 0);
    const fileRect = rect.children[0];
    expect(fileRect.y).toBe(FOLDER_NODE_H + FILES_TOP_GAP);
  });

  it('stacks multiple files with FILE_V_GAP spacing', () => {
    const [srcNode] = buildTree('wt', [f('src/A.ts'), f('src/B.ts'), f('src/C.ts')]);
    const rect = layoutFolder(srcNode, 0);
    const [a, b, c] = rect.children;
    expect(b.y).toBe(a.y + FILE_NODE_BASE_H + FILE_V_GAP);
    expect(c.y).toBe(b.y + FILE_NODE_BASE_H + FILE_V_GAP);
  });

  it('places nested folder children at startY + FOLDER_NODE_H + FOLDER_V_GAP', () => {
    const tree = buildTree('wt', [f('src/components/Button.tsx'), f('src/utils/helper.ts')]);
    const srcNode = tree[0]; // 'src' — branches, not collapsed
    const startY = 100;
    const rect = layoutFolder(srcNode, startY);
    const expectedChildY = startY + FOLDER_NODE_H + FOLDER_V_GAP;
    for (const child of rect.children) {
      expect(child.y).toBe(expectedChildY);
    }
  });

  it('centers the folder node within its subtree width', () => {
    const [srcNode] = buildTree('wt', [f('src/A.ts')]);
    const rect = layoutFolder(srcNode, 0);
    // subtreeW = max(FOLDER_NODE_W, FILE_NODE_W) = FILE_NODE_W (150 > 140)
    expect(rect.x).toBe((rect.subtreeW - FOLDER_NODE_W) / 2);
  });

  it('subtreeW is at least FOLDER_NODE_W even with no children', () => {
    // A folder node with no children should still be at least FOLDER_NODE_W wide
    const emptyFolder = { id: 'f', kind: 'folder' as const, name: 'empty', children: [] };
    const rect = layoutFolder(emptyFolder, 0);
    expect(rect.subtreeW).toBeGreaterThanOrEqual(FOLDER_NODE_W);
  });

  it('returns correct node dimensions', () => {
    const [srcNode] = buildTree('wt', [f('src/A.ts')]);
    const rect = layoutFolder(srcNode, 0);
    expect(rect.w).toBe(FOLDER_NODE_W);
    expect(rect.h).toBe(FOLDER_NODE_H);
  });
});

// ---------------------------------------------------------------------------
// layoutWorktreeContents
// ---------------------------------------------------------------------------

describe('layoutWorktreeContents', () => {
  it('returns totalW=200 and totalH=0 for no files', () => {
    const { totalW, totalH } = layoutWorktreeContents([], 0);
    expect(totalW).toBe(200);
    expect(totalH).toBe(0);
  });

  it('stacks root-level files vertically with FILE_V_GAP spacing', () => {
    const tree = buildTree('wt', [f('A.ts'), f('B.ts')]);
    const startY = 0;
    const { layouts } = layoutWorktreeContents(tree, startY);
    const [a, b] = layouts;
    expect(a.y).toBe(startY);
    expect(b.y).toBe(startY + FILE_NODE_BASE_H + FILE_V_GAP);
  });

  it('lays out multiple folder subtrees side by side horizontally', () => {
    const tree = buildTree('wt', [f('src/A.ts'), f('lib/B.ts')]);
    const { layouts } = layoutWorktreeContents(tree, 0);
    const [left, right] = layouts;
    // Both top-level folders — left one should start at or near x=0, right shifted by NODE_H_GAP
    expect(right.x).toBeGreaterThan(left.x);
  });

  it('enforces a minimum totalW of 200', () => {
    // A single very narrow folder (FOLDER_NODE_W = 140) still yields totalW = 200
    const tree = buildTree('wt', [f('a/x.ts')]);
    const { totalW } = layoutWorktreeContents(tree, 0);
    expect(totalW).toBeGreaterThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// computeFullLayout — node structure
// ---------------------------------------------------------------------------

describe('computeFullLayout — node structure', () => {
  it('always creates a worktree container node', () => {
    const { nodes } = layout([]);
    const wtNode = nodes.find((n) => n.id === 'wt-wt1');
    expect(wtNode).toBeDefined();
    expect(wtNode?.type).toBe('worktreeNode');
  });

  it('creates folder + file nodes for a file inside a folder', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const types = nodes.map((n) => n.type).sort();
    expect(types).toEqual(['fileNode', 'folderNode', 'worktreeNode']);
  });

  it('assigns the correct node IDs', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const ids = nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['file-wt1-src/App.tsx', 'folder-wt1-src', 'wt-wt1'].sort());
  });

  it('creates no folder node for a root-level file', () => {
    const { nodes } = layout([f('package.json')]);
    expect(nodes.find((n) => n.type === 'folderNode')).toBeUndefined();
    expect(nodes.find((n) => n.type === 'fileNode')).toBeDefined();
  });

  it('creates one worktree node per worktree', () => {
    const { nodes } = computeFullLayout([wt('wt1', [f('a.ts')]), wt('wt2', [f('b.ts')])]);
    expect(nodes.filter((n) => n.type === 'worktreeNode')).toHaveLength(2);
  });

  it('worktree node has correct width: totalW + 2 * CONTAINER_PAD_X', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const wtNode = nodes.find((n) => n.id === 'wt-wt1')!;
    // totalW = max(FILE_NODE_W, 200) = 200 for a single file
    expect(wtNode.width).toBe(200 + CONTAINER_PAD_X * 2);
  });

  it('worktree node height covers header + content + bottom padding', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const wtNode = nodes.find((n) => n.id === 'wt-wt1')!;
    const contentsStartY = WT_HEADER_H + CONTAINER_PAD_TOP;
    expect(wtNode.height).toBeGreaterThan(contentsStartY);
    expect(wtNode.height).toBeGreaterThanOrEqual(
      contentsStartY + FOLDER_NODE_H + FILES_TOP_GAP + FILE_NODE_BASE_H + CONTAINER_PAD_BOTTOM
    );
  });

  it('folder nodes have standard dimensions', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const folder = nodes.find((n) => n.type === 'folderNode')!;
    expect(folder.width).toBe(FOLDER_NODE_W);
    expect(folder.height).toBe(FOLDER_NODE_H);
  });

  it('file nodes have standard dimensions', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const file = nodes.find((n) => n.type === 'fileNode')!;
    expect(file.width).toBe(FILE_NODE_W);
    expect(file.height).toBe(FILE_NODE_BASE_H);
  });
});

// ---------------------------------------------------------------------------
// computeFullLayout — edge rules
// ---------------------------------------------------------------------------

describe('computeFullLayout — edge rules', () => {
  it('creates no edges when worktree has only root-level files (no folders)', () => {
    // Root-level files are direct children of the worktree container — no edge needed
    const { edges } = layout([f('package.json'), f('tsconfig.json')]);
    expect(edges).toHaveLength(0);
  });

  it('creates no edge from the worktree container to a root-level folder', () => {
    // src is a root child — its membership is implied by the dashed container
    const { edges } = layout([f('src/App.tsx')]);
    expect(edges.find((e) => e.source === 'wt-wt1')).toBeUndefined();
  });

  it('creates an edge from a root folder to each of its nested folder children', () => {
    const { edges } = layout([f('src/components/Button.tsx'), f('src/utils/helper.ts')]);
    expect(
      edges.find((e) => e.source === 'folder-wt1-src' && e.target === 'folder-wt1-src/components')
    ).toBeDefined();
    expect(
      edges.find((e) => e.source === 'folder-wt1-src' && e.target === 'folder-wt1-src/utils')
    ).toBeDefined();
  });

  it('creates exactly one edge per nested folder child', () => {
    const { edges } = layout([f('src/a/x.ts'), f('src/b/y.ts'), f('src/c/z.ts')]);
    const fromSrc = edges.filter((e) => e.source === 'folder-wt1-src');
    expect(fromSrc).toHaveLength(3);
  });

  it('creates an edge from a folder to the topmost (first) file in its column', () => {
    const { edges } = layout([f('src/A.ts'), f('src/B.ts'), f('src/C.ts')]);
    const fileEdges = edges.filter((e) => e.target.startsWith('file-'));
    expect(fileEdges).toHaveLength(1);
    expect(fileEdges[0]).toMatchObject({
      source: 'folder-wt1-src',
      target: 'file-wt1-src/A.ts',
    });
  });

  it('does NOT create an edge to the second or later files in a column', () => {
    const { edges } = layout([f('src/A.ts'), f('src/B.ts'), f('src/C.ts')]);
    expect(edges.find((e) => e.target === 'file-wt1-src/B.ts')).toBeUndefined();
    expect(edges.find((e) => e.target === 'file-wt1-src/C.ts')).toBeUndefined();
  });

  it('creates one file edge per folder even when multiple folders coexist', () => {
    // src/components has Button.tsx only; src/utils has helper.ts only
    // Each folder should have exactly 1 file edge (to its topmost file)
    const { edges } = layout([f('src/components/Button.tsx'), f('src/utils/helper.ts')]);
    const fileEdges = edges.filter((e) => e.target.startsWith('file-'));
    expect(fileEdges).toHaveLength(2);
  });

  it('creates edges through all levels of nesting', () => {
    const { edges } = layout([f('src/components/Button.tsx'), f('src/utils/helper.ts')]);
    // folder-to-folder edges
    expect(edges.find((e) => e.source === 'folder-wt1-src')).toBeDefined();
    // folder-to-file edges
    expect(edges.find((e) => e.target === 'file-wt1-src/components/Button.tsx')).toBeDefined();
    expect(edges.find((e) => e.target === 'file-wt1-src/utils/helper.ts')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computeFullLayout — positions
// ---------------------------------------------------------------------------

describe('computeFullLayout — positions', () => {
  it('file node is positioned below its parent folder node', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const folder = nodes.find((n) => n.id === 'folder-wt1-src')!;
    const file = nodes.find((n) => n.id === 'file-wt1-src/App.tsx')!;
    expect(file.position.y).toBeGreaterThan(folder.position.y + folder.height);
  });

  it('file y equals folder y + FOLDER_NODE_H + FILES_TOP_GAP', () => {
    const { nodes } = layout([f('src/App.tsx')]);
    const folder = nodes.find((n) => n.id === 'folder-wt1-src')!;
    const file = nodes.find((n) => n.id === 'file-wt1-src/App.tsx')!;
    expect(file.position.y).toBe(folder.position.y + FOLDER_NODE_H + FILES_TOP_GAP);
  });

  it('sibling folder nodes share the same y coordinate', () => {
    const { nodes } = layout([f('src/components/Button.tsx'), f('src/utils/helper.ts')]);
    const comp = nodes.find((n) => n.id === 'folder-wt1-src/components')!;
    const utils = nodes.find((n) => n.id === 'folder-wt1-src/utils')!;
    expect(comp.position.y).toBe(utils.position.y);
  });

  it('sibling folder y = parent folder y + FOLDER_NODE_H + FOLDER_V_GAP', () => {
    const { nodes } = layout([f('src/components/Button.tsx'), f('src/utils/helper.ts')]);
    const src = nodes.find((n) => n.id === 'folder-wt1-src')!;
    const comp = nodes.find((n) => n.id === 'folder-wt1-src/components')!;
    expect(comp.position.y).toBe(src.position.y + FOLDER_NODE_H + FOLDER_V_GAP);
  });

  it('all worktree container nodes are top-aligned at y = 0', () => {
    const { nodes } = computeFullLayout([wt('wt1', [f('src/A.ts')]), wt('wt2', [f('src/B.ts')])]);
    const wtNodes = nodes.filter((n) => n.type === 'worktreeNode');
    for (const n of wtNodes) {
      expect(n.position.y).toBe(0);
    }
  });

  it('second worktree container starts to the right of the first with CONTAINER_GAP', () => {
    const { nodes } = computeFullLayout([wt('wt1', [f('src/A.ts')]), wt('wt2', [f('src/B.ts')])]);
    const wt1 = nodes.find((n) => n.id === 'wt-wt1')!;
    const wt2 = nodes.find((n) => n.id === 'wt-wt2')!;
    expect(wt2.position.x).toBe(wt1.position.x + wt1.width + CONTAINER_GAP);
  });

  it('the two worktrees are centered: wt1.x + wt1.w/2 < 0, wt2.x + wt2.w/2 > 0', () => {
    const { nodes } = computeFullLayout([wt('wt1', [f('src/A.ts')]), wt('wt2', [f('src/B.ts')])]);
    const wt1 = nodes.find((n) => n.id === 'wt-wt1')!;
    const wt2 = nodes.find((n) => n.id === 'wt-wt2')!;
    expect(wt1.position.x + wt1.width / 2).toBeLessThan(0);
    expect(wt2.position.x + wt2.width / 2).toBeGreaterThan(0);
  });
});
