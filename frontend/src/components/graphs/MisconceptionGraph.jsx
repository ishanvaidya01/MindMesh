import { useRef, useEffect, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

/**
 * Misconception Cluster Graph — the visual centerpiece of MindMesh.
 *
 * Force-directed graph where:
 *   - Cluster nodes (large) represent misconception tags
 *   - Participant nodes (small) are colored by cluster
 *   - Links connect participants to their shared misconception
 *
 * Updates in real time as answers come in via WebSocket.
 */

const CLUSTER_COLORS = [
  '#e11d48', '#6d28d9', '#0284c7', '#d97706', '#059669',
  '#db2777', '#2563eb', '#dc2626', '#0d9488', '#9333ea',
];

export default function MisconceptionGraph({ graphData, clusters = [], height = 400 }) {
  const graphRef = useRef();
  const containerRef = useRef();

  // Build a color map from misconception tags
  const colorMap = useMemo(() => {
    const map = {};
    const tags = [...new Set((clusters || []).map(c => c.misconception_tag))];
    tags.forEach((tag, i) => {
      map[tag] = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
    });
    return map;
  }, [clusters]);

  // Enrich graph data with colors
  const enrichedData = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      return { nodes: [], links: [] };
    }

    const nodes = graphData.nodes.map(node => ({
      ...node,
      color: colorMap[node.group] || '#6b6b80',
    }));

    return { nodes, links: graphData.links || [] };
  }, [graphData, colorMap]);

  // Custom node renderer
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isCluster = node.type === 'cluster';
    const radius = isCluster ? 12 : 5;
    const color = node.color || '#6b6b80';

    // Glow effect for cluster nodes
    if (isCluster) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6, 0, 2 * Math.PI);
      ctx.fillStyle = color + '20';
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Border
    ctx.strokeStyle = isCluster ? '#fff' : color + '80';
    ctx.lineWidth = isCluster ? 2 : 1;
    ctx.stroke();

    // Label (only for cluster nodes or if zoomed in enough)
    if (isCluster || globalScale > 2) {
      const label = node.name || '';
      const fontSize = isCluster ? 11 / globalScale : 8 / globalScale;
      ctx.font = `${isCluster ? 'bold ' : ''}${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0f172a'; // Dark slate for light theme
      ctx.fillText(label, node.x, node.y + radius + 3);
    }
  }, []);

  // Custom link renderer
  const paintLink = useCallback((link, ctx) => {
    const start = link.source;
    const end = link.target;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)'; // Dark slate for light theme
    ctx.lineWidth = 1;
    ctx.stroke();
  }, []);

  // Zoom to fit when data changes
  useEffect(() => {
    if (graphRef.current && enrichedData.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400, 40);
      }, 300);
    }
  }, [enrichedData.nodes.length]);

  if (!enrichedData.nodes.length) {
    return (
      <div className="graph-container" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🧬</div>
          <p style={{ fontSize: '0.9rem' }}>Misconception clusters will appear here</p>
          <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>as participants submit answers</p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-container" ref={containerRef} style={{ height, position: 'relative' }}>
      <span className="graph-title">🧬 Misconception Clusters</span>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        display: 'flex', flexWrap: 'wrap', gap: 8,
      }}>
        {Object.entries(colorMap).map(([tag, color]) => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: '0.7rem', color: 'var(--text-secondary)',
            background: 'rgba(0,0,0,0.5)', padding: '2px 8px',
            borderRadius: 'var(--radius-full)', backdropFilter: 'blur(4px)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            {tag}
          </span>
        ))}
      </div>

      <ForceGraph2D
        ref={graphRef}
        graphData={enrichedData}
        width={containerRef.current?.offsetWidth || 600}
        height={height}
        backgroundColor="transparent"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={paintLink}
        linkCanvasObjectMode={() => 'replace'}
        cooldownTime={2000}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.3}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
