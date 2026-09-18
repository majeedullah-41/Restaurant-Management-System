import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 4500,
  error: 6000,
};

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION[type]);
    },
    [dismiss]
  );

  const api = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
      info: (message: string) => toast(message, "info"),
      warning: (message: string) => toast(message, "warning"),
    }),
    [toast]
  );

  if (toasts.length === 0) {
    return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[80] flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { icon, iconCls, barCls } = getToastStyles(item.type);

  return (
    <div
      role="status"
      data-testid={`toast-${item.type}`}
      className="pointer-events-auto relative overflow-hidden flex items-start gap-3 max-w-sm w-full bg-slate-800 dark:bg-slate-900 rounded-xl shadow-xl shadow-slate-900/30 border border-slate-600/60 dark:border-slate-700 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={`mt-0.5 shrink-0 ${iconCls}`}>{icon}</span>
        <p className="text-sm text-slate-100 leading-snug break-words">{item.message}</p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-auto shrink-0 text-slate-300 hover:text-white cursor-pointer transition-colors"
      >
        <X size={15} />
      </button>
      <span
        className={`absolute bottom-0 left-0 h-0.5 ${barCls} toast-progress`}
        style={{ animationDuration: `${TOAST_DURATION[item.type]}ms` }}
      />
    </div>
  );
}

function getToastStyles(type: ToastType) {
  switch (type) {
    case "success":
      return { icon: <CheckCircle2 size={18} />, iconCls: "text-emerald-400", barCls: "bg-emerald-500" };
    case "error":
      return { icon: <XCircle size={18} />, iconCls: "text-red-400", barCls: "bg-red-500" };
    case "warning":
      return { icon: <AlertTriangle size={18} />, iconCls: "text-amber-400", barCls: "bg-amber-500" };
    case "info":
    default:
      return { icon: <Info size={18} />, iconCls: "text-blue-400", barCls: "bg-blue-500" };
  }
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}