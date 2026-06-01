import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /**
   * Custom fallback to render when an error is caught. When omitted a minimal
   * built-in fallback with a "Try again" button is shown.
   */
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * React error boundary that prevents an uncaught render error from taking down
 * the entire app. Wrap any major UI section (terminal stack, editor, AI panel)
 * to contain failures locally.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeFeature />
 *   </ErrorBoundary>
 *
 * The boundary resets when the user clicks "Try again", which re-mounts the
 * subtree and gives the component a fresh start.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error("[nexis] React error boundary caught:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="flex h-full w-full items-center justify-center p-8 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-3 text-center max-w-sm">
            <span className="text-base font-medium text-foreground">
              Something went wrong
            </span>
            {this.state.error?.message && (
              <span className="font-mono text-xs opacity-60 break-all">
                {this.state.error.message}
              </span>
            )}
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
