import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportError } from '../../lib/errorReporting';
import { getUserFriendlyMessage } from '../../lib/errorMessages';
import { Button } from './Button';
import { Card } from './Card';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportError(error, { componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      const friendlyMessage = this.state.error ? getUserFriendlyMessage(this.state.error) : 'Something went wrong. Please try again.';
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <Card className="max-w-md text-center animate-fade-in-up p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-600 mb-6 text-sm">
              {friendlyMessage}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="primary" onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />
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
