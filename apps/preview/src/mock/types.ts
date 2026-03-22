export type AgentPersona = 'refactor' | 'feature' | 'bugfix';

export interface AgentConfig {
  id: string;
  persona: AgentPersona;
  worktreeId: string;
  speed: number; // ms between events (lower = faster)
}
