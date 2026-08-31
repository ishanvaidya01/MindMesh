import { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Host Time-Machine — timeline slider for rewinding to any past event.
 */

export default function TimeMachine({ lastSequence, onRewind }) {
  const [targetSequence, setTargetSequence] = useState(lastSequence);
  const [annotation, setAnnotation] = useState('');

  if (lastSequence < 0) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏪</div>
        <p style={{ color: 'var(--text-muted)' }}>No events to rewind to yet</p>
      </div>
    );
  }

  function handleRewind() {
    if (onRewind && targetSequence >= 0 && targetSequence <= lastSequence) {
      onRewind(targetSequence);
    }
  }

  return (
    <div className="glass-card">
      <h3 style={{
        fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        ⏪ Time Machine
      </h3>

      <div style={{ marginBottom: 20 }}>
        <div className="flex flex-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Event #0</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary-400)' }}>
            #{targetSequence}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Event #{lastSequence}</span>
        </div>

        <input
          type="range"
          min="0"
          max={lastSequence}
          value={targetSequence}
          onChange={e => setTargetSequence(parseInt(e.target.value))}
          style={{
            width: '100%', height: 8,
            WebkitAppearance: 'none', appearance: 'none',
            borderRadius: 'var(--radius-full)',
            background: `linear-gradient(to right, var(--primary-500) ${(targetSequence / lastSequence) * 100}%, var(--bg-surface) ${(targetSequence / lastSequence) * 100}%)`,
            outline: 'none', cursor: 'pointer',
          }}
        />
      </div>

      {/* Annotation */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Annotation (optional)</label>
        <input
          className="form-input"
          value={annotation}
          onChange={e => setAnnotation(e.target.value)}
          placeholder="Add a note about this point in time..."
        />
      </div>

      <div className="flex gap-sm">
        <motion.button
          className="btn btn-accent"
          onClick={handleRewind}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          ⏪ Rewind to Event #{targetSequence}
        </motion.button>
        <button className="btn btn-ghost" onClick={() => setTargetSequence(lastSequence)}>
          Jump to Latest
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12, fontStyle: 'italic' }}>
        Rewinding will replay all events up to the selected point and sync all connected clients.
      </p>
    </div>
  );
}
