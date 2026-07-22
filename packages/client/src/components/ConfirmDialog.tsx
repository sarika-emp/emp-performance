// ============================================================================
// Confirm dialog — a styled, promise-based replacement for window.confirm().
//
// Usage:
//   const confirm = useConfirm();
//   if (await confirm({ title: "Delete PIP?", message: "…", confirmLabel: "Delete", variant: "danger" })) {
//     // proceed
//   }
//
// Wrap the app once in <ConfirmDialogProvider>. The hook returns a Promise
// that resolves true (confirmed) or false (cancelled / dismissed).
// ============================================================================

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((options) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  const isDanger = opts?.variant === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {isDanger && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
              )}
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">{opts.title}</h2>
                {opts.message && (
                  <p className="mt-1 text-sm text-gray-500">{opts.message}</p>
                )}
              </div>
              <button
                onClick={() => close(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={
                  "rounded-lg px-4 py-2 text-sm font-medium text-white " +
                  (isDanger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-600 hover:bg-brand-700")
                }
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
