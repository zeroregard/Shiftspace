import type { PrStatus, CiStatus, MergeableState } from '@shiftspace/renderer';
import type { GitHubRepoRef } from './remote';

const API_BASE = 'https://api.github.com';
const GRAPHQL_URL = 'https://api.github.com/graphql';

/** Error carrying the HTTP status and rate-limit reset (epoch ms) if present. */
export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Epoch ms when the rate limit resets, if the response advertised it. */
    readonly rateLimitResetMs?: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** True when the error is a GitHub rate-limit / abuse rejection (403/429). */
export function isRateLimited(err: unknown): boolean {
  return err instanceof GitHubApiError && (err.status === 403 || err.status === 429);
}

// ---------------------------------------------------------------------------
// Raw API response shapes (only the fields we consume)
// ---------------------------------------------------------------------------

interface RawPrListItem {
  number: number;
  html_url: string;
  head: { sha: string };
}

export interface RawPrDetail {
  mergeable: boolean | null;
  mergeable_state?: string;
}

export interface RawReview {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  user: { login: string } | null;
  submitted_at?: string;
}

export interface RawCheckRun {
  status: 'queued' | 'in_progress' | 'completed';
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required'
    | 'skipped'
    | 'stale'
    | null;
}

export interface RawReviewThread {
  isResolved: boolean;
}

// ---------------------------------------------------------------------------
// Pure mappers (unit-tested without any network)
// ---------------------------------------------------------------------------

/** Map a PR's mergeable fields to our tri-state conflict flag. */
export function mapMergeable(detail: RawPrDetail): MergeableState {
  if (detail.mergeable === false || detail.mergeable_state === 'dirty') return true;
  if (detail.mergeable === true) return false;
  return 'unknown'; // GitHub still computing (null / 'unknown')
}

/**
 * Approved iff at least one reviewer's latest meaningful review is APPROVED and
 * no reviewer's latest meaningful review is CHANGES_REQUESTED. "Meaningful"
 * excludes COMMENTED/PENDING (they don't change approval), matching GitHub's
 * own latest-review-per-user logic.
 */
export function mapApproval(reviews: RawReview[]): boolean {
  const latest = new Map<string, RawReview['state']>();
  for (const r of reviews) {
    if (!r.user) continue;
    if (r.state === 'COMMENTED' || r.state === 'PENDING') continue;
    latest.set(r.user.login, r.state); // later entries overwrite earlier ones
  }
  const states = Array.from(latest.values());
  if (states.some((s) => s === 'CHANGES_REQUESTED')) return false;
  return states.some((s) => s === 'APPROVED');
}

/** Count unresolved review threads. Returns undefined when threads is null (fetch failed). */
export function mapUnresolved(threads: RawReviewThread[] | null): number | undefined {
  if (threads === null) return undefined;
  return threads.filter((t) => !t.isResolved).length;
}

/** Reduce check-runs on the head commit to a single aggregate CI status. */
export function mapCiStatus(checks: RawCheckRun[]): CiStatus {
  if (checks.length === 0) return 'none';
  if (checks.some((c) => c.status !== 'completed')) return 'running';
  const failing = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);
  if (checks.some((c) => c.conclusion && failing.has(c.conclusion))) return 'failing';
  return 'passing';
}

export interface PrStatusInputs {
  number: number;
  url: string;
  detail: RawPrDetail;
  reviews: RawReview[];
  threads: RawReviewThread[] | null;
  checks: RawCheckRun[];
  now?: number;
}

/** Combine all fetched pieces into a PrStatus. */
export function mapToPrStatus(inputs: PrStatusInputs): PrStatus {
  return {
    number: inputs.number,
    url: inputs.url,
    conflicts: mapMergeable(inputs.detail),
    approved: mapApproval(inputs.reviews),
    unresolvedComments: mapUnresolved(inputs.threads),
    ciStatus: mapCiStatus(inputs.checks),
    fetchedAt: inputs.now ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Thin GitHub client over global `fetch` (Node 18+ in the extension host).
 * Deliberately avoids `@octokit/rest` to keep the esbuild bundle small — we
 * only make a handful of read-only calls.
 */
export class GitHubClient {
  constructor(private readonly token: string) {}

  /** Fetch the full PR status for a branch, or null if there's no open PR. */
  async fetchPrStatus(ref: GitHubRepoRef, branch: string): Promise<PrStatus | null> {
    const pr = await this.findOpenPr(ref, branch);
    if (!pr) return null;
    const [detail, reviews, threads, checks] = await Promise.all([
      this.getPr(ref, pr.number),
      this.listReviews(ref, pr.number),
      this.getReviewThreads(ref, pr.number).catch(() => null), // soft-fail (GraphQL)
      this.getCheckRuns(ref, pr.head.sha),
    ]);
    return mapToPrStatus({ number: pr.number, url: pr.html_url, detail, reviews, threads, checks });
  }

  private async findOpenPr(ref: GitHubRepoRef, branch: string): Promise<RawPrListItem | null> {
    const head = `${ref.owner}:${branch}`;
    const list = await this.rest<RawPrListItem[]>(
      `/repos/${ref.owner}/${ref.repo}/pulls?head=${encodeURIComponent(head)}&state=open&per_page=1`
    );
    return list[0] ?? null;
  }

  private getPr(ref: GitHubRepoRef, number: number): Promise<RawPrDetail> {
    return this.rest<RawPrDetail>(`/repos/${ref.owner}/${ref.repo}/pulls/${number}`);
  }

  private listReviews(ref: GitHubRepoRef, number: number): Promise<RawReview[]> {
    return this.rest<RawReview[]>(
      `/repos/${ref.owner}/${ref.repo}/pulls/${number}/reviews?per_page=100`
    );
  }

  private async getCheckRuns(ref: GitHubRepoRef, sha: string): Promise<RawCheckRun[]> {
    const res = await this.rest<{ check_runs: RawCheckRun[] }>(
      `/repos/${ref.owner}/${ref.repo}/commits/${sha}/check-runs?per_page=100`
    );
    return res.check_runs ?? [];
  }

  private async getReviewThreads(ref: GitHubRepoRef, number: number): Promise<RawReviewThread[]> {
    const query = `query($owner:String!,$repo:String!,$number:Int!){
      repository(owner:$owner,name:$repo){
        pullRequest(number:$number){ reviewThreads(first:100){ nodes { isResolved } } }
      }
    }`;
    const data = await this.graphql<{
      repository: { pullRequest: { reviewThreads: { nodes: RawReviewThread[] } } };
    }>(query, { owner: ref.owner, repo: ref.repo, number });
    return data.repository.pullRequest.reviewThreads.nodes;
  }

  private async rest<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { headers: this.headers() });
    if (!res.ok) throw this.toError(res);
    return (await res.json()) as T;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw this.toError(res);
    const body = (await res.json()) as { data?: T; errors?: unknown };
    if (body.errors || !body.data) throw new GitHubApiError(200, 'GraphQL error');
    return body.data;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private toError(res: Response): GitHubApiError {
    const resetMs = parseResetMs(res.headers);
    return new GitHubApiError(res.status, `GitHub API ${res.status} for ${res.url}`, resetMs);
  }
}

/** Read rate-limit reset time (epoch ms) from response headers, if present. */
function parseResetMs(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) return Date.now() + secs * 1000;
  }
  const reset = headers.get('x-ratelimit-reset');
  if (reset) {
    const epoch = Number(reset);
    if (Number.isFinite(epoch)) return epoch * 1000;
  }
  return undefined;
}
