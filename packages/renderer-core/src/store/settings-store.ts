import { create } from 'zustand';
import type { WorktreeDiffCountMode } from '../types';

/**
 * Global (repo-wide) renderer settings pushed from the host:
 * - the ticket-link URL template (`shiftspace.ticketUrlTemplate`), read by the
 *   worktree card to build the "open ticket" link. Empty template = disabled.
 * - which comparison the worktree card's change counter shows
 *   (`shiftspace.worktreeDiffCount`).
 */
interface SettingsStore {
  ticketUrlTemplate: string;
  setTicketUrlTemplate: (t: string) => void;
  worktreeDiffCount: WorktreeDiffCountMode;
  setWorktreeDiffCount: (m: WorktreeDiffCountMode) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ticketUrlTemplate: '',
  setTicketUrlTemplate: (ticketUrlTemplate) => set({ ticketUrlTemplate }),
  worktreeDiffCount: 'working',
  setWorktreeDiffCount: (worktreeDiffCount) => set({ worktreeDiffCount }),
}));
