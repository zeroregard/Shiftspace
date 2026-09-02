import { create } from 'zustand';
import type { WorktreeDiffCountMode, WorktreeVisibility } from '../types';
import { DEFAULT_WORKTREE_VISIBILITY } from '../types';

/**
 * Global (repo-wide) renderer settings pushed from the host:
 * - the ticket-link URL template (`shiftspace.ticketUrlTemplate`), read by the
 *   worktree card to build the "open ticket" link. Empty template = disabled.
 * - which comparison the worktree card's change counter shows
 *   (`shiftspace.worktreeDiffCount`).
 * - which sections of the worktree card are visible at rest, on hover, or not
 *   at all (`shiftspace.worktree.visibility.*`).
 */
interface SettingsStore {
  ticketUrlTemplate: string;
  setTicketUrlTemplate: (t: string) => void;
  worktreeDiffCount: WorktreeDiffCountMode;
  setWorktreeDiffCount: (m: WorktreeDiffCountMode) => void;
  worktreeVisibility: WorktreeVisibility;
  setWorktreeVisibility: (v: WorktreeVisibility) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ticketUrlTemplate: '',
  setTicketUrlTemplate: (ticketUrlTemplate) => set({ ticketUrlTemplate }),
  worktreeDiffCount: 'working',
  setWorktreeDiffCount: (worktreeDiffCount) => set({ worktreeDiffCount }),
  worktreeVisibility: DEFAULT_WORKTREE_VISIBILITY,
  setWorktreeVisibility: (worktreeVisibility) => set({ worktreeVisibility }),
}));
