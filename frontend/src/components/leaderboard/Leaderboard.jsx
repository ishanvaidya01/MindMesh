import { motion, AnimatePresence } from 'framer-motion';

/**
 * QuestionTrackDots — shows green/red dots for each question answered.
 * Renders inline between the player name and score.
 */
function QuestionTrackDots({ track = [], totalQuestions = 0 }) {
  // Normalize to show dots for all questions (grey = not answered)
  const dots = Array.from({ length: Math.max(track.length, totalQuestions || track.length) }, (_, i) => {
    const answered = track.find(t => t.q_index === i);
    if (!answered) return 'pending';
    return answered.is_correct ? 'correct' : 'wrong';
  });

  if (dots.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', maxWidth: 120 }}>
      {dots.map((status, i) => (
        <motion.div
          key={i}
          initial={status !== 'pending' ? { scale: 0 } : {}}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20, delay: i * 0.03 }}
          title={status === 'correct' ? 'Correct' : status === 'wrong' ? 'Wrong' : 'Not answered'}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background:
              status === 'correct' ? '#22c55e' :
              status === 'wrong'   ? '#ef4444' :
              'rgba(148,163,184,0.3)',
            border: status === 'pending' ? '1px solid rgba(148,163,184,0.3)' : 'none',
            boxShadow:
              status === 'correct' ? '0 0 4px rgba(34,197,94,0.5)' :
              status === 'wrong'   ? '0 0 4px rgba(239,68,68,0.5)' :
              'none',
          }}
        />
      ))}
    </div>
  );
}

/**
 * StreakBadge — fire emojis for consecutive correct answers.
 */
function StreakBadge({ streak = 0 }) {
  if (streak < 3) return null;
  const fires = streak >= 5 ? '🔥🔥' : '🔥';
  return (
    <motion.span
      initial={{ scale: 0, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      title={`${streak} in a row!`}
      style={{
        fontSize: '0.75rem', marginLeft: 4, cursor: 'default',
        filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.5))'
      }}
    >
      {fires}
    </motion.span>
  );
}

/**
 * Dual Leaderboard component with animated rank changes,
 * per-question answer track dots, and streak fire badges.
 */
export default function Leaderboard({ data, activeTab = 'standard', onTabChange, compact = false }) {
  const leaderboard = data || { standard: [], calibration: [] };
  const entries = activeTab === 'standard' ? leaderboard.standard : leaderboard.calibration;

  const scoreKey = activeTab === 'standard' ? 'points' : 'calibration_score';
  const scoreLabel = activeTab === 'standard' ? 'pts' : 'cal';

  // Total questions = max track length across all entries
  const totalQuestions = Math.max(0, ...((entries || []).map(e => (e.question_track || []).length)));

  function getRankClass(rank) {
    if (rank === 1) return 'leaderboard-rank--gold';
    if (rank === 2) return 'leaderboard-rank--silver';
    if (rank === 3) return 'leaderboard-rank--bronze';
    return '';
  }

  function getRankIcon(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  }

  return (
    <div>
      {/* Tabs */}
      {onTabChange && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab ${activeTab === 'standard' ? 'tab--active' : ''}`}
            onClick={() => onTabChange('standard')}>
            🏆 Standard (Points)
          </button>
          <button className={`tab ${activeTab === 'calibration' ? 'tab--active' : ''}`}
            onClick={() => onTabChange('calibration')}>
            🎯 Prediction Accuracy
          </button>
        </div>
      )}

      <div className="leaderboard">
        <AnimatePresence>
          {(entries || []).slice(0, compact ? 10 : 50).map((entry, idx) => (
            <motion.div
              key={entry.participant_id}
              layoutId={`lb-${entry.participant_id}`}
              className="leaderboard-row"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={idx === 0 && !compact ? {
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: 'var(--radius-md)',
                padding: compact ? '6px 12px' : '12px 16px',
              } : {
                padding: compact ? '6px 12px' : undefined,
              }}
            >
              {/* Rank badge */}
              <span className={`leaderboard-rank ${getRankClass(entry.rank)}`}>
                {getRankIcon(entry.rank)}
              </span>

              {/* Name + streak */}
              <span className="leaderboard-name" style={{
                fontSize: compact ? '0.85rem' : undefined,
                display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden'
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.display_name}
                </span>
                <StreakBadge streak={entry.streak || 0} />
              </span>

              {/* 🟢🔴 Question track dots — compact hides them */}
              {!compact && (
                <QuestionTrackDots
                  track={entry.question_track || []}
                  totalQuestions={totalQuestions}
                />
              )}

              {/* Score */}
              <motion.span
                className="leaderboard-score"
                key={entry[scoreKey]}
                initial={{ scale: 1.3, color: '#10b981' }}
                animate={{ scale: 1, color: 'var(--primary-400)' }}
                transition={{ duration: 0.5 }}
                style={{ fontSize: compact ? '0.85rem' : undefined }}
              >
                {typeof entry[scoreKey] === 'number'
                  ? activeTab === 'calibration'
                    ? entry[scoreKey].toFixed(2)
                    : entry[scoreKey].toLocaleString()
                  : entry[scoreKey]
                }
                <span style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginLeft: 4 }}>{scoreLabel}</span>
              </motion.span>
            </motion.div>
          ))}
        </AnimatePresence>

        {(!entries || entries.length === 0) && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
            No scores yet — waiting for answers
          </div>
        )}
      </div>
    </div>
  );
}
