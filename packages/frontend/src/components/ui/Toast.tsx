import { useCallback, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let showToastInternal: ((message: string, type?: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = 'success') {
  showToastInternal?.(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3000);
  }, []);

  showToastInternal = show;

  const borderColor = {
    success: 'var(--green)',
    error: 'var(--red)',
    info: 'var(--blue)'
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded border bg-[var(--surface)] px-4 py-2 text-sm text-[var(--ink)] shadow-lg"
          style={{ borderColor: borderColor[toast.type] }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
