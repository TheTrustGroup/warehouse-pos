import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button, Card } from '../components/ui';

export function NotFound() {
  return (
    <div className="min-h-[var(--min-h-viewport)] flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
      <Card className="max-w-md text-center animate-fade-in-up">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl font-bold text-slate-400">404</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Page Not Found</h1>
        <p className="text-slate-600 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="btn-primary flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Link>
          <Button variant="secondary" onClick={() => window.history.back()} className="inline-flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
}
