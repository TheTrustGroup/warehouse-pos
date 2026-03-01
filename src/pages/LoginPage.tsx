// ============================================================
// LoginPage.tsx — Split layout: left dark brand panel (monochrome
// logo + Inventory & POS, tagline, features), right light form.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { validateLoginForm } from '../lib/validationSchemas';
import { BrandLockup } from '../components/ui/BrandLockup';

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEyeOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const SERVER_UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';

const FEATURES = ['Multi-warehouse inventory', 'Size-based stock tracking', 'Fast POS checkout'] as const;

const BRAND_BG = '#1A1917';
const BRAND_TEXT_MUTED = 'rgba(240,237,232,0.5)';
const BRAND_TEXT_FOOTER = 'rgba(240,237,232,0.25)';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [showOfflineOption, setShowOfflineOption] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const { login, loginOffline, sessionExpired, clearSessionExpired, authError, clearAuthError } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    clearSessionExpired();
  }, [clearSessionExpired]);

  useEffect(() => {
    const t = setTimeout(() => {
      setReady(true);
      emailRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, []);

  const bannerError =
    authError ??
    (sessionExpired ? 'Your session expired. Please sign in again.' : null) ??
    error;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const result = validateLoginForm(email, password);
    if (!result.success) {
      const first = Object.values(result.errors)[0];
      setError(first ?? 'Please check your email and password.');
      if (first) showToast('error', first);
      return;
    }
    if (loading) return;

    setLoading(true);
    setError('');
    setShowOfflineOption(false);
    clearAuthError();

    try {
      const redirectPath = await login(result.data.email, result.data.password);
      showToast('success', 'Login successful');
      navigate(redirectPath, { replace: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setError(message);
      const isServerUnreachable =
        message === SERVER_UNREACHABLE ||
        /load failed|failed to fetch|network error|networkrequestfailed/i.test(message);
      if (isServerUnreachable) {
        setShowOfflineOption(true);
        showToast('error', SERVER_UNREACHABLE);
      } else {
        showToast('error', message);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleContinueOffline() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      showToast('error', 'Enter your email first');
      return;
    }
    loginOffline(trimmedEmail);
    showToast('success', 'Signed in offline. Your local inventory is available.');
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-[var(--min-h-viewport)] flex flex-col md:flex-row">
      {/* —— Left: Dark brand panel —— */}
      <div
        className="relative flex-shrink-0 w-full md:w-[420px] md:min-h-[var(--min-h-viewport)] flex flex-col justify-between px-6 py-8 md:px-10 md:py-12"
        style={{ backgroundColor: BRAND_BG }}
      >
        {/* Subtle grid overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0L0 0 0 32" fill="none" stroke="#F0EDE8" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-grid)" />
        </svg>

        <div className="relative z-10">
          <BrandLockup variant="login" />

          {/* Tagline */}
          <p className="mt-8 text-[15px] leading-relaxed max-w-[280px]" style={{ color: BRAND_TEXT_MUTED }}>
            Warehouse & point-of-sale for your stores.
          </p>

          {/* Feature list — hidden on small mobile to keep focus on form */}
          <ul className="mt-6 space-y-3 hidden sm:block" aria-label="Features">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'rgba(240,237,232,0.4)' }}
                />
                <span className="text-[13px]" style={{ color: 'rgba(240,237,232,0.6)' }}>
                  {f}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 mt-8 hidden md:block">
          <p className="text-[11px] font-mono" style={{ color: BRAND_TEXT_FOOTER }}>
            warehouse.extremedeptkidz.com
          </p>
        </div>
      </div>

      {/* —— Right: Light form panel —— */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12 md:py-0 md:px-12 min-h-[50vh] md:min-h-0">
        <div
          className={`w-full max-w-[400px] transition-all duration-500 ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}
        >
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="text-sm mt-1.5 font-medium text-slate-500">
              Sign in to your workspace
            </p>
          </header>

          {bannerError && (
            <div
              className="mb-6 px-4 py-3.5 rounded-xl flex gap-3 items-start bg-primary-50/80 border border-primary-200 text-primary-700"
              role="alert"
              style={{ animation: 'loginSlideDown 0.25s ease' }}
            >
              <svg className="flex-shrink-0 mt-0.5 text-primary-600" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm font-semibold leading-snug">{bannerError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2"
              >
                Email address
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <IconMail />
                </span>
                <input
                  ref={emailRef}
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                    clearAuthError();
                  }}
                  placeholder="you@extremedeptkidz.com"
                  autoComplete="email"
                  disabled={loading}
                  className="input-field w-full pl-11 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400
                             border-slate-200 focus:border-primary-400 focus:ring-primary-500/20
                             disabled:opacity-50 transition-all duration-150 bg-white"
                  style={{ minHeight: 44 }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2"
              >
                Password
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <IconLock />
                </span>
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                    clearAuthError();
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                  className="input-field w-full pl-11 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-400
                             border-slate-200 focus:border-primary-400 focus:ring-primary-500/20
                             disabled:opacity-50 transition-all duration-150 bg-white"
                  style={{ minHeight: 44 }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <IconEyeOff /> : <IconEyeOn />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="animate-spin"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            {showOfflineOption && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleContinueOffline}
                  className="btn-secondary w-full"
                >
                  Continue offline
                </button>
              </div>
            )}
          </form>

          <footer className="mt-8 pt-6 border-t border-slate-200 text-center space-y-1">
            <p className="text-xs font-medium text-slate-500">
              Warehouse Management System
            </p>
            <p className="text-[11px] font-mono text-slate-400">
              v2.0 · extremedeptkidz.com
            </p>
          </footer>
        </div>
      </div>

      <style>{`
        @keyframes loginSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
