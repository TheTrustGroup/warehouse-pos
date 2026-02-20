// ============================================================
// LoginPage.tsx  —  warehouse-pos/src/pages/LoginPage.tsx
// Premium dark brand panel + clean form. Mobile-first.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { validateLoginForm } from '../lib/validationSchemas';

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconEyeOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const SERVER_UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';

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
    const t = setTimeout(() => { setReady(true); emailRef.current?.focus(); }, 60);
    return () => clearTimeout(t);
  }, []);

  // Show authError or sessionExpired in banner
  const bannerError = authError ?? (sessionExpired ? 'Your session expired. Please sign in again.' : null) ?? error;

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
    <div className="min-h-screen flex flex-col md:flex-row" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Dark brand panel ────────────────────────────────── */}
      <div className="relative overflow-hidden md:w-[400px] md:min-h-screen flex-shrink-0
                      flex flex-col justify-between px-8 py-9 md:px-12 md:py-14
                      bg-[#0A0E1A]">

        {/* Background grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.045] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="g" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0L0 0 0 44" fill="none" stroke="white" strokeWidth="0.8"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#g)"/>
        </svg>

        {/* Red atmospheric glows */}
        <div className="absolute -top-20 -left-10 w-72 h-72 rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.18) 0%, transparent 70%)' }}/>
        <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.1) 0%, transparent 70%)' }}/>
        {/* Vertical separator line */}
        <div className="absolute right-0 top-0 bottom-0 w-px hidden md:block"
             style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.07), transparent)' }}/>

        {/* Logo mark */}
        <div className="relative z-10">
          <div className="w-11 h-11 rounded-[14px] bg-red-500 flex items-center justify-center
                          text-white text-[17px] font-black"
               style={{ boxShadow: '0 4px 20px rgba(239,68,68,0.5)' }}>
            E
          </div>
        </div>

        {/* Headline — desktop only */}
        <div className="relative z-10 hidden md:block">
          <h1 className="text-white font-black leading-[0.92] tracking-[-0.03em]"
              style={{ fontSize: '52px' }}>
            Extreme<br/>
            <span style={{ color: '#EF4444' }}>Dept</span><br/>
            Kidz
          </h1>
          <p className="text-slate-500 text-[14px] mt-5 leading-relaxed max-w-[230px]">
            Warehouse & point-of-sale system for your stores.
          </p>
          <div className="mt-7 space-y-2.5">
            {['Multi-warehouse inventory', 'Size-based stock tracking', 'Fast POS checkout'].map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-1 h-1 rounded-full bg-red-500 flex-shrink-0"/>
                <span className="text-[12px] text-slate-500">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile brand */}
        <div className="relative z-10 md:hidden">
          <p className="text-[24px] font-black text-white tracking-tight">
            Extreme <span style={{ color: '#EF4444' }}>Dept</span> Kidz
          </p>
        </div>

        {/* Version */}
        <div className="relative z-10 hidden md:block">
          <p className="text-[11px] text-slate-700 font-mono">warehouse.extremedeptkidz.com</p>
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12 md:py-0">
        <div className={`w-full max-w-[380px] transition-all duration-500
                         ${ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
             style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}>

          {/* Form header */}
          <div className="mb-8">
            <h2 className="text-[30px] font-black text-slate-900 tracking-tight leading-tight">
              Welcome back
            </h2>
            <p className="text-slate-400 text-[14px] mt-1.5 font-medium">
              Sign in to your workspace
            </p>
          </div>

          {/* Error banner */}
          {bannerError && (
            <div className="mb-5 px-4 py-3.5 rounded-2xl bg-red-50 border border-red-200
                            flex gap-3 items-start" style={{ animation: 'slideDown 0.2s ease' }}>
              <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-[13px] font-semibold text-red-700 leading-snug">{bannerError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Email */}
            <div>
              <label htmlFor="login-email"
                     className="block text-[11px] font-bold text-slate-500 uppercase tracking-[0.09em] mb-2">
                Email address
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <IconMail/>
                </span>
                <input
                  ref={emailRef}
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); clearAuthError(); }}
                  placeholder="info@extremedeptkidz.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full pl-11 pr-4 rounded-2xl border-[1.5px] border-slate-200 bg-white
                             text-[15px] text-slate-900 placeholder:text-slate-300
                             focus:outline-none focus:border-red-400 focus:ring-[3px] focus:ring-red-100
                             disabled:opacity-50 transition-all duration-150"
                  style={{ height: '52px' }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password"
                     className="block text-[11px] font-bold text-slate-500 uppercase tracking-[0.09em] mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <IconLock/>
                </span>
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); clearAuthError(); }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full pl-11 pr-12 rounded-2xl border-[1.5px] border-slate-200 bg-white
                             text-[15px] text-slate-900 placeholder:text-slate-300
                             focus:outline-none focus:border-red-400 focus:ring-[3px] focus:ring-red-100
                             disabled:opacity-50 transition-all duration-150"
                  style={{ height: '52px' }}
                />
                <button type="button" tabIndex={-1}
                        onClick={() => setShowPw(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400
                                   hover:text-slate-600 transition-colors p-1">
                  {showPw ? <IconEyeOff/> : <IconEyeOn/>}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl border-none bg-red-500 hover:bg-red-600
                           text-white text-[16px] font-extrabold tracking-wide
                           flex items-center justify-center gap-3
                           disabled:bg-slate-200 disabled:text-slate-400
                           active:scale-[0.98] transition-all duration-150"
                style={{
                  height: '56px',
                  boxShadow: loading ? 'none' : '0 4px 20px rgba(239,68,68,0.35)',
                }}
              >
                {loading ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                         style={{ animation: 'spin 0.7s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </button>
            </div>

            {/* Continue offline */}
            {showOfflineOption && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleContinueOffline}
                  className="w-full rounded-2xl border-2 border-slate-300 bg-transparent
                             text-slate-600 text-[14px] font-semibold
                             hover:bg-slate-100 hover:border-slate-400
                             py-3 transition-all duration-150"
                >
                  Continue offline
                </button>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200 text-center space-y-1">
            <p className="text-[12px] text-slate-400 font-medium">Warehouse Management System</p>
            <p className="text-[11px] text-slate-300 font-mono">v2.0 · extremedeptkidz.com</p>
          </div>
        </div>
      </div>

      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap"/>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
