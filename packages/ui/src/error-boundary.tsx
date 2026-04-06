import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Fallback UI shown when a child throws. Receives a retry callback. */
  fallback: ReactNode | ((retry: () => void) => ReactNode);
  /** When this value changes, the error state is automatically cleared. */
  resetKey?: unknown;
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
    console.error('[Shiftspace] Component error:', error, info.componentStack);
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
