/**
 * Stable render keys for worktree cards.
 *
 * Neither natural identifier survives everything a card can go through: a
 * worktree's id is its path, which a rename changes, and its branch changes
 * on checkout or swap. Keying the animated card list by either makes the
 * animation library treat the edit as one card leaving and a new one
 * arriving — the old card holds its slot while it fades out, so the list
 * briefly shows an extra, empty slot before closing the gap.
 *
 * Instead, each worktree gets an opaque key the first time the store sees
 * it, and a rename carries that key over to the worktree's new id.
 */
let lastCardKey = 0;

/**
 * Bring `prev` in line with the ids in `worktrees`: keep existing keys, hand
 * the renamed worktree its old key, mint fresh keys for new worktrees, and
 * drop keys for worktrees that are gone. Returns `prev` itself when nothing
 * changed, so store subscribers aren't woken up for no reason.
 */
export function syncCardKeys(
  prev: ReadonlyMap<string, string>,
  worktrees: ReadonlyMap<string, unknown>,
  rename?: { from: string; to: string }
): ReadonlyMap<string, string> {
  if (prev.size === worktrees.size && [...worktrees.keys()].every((id) => prev.has(id))) {
    return prev;
  }
  const next = new Map<string, string>();
  for (const id of worktrees.keys()) {
    const carried = rename && id === rename.to ? prev.get(rename.from) : undefined;
    next.set(id, prev.get(id) ?? carried ?? `card-${++lastCardKey}`);
  }
  return next;
}
