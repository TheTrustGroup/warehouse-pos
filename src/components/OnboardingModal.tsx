/**
 * First-time user onboarding: tutorial steps, offline explanation, sync status, help link.
 * Shown once per device (localStorage). Dismissible.
 */

import { useState, useEffect } from 'react';
import { X, WifiOff, Cloud, RefreshCw, BookOpen, ChevronRight } from 'lucide-react';
import { Button } from './ui/Button';

const STORAGE_KEY = 'warehouse_onboarding_seen';
const STEPS = [
  {
    title: 'Welcome',
    body: 'This app works offline. Add and edit products anytime; changes sync to the server when you’re back online.',
    icon: Cloud,
  },
  {
    title: 'Offline mode',
    body: 'When you see "Working offline", you can still add, edit, and delete products. They’ll sync automatically within about 30 seconds after you reconnect.',
    icon: WifiOff,
  },
  {
    title: 'Sync status',
    body: 'Use the sync bar at the top (or Settings → Admin & logs) to see pending changes and trigger a sync. Products show a "pending" badge until synced.',
    icon: RefreshCw,
  },
  {
    title: 'Need help?',
    body: 'Check the documentation for troubleshooting, backup/restore, and browser requirements.',
    icon: BookOpen,
  },
];

/** Link to help docs; update to your repo or docs site (e.g. import.meta.env.VITE_HELP_URL). */
const HELP_URL = typeof import.meta.env !== 'undefined' && import.meta.env?.VITE_HELP_URL
  ? String(import.meta.env.VITE_HELP_URL)
  : '#';

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setOpen(false);
      else setOpen(true);
    } catch {
      setOpen(false);
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current?.icon ?? Cloud;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="glass-card max-w-md w-full p-6 relative animate-fade-in-up">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{current?.title}</h2>
            <p className="text-slate-600 text-sm mt-1">{current?.body}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${i === step ? 'bg-primary-600' : 'bg-slate-200'}`}
                aria-hidden
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button variant="primary" size="sm" onClick={() => setStep((s) => s + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1 inline" />
              </Button>
            ) : (
              <>
                <a
                  href={HELP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  <BookOpen className="w-4 h-4" /> Docs
                </a>
                <Button variant="primary" size="sm" onClick={dismiss}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
