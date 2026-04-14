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

// ---------------------------------------------------------------------------
// Path sanitization
// ---------------------------------------------------------------------------
//
// Sentry events must not leak absolute filesystem paths. Home-prefix stripping
// (`/Users/alice` → `~`) isn't enough — intermediate project folders like
// `Projects/CF/cf-web/.cursor/orchestrator/package.json` still identify a
// user. We replace the *entire* matched path with `<path>/<basename>`, so the
// basename stays useful for debugging but every directory disappears.

// The `(?<![A-Za-z0-9:/])` lookbehind keeps us from matching path-like
// substrings *inside* URLs (e.g. `https://host/api/v1/users` — the `/api` is
// preceded by `t`, so it's ignored). A preceding space, quote, `=`, `(`, etc.
// all still pass.
const PATH_PATTERNS: RegExp[] = [
  // Windows UNC: \\server\share\a\b
  /\\\\[^\\\s"'`<>]+\\[^\\\s"'`<>]+(?:\\[^\\\s"'`<>]+)*/g,
  // Windows drive: C:\a\b\c
  /(?<![A-Za-z0-9])[A-Za-z]:\\(?:[^\\\s"'`<>]+\\)*[^\\\s"'`<>]+/g,
  // POSIX anchored on known system roots. Stop at whitespace/quotes/brackets
  // so we don't swallow trailing punctuation in messages.
  /(?<![A-Za-z0-9:/])\/(?:Users|home|private\/var|private\/tmp|var|tmp|opt|usr|etc|root|mnt|Volumes)\/[^\s:'"`)<>]+/g,
];

// Generic fallback for POSIX paths that aren't under a known system root but
// still look absolute (>= 3 segments). Applied last so the more specific
// anchored patterns take precedence. Lookbehind guards against URL paths.
const GENERIC_POSIX_PATH = /(?<![A-Za-z0-9:/])\/[^\s:'"`)<>/]+\/[^\s:'"`)<>/]+\/[^\s:'"`)<>]+/g;

function basenameOf(match: string): string {
  const parts = match.split(/[\\/]/);
  let i = parts.length - 1;
  while (i >= 0 && parts[i] === '') i--;
  return i >= 0 ? parts[i]! : '';
}

function replacePath(match: string): string {
  const base = basenameOf(match);
  return base ? `<path>/${base}` : '<path>';
}

/** Strict string form — callers know they have a string. */
export function sanitizePathString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const pattern of PATH_PATTERNS) {
    out = out.replace(pattern, replacePath);
  }
  out = out.replace(GENERIC_POSIX_PATH, (match) => {
    // Guard against false positives like `/api/v1/users` inside URLs: only
    // rewrite long, multi-segment paths.
    if (match.length < 12) return match;
    return replacePath(match);
  });
  return out;
}

/** Returns `input` unchanged if it isn't a string. */
export function sanitizePath(input: unknown): unknown {
  return typeof input === 'string' ? sanitizePathString(input) : input;
}

/**
 * Recursively walk `value`, applying `sanitizePathString` to every string
 * leaf. Mutates objects/arrays in place (cheaper than cloning a Sentry event)
 * and returns the sanitized value for string inputs. Cycle-guarded via
 * WeakSet, depth-capped to avoid runaway on pathological inputs.
 */
function sanitizeDeep(value: unknown, seen: WeakSet<object> = new WeakSet(), depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') return sanitizePathString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = sanitizeDeep(value[i], seen, depth + 1);
    }
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    obj[k] = sanitizeDeep(obj[k], seen, depth + 1);
  }
  return obj;
}

function sanitizeContext(context?: Record<string, string>): Record<string, string> | undefined {
  if (!context) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = sanitizePathString(String(v));
  }
  return out;
}

/**
 * Deep-scrub a Sentry event. Applied in `beforeSend` as a defense-in-depth
 * layer on top of choke-point sanitization in the `report*` helpers. Generic
 * so it accepts both the `ErrorEvent` passed to `beforeSend` and the broader
 * `Event` shape used in tests.
 */
function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (event.message) event.message = sanitizePathString(event.message);

  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = sanitizePathString(ex.value);
      if (ex.type) ex.type = sanitizePathString(ex.type);
      if (ex.stacktrace?.frames) {
        for (const frame of ex.stacktrace.frames) {
          if (frame.filename) frame.filename = sanitizePathString(frame.filename);
          if (frame.abs_path) frame.abs_path = sanitizePathString(frame.abs_path);
          if (frame.module) frame.module = sanitizePathString(frame.module);
        }
      }
    }
  }

  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.message) b.message = sanitizePathString(b.message);
      if (b.data) sanitizeDeep(b.data);
    }
  }

  if (event.tags) {
    for (const k of Object.keys(event.tags)) {
      const v = event.tags[k];
      if (typeof v === 'string') event.tags[k] = sanitizePathString(v);
    }
  }

  if (event.extra) sanitizeDeep(event.extra);
  if (event.contexts) sanitizeDeep(event.contexts);

  if (event.request) {
    if (event.request.url) event.request.url = sanitizePathString(event.request.url);
    if (event.request.data) event.request.data = sanitizeDeep(event.request.data);
  }

  if (event.user) {
    const user = event.user as Record<string, unknown>;
    for (const k of Object.keys(user)) {
      const v = user[k];
      if (typeof v === 'string') user[k] = sanitizePathString(v);
    }
  }

  return event;
}

/**
 * Detect whether a captured exception's frames include at least one frame from
 * Shiftspace's own code. Used to drop events whose stack traces come entirely
 * from host-editor internals (`vscode-file://vscode-app/...`), which Sentry's
 * global handlers occasionally surface even though we can't act on them.
 */
export function hasShiftspaceFrame(
  values: NonNullable<NonNullable<Sentry.ErrorEvent['exception']>['values']>
): boolean {
  let sawAnyFrame = false;
  for (const value of values) {
    const frames = value.stacktrace?.frames;
    if (!frames) continue;
    for (const frame of frames) {
      const filename = frame.filename ?? '';
      if (!filename) continue;
      sawAnyFrame = true;
      // Host-editor frames live under vscode-file:// (VSCode/Cursor webview
      // bundle URLs) or reference the editor binary directly. Everything else
      // — our extension bundle, node_modules loaded by the extension host,
      // user paths — counts as "ours".
      if (filename.startsWith('vscode-file://')) continue;
      if (filename.startsWith('electron/')) continue;
      if (filename === '<anonymous>') continue;
      return true;
    }
  }
  // If we couldn't determine the origin (no frames at all), keep the event —
  // better to investigate than silently drop.
  return !sawAnyFrame;
}

/**
 * Initialize Sentry error reporting.
 * Only sends data if the user has opted in via shiftspace.telemetry.enabled.
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

    // The VS Code extension host is a shared Node process: the default
    // OnUncaughtException / OnUnhandledRejection integrations would capture
    // errors from every other extension the user has installed (we've seen
    // Cursor's built-in npm task runner leak through this way). Only report
    // errors we explicitly forward via `reportError` / `Sentry.captureException`.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection'),

    // Drop network/console breadcrumbs entirely — fetch/http leak URLs and
    // query params, console may echo file contents. Sanitize anything that
    // does make it through as a safety net.
    beforeBreadcrumb(breadcrumb) {
      if (
        breadcrumb.category === 'fetch' ||
        breadcrumb.category === 'http' ||
        breadcrumb.category === 'console'
      ) {
        return null;
      }
      if (breadcrumb.message) breadcrumb.message = sanitizePathString(breadcrumb.message);
      if (breadcrumb.data) sanitizeDeep(breadcrumb.data);
      return breadcrumb;
    },

    beforeSend(event) {
      // Don't send if telemetry was disabled after init
      if (!shouldSendTelemetry()) return null;

      // Drop events that originate entirely from the host editor's workbench
      // (e.g. Cursor/VSCode internals like `_chat.editSessions.accept` command
      // failures). The `integrations` filter above already strips the global
      // uncaught/unhandled-rejection handlers that were the main source of
      // these — this is defense-in-depth for explicit `reportError` / direct
      // `captureException` calls that might hand us a foreign stack.
      if (event.exception?.values && !hasShiftspaceFrame(event.exception.values)) {
        return null;
      }

      return scrubEvent(event);
    },
  });

  initialized = true;
}

/**
 * Check our own explicit opt-in setting.
 *
 * We intentionally do NOT gate on `vscode.env.isTelemetryEnabled`: some VS Code
 * forks (e.g. Cursor) hardcode `telemetryLevel=0` internally, which would make
 * that flag always report `false` and silently disable our telemetry even for
 * users who explicitly opted in via our first-run prompt. Shiftspace already
 * has its own explicit consent flow (defaulting to `false`), so per VS Code's
 * docs we're not required to also gate on the global telemetry level.
 */
function shouldSendTelemetry(): boolean {
  const config = vscode.workspace.getConfiguration('shiftspace');
  return config.get<boolean>('telemetry.enabled', false);
}

/**
 * Report an error to Sentry (if telemetry is enabled).
 */
export function reportError(error: Error, context?: Record<string, string>): void {
  if (!initialized || !shouldSendTelemetry()) return;

  const safe = sanitizeContext(context);
  if (safe) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(safe)) {
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

  const safe = sanitizeContext(context);
  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    if (safe) {
      for (const [key, value] of Object.entries(safe)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureMessage(sanitizePathString(message));
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
  const safe = sanitizeContext(context);
  if (!shouldSendDeduped(name, safe)) return;

  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('category', 'invariant');
    scope.setTag('invariant', name);
    if (safe) {
      for (const [key, value] of Object.entries(safe)) {
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
  const safe = sanitizeContext(context);
  if (!shouldSendDeduped(name, safe)) return;

  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('category', 'unexpected_state');
    scope.setTag('state', name);
    if (safe) {
      for (const [key, value] of Object.entries(safe)) {
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

/** Test-only: expose `scrubEvent` so tests can hit it without `Sentry.init`. */
export function __scrubEventForTests<T extends Sentry.Event>(event: T): T {
  return scrubEvent(event);
}
