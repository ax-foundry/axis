'use client';

import type { AlignmentMetrics } from '@/types';

interface ConfusionMatrixProps {
  metrics: AlignmentMetrics;
}

export function ConfusionMatrix({ metrics }: ConfusionMatrixProps) {
  // confusion_matrix format: [[TN, FP], [FN, TP]]
  const [[tn, fp], [fn, tp]] = metrics.confusion_matrix;
  const total = tn + fp + fn + tp;

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-text-primary">Confusion Matrix</h4>

      <div className="flex items-start gap-5">
        {/* HTML Table */}
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="p-0" />
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-text-muted">
                LLM: Accept
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-text-muted">
                LLM: Reject
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="pr-2 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                Human: Accept
              </th>
              <td className="h-11 w-[72px] border border-border bg-green-50 text-center text-[15px] font-bold text-success">
                {tp}
              </td>
              <td className="h-11 w-[72px] border border-border bg-amber-50 text-center text-[15px] font-bold text-warning">
                {fn}
              </td>
            </tr>
            <tr>
              <th className="pr-2 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                Human: Reject
              </th>
              <td className="h-11 w-[72px] border border-border bg-red-50 text-center text-[15px] font-bold text-error">
                {fp}
              </td>
              <td className="h-11 w-[72px] border border-border bg-green-50 text-center text-[15px] font-bold text-success">
                {tn}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Legend */}
        <div className="text-xs leading-loose text-text-secondary">
          <div>
            <strong className="font-semibold text-text-primary">{tp}</strong> True Positives — Both
            accepted
          </div>
          <div>
            <strong className="font-semibold text-text-primary">{tn}</strong> True Negatives — Both
            rejected
          </div>
          <div>
            <strong className="font-semibold text-text-primary">{fp}</strong> False Positives — LLM
            accepted, human rejected
          </div>
          <div>
            <strong className="font-semibold text-text-primary">{fn}</strong> False Negative
            {fn !== 1 ? 's' : ''} — LLM rejected, human accepted
          </div>
          <p className="mt-2 text-xs leading-normal text-text-muted">
            {fp > fn
              ? 'The LLM judge tends to be more lenient than human reviewers. Consider tightening the evaluation criteria.'
              : fn > fp
                ? 'The LLM judge tends to be stricter than human reviewers. Consider relaxing the evaluation criteria.'
                : 'The LLM judge errors are balanced between false positives and false negatives.'}
            {total > 0 && ` Overall accuracy: ${(((tp + tn) / total) * 100).toFixed(1)}%.`}
          </p>
        </div>
      </div>
    </div>
  );
}
