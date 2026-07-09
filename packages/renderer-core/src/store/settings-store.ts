import { create } from 'zustand';

/**
 * Global (repo-wide) renderer settings pushed from the host. Currently holds
 * the ticket-link URL template (`shiftspace.ticketUrlTemplate`), read by the
 * worktree card to build the "open ticket" link. Empty template = disabled.
 */
interface SettingsStore {
  ticketUrlTemplate: string;
  setTicketUrlTemplate: (t: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ticketUrlTemplate: '',
  setTicketUrlTemplate: (ticketUrlTemplate) => set({ ticketUrlTemplate }),
}));
