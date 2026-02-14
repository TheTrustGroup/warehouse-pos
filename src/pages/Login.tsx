import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { API_BASE_URL } from '../lib/api';
import { apiRequest } from '../lib/apiClient';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { validateLoginForm } from '../lib/validationSchemas';
import { Button } from '../components/ui/Button';
import { Lock, Mail, WifiOff, Clock, ShieldAlert } from 'lucide-react';

const SERVER_UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOfflineOption, setShowOfflineOption] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { login, loginOffline, sessionExpired, clearSessionExpired, authError, clearAuthError } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    clearSessionExpired();
  }, [clearSessionExpired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const result = validateLoginForm(email, password);
    if (!result.success) {
      setFieldErrors(result.errors);
      const first = Object.values(result.errors)[0];
      if (first) showToast('error', first);
      return;
    }
    setFieldErrors({});
    setShowOfflineOption(false);
    try {
      setIsLoading(true);
      const redirectPath = await login(result.data.email, result.data.password);
      showToast('success', 'Login successful');
      // Prefetch: wake serverless while user is still on login so first screen load is faster
      apiRequest({
        baseUrl: API_BASE_URL,
        path: '/api/health',
        method: 'GET',
        timeoutMs: 8_000,
        maxRetries: 0,
        skipCircuit: true,
      }).catch(() => {});
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isServerUnreachable =
        message === SERVER_UNREACHABLE ||
        /load failed|failed to fetch|network error|networkrequestfailed/i.test(message);
      if (isServerUnreachable) {
        setShowOfflineOption(true);
        showToast('error', SERVER_UNREACHABLE);
      } else {
        showToast('error', getUserFriendlyMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueOffline = () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      showToast('error', 'Enter your email first');
      return;
    }
    loginOffline(trimmedEmail);
    showToast('success', 'Signed in offline. Your local inventory is available.');
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
      <div className="glass-card max-w-md w-full p-8 animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold gradient-text mb-2">
            Extreme Dept Kidz
          </h1>
          <p className="text-slate-600">Warehouse & POS System</p>
        </div>

        {sessionExpired && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Session expired</p>
              <p className="text-sm text-amber-700 mt-0.5">You were signed out due to inactivity. Please sign in again.</p>
            </div>
          </div>
        )}

        {authError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3" role="alert">
            <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Role could not be verified</p>
              <p className="text-sm text-red-700 mt-0.5">{authError}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={clearAuthError}
                className="mt-2 text-sm font-semibold text-red-700 hover:text-red-800 underline min-h-0 py-1"
              >
                Dismiss and try again
              </Button>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2" htmlFor="login-email">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: '' })); }}
                className={`input-field w-full pl-10 ${fieldErrors.email ? 'border-red-500' : ''}`}
                placeholder="Enter your email"
                autoComplete="email"
                disabled={isLoading}
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="login-email-error" className="text-red-600 text-sm mt-1">{fieldErrors.email}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2" htmlFor="login-password">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: '' })); }}
                className={`input-field w-full pl-10 ${fieldErrors.password ? 'border-red-500' : ''}`}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              />
              {fieldErrors.password && (
                <p id="login-password-error" className="text-red-600 text-sm mt-1">{fieldErrors.password}</p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            className="w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              'Login'
            )}
          </Button>

          {showOfflineOption && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-sm text-slate-600 mb-2">Server unreachable. You can still use the app with your local data:</p>
              <p className="text-xs text-slate-500 mb-2 break-all">API: {API_BASE_URL}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={handleContinueOffline}
                className="w-full py-2.5 flex items-center justify-center gap-2"
              >
                <WifiOff className="w-4 h-4" />
                Continue offline
              </Button>
            </div>
          )}
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          Warehouse Management System
        </p>
      </div>
    </div>
  );
}
