import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Lock, Mail, WifiOff, Clock } from 'lucide-react';

const SERVER_UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOfflineOption, setShowOfflineOption] = useState(false);
  const { login, loginOffline, sessionExpired, clearSessionExpired } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    clearSessionExpired();
  }, [clearSessionExpired]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      showToast('error', 'Please enter email and password');
      return;
    }

    setShowOfflineOption(false);
    try {
      setIsLoading(true);
      await login(trimmedEmail, trimmedPassword);
      showToast('success', 'Login successful');
      navigate('/', { replace: true });
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Login failed';
      const isServerUnreachable =
        message === SERVER_UNREACHABLE ||
        /load failed|failed to fetch|network error|networkrequestfailed/i.test(message);
      if (isServerUnreachable) {
        message = SERVER_UNREACHABLE;
        setShowOfflineOption(true);
      }
      showToast('error', message);
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

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your email"
                autoComplete="email"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Logging in...</span>
              </>
            ) : (
              'Login'
            )}
          </button>

          {showOfflineOption && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-sm text-slate-600 mb-2">Server unreachable. You can still use the app with your local data:</p>
              <button
                type="button"
                onClick={handleContinueOffline}
                className="w-full py-2.5 px-4 rounded-xl border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors flex items-center justify-center gap-2"
              >
                <WifiOff className="w-4 h-4" />
                Continue offline
              </button>
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
