"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info" | "warning";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Milliseconds; errors stay longer because they need reading. */
  duration: number;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  description?: string;
  duration?: number;
};

const ToastContext = createContext<{
  push: (toast: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
} | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const tone = input.tone ?? "info";
      const toast: Toast = {
        id: nextId++,
        tone,
        title: input.title,
        description: input.description,
        duration: input.duration ?? (tone === "error" ? 8000 : 4500),
      };
      // Cap the stack so a burst of updates cannot cover the screen.
      setToasts((current) => [...current.slice(-2), toast]);
      timers.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), toast.duration),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      push,
      success: (title: string, description?: string) =>
        push({ tone: "success", title, description }),
      error: (title: string, description?: string) =>
        push({ tone: "error", title, description }),
      info: (title: string, description?: string) =>
        push({ tone: "info", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Live region so screen readers announce results of actions. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Record<ToastTone, { bar: string; icon: ReactNode }> = {
  success: {
    bar: "bg-success",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-success">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.7 6.2-4.4 4.4a.9.9 0 0 1-1.27 0L6.3 10.87a.9.9 0 0 1 1.27-1.27l1.1 1.1 3.76-3.77A.9.9 0 0 1 13.7 8.2Z" />
      </svg>
    ),
  },
  error: {
    bar: "bg-danger",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-danger">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.4a.9.9 0 0 1 .9.9v4a.9.9 0 0 1-1.8 0v-4a.9.9 0 0 1 .9-.9Zm0 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
      </svg>
    ),
  },
  warning: {
    bar: "bg-warning",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-warning">
        <path d="M10 2 19 17H1L10 2Zm0 5.5a.9.9 0 0 0-.9.9v3a.9.9 0 0 0 1.8 0v-3a.9.9 0 0 0-.9-.9Zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
      </svg>
    ),
  },
  info: {
    bar: "bg-info",
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-info">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm.9 4.1a.9.9 0 0 0-1.8 0v4a.9.9 0 0 0 1.8 0v-4Z" />
      </svg>
    ),
  },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = TONE_STYLE[toast.tone];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className="animate-rise pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-lg border border-line bg-surface shadow-e3"
    >
      <span aria-hidden className={cn("w-1 shrink-0", style.bar)} />
      <div className="flex min-w-0 flex-1 items-start gap-2.5 p-3">
        <span className="mt-px shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-semibold text-ink">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-2">
              {toast.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-m-1 shrink-0 rounded p-1 text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink-2"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
            <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L6.99 8 3.3 4.3l1-1Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return context;
}
