import React from 'react';
import { cn } from '@/lib/utils';

export const Select = ({ children, value, onValueChange, className }: any) => {
  let options: any[] = [];
  React.Children.forEach(children, (child) => {
    if (child && child.type === SelectContent) {
      options = React.Children.toArray(child.props.children);
    }
  });

  return (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={cn(
        "flex h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400",
        className
      )}
    >
      {options.map((opt: any) =>
        opt && opt.props ? (
          <option key={opt.props.value} value={opt.props.value}>
            {opt.props.children}
          </option>
        ) : null
      )}
    </select>
  );
};

export const SelectTrigger = ({ children }: any) => null;
export const SelectContent = ({ children }: any) => null;
export const SelectItem = ({ children, value }: any) => null;
export const SelectValue = ({ placeholder }: any) => null;
