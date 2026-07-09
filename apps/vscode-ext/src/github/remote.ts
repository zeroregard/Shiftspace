export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

/**
 * Parse a git remote URL into `{ owner, repo }`, or return null for any
 * non-GitHub remote (GitLab, Bitbucket, plain paths, GitHub Enterprise) so the
 * PR feature silently no-ops.
 *
 * Handles:
 *   git@github.com:owner/repo.git         (scp-like SSH)
 *   ssh://git@github.com/owner/repo.git   (ssh://)
 *   https://github.com/owner/repo.git     (https, optional .git)
 *   https://github.com/owner/repo         (no .git)
 *   git://github.com/owner/repo.git
 *
 * Only `github.com` is accepted — GitHub Enterprise hosts are out of scope for v1.
 */
export function parseGitHubRemote(remoteUrl: string): GitHubRepoRef | null {
  const url = remoteUrl.trim();
  if (!url) return null;

  // scp-like SSH: git@github.com:owner/repo(.git)
  const scp = /^[^@]+@([^:]+):(.+)$/.exec(url);
  if (scp) return fromHostPath(scp[1]!, scp[2]!);

  // ssh:// | https:// | http:// | git://
  const m = /^(?:ssh|https?|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(url);
  if (m) return fromHostPath(m[1]!, m[2]!);

  return null;
}

function fromHostPath(host: string, pathPart: string): GitHubRepoRef | null {
  if (host.toLowerCase() !== 'github.com') return null; // non-GitHub → no-op
  const cleaned = pathPart.replace(/\.git$/, '').replace(/\/+$/, '');
  const segs = cleaned.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  // owner/repo are the first two segments (guards against extra path noise).
  return { owner: segs[0]!, repo: segs[1]! };
}
