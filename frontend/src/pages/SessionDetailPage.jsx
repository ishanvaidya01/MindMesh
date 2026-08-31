import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useQuizStore from '../stores/useQuizStore';
import Leaderboard from '../components/leaderboard/Leaderboard';
import MisconceptionGraph from '../components/graphs/MisconceptionGraph';

export default function SessionDetailPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { fetchHistory } = useQuizStore();
  const [history, setHistory] = useState(null);
  const [activeTab, setActiveTab] = useState('standard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchHistory(roomCode).then(data => {
      setHistory(data);
      setLoading(false);
    });
  }, [roomCode]);

  if (loading) {
    return (
      <div className="app-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading session data...</p>
      </div>
    );
  }

  if (!history) {
    return (
      <div className="app-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <p style={{ color: 'var(--text-muted)' }}>Session not found</p>
        <button className="btn btn-ghost" onClick={() => navigate('/history')} style={{ marginTop: 16 }}>
          Back to History
        </button>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-title">
          <button onClick={() => navigate('/history')} className="btn btn-ghost btn-sm">← Back</button>
          <div>
            <h2>{history.quiz_title}</h2>
            <div className="flex gap-sm" style={{ alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--primary-400)' }}>
                {roomCode}
              </span>
              <span className={`badge badge--${history.status}`}>{history.status}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Hosted by {history.host} · {Object.keys(history.participants || {}).length} participants
              </span>
            </div>
          </div>
        </div>
        <button className="btn btn-accent btn-sm" onClick={() => navigate(`/debrief/${roomCode}`)}>
          View Quiz Summary
        </button>
      </div>

      {/* Leaderboard */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Final Standings
        </h3>
        <Leaderboard data={history.leaderboard} activeTab={activeTab} onTabChange={setActiveTab} />
      </motion.div>

      {/* Questions breakdown */}
      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Question-by-Question Breakdown
      </h3>

      {(history.questions || []).map((q, i) => {
        const totalAnswers = Object.keys(q.answers || {}).length;
        const correctCount = Object.values(q.answers || {}).filter(a => a.is_correct).length;
        const accuracy = totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0;

        return (
          <motion.div
            key={q.question_id}
            className="glass-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            style={{ marginBottom: 12 }}
          >
            <div className="flex flex-between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)',
                  background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                }}>
                  Q{q.order + 1}
                </span>
                <h4 style={{ fontSize: '1rem', marginTop: 8, lineHeight: 1.4 }}>{q.text}</h4>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700,
                  color: accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--error)',
                }}>
                  {accuracy}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>accuracy</div>
              </div>
            </div>

            {/* Options with answer distribution */}
            <div style={{ display: 'grid', gap: 6 }}>
              {(q.options || []).map(opt => {
                const answerCount = Object.values(q.answers || {}).filter(a => a.option_id === opt.id).length;
                const pct = totalAnswers > 0 ? Math.round((answerCount / totalAnswers) * 100) : 0;

                return (
                  <div key={opt.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                    background: opt.is_correct ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                    border: `1px solid ${opt.is_correct ? 'rgba(16, 185, 129, 0.2)' : 'transparent'}`,
                  }}>
                    <span style={{
                      fontSize: '0.85rem', color: opt.is_correct ? 'var(--success)' : 'var(--text-secondary)',
                      flex: 1,
                    }}>
                      {opt.is_correct ? '✓ ' : ''}{opt.text}
                      {opt.misconception_tag && (
                        <span style={{
                          marginLeft: 8, fontSize: '0.7rem', color: 'var(--warning)',
                          background: 'rgba(245, 158, 11, 0.1)', padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                        }}>
                          {opt.misconception_tag}
                        </span>
                      )}
                    </span>
                    <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        flex: 1, height: 4, background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-full)', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: opt.is_correct ? 'var(--success)' : 'var(--error)',
                          borderRadius: 'var(--radius-full)', transition: 'width 0.5s',
                        }} />
                      </div>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                        color: 'var(--text-muted)', minWidth: 35, textAlign: 'right',
                      }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
