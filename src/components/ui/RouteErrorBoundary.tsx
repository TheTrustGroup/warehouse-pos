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
