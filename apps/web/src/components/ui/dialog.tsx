import { cn } from "../../lib/cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="dv-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div
        className={cn(
          "dv-dialog relative z-10 w-full max-w-lg",
          className,
        )}
      >
        {title ? (
          <div className="dv-card-header flex items-center justify-between px-6 py-4">
            <h2 className="text-base font-semibold text-[var(--dv-text)]">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
