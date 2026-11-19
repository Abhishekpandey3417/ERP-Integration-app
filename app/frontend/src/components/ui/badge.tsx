// Minimal Badge stub for compilation
import React from 'react';
import { cn } from '@/lib/utils';

export const Badge = ({ children, className, variant }: any) => (
  <span className={cn(
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
    className
  )}>
    {children}
  </span>
);
Badge.displayName = 'Badge';

