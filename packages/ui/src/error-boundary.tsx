import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Global error reporter — set this to forward component errors to an external
 * system (e.g. VSCode Output channel). Defaults to no-op.
 */
export let onComponentError: (error: Error, componentStack: string | undefined) => void = () => {};

/**
 * Set the global component error reporter.
 * Call this once at app startup (e.g. in the webview entry point).
 */
export function setComponentErrorReporter(
  reporter: (error: Error, componentStack: string | undefined) => void
): void {
  onComponentError = reporter;
}

interface ErrorBoundaryProps {
  /** Fallback UI shown when a child throws. Receives a retry callback. */
  fallback: ReactNode | ((retry: () => void) => ReactNode);
  /** When this value changes, the error state is automatically cleared. */
  resetKey?: unknown;
  /** Called when an error is caught — use to report errors to external systems. */
  onError?: (error: Error, componentStack: string | undefined) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render errors in descendant components and displays a fallback
 * instead of crashing the entire view.
 *
 * Supports automatic recovery via `resetKey` (clears the error when the key
 * changes) and manual recovery via the retry callback passed to `fallback`.
 *
 * React 19 still requires class components for error boundaries.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack ?? undefined;
    console.error('[Shiftspace] Component error:', error, stack);
    this.props.onError?.(error, stack);
    onComponentError(error, stack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(this.handleRetry) : fallback;
    }
    return this.props.children;
  }
}
