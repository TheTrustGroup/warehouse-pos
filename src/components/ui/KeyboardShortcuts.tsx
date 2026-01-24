import { Keyboard } from 'lucide-react';
import { useState } from 'react';

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  const shortcuts = [
    { key: '/', description: 'Focus search (POS)' },
    { key: 'Ctrl + K', description: 'Quick search' },
    { key: 'Esc', description: 'Close modal' },
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow z-40 min-w-[44px] min-h-[44px] flex items-center justify-center"
        title="Keyboard Shortcuts"
        aria-label="Open keyboard shortcuts"
      >
        <Keyboard className="w-5 h-5 text-slate-600" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setIsOpen(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2">
              {shortcuts.map((shortcut, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-slate-600">{shortcut.description}</span>
                  <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-6 w-full btn-primary"
              aria-label="Close keyboard shortcuts"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
