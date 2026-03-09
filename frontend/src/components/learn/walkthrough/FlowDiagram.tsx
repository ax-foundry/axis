'use client';

import { useMemo } from 'react';

import type { FlowNode, FlowEdge } from '@/types';

interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  activeNodeIds: string[];
  activeEdgeIds: string[];
}

/* ── Layout constants ── */
const NODE_W = 128;
const NODE_H = 56;
const NODE_R = 14;
const GAP = 48; // horizontal gap between nodes
const PAD_X = 32;
const PAD_Y = 28;

/* ── Per-type styling ── */
const nodeStyles: Record<
  FlowNode['type'],
  {
    fill: string;
    fillActive: string;
    stroke: string;
    strokeInactive: string;
    text: string;
    badge: string;
    badgeText: string;
    glowColor: string;
    typeLabel: string;
  }
> = {
  input: {
    fill: '#F0F4FF',
    fillActive: '#DBEAFE',
    stroke: '#3B82F6',
    strokeInactive: '#CBD5E1',
    text: '#1E40AF',
    badge: '#DBEAFE',
    badgeText: '#2563EB',
    glowColor: '59,130,246',
    typeLabel: 'INPUT',
  },
  process: {
    fill: '#ECFDF5',
    fillActive: '#D1FAE5',
    stroke: '#10B981',
    strokeInactive: '#CBD5E1',
    text: '#047857',
    badge: '#D1FAE5',
    badgeText: '#059669',
    glowColor: '16,185,129',
    typeLabel: 'PROCESS',
  },
  judge: {
    fill: '#FFFBEB',
    fillActive: '#FEF3C7',
    stroke: '#F59E0B',
    strokeInactive: '#CBD5E1',
    text: '#92400E',
    badge: '#FEF3C7',
    badgeText: '#D97706',
    glowColor: '245,158,11',
    typeLabel: 'EVALUATE',
  },
  output: {
    fill: '#FAF5FF',
    fillActive: '#F3E8FF',
    stroke: '#8B5CF6',
    strokeInactive: '#CBD5E1',
    text: '#5B21B6',
    badge: '#EDE9FE',
    badgeText: '#7C3AED',
    glowColor: '139,92,246',
    typeLabel: 'OUTPUT',
  },
};

/* ── Tiny SVG icon paths (16×16 viewBox) per type ── */
const nodeIconPaths: Record<FlowNode['type'], JSX.Element> = {
  input: (
    <>
      <rect x="3" y="2" width="10" height="12" rx="1.5" fill="none" strokeWidth="1.4" />
      <line x1="5.5" y1="5" x2="10.5" y2="5" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="11" x2="8.5" y2="11" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  process: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" strokeWidth="1.4" />
      <polyline
        points="8,4 8,8 11,10"
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  judge: (
    <>
      <line x1="8" y1="2.5" x2="8" y2="9" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="5" x2="12" y2="5" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" />
      <line x1="8" y1="9" x2="5" y2="13.5" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="9" x2="11" y2="13.5" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  output: (
    <>
      <rect x="2.5" y="10" width="3" height="4" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="10.5" y="3" width="3" height="11" rx="0.5" fill="currentColor" stroke="none" />
    </>
  ),
};

export function FlowDiagram({ nodes, edges, activeNodeIds, activeEdgeIds }: FlowDiagramProps) {
  /* Auto-layout: evenly space nodes horizontally, centered vertically */
  const { positions, viewW, viewH } = useMemo(() => {
    const count = nodes.length;
    const totalW = count * NODE_W + (count - 1) * GAP + PAD_X * 2;
    const totalH = NODE_H + PAD_Y * 2 + 20; // extra 20 for type badge
    const posMap = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, i) => {
      posMap.set(n.id, {
        x: PAD_X + i * (NODE_W + GAP),
        y: PAD_Y + 14, // offset for type badge above
      });
    });
    return { positions: posMap, viewW: totalW, viewH: totalH };
  }, [nodes]);

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Subtle drop shadow */}
          <filter id="fd-shadow" x="-10%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.06" />
          </filter>

          {/* Per-type glow filters for active nodes */}
          {Object.entries(nodeStyles).map(([type, s]) => (
            <filter key={type} id={`fd-glow-${type}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="4"
                floodColor={`rgb(${s.glowColor})`}
                floodOpacity="0.35"
              />
            </filter>
          ))}

          {/* Arrow markers */}
          <marker id="fd-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0 0 L8 3 L0 6 Z" fill="#CBD5E1" />
          </marker>
          <marker
            id="fd-arrow-active"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 L8 3 L0 6 Z" fill="#8B9F4F" />
          </marker>
        </defs>

        {/* ── Edges ── */}
        {edges.map((edge) => {
          const sp = positions.get(edge.source);
          const tp = positions.get(edge.target);
          if (!sp || !tp) return null;

          const x1 = sp.x + NODE_W;
          const y1 = sp.y + NODE_H / 2;
          const x2 = tp.x;
          const y2 = tp.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;

          const isActive = activeEdgeIds.includes(edge.id);
          const d = `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;

          return (
            <g key={edge.id}>
              <path
                d={d}
                fill="none"
                stroke={isActive ? '#8B9F4F' : '#E2E8F0'}
                strokeWidth={isActive ? 2.5 : 1.5}
                markerEnd={isActive ? 'url(#fd-arrow-active)' : 'url(#fd-arrow)'}
                className={isActive && edge.animated ? 'flow-edge-animated' : ''}
                style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
              />
              {/* Edge label pill */}
              {edge.label && (
                <g transform={`translate(${mx}, ${(y1 + y2) / 2 - 12})`}>
                  <rect
                    x={-((edge.label.length * 5 + 12) / 2)}
                    y={-8}
                    width={edge.label.length * 5 + 12}
                    height={16}
                    rx={8}
                    fill={isActive ? '#F0FDF4' : '#F8FAFC'}
                    stroke={isActive ? '#BBF7D0' : '#E2E8F0'}
                    strokeWidth={0.8}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="8"
                    fontWeight="500"
                    fontFamily="Inter, system-ui, sans-serif"
                    fill={isActive ? '#166534' : '#94A3B8'}
                    letterSpacing="0.02em"
                  >
                    {edge.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Nodes ── */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;

          const s = nodeStyles[node.type];
          const isActive = activeNodeIds.includes(node.id);
          const iconPaths = nodeIconPaths[node.type];

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ transition: 'opacity 0.3s' }}
            >
              {/* Node card */}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={NODE_R}
                ry={NODE_R}
                fill={isActive ? s.fillActive : s.fill}
                stroke={isActive ? s.stroke : s.strokeInactive}
                strokeWidth={isActive ? 2 : 1.2}
                filter={isActive ? `url(#fd-glow-${node.type})` : 'url(#fd-shadow)'}
                style={{ transition: 'all 0.3s ease' }}
              />

              {/* Icon circle */}
              <circle
                cx={NODE_W / 2}
                cy={17}
                r={11}
                fill={isActive ? s.badge : '#F8FAFC'}
                stroke={isActive ? s.stroke : '#E2E8F0'}
                strokeWidth={1}
                style={{ transition: 'all 0.3s ease' }}
              />

              {/* Icon SVG */}
              <g
                transform={`translate(${NODE_W / 2 - 7}, ${17 - 7}) scale(0.875)`}
                stroke={isActive ? s.text : '#94A3B8'}
                fill="none"
                style={{ color: isActive ? s.text : '#94A3B8', transition: 'all 0.3s ease' }}
              >
                {iconPaths}
              </g>

              {/* Main label */}
              <text
                x={NODE_W / 2}
                y={41}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif"
                fill={isActive ? s.text : '#64748B'}
                style={{ transition: 'fill 0.3s' }}
              >
                {node.label}
              </text>

            </g>
          );
        })}
      </svg>
    </div>
  );
}
