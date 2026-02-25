'use client';

import { CheckCircle, XCircle } from 'lucide-react';

interface DosDontsPanelProps {
  dos: string[];
  donts: string[];
}

export function DosDontsPanel({ dos, donts }: DosDontsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Do's */}
      <div className="card border-success/20 bg-success/5">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-success" />
          <h4 className="font-semibold text-success">Do</h4>
        </div>
        <ul className="space-y-3">
          {dos.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="mt-0.5 text-success">+</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Don'ts */}
      <div className="card border-error/20 bg-error/5">
        <div className="mb-4 flex items-center gap-2">
          <XCircle className="h-5 w-5 text-error" />
          <h4 className="font-semibold text-error">Don&apos;t</h4>
        </div>
        <ul className="space-y-3">
          {donts.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="mt-0.5 text-error">-</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
