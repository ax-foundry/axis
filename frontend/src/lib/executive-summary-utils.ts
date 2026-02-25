import type { MetricCategory, MonitoringHierarchyNode, MonitoringRecord } from '@/types';

/**
 * Compute health status from average score.
 *
 * Accepts optional threshold overrides (defaults: good=0.7, pass=0.5).
 */
export function computeHealthStatus(
  avgScore: number | null,
  good: number = 0.7,
  pass: number = 0.5
): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (avgScore === null) return 'unknown';
  if (avgScore >= good) return 'healthy';
  if (avgScore >= pass) return 'warning';
  return 'critical';
}

/**
 * Extract time-ordered trend points for a specific metric/source combination.
 */
export function computeTrendPoints(
  records: MonitoringRecord[],
  metricName?: string,
  sourceName?: string,
  sourceComponent?: string
): { timestamp: string; value: number }[] {
  const filtered = records.filter((r) => {
    if (metricName && String(r.metric_name || '') !== metricName) return false;
    if (sourceName && String(r.source_name || '') !== sourceName) return false;
    if (sourceComponent && String(r.source_component || '') !== sourceComponent) return false;
    return typeof r.metric_score === 'number';
  });

  // Aggregate to daily averages to smooth out noisy sparklines
  const dailyBuckets = new Map<string, number[]>();
  for (const r of filtered) {
    const day = (r.timestamp || '').slice(0, 10); // YYYY-MM-DD
    if (!day) continue;
    if (!dailyBuckets.has(day)) dailyBuckets.set(day, []);
    dailyBuckets.get(day)!.push(r.metric_score as number);
  }

  return Array.from(dailyBuckets.entries())
    .map(([day, scores]) => ({
      timestamp: day,
      value: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Compare recent 25% of records vs older 75% to compute score delta.
 */
export function computeScoreDelta(scores: number[]): number | null {
  if (scores.length < 4) return null;
  const splitIdx = Math.floor(scores.length * 0.75);
  const olderScores = scores.slice(0, splitIdx);
  const recentScores = scores.slice(splitIdx);
  const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
  const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  return recentAvg - olderAvg;
}

/**
 * Build a 3-level monitoring hierarchy: source_name → source_component → metric_name.
 * Returns a Map of node id → MonitoringHierarchyNode plus a root-level ordering array.
 */
export function buildMonitoringHierarchy(records: MonitoringRecord[]): {
  nodes: Map<string, MonitoringHierarchyNode>;
  rootIds: string[];
} {
  const nodes = new Map<string, MonitoringHierarchyNode>();

  // Group: sourceName → sourceComponent → metricName → records
  const tree = new Map<string, Map<string, Map<string, MonitoringRecord[]>>>();

  for (const r of records) {
    const sName = String(r.source_name || '(unknown)');
    const sComp = String(r.source_component || '(default)');
    const mName = String(r.metric_name || '(unnamed)');

    if (!tree.has(sName)) tree.set(sName, new Map());
    const compMap = tree.get(sName)!;
    if (!compMap.has(sComp)) compMap.set(sComp, new Map());
    const metricMap = compMap.get(sComp)!;
    if (!metricMap.has(mName)) metricMap.set(mName, []);
    metricMap.get(mName)!.push(r);
  }

  const rootIds: string[] = [];

  Array.from(tree.entries()).forEach(([sourceName, compMap]) => {
    const sourceId = `src:${sourceName}`;
    const sourceChildIds: string[] = [];
    const sourceScores: number[] = [];
    let sourceRecordCount = 0;
    const sourceTrendRecords: MonitoringRecord[] = [];

    Array.from(compMap.entries()).forEach(([compName, metricMap]) => {
      const compId = `comp:${sourceName}:${compName}`;
      const compChildIds: string[] = [];
      const compScores: number[] = [];
      let compRecordCount = 0;
      const compTrendRecords: MonitoringRecord[] = [];

      Array.from(metricMap.entries()).forEach(([metricName, metricRecords]) => {
        const metricId = `metric:${sourceName}:${compName}:${metricName}`;
        const scores = metricRecords
          .map((r: MonitoringRecord) => r.metric_score)
          .filter((s: unknown): s is number => typeof s === 'number');

        const avgScore =
          scores.length > 0
            ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
            : null;
        const trendPoints = computeTrendPoints(metricRecords);
        const delta = computeScoreDelta(scores);
        const rawCategory = metricRecords[0]?.metric_category;
        const category = rawCategory
          ? (String(rawCategory).toUpperCase() as MetricCategory)
          : undefined;

        nodes.set(metricId, {
          id: metricId,
          name: metricName,
          level: 'metric',
          sourceName,
          sourceComponent: compName,
          metricName,
          metricCategory: category,
          avgScore,
          recordCount: metricRecords.length,
          healthStatus: computeHealthStatus(avgScore),
          trendPoints,
          scoreDelta: delta,
          childIds: [],
        });

        compChildIds.push(metricId);
        compScores.push(...scores);
        compRecordCount += metricRecords.length;
        compTrendRecords.push(...metricRecords);
      });

      const compAvg =
        compScores.length > 0
          ? compScores.reduce((a: number, b: number) => a + b, 0) / compScores.length
          : null;

      nodes.set(compId, {
        id: compId,
        name: compName,
        level: 'component',
        sourceName,
        sourceComponent: compName,
        avgScore: compAvg,
        recordCount: compRecordCount,
        healthStatus: computeHealthStatus(compAvg),
        trendPoints: computeTrendPoints(compTrendRecords, undefined, sourceName, compName),
        scoreDelta: computeScoreDelta(compScores),
        childIds: compChildIds,
      });

      sourceChildIds.push(compId);
      sourceScores.push(...compScores);
      sourceRecordCount += compRecordCount;
      sourceTrendRecords.push(...compTrendRecords);
    });

    const sourceAvg =
      sourceScores.length > 0
        ? sourceScores.reduce((a: number, b: number) => a + b, 0) / sourceScores.length
        : null;

    nodes.set(sourceId, {
      id: sourceId,
      name: sourceName,
      level: 'source',
      sourceName,
      avgScore: sourceAvg,
      recordCount: sourceRecordCount,
      healthStatus: computeHealthStatus(sourceAvg),
      trendPoints: computeTrendPoints(sourceTrendRecords, undefined, sourceName),
      scoreDelta: computeScoreDelta(sourceScores),
      childIds: sourceChildIds,
    });

    rootIds.push(sourceId);
  });

  return { nodes, rootIds };
}
