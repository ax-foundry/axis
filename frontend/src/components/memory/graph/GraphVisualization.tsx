'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useMemoryStore } from '@/stores/memory-store';
import { GraphNodeColors, GraphNodeSizes } from '@/types/memory';

import type { GraphEdge, GraphNode, GraphNodeType } from '@/types/memory';

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: GraphNodeType;
  metadata?: Record<string, string>;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
  label?: string;
}

interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphVisualization({ nodes, edges }: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const { selectedNodeId, setSelectedNodeId } = useMemoryStore();

  // Use refs for values accessed inside D3 callbacks to avoid re-creating the simulation
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  const setSelectedNodeIdRef = useRef(setSelectedNodeId);
  setSelectedNodeIdRef.current = setSelectedNodeId;

  // Store zoom behavior and simulation nodes for pan-to-node
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(500, entry.contentRect.height),
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // D3 rendering
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (nodes.length === 0) return;

    const { width, height } = dimensions;

    // Prepare simulation data
    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type as GraphNodeType,
      metadata: n.metadata,
    }));

    simNodesRef.current = simNodes;

    const nodeIdSet = new Set(simNodes.map((n) => n.id));

    const simLinks: SimLink[] = edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        label: e.label,
      }));

    // Count connections per node for label visibility
    const connectionCount = new Map<string, number>();
    simLinks.forEach((l) => {
      const src = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
      const tgt = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
      connectionCount.set(src, (connectionCount.get(src) ?? 0) + 1);
      connectionCount.set(tgt, (connectionCount.get(tgt) ?? 0) + 1);
    });

    // Create root group with zoom
    const g = svg.append('g');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    zoomRef.current = zoom;

    svg.call(
      zoom as unknown as (
        selection: d3.Selection<SVGSVGElement | null, unknown, null, undefined>
      ) => void
    );

    // Arrow markers
    const markerTypes = ['TRIGGERS', 'RESULTS_IN', 'OVERRIDES', 'DERIVED_FROM', 'RELATED'];
    g.append('defs')
      .selectAll('marker')
      .data(markerTypes)
      .enter()
      .append('marker')
      .attr('id', (d) => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#B8C5D3');

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(25));

    // Edges
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', '#B8C5D3')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', (d) => (d.type === 'OVERRIDES' ? '4,4' : 'none'))
      .attr('marker-end', (d) => `url(#arrow-${d.type})`);

    // Node groups
    const nodeGroup = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        setSelectedNodeIdRef.current(d.id === selectedNodeIdRef.current ? null : d.id);
      })
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Node circles
    nodeGroup
      .append('circle')
      .attr('r', (d) => GraphNodeSizes[d.type] ?? 10)
      .attr('fill', (d) => GraphNodeColors[d.type] ?? '#7F8C8D')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    // Selected node ring
    nodeGroup
      .append('circle')
      .attr('r', (d) => (GraphNodeSizes[d.type] ?? 10) + 3)
      .attr('fill', 'none')
      .attr('stroke', (d) => (d.id === selectedNodeIdRef.current ? '#D4AF37' : 'none'))
      .attr('stroke-width', 3)
      .attr('class', 'selection-ring');

    // Labels — always show for high-degree nodes, otherwise show on hover
    nodeGroup
      .append('text')
      .text((d) => d.label)
      .attr('x', (d) => (GraphNodeSizes[d.type] ?? 10) + 4)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#2C3E50')
      .attr('pointer-events', 'none')
      .attr('opacity', (d) => ((connectionCount.get(d.id) ?? 0) > 3 ? 1 : 0));

    // Hover: show labels
    nodeGroup
      .on('mouseenter', function () {
        d3.select(this).select('text').attr('opacity', 1);
        d3.select(this).select('circle').attr('stroke-width', 2.5);
      })
      .on('mouseleave', function (_event, d) {
        const connections = connectionCount.get(d.id) ?? 0;
        d3.select(this)
          .select('text')
          .attr('opacity', connections > 3 ? 1 : 0);
        d3.select(this).select('circle').attr('stroke-width', 1.5);
      });

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, dimensions]);

  // Pan/zoom to a specific node
  const panToNode = useCallback(
    (nodeId: string) => {
      const svg = d3.select(svgRef.current);
      const zoom = zoomRef.current;
      if (!zoom || !svgRef.current) return;

      const targetNode = simNodesRef.current.find((n) => n.id === nodeId);
      if (!targetNode || targetNode.x == null || targetNode.y == null) return;

      const { width, height } = dimensions;
      const scale = 1.5;
      const tx = width / 2 - targetNode.x * scale;
      const ty = height / 2 - targetNode.y * scale;

      svg
        .transition()
        .duration(500)
        .call(
          (zoom as unknown as { transform: (...args: unknown[]) => void }).transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
    },
    [dimensions]
  );

  // Update selection ring and pan to node when selectedNodeId changes
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, SimNode>('.selection-ring').attr('stroke', function () {
      const parent = (this as SVGCircleElement).parentNode as Element;
      const d = d3.select<Element, SimNode>(parent).datum();
      return d?.id === selectedNodeId ? '#D4AF37' : 'none';
    });

    // Pan to the selected node
    if (selectedNodeId) {
      panToNode(selectedNodeId);
    }
  }, [selectedNodeId, panToNode]);

  return (
    <div ref={containerRef} className="relative h-full min-h-[500px] w-full">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="rounded-lg bg-gray-50/50"
      />
    </div>
  );
}
