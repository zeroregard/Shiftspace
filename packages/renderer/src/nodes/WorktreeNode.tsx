import type { NodeComponentProps } from '../TreeCanvas';
import type { WorktreeState } from '../types';
import { WorktreeHeader } from './WorktreeHeader';

interface WorktreeNodeData {
  worktree: WorktreeState;
  /** When true, skip container border, background, header, and diff dropdown. */
  bare?: boolean;
  [key: string]: unknown;
}

export function WorktreeNode({ data }: NodeComponentProps<WorktreeNodeData>) {
  const wt = data.worktree;

  if (data.bare) {
    return <div className="w-full h-full" />;
  }

  return (
    <div className="w-full h-full border-2 border-dashed border-border-dashed rounded-2xl bg-cluster-alpha text-text-primary px-7.5 py-5 text-left flex flex-col">
      <WorktreeHeader worktree={wt} compact />
    </div>
  );
}
