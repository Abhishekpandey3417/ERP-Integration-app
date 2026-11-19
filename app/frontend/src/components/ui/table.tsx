import React from 'react';
import { cn } from '@/lib/utils';

export const Table = ({ children, className }: any) => (
  <div className="relative w-full overflow-auto">
    <table className={cn("w-full caption-bottom text-xs", className)}>{children}</table>
  </div>
);
export const TableHeader = ({ children, className }: any) => (
  <thead className={cn("[&_tr]:border-b border-slate-200 bg-slate-50", className)}>{children}</thead>
);
export const TableBody = ({ children, className }: any) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)}>{children}</tbody>
);
export const TableRow = ({ children, className }: any) => (
  <tr className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50/50", className)}>{children}</tr>
);
export const TableHead = ({ children, className }: any) => (
  <th className={cn("h-8 px-3 text-left align-middle font-medium text-slate-500", className)}>{children}</th>
);
export const TableCell = ({ children, className }: any) => (
  <td className={cn("p-3 align-middle text-slate-700", className)}>{children}</td>
);
