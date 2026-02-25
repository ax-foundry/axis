'use client';

import type { FlowNode, FlowEdge } from '@/types';

interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  activeNodeIds: string[];
  activeEdgeIds: string[];
  width?: number;
  height?: number;
}

const NODE_WIDTH = 100;
const NODE_HEIGHT = 60;
const NODE_RADIUS = 12;

const nodeColors: Record<FlowNode['type'], { fill: string; stroke: string; text: string }> = {
  input: { fill: '#EFF6FF', stroke: '#3B82F6', text: '#1E40AF' },
  process: { fill: '#ECFDF5', stroke: '#10B981', text: '#047857' },
  judge: { fill: '#FEF3C7', stroke: '#F59E0B', text: '#B45309' },
  output: { fill: '#F3E8FF', stroke: '#8B5CF6', text: '#6D28D9' },
};

const getAnimationClass = (type: FlowNode['type'], isActive: boolean) => {
  if (!isActive) return '';
  switch (type) {
    case 'input':
      return 'flow-node-active-blue';
    case 'process':
      return 'flow-node-active';
    case 'judge':
      return 'flow-node-active-amber';
    case 'output':
      return 'flow-node-active-purple';
    default:
      return 'flow-node-active';
  }
};

export function FlowDiagram({
  nodes,
  edges,
  activeNodeIds,
  activeEdgeIds,
  width = 650,
  height = 200,
}: FlowDiagramProps) {
  return (
    <div className="rounded-xl border border-border bg-gray-50 p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Definitions for arrow markers */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#CBD5E1" />
          </marker>
          <marker
            id="arrowhead-active"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#8B9F4F" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const sourceNode = nodes.find((n) => n.id === edge.source);
          const targetNode = nodes.find((n) => n.id === edge.target);

          if (!sourceNode || !targetNode) return null;

          const startX = sourceNode.position.x + NODE_WIDTH;
          const startY = sourceNode.position.y + NODE_HEIGHT / 2;
          const endX = targetNode.position.x;
          const endY = targetNode.position.y + NODE_HEIGHT / 2;

          // Create a curved path for better visuals
          const midX = (startX + endX) / 2;
          const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

          const isActive = activeEdgeIds.includes(edge.id);

          return (
            <g key={edge.id}>
              <path
                d={path}
                fill="none"
                stroke={isActive ? '#8B9F4F' : '#CBD5E1'}
                strokeWidth={isActive ? 3 : 2}
                markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                className={`transition-all duration-300 ${
                  isActive && edge.animated ? 'flow-edge-animated' : ''
                }`}
              />
              {edge.label && (
                <text
                  x={midX}
                  y={(startY + endY) / 2 - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#7F8C8D"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const colors = nodeColors[node.type];
          const isActive = activeNodeIds.includes(node.id);

          return (
            <g
              key={node.id}
              transform={`translate(${node.position.x}, ${node.position.y})`}
              className={`transition-all duration-300 ${getAnimationClass(node.type, isActive)}`}
            >
              {/* Node background */}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={NODE_RADIUS}
                ry={NODE_RADIUS}
                fill={colors.fill}
                stroke={isActive ? colors.stroke : '#E2E8F0'}
                strokeWidth={isActive ? 3 : 2}
                className="transition-all duration-300"
              />
              {/* Node label */}
              <text
                x={NODE_WIDTH / 2}
                y={NODE_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="500"
                fill={colors.text}
              >
                {node.label}
              </text>
              {/* Active indicator */}
              {isActive && (
                <circle
                  cx={NODE_WIDTH - 8}
                  cy={8}
                  r={4}
                  fill={colors.stroke}
                  className="step-indicator-active"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
