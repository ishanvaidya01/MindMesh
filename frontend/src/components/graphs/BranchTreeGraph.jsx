import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import useQuizStore from '../../stores/useQuizStore';

/**
 * Branch Tree Graph — host-facing git-graph style visualization
 * showing which adaptive branch path the session actually took.
 */

export default function BranchTreeGraph({ roomCode }) {
  const { fetchBranchTree } = useQuizStore();
  const [treeData, setTreeData] = useState(null);

  useEffect(() => {
    if (roomCode) {
      fetchBranchTree(roomCode).then(data => {
        if (data) setTreeData(data);
      });
    }
  }, [roomCode]);

  if (!treeData || !treeData.nodes || treeData.nodes.length === 0) {
    return (
      <div className="graph-container" style={{
        height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌿</div>
          <p style={{ fontSize: '0.9rem' }}>Branch tree visualization</p>
          <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Shows adaptive quiz path</p>
        </div>
      </div>
    );
  }

  const pathTaken = new Set(treeData.path_taken || []);

  // Layout nodes vertically
  const nodePositions = {};
  const mainlineNodes = treeData.nodes.filter(n => !n.is_branch);
  const branchNodes = treeData.nodes.filter(n => n.is_branch);

  const nodeWidth = 220;
  const nodeHeight = 60;
  const gapY = 80;
  const gapX = 260;

  mainlineNodes.forEach((node, i) => {
    nodePositions[node.id] = { x: 40, y: i * gapY + 40 };
  });

  branchNodes.forEach((node, i) => {
    // Find parent position
    const parentEdge = treeData.edges.find(e => e.to === node.id && e.type === 'branch');
    const parentPos = parentEdge ? nodePositions[parentEdge.from] : null;
    nodePositions[node.id] = {
      x: (parentPos?.x || 40) + gapX,
      y: (parentPos?.y || 0) + (i + 1) * 40,
    };
  });

  const svgHeight = Math.max(400, (mainlineNodes.length + branchNodes.length) * gapY + 80);
  const svgWidth = 600;

  return (
    <div className="graph-container" style={{ height: svgHeight, overflow: 'auto', position: 'relative' }}>
      <span className="graph-title">🌿 Quiz Branch Tree</span>

      <svg width={svgWidth} height={svgHeight} style={{ paddingTop: 40 }}>
        {/* Edges */}
        {treeData.edges.map((edge, i) => {
          const from = nodePositions[edge.from];
          const to = nodePositions[edge.to];
          if (!from || !to) return null;

          const isBranch = edge.type === 'branch';
          const isOnPath = pathTaken.has(edge.from) && pathTaken.has(edge.to);

          return (
            <g key={i}>
              <line
                x1={from.x + nodeWidth / 2}
                y1={from.y + nodeHeight}
                x2={to.x + nodeWidth / 2}
                y2={to.y}
                stroke={isOnPath ? '#10b981' : isBranch ? '#8b5cf6' : '#2a2a3a'}
                strokeWidth={isOnPath ? 3 : 2}
                strokeDasharray={isBranch ? '6,4' : 'none'}
                opacity={isOnPath ? 1 : 0.5}
              />
              {isBranch && edge.condition && (
                <text
                  x={(from.x + to.x + nodeWidth) / 2}
                  y={(from.y + nodeHeight + to.y) / 2}
                  fill="#8b5cf6"
                  fontSize="9"
                  fontFamily="Inter, sans-serif"
                  textAnchor="middle"
                  opacity={0.7}
                >
                  {`>${edge.condition.threshold_pct}% "${edge.condition.if_misconception_tag}"`}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {treeData.nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          const isOnPath = pathTaken.has(node.id);
          const isBranch = node.is_branch;

          return (
            <motion.g
              key={node.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <rect
                x={pos.x}
                y={pos.y}
                width={nodeWidth}
                height={nodeHeight}
                rx={10}
                fill={isOnPath ? 'rgba(16, 185, 129, 0.15)' : isBranch ? 'rgba(139, 92, 246, 0.1)' : '#151524'}
                stroke={isOnPath ? '#10b981' : isBranch ? '#8b5cf6' : '#2a2a3a'}
                strokeWidth={isOnPath ? 2 : 1}
              />
              {/* Dot indicator */}
              <circle
                cx={pos.x + 16}
                cy={pos.y + nodeHeight / 2}
                r={5}
                fill={isOnPath ? '#10b981' : isBranch ? '#8b5cf6' : '#4a4a5a'}
              />
              <text
                x={pos.x + 30}
                y={pos.y + nodeHeight / 2 + 4}
                fill={isOnPath ? '#e0e0e8' : '#8a8a9a'}
                fontSize="11"
                fontFamily="Inter, sans-serif"
              >
                {node.label.slice(0, 30)}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
