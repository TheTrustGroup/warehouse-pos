import { Keyboard } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  const shortcuts = [
    { key: '/', description: 'Focus search (POS)' },
    { key: 'Ctrl + K', description: 'Quick search' },
    { key: 'Esc', description: 'Close modal' },
  ];

  return (
    <>
      <Button
        variant="action"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 p-3 glass-primary rounded-full shadow-lg hover:shadow-xl transition-shadow z-40 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-700 border border-white/20"
        title="Keyboard Shortcuts"
        aria-label="Open keyboard shortcuts"
      >
        <Keyboard className="w-5 h-5 text-slate-600" />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-overlay modal-overlay-padding p-4" onClick={() => setIsOpen(false)}>
          <div className="glass-primary glass-border-gradient rounded-2xl p-4 sm:p-6 max-w-md w-full max-h-[85vh] overflow-y-auto modal-content-fit text-slate-900 dark:text-slate-100" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2">
              {shortcuts.map((shortcut, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">{shortcut.description}</span>
                  <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full"
              aria-label="Close keyboard shortcuts"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
