'use client';

import * as d3 from 'd3';
import { useEffect, useRef, useState, useMemo } from 'react';

import { pythonToJson } from '@/components/shared';
import { formatScore } from '@/lib/scorecard-utils';
import { Columns, Colors, Thresholds } from '@/types';

export interface AggregateStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  stdDev: number;
  scores: number[];
}

export interface TreeNode {
  name: string;
  score: number | null;
  weight: number;
  type: 'metric' | 'component';
  children?: TreeNode[];
  explanation?: string;
  collapsed?: boolean;
  signals?: string[] | string | Record<string, unknown>;
  critique?: string;
  isAggregated?: boolean;
  aggregateStats?: AggregateStats;
}

interface TreeVisualizationProps {
  data: Record<string, unknown>[];
  viewMode: 'individual' | 'aggregated';
  selectedTestCase?: string;
  useNormalizedWeights?: boolean;
  onLeafClick?: (node: TreeNode, event: { x: number; y: number }) => void;
}

export function TreeVisualization({
  data,
  viewMode,
  selectedTestCase,
  onLeafClick,
}: TreeVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Helper function to compute aggregate statistics
  const computeAggregateStats = (scores: number[]): AggregateStats => {
    const validScores = scores.filter((s) => s !== null && !isNaN(s));
    if (validScores.length === 0) {
      return {
        count: 0,
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        p25: 0,
        p75: 0,
        stdDev: 0,
        scores: [],
      };
    }

    const sorted = [...validScores].sort((a, b) => a - b);
    const count = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / count;
    const median =
      count % 2 === 0
        ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
        : sorted[Math.floor(count / 2)];
    const min = sorted[0];
    const max = sorted[count - 1];
    const p25 = sorted[Math.floor(count * 0.25)];
    const p75 = sorted[Math.floor(count * 0.75)];
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return { count, mean, median, min, max, p25, p75, stdDev, scores: sorted };
  };

  // Build tree structure from data
  const treeData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Filter data based on view mode
    let filteredData = data;
    if (viewMode === 'individual' && selectedTestCase) {
      filteredData = data.filter((d) => d[Columns.DATASET_ID] === selectedTestCase);
    }

    // For aggregated view, collect all scores per metric
    const scoreCollector = new Map<string, number[]>();

    // Build tree from flat data
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    filteredData.forEach((row) => {
      const name = row[Columns.METRIC_NAME] as string;
      const parent = row[Columns.PARENT] as string | null;
      const score = row[Columns.METRIC_SCORE] as number;
      const weight = (row[Columns.WEIGHT] as number) || 1;
      const type = (row[Columns.METRIC_TYPE] as string) || 'metric';
      const explanation = row[Columns.EXPLANATION] as string;
      const critique = row[Columns.CRITIQUE] as string | undefined;

      // Parse signals - could be JSON string, Python dict string, object, or undefined
      let signals: string[] | string | Record<string, unknown> | undefined = undefined;
      const rawSignals = row[Columns.SIGNALS];
      if (rawSignals) {
        if (typeof rawSignals === 'string') {
          try {
            signals = JSON.parse(rawSignals);
          } catch {
            // Try converting Python dict syntax to JSON using proper parser
            try {
              const jsonStr = pythonToJson(rawSignals);
              signals = JSON.parse(jsonStr);
            } catch {
              signals = rawSignals;
            }
          }
        } else {
          signals = rawSignals as Record<string, unknown>;
        }
      }

      // Collect scores for aggregated view
      if (viewMode === 'aggregated' && score !== null && !isNaN(score)) {
        const existing = scoreCollector.get(name) || [];
        existing.push(score);
        scoreCollector.set(name, existing);
      }

      // For aggregated view, don't store individual explanation/signals/critique
      const existingNode = nodeMap.get(name);
      if (!existingNode) {
        nodeMap.set(name, {
          name,
          score: score ?? null,
          weight,
          type: type as 'metric' | 'component',
          // Only include individual details in non-aggregated mode
          explanation: viewMode === 'aggregated' ? undefined : explanation,
          signals: viewMode === 'aggregated' ? undefined : signals,
          critique: viewMode === 'aggregated' ? undefined : critique,
          isAggregated: viewMode === 'aggregated',
          children: [],
        });
      }

      if (!parent) {
        const node = nodeMap.get(name);
        if (node && !roots.includes(node)) {
          roots.push(node);
        }
      }
    });

    // For aggregated view, compute aggregate stats for each node
    if (viewMode === 'aggregated') {
      scoreCollector.forEach((scores, name) => {
        const node = nodeMap.get(name);
        if (node) {
          const stats = computeAggregateStats(scores);
          node.aggregateStats = stats;
          node.score = stats.mean; // Use mean as the displayed score
        }
      });
    }

    // Build parent-child relationships
    filteredData.forEach((row) => {
      const name = row[Columns.METRIC_NAME] as string;
      const parent = row[Columns.PARENT] as string | null;

      if (parent) {
        const parentNode = nodeMap.get(parent);
        const childNode = nodeMap.get(name);
        if (parentNode && childNode && !parentNode.children?.includes(childNode)) {
          parentNode.children = parentNode.children || [];
          parentNode.children.push(childNode);
        }
      }
    });

    // Create synthetic root if multiple roots
    if (roots.length > 1) {
      const rootScores = roots.map((r) => r.score || 0).filter((s) => !isNaN(s));
      const rootStats = viewMode === 'aggregated' ? computeAggregateStats(rootScores) : undefined;
      return {
        name: 'Overall',
        score: rootScores.reduce((a, b) => a + b, 0) / rootScores.length,
        weight: 1,
        type: 'component' as const,
        children: roots,
        isAggregated: viewMode === 'aggregated',
        aggregateStats: rootStats,
      };
    }

    return roots[0] || null;
  }, [data, viewMode, selectedTestCase]);

  // Calculate dimensions on mount
  useEffect(() => {
    const updateDimensions = () => {
      const container = svgRef.current?.parentElement;
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: Math.max(600, container.clientHeight),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Render D3 tree
  useEffect(() => {
    if (!svgRef.current || !treeData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 120, bottom: 40, left: 120 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create tree layout
    const treeLayout = d3.tree<TreeNode>().size([height, width]);

    // Create hierarchy
    const root = d3.hierarchy(treeData, (d) => {
      if (collapsedNodes.has(d.name)) return undefined;
      return d.children;
    });

    const treeRoot = treeLayout(root);

    // Draw links
    g.selectAll('.link')
      .data(treeRoot.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#E1E5EA')
      .attr('stroke-width', 2)
      .attr(
        'd',
        d3
          .linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
          .x((d) => d.y)
          .y((d) => d.x)
      );

    // Draw nodes
    const nodes = g
      .selectAll('.node')
      .data(treeRoot.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`);

    // Node circles
    nodes
      .append('circle')
      .attr('r', 8)
      .attr('fill', (d) => {
        const score = d.data.score;
        if (score === null) return Colors.accentSilver;
        if (score >= Thresholds.GREEN_THRESHOLD) return Colors.success;
        if (score <= Thresholds.RED_THRESHOLD) return Colors.error;
        return Colors.warning;
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        if (d.data.children?.length) {
          // Parent node - toggle collapse
          setCollapsedNodes((prev) => {
            const next = new Set(prev);
            if (next.has(d.data.name)) {
              next.delete(d.data.name);
            } else {
              next.add(d.data.name);
            }
            return next;
          });
        } else {
          // Leaf node - emit click event with position
          onLeafClick?.(d.data, { x: event.pageX, y: event.pageY });
        }
      });

    // Collapse indicator
    nodes
      .filter(
        (d): d is d3.HierarchyPointNode<TreeNode> =>
          !!(d.data.children && d.data.children.length > 0)
      )
      .append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => (collapsedNodes.has(d.data.name) ? '+' : '-'));

    // Node labels
    nodes
      .append('text')
      .attr('dy', '0.31em')
      .attr('x', (d) => (d.children ? -12 : 12))
      .attr('text-anchor', (d) => (d.children ? 'end' : 'start'))
      .attr('fill', Colors.textPrimary)
      .attr('font-size', '12px')
      .attr('font-weight', '500')
      .text((d) => d.data.name);

    // Score labels
    nodes
      .append('text')
      .attr('dy', '1.5em')
      .attr('x', (d) => (d.children ? -12 : 12))
      .attr('text-anchor', (d) => (d.children ? 'end' : 'start'))
      .attr('fill', Colors.textMuted)
      .attr('font-size', '11px')
      .text((d) => {
        const score = d.data.score;
        if (score === null) return 'N/A';
        return formatScore(score);
      });
  }, [treeData, dimensions, collapsedNodes, onLeafClick]);

  if (!treeData) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted">
        No tree data available
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[600px] w-full">
      <svg ref={svgRef} className="h-full w-full" />
    </div>
  );
}
