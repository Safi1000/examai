"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";

type ToastTone = "default" | "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "default") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </ToastContext.Provider>
  );
}

const toneStyles: Record<ToastTone, string> = {
  default: "border-border-strong bg-surface text-ink",
  success: "border-success bg-success-soft text-success",
  error: "border-error bg-error-soft text-error",
  info: "border-info bg-info-soft text-info",
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto w-full max-w-sm animate-slide-in rounded-md border px-4 py-3 text-left text-sm font-medium shadow-[var(--shadow-md)] ${toneStyles[t.tone]}`}
        >
          {t.message}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
