import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | string;
  size?: 'default' | 'sm' | 'lg' | 'icon' | string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50";
    
    let variantCls = "bg-[#373757] text-white shadow-xs hover:bg-[#282846]";
    if (variant === 'outline') {
      variantCls = "border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50";
    } else if (variant === 'ghost') {
      variantCls = "text-slate-700 hover:bg-slate-100 hover:text-slate-900";
    } else if (variant === 'destructive') {
      variantCls = "bg-red-600 text-white shadow-xs hover:bg-red-700";
    } else if (variant === 'secondary') {
      variantCls = "bg-slate-100 text-slate-900 shadow-xs hover:bg-slate-200";
    }

    let sizeCls = "h-8 px-3 py-1.5";
    if (size === 'sm') sizeCls = "h-7 px-2.5 text-xs";
    if (size === 'lg') sizeCls = "h-10 px-5 text-sm";
    if (size === 'icon') sizeCls = "size-8 p-1";

    return (
      <button
        ref={ref}
        className={cn(base, variantCls, sizeCls, className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
