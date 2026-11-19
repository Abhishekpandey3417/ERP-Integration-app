import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface TabsContextType {
  value: string;
  setValue: (v: string) => void;
}
const TabsContext = React.createContext<TabsContextType>({ value: '', setValue: () => {} });

export const Tabs = ({ children, defaultValue, value: controlledValue, onValueChange, className }: any) => {
  const [internal, setInternal] = useState(defaultValue || '');
  const active = controlledValue !== undefined ? controlledValue : internal;
  const setValue = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };
  return (
    <TabsContext.Provider value={{ value: active, setValue }}>
      <div className={cn("space-y-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList = ({ children, className }: any) => (
  <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500", className)}>
    {children}
  </div>
);

export const TabsTrigger = ({ value, children, className }: any) => {
  const ctx = React.useContext(TabsContext);
  const isSelected = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        isSelected ? "bg-white text-slate-900 shadow-xs font-semibold" : "hover:text-slate-900",
        className
      )}
      data-value={value}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ value, children, className }: any) => {
  const ctx = React.useContext(TabsContext);
  if (ctx.value !== value) return null;
  return <div className={cn("focus-visible:outline-none", className)}>{children}</div>;
};
