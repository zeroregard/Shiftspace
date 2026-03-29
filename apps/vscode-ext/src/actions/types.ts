// New action config for .shiftspace.json
export interface ShiftspaceActionConfig {
  id: string;
  label: string;
  command: string;
  type: 'check' | 'service';
  icon: string;
}

export interface PipelineConfig {
  steps: string[]; // action IDs in order
  stopOnFailure: boolean;
}

export interface ShiftspaceConfig {
  actions: ShiftspaceActionConfig[];
  pipelines?: Record<string, PipelineConfig>;
}

// Check states
export type CheckStatus = 'idle' | 'running' | 'passed' | 'failed' | 'stale' | 'unconfigured';
// Service states
export type ServiceStatus = 'stopped' | 'running' | 'failed';
// Combined
export type ActionStatus = CheckStatus | ServiceStatus;

export interface CheckState {
  type: 'check';
  status: CheckStatus;
  durationMs?: number;
  exitCode?: number;
  startedAt?: number;
}

export interface ServiceState {
  type: 'service';
  status: ServiceStatus;
  port?: number;
  pid?: number;
}

export type ActionState = CheckState | ServiceState;

export interface CheckResult {
  actionId: string;
  status: 'passed' | 'failed';
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Serialized state for webview communication */
export interface SerializedActionState {
  type: 'check' | 'service';
  status: ActionStatus;
  durationMs?: number;
  port?: number;
}
