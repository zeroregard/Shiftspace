/**
 * Composite key helpers for Zustand Map-based stores.
 *
 * All store Maps that combine worktreeId with another identifier use these
 * functions so the separator is defined in one place and cannot collide with
 * values that happen to contain the separator character.
 *
 * Format: `<worktreeId>\0<secondPart>` — the null byte is never part of a
 * valid file path or ID, making collisions impossible (unlike `:` which
 * could appear in file paths).
 */

const SEP = '\0';

/** Build a composite store key from worktreeId + a second part (filePath, insightId, actionId, etc.). */
export function storeKey(worktreeId: string, secondPart: string): string {
  return `${worktreeId}${SEP}${secondPart}`;
}

/** Extract the worktreeId prefix from a composite store key. */
export function storeKeyWorktreeId(compositeKey: string): string {
  return compositeKey.split(SEP)[0];
}

/** Build the prefix used for iteration / deletion of all keys belonging to a worktree. */
export function storeKeyPrefix(worktreeId: string): string {
  return `${worktreeId}${SEP}`;
}
