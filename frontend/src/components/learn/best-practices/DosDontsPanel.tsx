'use client';

import { CheckCircle, XCircle } from 'lucide-react';

interface DosDontsPanelProps {
  dos: string[];
  donts: string[];
}

export function DosDontsPanel({ dos, donts }: DosDontsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Do's */}
      <div className="border-success/20 rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success" />
          <h4 className="text-xs font-semibold text-success">Do</h4>
        </div>
        <ul className="space-y-2">
          {dos.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="mt-0.5 text-success">+</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Don'ts */}
      <div className="border-error/20 rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <XCircle className="h-4 w-4 text-error" />
          <h4 className="text-xs font-semibold text-error">Don&apos;t</h4>
        </div>
        <ul className="space-y-2">
          {donts.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="mt-0.5 text-error">-</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
