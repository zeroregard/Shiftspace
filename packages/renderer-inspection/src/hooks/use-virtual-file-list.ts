import { useMemo } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import type { FileChange, WorktreeState } from '@shiftspace/renderer-core';

export const SECTION_LABEL_HEIGHT = 28;
export const FILE_ROW_HEIGHT = 32;

export type VirtualItem =
  | { type: 'label'; label: string; icon?: string }
  | { type: 'file'; file: FileChange; sectionKey: string };

interface UseVirtualFileListOptions {
  committed: FileChange[];
  staged: FileChange[];
  unstaged: FileChange[];
  diffModeType: WorktreeState['diffMode']['type'];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

interface VirtualFileList {
  items: VirtualItem[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
}

/**
 * Flattens the three file sections into a single list of virtualizer items
 * (section labels + file rows) and wires up the virtualizer instance.
 */
export function useVirtualFileList({
  committed,
  staged,
  unstaged,
  diffModeType,
  scrollRef,
}: UseVirtualFileListOptions): VirtualFileList {
  const items = useMemo(() => {
    const result: VirtualItem[] = [];
    if (committed.length > 0) {
      result.push({
        type: 'label',
        label: diffModeType === 'repo' ? 'Tracked' : 'Committed',
        icon: 'git-branch',
      });
      for (const file of committed) {
        result.push({ type: 'file', file, sectionKey: 'committed' });
      }
    }
    if (staged.length > 0) {
      result.push({ type: 'label', label: 'Staged', icon: 'git-branch-staged-changes' });
      for (const file of staged) {
        result.push({ type: 'file', file, sectionKey: 'staged' });
      }
    }
    if (unstaged.length > 0) {
      result.push({ type: 'label', label: 'Unstaged', icon: 'git-branch-changes' });
      for (const file of unstaged) {
        result.push({ type: 'file', file, sectionKey: 'unstaged' });
      }
    }
    return result;
  }, [committed, staged, unstaged, diffModeType]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      items[index].type === 'label' ? SECTION_LABEL_HEIGHT : FILE_ROW_HEIGHT,
    overscan: 10,
  });

  return { items, virtualizer };
}
