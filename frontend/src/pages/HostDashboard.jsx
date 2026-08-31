import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useWebSocket from '../stores/useWebSocket';
import useRoomStore from '../stores/useRoomStore';
import Leaderboard from '../components/leaderboard/Leaderboard';
import MisconceptionGraph from '../components/graphs/MisconceptionGraph';

const API_BASE = 'http://localhost:8000/api';

// ─── Student Progress Bar Graph ───────────────────────────────────────────────
// Shows how many students are on each question — vertical bar chart
function StudentProgressChart({ studentProgress, participants, totalQuestions }) {
  if (!participants || participants.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Waiting for students to start…
      </div>
    );
  }

  const total = totalQuestions || 1;
  const distribution = {}; // { "Q1": count, "Q2": count, ..., "Done": count }
  let waitingCount = 0;

  participants.forEach(p => {
    const prog = studentProgress[p.id];
    if (!prog || prog.questionIndex < 0) {
      waitingCount++;
    } else if (prog.completed) {
      distribution['Done'] = (distribution['Done'] || 0) + 1;
    } else {
      const key = `Q${prog.questionIndex + 1}`;
      distribution[key] = (distribution[key] || 0) + 1;
    }
  });

  // Build ordered bars: Waiting, Q1, Q2, ..., Qn, Done
  const bars = [];
  if (waitingCount > 0) bars.push({ label: 'Wait', count: waitingCount, color: 'var(--text-muted)' });
  for (let i = 0; i < total; i++) {
    const key = `Q${i + 1}`;
    bars.push({ label: key, count: distribution[key] || 0, color: 'var(--primary-500)' });
  }
  if (distribution['Done']) bars.push({ label: 'Done', count: distribution['Done'], color: 'var(--success)' });

  const maxCount = Math.max(1, ...bars.map(b => b.count));
  const chartHeight = 120;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: chartHeight + 28, paddingTop: 8 }}>
      {bars.map((bar, i) => {
        const barHeight = bar.count > 0 ? Math.max(8, (bar.count / maxCount) * chartHeight) : 0;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
            {/* Count label */}
            {bar.count > 0 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ fontSize: '0.7rem', fontWeight: 700, color: bar.color, marginBottom: 3, fontFamily: 'var(--font-mono)' }}
              >
                {bar.count}
              </motion.span>
            )}
            {/* Bar */}
            <motion.div
              animate={{ height: barHeight }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
              style={{
                width: '100%', maxWidth: 32, borderRadius: '6px 6px 0 0',
                background: bar.label === 'Done'
                  ? 'linear-gradient(0deg, #10b981, #34d399)'
                  : bar.label === 'Wait'
                    ? 'rgba(148,163,184,0.3)'
                    : 'linear-gradient(0deg, var(--primary-500), var(--primary-400))',
                minHeight: bar.count > 0 ? 8 : 2,
              }}
            />
            {/* Question label */}
            <span style={{
              fontSize: '0.62rem', fontWeight: 600, marginTop: 4,
              color: bar.count > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Answer Distribution Chart ────────────────────────────────────────────────
// Shows how many students picked each option per question — stacked horizontal bars
const OPTION_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];

function AnswerDistributionChart({ questionCounts, correctCounts, clusters, questions = [] }) {
  // clusters: [{ misconception_tag, question_id, participant_ids }]
  // We'll show per-option counts per question using cluster data + correct counts
  const qEntries = Object.entries(questionCounts || {});

  if (qEntries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📊</div>
        <p style={{ fontSize: '0.85rem' }}>Answer distribution will appear here as students submit answers</p>
      </div>
    );
  }

  const questionLabels = questions.reduce((m, q, i) => ({ ...m, [q.id]: { label: `Q${i + 1}`, text: q.text } }), {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {qEntries.map(([qId, total]) => {
        const correct = correctCounts?.[qId] || 0;
        const incorrect = total - correct;
        const correctPct = total > 0 ? (correct / total) * 100 : 0;
        const incorrectPct = total > 0 ? (incorrect / total) * 100 : 0;
        const qLabel = questionLabels[qId];
        const qClusters = (clusters || []).filter(c => c.question_id === qId);

        return (
          <div key={qId} style={{ background: 'var(--bg-deep)', borderRadius: 'var(--radius-md)', padding: '16px 18px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--primary-500)', fontSize: '0.85rem' }}>
                  {qLabel?.label || qId.substring(0, 6)}
                </span>
                {qLabel?.text && (
                  <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {qLabel.text.length > 50 ? qLabel.text.substring(0, 50) + '…' : qLabel.text}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{total} answer{total !== 1 ? 's' : ''}</span>
            </div>

            {/* Correct vs Incorrect bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>✅ Correct ({correct})</span>
                <span>❌ Wrong ({incorrect})</span>
              </div>
              <div style={{ height: 16, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
                <motion.div
                  animate={{ width: `${correctPct}%` }}
                  transition={{ duration: 0.5 }}
                  style={{ height: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)', borderRadius: '99px 0 0 99px' }}
                />
                <motion.div
                  animate={{ width: `${incorrectPct}%` }}
                  transition={{ duration: 0.5 }}
                  style={{ height: '100%', background: 'linear-gradient(90deg, #ef4444, #f87171)', borderRadius: '0 99px 99px 0' }}
                />
              </div>
            </div>

            {/* Misconception clusters */}
            {qClusters.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: 4 }}>Common traps:</span>
                {qClusters.map((c, ci) => (
                  <span key={ci} style={{
                    fontSize: '0.7rem', fontWeight: 600,
                    background: `${OPTION_COLORS[ci % OPTION_COLORS.length]}15`,
                    color: OPTION_COLORS[ci % OPTION_COLORS.length],
                    border: `1px solid ${OPTION_COLORS[ci % OPTION_COLORS.length]}30`,
                    padding: '2px 8px', borderRadius: 99
                  }}>
                    {c.misconception_tag?.replace(/_/g, ' ')} ({c.participant_ids?.length || 0})
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Hints History Panel ───────────────────────────────────────────────────────
function HintsPanel({ hints }) {
  const entries = Object.entries(hints || {});
  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🤖</div>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
          AI hints appear here when students have &lt; 15 seconds remaining.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map(([qId, hint], i) => (
        <div key={qId} style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.04))',
          border: '1px solid rgba(99,102,241,0.15)'
        }}>
          <div style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
            🤖 AI Hint — Question {i + 1}
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#334155', lineHeight: 1.5 }}>{hint}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Restart Quiz Panel ────────────────────────────────────────────────────────
function RestartPanel({ roomCode, onRestart }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRestart() {
    setLoading(true);
    try {
      const hostToken = sessionStorage.getItem('host_token');
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/reset/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_token: hostToken }),
      });
      if (res.ok) {
        onRestart();
      } else {
        alert('Failed to reset the quiz. Please try again.');
      }
    } catch (e) {
      alert('Network error: ' + e.message);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="glass-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔄</div>
      <h3 style={{ margin: '0 0 12px', color: '#0f172a' }}>Restart Quiz from Beginning</h3>
      <p style={{ color: '#64748b', marginBottom: 8, fontSize: '0.9rem', maxWidth: 420, margin: '0 auto 16px' }}>
        This will reset the current session — all live leaderboard data will be cleared and students can answer fresh.
      </p>
      <p style={{ color: '#10b981', fontSize: '0.8rem', marginBottom: 24, fontWeight: 600 }}>
        ✓ Previously recorded best scores are preserved in the history.
      </p>

      {!confirming ? (
        <button
          className="btn btn-primary"
          onClick={() => setConfirming(true)}
          style={{ padding: '14px 32px', fontSize: '1rem' }}
        >
          Start Quiz from Beginning
        </button>
      ) : (
        <div>
          <p style={{ fontWeight: 700, color: '#ef4444', marginBottom: 16 }}>
            ⚠️ Are you sure? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={loading}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handleRestart}
              disabled={loading}
              style={{ padding: '12px 28px' }}
            >
              {loading ? '⏳ Resetting…' : '✓ Yes, Restart Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Host Dashboard ────────────────────────────────────────────────────
export default function HostDashboard() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const ws = useWebSocket();
  const room = useRoomStore();
  const [activePanel, setActivePanel] = useState('leaderboard');

  const handleMessage = useCallback((data) => {
    room.handleMessage(data);
  }, []);

  useEffect(() => {
    ws.setOnMessage(handleMessage);
    ws.connect(roomCode);
    return () => {
      ws.disconnect();
      room.resetRoom();
    };
  }, [roomCode]);

  useEffect(() => {
    if (ws.connected) {
      const hostToken = sessionStorage.getItem('host_token');
      if (hostToken) {
        ws.authenticate(null, hostToken);
      }
    }
  }, [ws.connected]);

  function pushNextQuestion() {
    ws.send({ type: 'question_pushed' });
  }

  function pauseSession() {
    ws.send({ type: 'host_pause' });
  }

  function resumeSession() {
    ws.send({ type: 'host_resume' });
  }

  function endSession() {
    if (window.confirm('End this quiz session? This cannot be undone.')) {
      ws.send({ type: 'end_session' });
    }
  }

  function handleRestart() {
    // Room reset was done via REST; tell backend via WS too (updates all clients)
    ws.send({ type: 'host_reset_room' });
    setActivePanel('leaderboard');
  }

  // Count how many students are on each question
  const totalStudents = room.participants.length || room.totalParticipants || 1;
  // Total questions: try to infer from studentProgress
  const maxQFromProgress = Object.values(room.studentProgress).reduce((m, p) => Math.max(m, p.totalQuestions || 0), 0);

  if (room.sessionEnded) {
    return (
      <div className="app-container" style={{ maxWidth: 900, margin: '0 auto', paddingTop: 60 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>Session Ended 🎉</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
            Room <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)' }}>{roomCode}</span> has concluded.
          </p>
          <Leaderboard data={room.leaderboard} activeTab={room.activeLeaderboardTab} onTabChange={room.setActiveLeaderboardTab} />
          <div className="flex gap-md" style={{ justifyContent: 'center', marginTop: 32 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/debrief/${roomCode}`)}>
              View Quiz Summary
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(`/history/${roomCode}`)}>
              View Session History
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              Back to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-title">
          <h2>Host Dashboard</h2>
          <span className={`badge badge--${room.status}`}>
            {room.status === 'live' ? '● LIVE' : room.status}
          </span>
        </div>
        <div className="flex gap-sm" style={{ alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {room.participants.length} participant{room.participants.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Lobby */}
      {room.status === 'lobby' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="room-code-container" style={{ marginBottom: 32 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 8, position: 'relative', zIndex: 1 }}>
            Share this code with participants
          </p>
          <div className="room-code">{roomCode}</div>
          <div style={{ marginTop: 16, position: 'relative', zIndex: 1 }}>
            {room.participants.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                {room.participants.map(p => (
                  <span key={p.id} style={{
                    padding: '4px 12px', borderRadius: 'var(--radius-full)',
                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    fontSize: '0.85rem', color: 'var(--text-secondary)',
                  }}>
                    {p.name}
                  </span>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-lg" onClick={pushNextQuestion}
              disabled={room.participants.length === 0}>
              Start Quiz →
            </button>
          </div>
        </motion.div>
      )}

      {/* Live controls */}
      {(room.status === 'live' || room.status === 'paused') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
          {/* LEFT */}
          <div>
            {/* Room code banner — always visible during live session */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))',
              border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14,
              padding: '12px 18px', marginBottom: 16,
            }}>
              <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Room Code
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '1.5rem',
                color: '#4f46e5', letterSpacing: '0.18em',
              }}>
                {roomCode}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(roomCode)}
                style={{
                  marginLeft: 'auto', background: 'rgba(99,102,241,0.12)',
                  border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8,
                  padding: '4px 12px', fontSize: '0.75rem', color: '#6366f1',
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}
              >
                Copy
              </button>
            </div>
            {/* Current question card */}
            {room.currentQuestion && (
              <div className="glass-card" style={{ marginBottom: 20, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Q{room.questionIndex + 1}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {room.answersReceived}/{room.totalParticipants || room.participants.length} answered
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700,
                      color: room.timeRemaining <= 5 ? 'var(--error)' : 'var(--text-primary)',
                    }}>
                      {room.timeRemaining}s
                    </span>
                  </div>
                </div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>{room.currentQuestion.text}</h3>

                {/* Student progress chart */}
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                    📍 Student Progress
                  </div>
                  <StudentProgressChart
                    studentProgress={room.studentProgress}
                    participants={room.participants}
                    totalQuestions={maxQFromProgress || 1}
                  />
                </div>
              </div>
            )}

            {/* Host controls */}
            <div className="flex gap-sm" style={{ marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <motion.button
                className="btn btn-primary"
                onClick={pushNextQuestion}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              >
                Next Question →
              </motion.button>
              {room.status === 'live' ? (
                <button className="btn btn-ghost" onClick={pauseSession}>⏸ Pause</button>
              ) : (
                <button className="btn btn-success" onClick={resumeSession}>▶ Resume</button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-danger btn-sm" onClick={endSession}>End Session</button>
            </div>

            {/* Panel tabs */}
            <div className="tabs" style={{ marginBottom: 16 }}>
              {[
                ['leaderboard', '🏆 Leaderboard'],
                ['distribution', '📊 Answer Distribution'],
                ['hints', '🤖 AI Hints'],
                ['restart', '🔄 Restart Quiz'],
              ].map(([tab, label]) => (
                <button key={tab} className={`tab ${activePanel === tab ? 'tab--active' : ''}`}
                  onClick={() => setActivePanel(tab)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <AnimatePresence mode="wait">
              <motion.div key={activePanel} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {activePanel === 'leaderboard' && (
                  <Leaderboard data={room.leaderboard} activeTab={room.activeLeaderboardTab} onTabChange={room.setActiveLeaderboardTab} />
                )}
                {activePanel === 'distribution' && (
                  <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase' }}>
                      📊 Answer Distribution by Question
                    </h3>
                    <AnswerDistributionChart
                      questionCounts={room.questionCounts}
                      correctCounts={room.correctCounts}
                      clusters={room.clusters}
                    />
                  </div>
                )}
                {activePanel === 'hints' && (
                  <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase' }}>
                      🤖 AI Socratic Hints
                    </h3>
                    <HintsPanel hints={room.hints} />
                  </div>
                )}
                {activePanel === 'restart' && (
                  <RestartPanel roomCode={roomCode} onRestart={handleRestart} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* RIGHT: Sticky leaderboard */}
          <div>
            <div className="glass-card" style={{ position: 'sticky', top: 20 }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🏆 Live Rankings
              </h3>
              <Leaderboard
                data={room.leaderboard}
                activeTab={room.activeLeaderboardTab}
                onTabChange={room.setActiveLeaderboardTab}
                compact
              />

              {/* Student progress summary in sidebar */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
                  Student Progress
                </div>
                {room.participants.slice(0, 6).map(p => {
                  const prog = room.studentProgress[p.id];
                  const qIdx = prog ? prog.questionIndex : -1;
                  const done = prog?.completed;
                  const pct = maxQFromProgress > 0 && qIdx >= 0 ? Math.min(((qIdx + 1) / maxQFromProgress) * 100, 100) : 0;
                  return (
                    <div key={p.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 3 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{p.name}</span>
                        <span style={{ color: done ? 'var(--success)' : 'var(--primary-500)', fontWeight: 700 }}>
                          {done ? '✓' : qIdx >= 0 ? `Q${qIdx + 1}` : '…'}
                        </span>
                      </div>
                      <div style={{ height: 5, background: 'var(--bg-deep)', borderRadius: 99, overflow: 'hidden' }}>
                        <motion.div
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4 }}
                          style={{
                            height: '100%', borderRadius: 99,
                            background: done ? 'var(--success)' : 'var(--primary-500)'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {room.participants.length > 6 && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    +{room.participants.length - 6} more students
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
