/**
 * Matches a Jira/Linear-style ticket id anywhere in a branch name, e.g.
 * `feature/ABC-123-add-thing` → `ABC-123`. Requires an uppercase letter to
 * start so ordinary hyphenated words (`add-thing`) don't false-match.
 */
const TICKET_RE = /[A-Z][A-Z0-9]+-\d+/;

/** Extract a ticket id from a branch name, or null if none is present. */
export function extractTicketId(branch: string): string | null {
  const m = TICKET_RE.exec(branch);
  return m ? m[0] : null;
}

/**
 * Build a ticket URL from a template and a branch name.
 *
 * Supported placeholders:
 *   - `{branch}` — the full branch name (URL-encoded)
 *   - `{ticket}` — a ticket id extracted from the branch (e.g. `ABC-123`)
 *
 * Returns null when the template is empty, or when it references `{ticket}`
 * but no ticket id can be extracted from the branch — so the link button
 * is hidden rather than pointing at a broken URL.
 */
export function buildTicketUrl(template: string, branch: string): string | null {
  if (!template) return null;

  const needsTicket = template.includes('{ticket}');
  const ticket = needsTicket ? extractTicketId(branch) : null;
  if (needsTicket && !ticket) return null;

  return template
    .split('{ticket}')
    .join(ticket ?? '')
    .split('{branch}')
    .join(encodeURIComponent(branch));
}
