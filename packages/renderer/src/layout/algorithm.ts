import type { TreeNode } from './tree';
import {
  NODE_H_GAP,
  FOLDER_V_GAP,
  FILE_V_GAP,
  FILE_NODE_W,
  FILE_NODE_H,
  FOLDER_NODE_W,
  FOLDER_NODE_H,
  FILES_TOP_GAP,
} from './constants';

export interface LayoutRect {
  node: TreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  subtreeW: number;
  subtreeH: number;
  children: LayoutRect[];
}

/** Layout a folder subtree. Folders fan out horizontally; files stack vertically. */
export function layoutFolder(node: TreeNode, startY: number): LayoutRect {
  const folders = node.children.filter((c) => c.kind === 'folder');
  const files = node.children.filter((c) => c.kind === 'file');

  const folderY = startY + FOLDER_NODE_H + FOLDER_V_GAP;
  const childFolderLayouts = folders.map((f) => layoutFolder(f, folderY));

  const fileStartY = startY + FOLDER_NODE_H + FILES_TOP_GAP;
  const childFileLayouts: LayoutRect[] = [];
  let fileY = fileStartY;
  for (const f of files) {
    childFileLayouts.push({
      node: f,
      x: 0,
      y: fileY,
      w: FILE_NODE_W,
      h: FILE_NODE_H,
      subtreeW: FILE_NODE_W,
      subtreeH: FILE_NODE_H,
      children: [],
    });
    fileY += FILE_NODE_H + FILE_V_GAP;
  }
  const fileColumnH = files.length > 0 ? fileY - fileStartY - FILE_V_GAP : 0;
  const fileColumnW = files.length > 0 ? FILE_NODE_W : 0;

  const folderChildrenW = childFolderLayouts.reduce(
    (sum, c, i) => sum + c.subtreeW + (i > 0 ? NODE_H_GAP : 0),
    0
  );

  const hasFiles = files.length > 0;
  const hasFolders = folders.length > 0;
  const allChildrenW =
    (hasFolders ? folderChildrenW : 0) +
    (hasFolders && hasFiles ? NODE_H_GAP : 0) +
    (hasFiles ? fileColumnW : 0);

  const subtreeW = Math.max(FOLDER_NODE_W, allChildrenW);

  const childBlockStart = (subtreeW - allChildrenW) / 2;
  let cx = childBlockStart;

  if (hasFiles) {
    for (const fl of childFileLayouts) {
      fl.x = cx;
    }
    cx += fileColumnW + NODE_H_GAP;
  }

  for (const cl of childFolderLayouts) {
    shiftSubtreeX(cl, cx);
    cx += cl.subtreeW + NODE_H_GAP;
  }

  const folderChildMaxH =
    childFolderLayouts.length > 0
      ? Math.max(...childFolderLayouts.map((c) => c.y + c.subtreeH - startY))
      : 0;
  const fileBottomH = hasFiles ? fileStartY + fileColumnH - startY : 0;
  const subtreeH = Math.max(FOLDER_NODE_H, folderChildMaxH, fileBottomH);

  return {
    node,
    x: (subtreeW - FOLDER_NODE_W) / 2,
    y: startY,
    w: FOLDER_NODE_W,
    h: FOLDER_NODE_H,
    subtreeW,
    subtreeH,
    children: [...childFolderLayouts, ...childFileLayouts],
  };
}

/** Shift all x positions in a subtree by dx (recursive). */
export function shiftSubtreeX(rect: LayoutRect, dx: number) {
  rect.x += dx;
  for (const child of rect.children) {
    shiftSubtreeX(child, dx);
  }
}

/** Layout all top-level children of a worktree (mix of folders and root files). */
export function layoutWorktreeContents(
  children: TreeNode[],
  startY: number
): { layouts: LayoutRect[]; totalW: number; totalH: number } {
  const folders = children.filter((c) => c.kind === 'folder');
  const rootFiles = children.filter((c) => c.kind === 'file');

  const folderLayouts = folders.map((f) => layoutFolder(f, startY));

  const rootFileLayouts: LayoutRect[] = [];
  let fileY = startY;
  for (const f of rootFiles) {
    rootFileLayouts.push({
      node: f,
      x: 0,
      y: fileY,
      w: FILE_NODE_W,
      h: FILE_NODE_H,
      subtreeW: FILE_NODE_W,
      subtreeH: FILE_NODE_H,
      children: [],
    });
    fileY += FILE_NODE_H + FILE_V_GAP;
  }
  const rootFileColumnW = rootFiles.length > 0 ? FILE_NODE_W : 0;
  const rootFileColumnH = rootFiles.length > 0 ? fileY - startY - FILE_V_GAP : 0;

  const hasFolders = folderLayouts.length > 0;
  const hasRootFiles = rootFiles.length > 0;

  const foldersTotalW = folderLayouts.reduce(
    (sum, c, i) => sum + c.subtreeW + (i > 0 ? NODE_H_GAP : 0),
    0
  );
  const totalW =
    (hasFolders ? foldersTotalW : 0) +
    (hasFolders && hasRootFiles ? NODE_H_GAP : 0) +
    (hasRootFiles ? rootFileColumnW : 0);

  let cx = 0;
  for (const fl of folderLayouts) {
    shiftSubtreeX(fl, cx);
    cx += fl.subtreeW + NODE_H_GAP;
  }
  if (hasRootFiles) {
    for (const rf of rootFileLayouts) {
      rf.x = cx;
    }
  }

  const folderMaxH =
    folderLayouts.length > 0 ? Math.max(...folderLayouts.map((c) => c.subtreeH)) : 0;
  const totalH = Math.max(folderMaxH, rootFileColumnH);

  return {
    layouts: [...folderLayouts, ...rootFileLayouts],
    totalW: Math.max(totalW, 200),
    totalH,
  };
}
