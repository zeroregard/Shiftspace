import * as Sentry from '@sentry/node';
import * as vscode from 'vscode';

let initialized = false;

const SENTRY_DSN = 'https://1d35874d3c7a6560caaa4204c86842de@o4511201332035584.ingest.de.sentry.io/4511201335509072';

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
 * Clean up Sentry on extension deactivation.
 */
export async function closeTelemetry(): Promise<void> {
  if (!initialized) return;
  await Sentry.close(2000);
}
