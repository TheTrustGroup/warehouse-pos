/**
 * Inner error boundary for the POS route only.
 * Catches errors in POS content (product load, grid, cart, etc.) so we show
 * an inline "Couldn't load POS" + Retry instead of the full-route "Something went wrong in POS".
 * The outer RouteErrorBoundary only sees errors if this boundary fails to render its fallback.
 */
import { Component, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { reportError } from '../../lib/errorReporting';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class POSContentBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportError(error, { componentStack: errorInfo.componentStack, route: 'POS-content' });
    console.error('[POS ERROR BOUNDARY CAUGHT]', error);
    console.error('[POS ERROR BOUNDARY INFO]', errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-[50vh] flex flex-col items-center justify-center p-6 bg-[var(--edk-bg)]"
          role="alert"
        >
          <p className="text-[var(--edk-ink)] font-semibold text-center mb-2">
            Couldn&apos;t load POS
          </p>
          <p className="text-sm text-[var(--edk-ink-3)] text-center max-w-sm mb-6">
            Check your connection and try again. If the problem continues, refresh the page.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: '#1a1a1a',
                color: '#ef4444',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '11px',
                overflow: 'auto',
                maxHeight: '200px',
                textAlign: 'left',
                marginTop: '12px',
                width: '100%',
                maxWidth: '480px',
              }}
              role="log"
            >
              {this.state.error?.message}
              {'\n'}
              {this.state.error?.stack}
            </pre>
          )}
          <Button
            variant="primary"
            onClick={this.handleRetry}
            className="inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
