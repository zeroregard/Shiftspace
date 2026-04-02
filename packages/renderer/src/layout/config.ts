export const NODE_H_GAP = 30;
export const FOLDER_V_GAP = 50;
export const FILE_V_GAP = 8;
export const FILE_NODE_W = 200;
export const FILE_NODE_BASE_H = 44;
/** @deprecated Use FILE_NODE_BASE_H or computeFileNodeHeight() */
export const FILE_NODE_H = FILE_NODE_BASE_H;
export const INSIGHT_SECTION_HEADER_H = 20;
export const INSIGHT_ROW_H = 18;

/** Compute total file node height given the number of annotation rows
 *  (errors row + warnings row + each finding row). */
export function computeFileNodeHeight(annotationRows: number): number {
  if (annotationRows === 0) return FILE_NODE_BASE_H;
  return FILE_NODE_BASE_H + INSIGHT_SECTION_HEADER_H + annotationRows * INSIGHT_ROW_H;
}

export const FOLDER_NODE_W = 140;
export const FOLDER_NODE_H = 32;
export const WT_HEADER_H = 68;
export const CONTAINER_PAD_X = 30;
export const CONTAINER_PAD_TOP = 20;
export const CONTAINER_PAD_BOTTOM = 20;
export const CONTAINER_GAP = 60;
export const FILES_TOP_GAP = 40;
/** Height of the action bar row rendered above the worktree header. */
export const ACTION_BAR_H = 36;
