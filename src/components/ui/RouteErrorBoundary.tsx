import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportError } from '../../lib/errorReporting';
import { getUserFriendlyMessage } from '../../lib/errorMessages';
import { Button } from './Button';
import { Card } from './Card';

interface Props {
  children: ReactNode;
  /** Route/section name shown in the fallback (e.g. "Inventory", "POS"). */
  routeName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary for a single route or feature. Catches errors in children,
 * reports them, and shows a fallback with "Try again" (resets boundary) and "Refresh page".
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportError(error, {
      componentStack: errorInfo.componentStack,
      route: this.props.routeName,
    });
    // Always log so the root cause is visible in DevTools (dev and production).
    const label = this.props.routeName ?? 'Route';
    console.error(`[RouteErrorBoundary] ${label}:`, error?.message ?? String(error), error?.stack ?? '');
    console.error('[POS ERROR BOUNDARY CAUGHT]', error);
    console.error('[POS ERROR BOUNDARY INFO]', errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const { routeName } = this.props;
      const title = routeName ? `Something went wrong in ${routeName}` : 'Something went wrong';
      const friendlyMessage = this.state.error ? getUserFriendlyMessage(this.state.error) : 'You can try again or refresh the page. If the problem continues, check your connection or contact support.';
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6 bg-slate-50/80">
          <Card className="max-w-md text-center animate-fade-in-up p-8">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
            <p className="text-slate-600 mb-6 text-sm">
              {friendlyMessage}
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
                }}
                role="log"
              >
                {this.state.error?.message}
                {'\n'}
                {this.state.error?.stack}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="primary" onClick={this.handleRetry} className="inline-flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Try again
              </Button>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Refresh page
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
