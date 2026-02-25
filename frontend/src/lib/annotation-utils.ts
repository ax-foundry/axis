import { Columns } from '@/types';

import type { AnnotationData, AnnotationScoreValue, EvaluationRecord } from '@/types';

// Annotation column names to check for existing annotations
export const ANNOTATION_COLUMNS = {
  judgment: Columns.JUDGMENT,
  critique: Columns.CRITIQUE,
  userTags: Columns.USER_TAGS,
  flagged: Columns.ANNOTATION_FLAGGED,
} as const;

/**
 * Extract existing annotations from uploaded data
 * Used by both data-store and annotation-store
 */
export function extractAnnotationsFromData(
  data: EvaluationRecord[],
  columns: string[],
  getRecordId: (record: EvaluationRecord, index: number) => string
): Record<string, AnnotationData> {
  const annotations: Record<string, AnnotationData> = {};

  // Check which annotation columns exist
  const hasJudgment = columns.includes(ANNOTATION_COLUMNS.judgment);
  const hasCritique = columns.includes(ANNOTATION_COLUMNS.critique);
  const hasUserTags = columns.includes(ANNOTATION_COLUMNS.userTags);
  const hasFlagged = columns.includes(ANNOTATION_COLUMNS.flagged);

  if (!hasJudgment && !hasCritique && !hasUserTags && !hasFlagged) {
    return annotations;
  }

  const seen = new Set<string>();

  data.forEach((record, index) => {
    const id = getRecordId(record, index);

    // Skip duplicates and fallback IDs
    if (seen.has(id) || id.startsWith('record-')) return;
    seen.add(id);

    const judgment = hasJudgment ? record[ANNOTATION_COLUMNS.judgment] : undefined;
    const critique = hasCritique ? record[ANNOTATION_COLUMNS.critique] : undefined;
    const userTags = hasUserTags ? record[ANNOTATION_COLUMNS.userTags] : undefined;
    const flagged = hasFlagged ? record[ANNOTATION_COLUMNS.flagged] : undefined;

    // Skip if no annotation data exists for this record
    if (judgment === undefined && !critique && !userTags && !flagged) return;
    if (judgment === null && !critique && !userTags && !flagged) return;

    // Parse score from judgment
    let score: AnnotationScoreValue | undefined;
    if (judgment !== undefined && judgment !== null && judgment !== '') {
      if (judgment === 'accept' || judgment === 1 || judgment === '1' || judgment === true) {
        score = 'accept';
      } else if (
        judgment === 'reject' ||
        judgment === 0 ||
        judgment === '0' ||
        judgment === false
      ) {
        score = 'reject';
      } else if (typeof judgment === 'number') {
        score = judgment;
      } else if (typeof judgment === 'string' && !isNaN(Number(judgment))) {
        score = Number(judgment);
      }
    }

    // Parse tags
    let tags: string[] = [];
    if (userTags) {
      if (Array.isArray(userTags)) {
        tags = userTags.map(String);
      } else if (typeof userTags === 'string') {
        try {
          const parsed = JSON.parse(userTags);
          tags = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          // Try comma-separated
          tags = userTags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
        }
      }
    }

    // Parse flagged
    const isFlagged = flagged === true || flagged === 1 || flagged === '1' || flagged === 'true';

    // Only create annotation if there's actual data
    if (score !== undefined || tags.length > 0 || critique || isFlagged) {
      annotations[id] = {
        score,
        tags,
        critique: critique ? String(critique) : '',
        flagged: isFlagged || undefined,
      };
    }
  });

  return annotations;
}

/**
 * Merge annotations back into data records for export
 */
export function mergeAnnotationsToData(
  data: EvaluationRecord[],
  annotations: Record<string, AnnotationData>,
  getRecordId: (record: EvaluationRecord, index: number) => string
): EvaluationRecord[] {
  const seen = new Set<string>();
  const result: EvaluationRecord[] = [];

  data.forEach((record, index) => {
    const id = getRecordId(record, index);

    // Skip duplicates - only keep first occurrence
    if (seen.has(id) || id.startsWith('record-')) return;
    seen.add(id);

    const annotation = annotations[id];
    const annotatedRecord = { ...record };

    // Add annotation columns
    if (annotation) {
      // Convert score to judgment
      if (annotation.score !== undefined) {
        annotatedRecord[ANNOTATION_COLUMNS.judgment] = annotation.score;
      }
      // Add critique
      if (annotation.critique) {
        annotatedRecord[ANNOTATION_COLUMNS.critique] = annotation.critique;
      }
      // Add tags as JSON array string
      if (annotation.tags && annotation.tags.length > 0) {
        annotatedRecord[ANNOTATION_COLUMNS.userTags] = JSON.stringify(annotation.tags);
      }
      // Add flagged status
      if (annotation.flagged) {
        annotatedRecord[ANNOTATION_COLUMNS.flagged] = true;
      }
    }

    result.push(annotatedRecord);
  });

  return result;
}
