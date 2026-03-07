import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button, Card } from '../components/ui';

export function NotFound() {
  return (
    <div className="min-h-[var(--min-h-viewport)] flex items-center justify-center bg-[var(--edk-bg)] p-4">
      <Card className="max-w-md text-center animate-fade-in-up border border-[var(--edk-border)] bg-[var(--edk-surface)]">
        <div className="w-20 h-20 bg-[var(--edk-surface-2)] rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl font-bold text-[var(--edk-ink-3)]">404</span>
        </div>
        <h1 className="text-2xl font-bold text-[var(--edk-ink)] mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Page Not Found</h1>
        <p className="text-[var(--edk-ink-2)] mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="min-h-[var(--touch-min)] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[var(--edk-red)] hover:bg-[var(--edk-red-hover)] shadow-[0_2px_8px_var(--edk-red-soft)] transition-all"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Link>
          <Button variant="secondary" onClick={() => window.history.back()} className="inline-flex items-center justify-center gap-2" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
}
