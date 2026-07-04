import { type ReactNode } from 'react';
import { COLORS } from '../../lib/stitch-design-tokens';

interface StitchTableProps {
  headers: string[];
  children: ReactNode;
  className?: string;
}

export function StitchTable({ headers, children, className = '' }: StitchTableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-xs font-bold uppercase tracking-wider"
                style={{ backgroundColor: `${COLORS.bg}55`, color: COLORS.onSurfaceVariant }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-sm">{children}</tbody>
      </table>
    </div>
  );
}
