import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export const Dialog = ({ open, onOpenChange, children }: any) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => onOpenChange?.(false)} />
      <div className="relative z-50 w-full max-h-[90vh] overflow-y-auto">
        {React.Children.map(children, (child) =>
          React.isValidElement(child) ? React.cloneElement(child as any, { onClose: () => onOpenChange?.(false) }) : child
        )}
      </div>
    </div>
  );
};

export const DialogContent = ({ children, className, onClose, ...props }: any) => (
  <div className={cn("relative mx-auto w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg", className)} {...props}>
    <button
      type="button"
      onClick={onClose}
      className="absolute right-4 top-4 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      aria-label="Close"
    >
      <X className="size-4" />
    </button>
    {children}
  </div>
);

export const DialogHeader = ({ children, className }: any) => (
  <div className={cn("flex flex-col space-y-1.5 pb-4 border-b border-slate-100 mb-4", className)}>{children}</div>
);

export const DialogTitle = ({ children, className }: any) => (
  <h2 className={cn("text-lg font-semibold leading-none tracking-tight text-slate-900", className)}>{children}</h2>
);

export const DialogDescription = ({ children, className }: any) => (
  <p className={cn("text-xs text-slate-500", className)}>{children}</p>
);
