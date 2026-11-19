import React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ children, className, ...props }: any) => (
  <div className={cn("rounded-lg border border-slate-200 bg-white text-slate-900 shadow-xs", className)} {...props}>
    {children}
  </div>
);
export const CardHeader = ({ children, className, ...props }: any) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}>{children}</div>
);
export const CardTitle = ({ children, className, ...props }: any) => (
  <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props}>{children}</h3>
);
export const CardDescription = ({ children, className, ...props }: any) => (
  <p className={cn("text-sm text-slate-500", className)} {...props}>{children}</p>
);
export const CardContent = ({ children, className, ...props }: any) => (
  <div className={cn("p-6 pt-0", className)} {...props}>{children}</div>
);
