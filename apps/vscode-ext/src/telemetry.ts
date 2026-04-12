import * as Sentry from '@sentry/node';
import * as vscode from 'vscode';
import { log } from './logger';

let initialized = false;

/**
 * In-session dedup cache for invariant / unexpected-state reports.
 *
 * Many of these signals fire from polling loops or per-file handlers, so the
 * same condition can trigger hundreds of times in one session. We only need
 * one sample per (name + context) per session to know it happened. Capped so
 * a genuinely runaway loop can't blow up memory.
 */
const DEDUP_CAP = 100;
const seenSignals = new Set<string>();

function dedupKey(name: string, context?: Record<string, string>): string {
  if (!context) return name;
  // Stable key ignoring insertion order
  const parts = Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join('|');
  return `${name}::${parts}`;
}

function shouldSendDeduped(name: string, context?: Record<string, string>): boolean {
  const key = dedupKey(name, context);
  if (seenSignals.has(key)) return false;
  if (seenSignals.size >= DEDUP_CAP) return false;
  seenSignals.add(key);
  return true;
}

const SENTRY_DSN =
  'https://1d35874d3c7a6560caaa4204c86842de@o4511201332035584.ingest.de.sentry.io/4511201335509072';

/**
 * Initialize Sentry error reporting.
 * Only sends data if:
 * 1. The user has opted in via shiftspace.telemetry.enabled
 * 2. VSCode's global telemetry level is not 'off'
 */
export function initTelemetry(extensionVersion: string): void {
  if (initialized) return;
  if (!shouldSendTelemetry()) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    release: `shiftspace@${extensionVersion}`,
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',

    // Only send errors and crashes, no performance/transaction data
    tracesSampleRate: 0,

    // Strip any potentially sensitive data
    beforeSend(event) {
      // Don't send if telemetry was disabled after init
      if (!shouldSendTelemetry()) return null;

      // Remove any file paths that might contain usernames
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.stacktrace?.frames) {
            for (const frame of exception.stacktrace.frames) {
              if (frame.filename) {
                frame.filename = frame.filename
                  .replace(/^\/Users\/[^/]+/, '~')
                  .replace(/^[A-Z]:\\Users\\[^\\]+/, '~')
                  .replace(/^\/home\/[^/]+/, '~');
              }
            }
          }
        }
      }

      // Remove breadcrumbs that might contain file contents
      event.breadcrumbs = event.breadcrumbs?.filter(
        (b) => b.category !== 'console' // console logs might contain code
      );

      return event;
    },
  });

  initialized = true;
}

/**
 * Check both Shiftspace setting AND VSCode global telemetry.
 */
function shouldSendTelemetry(): boolean {
  // Check VSCode's global telemetry level
  if (!vscode.env.isTelemetryEnabled) return false;

  // Check our own opt-in setting
  const config = vscode.workspace.getConfiguration('shiftspace');
  return config.get<boolean>('telemetry.enabled', false);
}

/**
 * Report an error to Sentry (if telemetry is enabled).
 */
export function reportError(error: Error, context?: Record<string, string>): void {
  if (!initialized || !shouldSendTelemetry()) return;

  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Report a non-fatal issue (warning level).
 */
export function reportWarning(message: string, context?: Record<string, string>): void {
  if (!initialized || !shouldSendTelemetry()) return;

  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureMessage(message);
  });
}

/**
 * Assert that `cond` holds. If not, log a warning locally and report it to
 * Sentry (deduped per-session). Never throws — invariants describe states we
 * want to investigate, not states that should crash the extension.
 *
 * Use for "this should never happen as long as the world is sane" conditions.
 * Example:
 *   invariant(worktrees.length > 0, 'git.worktreesNonEmpty', { root })
 */
export function invariant(
  cond: unknown,
  name: string,
  context?: Record<string, string>
): asserts cond {
  if (cond) return;
  reportInvariant(name, context);
}

/** Imperative form of `invariant` — use when the failing condition isn't a simple boolean. */
export function reportInvariant(name: string, context?: Record<string, string>): void {
  log.warn(`[invariant] ${name}`, context ?? {});
  if (!initialized || !shouldSendTelemetry()) return;
  if (!shouldSendDeduped(name, context)) return;

  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('category', 'invariant');
    scope.setTag('invariant', name);
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureMessage(`invariant violated: ${name}`);
  });
}

/**
 * Report an unexpected but recoverable state — a condition we want to
 * investigate but that doesn't rise to a hard invariant (e.g. MCP called
 * with an unknown cwd, webview sent an unknown message type).
 *
 * Also deduped per-session to avoid flooding Sentry from polling code.
 */
export function reportUnexpectedState(name: string, context?: Record<string, string>): void {
  log.warn(`[unexpected] ${name}`, context ?? {});
  if (!initialized || !shouldSendTelemetry()) return;
  if (!shouldSendDeduped(name, context)) return;

  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('category', 'unexpected_state');
    scope.setTag('state', name);
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureMessage(`unexpected state: ${name}`);
  });
}

/**
 * Clean up Sentry on extension deactivation.
 */
export async function closeTelemetry(): Promise<void> {
  if (!initialized) return;
  await Sentry.close(2000);
}

/** Test-only: reset the dedup cache. Exported so unit tests can exercise hot paths. */
export function __resetTelemetryDedupForTests(): void {
  seenSignals.clear();
}
