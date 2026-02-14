import { createContext, useContext, useState, ReactNode } from 'react';
import { Toast } from '../components/ui/Toast';

interface ToastContextType {
  showToast: (type: 'success' | 'error' | 'warning', message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'warning'; message: string }>>([]);

  const showToast = (type: 'success' | 'error' | 'warning', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toasts: transient feedback only (z-index 60). Critical/blocking errors must use in-flow banners that reserve layout space. */}
      <div className="fixed bottom-[max(1rem,var(--safe-bottom))] right-[max(1rem,var(--safe-right))] z-[60] flex flex-col items-end gap-2 max-h-[min(50vh,320px)] overflow-y-auto pointer-events-none [&>*]:pointer-events-auto">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
