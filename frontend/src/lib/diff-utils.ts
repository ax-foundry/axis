/** Word-level diff utility for what-if output comparison. */

export type DiffType = 'equal' | 'insert' | 'delete';

export interface DiffSegment {
  type: DiffType;
  value: string;
}

/**
 * Normalize content for diffing: stringify JSON with sorted keys,
 * consistent spacing to avoid pretty-print churn.
 */
export function stringifyForDiff(content: unknown): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') {
    // Try to parse as JSON for normalization
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, Object.keys(parsed).sort(), 2);
    } catch {
      return content;
    }
  }
  try {
    return JSON.stringify(content, Object.keys(content as object).sort(), 2);
  } catch {
    return String(content);
  }
}

/**
 * Simple LCS-based word diff.
 * Returns an array of DiffSegments (equal / insert / delete).
 */
export function computeWordDiff(original: string, simulated: string): DiffSegment[] {
  const wordsA = original.split(/(\s+)/);
  const wordsB = simulated.split(/(\s+)/);

  // Build LCS table
  const m = wordsA.length;
  const n = wordsB.length;

  // For very large inputs, fall back to simple comparison
  if (m * n > 500_000) {
    if (original === simulated) {
      return [{ type: 'equal', value: original }];
    }
    return [
      { type: 'delete', value: original },
      { type: 'insert', value: simulated },
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const segments: DiffSegment[] = [];
  let i = m;
  let j = n;

  const stack: DiffSegment[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      stack.push({ type: 'equal', value: wordsA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'insert', value: wordsB[j - 1] });
      j--;
    } else {
      stack.push({ type: 'delete', value: wordsA[i - 1] });
      i--;
    }
  }

  // Reverse and merge adjacent segments of same type
  for (let k = stack.length - 1; k >= 0; k--) {
    const seg = stack[k];
    const last = segments[segments.length - 1];
    if (last && last.type === seg.type) {
      last.value += seg.value;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}
