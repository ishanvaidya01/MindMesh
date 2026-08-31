import { useRef, useEffect, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

/**
 * Lifeline Social Graph — visualizes anonymous peer-to-peer lifeline signals.
 *
 * Nodes pulse when they receive a lifeline.
 * Links show the flow of support within the room.
 */

export default function LifelineGraph({ graphData, height = 400 }) {
  const graphRef = useRef();
  const containerRef = useRef();
  const pulsePhase = useRef(0);

  // Animate pulse
  useEffect(() => {
    let frame;
    const animate = () => {
      pulsePhase.current = (pulsePhase.current + 0.03) % (2 * Math.PI);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const radius = 6;
    const pulse = Math.sin(pulsePhase.current + node.x * 0.01) * 0.5 + 0.5;

    // Pulse glow
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 4 + pulse * 4, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(167, 139, 250, ${0.05 + pulse * 0.1})`;
    ctx.fill();

    // Node
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#a78bfa';
    ctx.fill();
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    const fontSize = 9 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#a0a0b8';
    ctx.fillText(node.name || '', node.x, node.y + radius + 3);
  }, []);

  const paintLink = useCallback((link, ctx) => {
    const start = link.source;
    const end = link.target;

    // Gradient link
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, 'rgba(167, 139, 250, 0.4)');
    gradient.addColorStop(1, 'rgba(167, 139, 250, 0.1)');

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowLen = 6;
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(
      midX - arrowLen * Math.cos(angle - Math.PI / 6),
      midY - arrowLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      midX - arrowLen * Math.cos(angle + Math.PI / 6),
      midY - arrowLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.fillStyle = 'rgba(167, 139, 250, 0.5)';
    ctx.fill();
  }, []);

  useEffect(() => {
    if (graphRef.current && graphData?.nodes?.length > 0) {
      setTimeout(() => graphRef.current.zoomToFit(400, 40), 300);
    }
  }, [graphData?.nodes?.length]);

  if (!graphData?.nodes?.length) {
    return (
      <div className="graph-container" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>💡</div>
          <p style={{ fontSize: '0.9rem' }}>Lifeline connections will appear here</p>
          <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>when participants send silent signals</p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-container" ref={containerRef} style={{ height, position: 'relative' }}>
      <span className="graph-title">💡 Lifeline Network</span>

      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={containerRef.current?.offsetWidth || 600}
        height={height}
        backgroundColor="transparent"
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={paintLink}
        linkCanvasObjectMode={() => 'replace'}
        linkDirectionalArrowLength={6}
        cooldownTime={2000}
        d3AlphaDecay={0.03}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
