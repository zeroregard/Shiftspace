/**
 * Returns branches from `allBranches` that are not already checked out in any
 * worktree. This prevents offering a branch that git would reject because it's
 * already in use by another worktree.
 */
export function filterCheckoutableBranches(
  allBranches: string[],
  occupiedBranches: string[]
): string[] {
  const occupied = new Set(occupiedBranches);
  return allBranches.filter((b) => !occupied.has(b));
}
