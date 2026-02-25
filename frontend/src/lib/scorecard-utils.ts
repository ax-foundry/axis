import { Award, Layers, ChevronRight, Circle, type LucideIcon } from 'lucide-react';

import { Columns } from '@/types';

import type { DataFormat } from '@/types';

// Types
export interface ScorecardMetric {
  metricName: string;
  parent: string | null;
  type: 'category' | 'component' | 'sub-component' | 'metric';
  level: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  stdDev: number;
  weight: number;
  normalizedWeight: number;
  scoreDistribution: number[];
  explanation: string;
  testCaseCount: number;
  childMetrics: string[];
}

export interface ScorecardDisplayRow extends ScorecardMetric {
  isExpanded: boolean;
  hasChildren: boolean;
  isVisible: boolean;
}

interface AggregatedData {
  scores: number[];
  parent: string | null;
  weight: number;
  metricType: string;
  explanation: string;
}

// Format score for display - shows raw value, not percentage
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '-';
  if (Number.isNaN(score)) return '-';

  // If it's a whole number, show without decimals
  if (Number.isInteger(score)) {
    return score.toString();
  }

  // For decimals, show up to 3 decimal places, trimming trailing zeros
  const formatted = score.toFixed(3);
  return parseFloat(formatted).toString();
}

// Format score range for display
export function formatScoreRange(min: number, max: number): string {
  return `${formatScore(min)} - ${formatScore(max)}`;
}

// Aggregate metrics from raw data
export function aggregateMetrics(
  data: Record<string, unknown>[],
  format: DataFormat
): Map<string, ScorecardMetric> {
  const aggregated = new Map<string, AggregatedData>();

  if (format !== 'tree_format' && format !== 'flat_format') {
    return new Map();
  }

  data.forEach((row) => {
    const metricName = row[Columns.METRIC_NAME] as string;
    const score = row[Columns.METRIC_SCORE] as number;
    const parent = (row[Columns.PARENT] as string) || null;
    const weight = (row[Columns.WEIGHT] as number) || 1;
    const metricType = (row[Columns.METRIC_TYPE] as string) || '';
    const explanation = (row[Columns.EXPLANATION] as string) || '';

    if (!metricName || typeof score !== 'number' || isNaN(score)) {
      return;
    }

    if (!aggregated.has(metricName)) {
      aggregated.set(metricName, {
        scores: [],
        parent,
        weight,
        metricType,
        explanation,
      });
    }

    aggregated.get(metricName)!.scores.push(score);
  });

  // Convert to ScorecardMetric
  const metrics = new Map<string, ScorecardMetric>();

  aggregated.forEach((agg, metricName) => {
    const scores = agg.scores;
    const sum = scores.reduce((a, b) => a + b, 0);
    const avgScore = scores.length > 0 ? sum / scores.length : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

    // Calculate standard deviation
    const mean = avgScore;
    const variance =
      scores.length > 1
        ? scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / (scores.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);

    // Create distribution (5 bins from 0 to 1)
    const bins = [0, 0, 0, 0, 0];
    scores.forEach((s) => {
      const binIndex = Math.min(Math.floor(s * 5), 4);
      bins[binIndex]++;
    });

    metrics.set(metricName, {
      metricName,
      parent: agg.parent,
      type: inferType(agg.metricType, 1),
      level: 1, // Will be computed in buildHierarchy
      avgScore,
      minScore,
      maxScore,
      stdDev,
      weight: agg.weight,
      normalizedWeight: 0, // Will be computed
      scoreDistribution: bins,
      explanation: agg.explanation,
      testCaseCount: scores.length,
      childMetrics: [],
    });
  });

  return metrics;
}

// Build hierarchy from aggregated metrics
export function buildHierarchy(
  aggregated: Map<string, ScorecardMetric>
): Map<string, ScorecardMetric> {
  // First pass: establish parent-child relationships
  aggregated.forEach((metric, name) => {
    if (metric.parent && aggregated.has(metric.parent)) {
      const parent = aggregated.get(metric.parent)!;
      if (!parent.childMetrics.includes(name)) {
        parent.childMetrics.push(name);
      }
    }
  });

  // Second pass: calculate levels by traversing to root
  aggregated.forEach((metric) => {
    let level = 1;
    let currentParent = metric.parent;

    while (currentParent && aggregated.has(currentParent)) {
      level++;
      currentParent = aggregated.get(currentParent)!.parent;
    }

    metric.level = level;

    // Infer type from level and metric_type
    metric.type = inferType(metric.type, level, metric.childMetrics.length > 0);
  });

  return aggregated;
}

// Infer type from metric_type string or level
function inferType(
  metricType: string,
  level: number,
  hasChildren: boolean = false
): 'category' | 'component' | 'sub-component' | 'metric' {
  // First try to infer from metricType string
  const typeStr = metricType.toLowerCase();
  if (typeStr.includes('category') || typeStr.includes('root')) {
    return 'category';
  }
  if (typeStr.includes('component') && !typeStr.includes('sub')) {
    return 'component';
  }
  if (typeStr.includes('sub-component') || typeStr.includes('subcomponent')) {
    return 'sub-component';
  }
  if (typeStr.includes('metric') || typeStr.includes('leaf')) {
    return 'metric';
  }

  // Fall back to level-based inference
  if (level === 1) {
    return hasChildren ? 'category' : 'metric';
  }
  if (level === 2) {
    return hasChildren ? 'component' : 'metric';
  }
  if (level === 3) {
    return hasChildren ? 'sub-component' : 'metric';
  }
  return 'metric';
}

// Compute normalized weights within sibling groups
export function computeNormalizedWeights(hierarchy: Map<string, ScorecardMetric>): void {
  // Group metrics by parent
  const siblingGroups = new Map<string | null, string[]>();

  hierarchy.forEach((metric, name) => {
    const parentKey = metric.parent;
    if (!siblingGroups.has(parentKey)) {
      siblingGroups.set(parentKey, []);
    }
    siblingGroups.get(parentKey)!.push(name);
  });

  // Compute normalized weights for each group
  siblingGroups.forEach((siblings) => {
    const totalWeight = siblings.reduce((sum, name) => {
      return sum + (hierarchy.get(name)?.weight || 1);
    }, 0);

    siblings.forEach((name) => {
      const metric = hierarchy.get(name);
      if (metric) {
        metric.normalizedWeight =
          totalWeight > 0 ? metric.weight / totalWeight : 1 / siblings.length;
      }
    });
  });
}

// Generate display rows based on expanded state
export function generateDisplayRows(
  hierarchy: Map<string, ScorecardMetric>,
  expandedNodes: Set<string>
): ScorecardDisplayRow[] {
  const rows: ScorecardDisplayRow[] = [];
  const visited = new Set<string>();

  // Find root nodes (no parent or parent not in hierarchy)
  const rootNodes: string[] = [];
  hierarchy.forEach((metric, name) => {
    if (!metric.parent || !hierarchy.has(metric.parent)) {
      rootNodes.push(name);
    }
  });

  // Sort root nodes by weight descending, then alphabetically
  rootNodes.sort((a, b) => {
    const metricA = hierarchy.get(a)!;
    const metricB = hierarchy.get(b)!;
    if (metricB.weight !== metricA.weight) {
      return metricB.weight - metricA.weight;
    }
    return a.localeCompare(b);
  });

  // Recursive function to add nodes and their children
  function addNode(name: string, isVisible: boolean): void {
    if (visited.has(name)) return;
    visited.add(name);

    const metric = hierarchy.get(name);
    if (!metric) return;

    const hasChildren = metric.childMetrics.length > 0;
    const isExpanded = expandedNodes.has(name);

    rows.push({
      ...metric,
      isExpanded,
      hasChildren,
      isVisible,
    });

    // Add children if expanded
    if (hasChildren) {
      // Sort children by weight descending, then alphabetically
      const sortedChildren = [...metric.childMetrics].sort((a, b) => {
        const childA = hierarchy.get(a);
        const childB = hierarchy.get(b);
        if (!childA || !childB) return 0;
        if (childB.weight !== childA.weight) {
          return childB.weight - childA.weight;
        }
        return a.localeCompare(b);
      });

      sortedChildren.forEach((childName) => {
        addNode(childName, isVisible && isExpanded);
      });
    }
  }

  // Add all nodes starting from roots
  rootNodes.forEach((name) => addNode(name, true));

  return rows;
}

// Get icon for metric type
export function getTypeIcon(type: ScorecardMetric['type']): LucideIcon {
  switch (type) {
    case 'category':
      return Award;
    case 'component':
      return Layers;
    case 'sub-component':
      return ChevronRight;
    case 'metric':
    default:
      return Circle;
  }
}

// Get label for metric type
export function getTypeLabel(type: ScorecardMetric['type']): string {
  switch (type) {
    case 'category':
      return 'CATEGORY';
    case 'component':
      return 'COMPONENT';
    case 'sub-component':
      return 'SUB-COMPONENT';
    case 'metric':
    default:
      return 'METRIC';
  }
}

// Get color class for metric type
export function getTypeColorClass(type: ScorecardMetric['type']): string {
  switch (type) {
    case 'category':
      return 'text-primary bg-primary/10';
    case 'component':
      return 'text-blue-600 bg-blue-100';
    case 'sub-component':
      return 'text-purple-600 bg-purple-100';
    case 'metric':
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

// Calculate overall weighted score
export function calculateWeightedScore(hierarchy: Map<string, ScorecardMetric>): number {
  // Get root nodes
  const rootNodes: ScorecardMetric[] = [];
  hierarchy.forEach((metric) => {
    if (!metric.parent || !hierarchy.has(metric.parent)) {
      rootNodes.push(metric);
    }
  });

  if (rootNodes.length === 0) return 0;

  // Calculate weighted average of root nodes
  const totalWeight = rootNodes.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = rootNodes.reduce((sum, m) => sum + m.avgScore * m.weight, 0);
  return weightedSum / totalWeight;
}

// Calculate score variance across all metrics
export function calculateScoreVariance(hierarchy: Map<string, ScorecardMetric>): number {
  const allScores: number[] = [];
  hierarchy.forEach((metric) => {
    allScores.push(metric.avgScore);
  });

  if (allScores.length <= 1) return 0;

  const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const variance =
    allScores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / (allScores.length - 1);
  return Math.sqrt(variance);
}

// Get metrics for a specific test case
export function getMetricsForTestCase(
  data: Record<string, unknown>[],
  testCaseId: string,
  format: DataFormat
): Map<string, ScorecardMetric> {
  if (format !== 'tree_format' && format !== 'flat_format') {
    return new Map();
  }

  // Filter data to this test case only
  const testCaseData = data.filter((row) => row[Columns.DATASET_ID] === testCaseId);

  // Aggregate just this test case's data
  const metrics = new Map<string, ScorecardMetric>();

  testCaseData.forEach((row) => {
    const metricName = row[Columns.METRIC_NAME] as string;
    const score = row[Columns.METRIC_SCORE] as number;
    const parent = (row[Columns.PARENT] as string) || null;
    const weight = (row[Columns.WEIGHT] as number) || 1;
    const metricType = (row[Columns.METRIC_TYPE] as string) || '';
    const explanation = (row[Columns.EXPLANATION] as string) || '';

    if (!metricName || typeof score !== 'number' || isNaN(score)) {
      return;
    }

    metrics.set(metricName, {
      metricName,
      parent,
      type: inferType(metricType, 1),
      level: 1,
      avgScore: score,
      minScore: score,
      maxScore: score,
      stdDev: 0,
      weight,
      normalizedWeight: 0,
      scoreDistribution: [0, 0, 0, 0, 0],
      explanation,
      testCaseCount: 1,
      childMetrics: [],
    });
  });

  // Build hierarchy and compute weights
  buildHierarchy(metrics);
  computeNormalizedWeights(metrics);

  return metrics;
}

// Get test cases with scores for a specific metric
export function getTestCasesForMetric(
  data: Record<string, unknown>[],
  metricName: string,
  format: DataFormat
): Array<{
  id: string;
  query: string;
  score: number;
  explanation: string;
}> {
  if (format !== 'tree_format' && format !== 'flat_format') {
    return [];
  }

  const testCases: Array<{
    id: string;
    query: string;
    score: number;
    explanation: string;
  }> = [];

  const seenIds = new Set<string>();

  data.forEach((row) => {
    const rowMetricName = row[Columns.METRIC_NAME] as string;
    const id = row[Columns.DATASET_ID] as string;

    if (rowMetricName !== metricName || seenIds.has(id)) {
      return;
    }

    seenIds.add(id);

    testCases.push({
      id,
      query: (row[Columns.QUERY] as string) || '',
      score: (row[Columns.METRIC_SCORE] as number) || 0,
      explanation: (row[Columns.EXPLANATION] as string) || '',
    });
  });

  return testCases.sort((a, b) => b.score - a.score);
}
