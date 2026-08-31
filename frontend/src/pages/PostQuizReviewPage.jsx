import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

function ConfidenceInsight({ confidence, isCorrect }) {
  let message, color, emoji;
  const c = confidence;

  if (isCorrect && c >= 100) { emoji = '🎯'; message = 'Perfect calibration — you were certain and right.'; color = 'var(--success)'; }
  else if (isCorrect && c >= 50) { emoji = '✅'; message = 'Good calibration — you trusted yourself.'; color = 'var(--success)'; }
  else if (isCorrect && c === 0) { emoji = '😅'; message = 'Lucky guess! You got it right, but trust yourself more next time.'; color = 'var(--warning)'; }
  else if (!isCorrect && c >= 100) { emoji = '⚠️'; message = 'Overconfident! High certainty on a wrong answer severely impacts your calibration score.'; color = 'var(--error)'; }
  else if (!isCorrect && c === 0) { emoji = '👍'; message = "Smart guess — you knew you weren't sure. Good self-awareness."; color = 'var(--text-muted)'; }
  else { emoji = '📊'; message = 'Your uncertainty was proportional to your outcome.'; color = 'var(--primary-500)'; }

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 'var(--radius-md)',
      background: `${color}10`, border: `1px solid ${color}30`,
      fontSize: '0.85rem', color, display: 'flex', alignItems: 'center', gap: 10,
      fontWeight: 500,
    }}>
      <span style={{ fontSize: '1.2rem' }}>{emoji}</span> {message}
    </div>
  );
}

export default function PostQuizReviewPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [reviewData, setReviewData] = useState(null);
  const [expandedQ, setExpandedQ] = useState(null);

  useEffect(() => {
    loadReview();
  }, [roomCode]);

  const loadReview = async () => {
    const sessionToken = sessionStorage.getItem('session_token');
    const params = sessionToken ? `?session_token=${sessionToken}` : '';

    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/my-review/${params}`);
      if (!res.ok) throw new Error('Review not found');
      const data = await res.json();
      setReviewData(data);
    } catch (err) {
      alert('Could not load review: ' + err.message);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!reviewData) return null;

  const { questions, total_correct, total_answered, total_points, calibration_score, quiz_title, display_name } = reviewData;
  const totalQuestions = questions?.length || 0;
  const accuracy = totalQuestions > 0 ? Math.round((total_correct / totalQuestions) * 100) : 0;
  const unanswered = totalQuestions - total_answered;
  const brier = Math.round((calibration_score || 0) * 100);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 16 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          📊 Quiz Analysis
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          {quiz_title} · {display_name}
        </p>
      </div>

      {/* Score Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Total Score', value: `${total_points}`, sub: 'pts', icon: '🏆', color: 'var(--primary-500)', bg: 'rgba(99,102,241,0.08)' },
          { label: 'Accuracy', value: `${accuracy}%`, sub: `${total_correct}/${totalQuestions}`, icon: '🎯', color: 'var(--success)', bg: 'rgba(16,185,129,0.08)' },
          { label: 'Calibration', value: `${brier}%`, sub: 'Brier score', icon: '📊', color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Unanswered', value: `${unanswered}`, sub: 'skipped', icon: '⏭️', color: 'var(--text-muted)', bg: 'rgba(148,163,184,0.08)' },
        ].map(stat => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
            style={{
              padding: '20px 16px', textAlign: 'center',
              background: stat.bg, border: 'none',
            }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono)' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, fontWeight: 700 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {stat.sub}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Question Breakdown Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Question Breakdown
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Click to expand details
        </span>
      </div>

      {/* Questions List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(questions || []).map((q, i) => {
          const ans = q.your_answer;
          const isCorrect = ans?.is_correct;
          const isExpanded = expandedQ === q.question_id;
          const wasAnswered = !!ans;

          return (
            <motion.div
              key={q.question_id}
              className="glass-card"
              style={{
                padding: 0, overflow: 'hidden', cursor: 'pointer',
                border: `1.5px solid ${!wasAnswered ? 'var(--glass-border)' : isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              {/* Question Row (click to expand) */}
              <div
                onClick={() => setExpandedQ(isExpanded ? null : q.question_id)}
                style={{
                  padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14,
                  background: !wasAnswered ? 'var(--bg-surface)' : isCorrect ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
                  transition: 'background 0.2s',
                }}
              >
                {/* Status badge */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: !wasAnswered ? 'var(--text-muted)' : isCorrect ? 'var(--success)' : 'var(--error)',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem', fontWeight: 700,
                }}>
                  {!wasAnswered ? '—' : isCorrect ? '✓' : '✗'}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
                    Q{i + 1}. {q.question_text}
                  </div>
                  {ans ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Your answer: <strong style={{ color: isCorrect ? 'var(--success)' : 'var(--error)' }}>
                        {q.options?.find(o => o.id === ans.option_id)?.text || 'Selected'}
                      </strong>
                      {!isCorrect && (
                        <> · Correct: <strong style={{ color: 'var(--success)' }}>
                          {q.options?.find(o => o.is_correct)?.text || '—'}
                        </strong></>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Not answered</span>
                  )}
                </div>

                {/* Points + expand indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {wasAnswered && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 700,
                      fontSize: '0.9rem',
                      color: isCorrect ? 'var(--success)' : 'var(--error)',
                    }}>
                      {isCorrect ? '+' : ''}{q.points_earned || 0}
                    </span>
                  )}
                  <motion.span
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
                  >
                    ▼
                  </motion.span>
                </div>
              </div>

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ padding: '20px', borderTop: '1px solid var(--glass-border)' }}>
                      {/* All Options */}
                      {q.options && q.options.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                          {q.options.map((opt, oi) => {
                            const wasSelected = ans?.option_id === opt.id;
                            const showCorrect = opt.is_correct;
                            return (
                              <div key={opt.id} style={{
                                padding: '12px 16px', borderRadius: 'var(--radius-md)',
                                background: showCorrect ? 'rgba(16,185,129,0.06)' : (wasSelected ? 'rgba(239,68,68,0.06)' : 'var(--bg-surface)'),
                                border: `1.5px solid ${showCorrect ? 'rgba(16,185,129,0.3)' : (wasSelected ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)')}`,
                                fontSize: '0.9rem',
                                color: showCorrect ? '#166534' : (wasSelected && !showCorrect ? 'var(--error)' : 'var(--text-secondary)'),
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{
                                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700,
                                    background: showCorrect ? 'var(--success)' : (wasSelected ? 'var(--error)' : 'rgba(148,163,184,0.15)'),
                                    color: (showCorrect || wasSelected) ? 'white' : 'var(--text-muted)',
                                  }}>
                                    {showCorrect ? '✓' : (wasSelected ? '✗' : String.fromCharCode(65 + oi))}
                                  </span>
                                  {opt.text}
                                </span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                  {showCorrect && '✓ Correct'}
                                  {wasSelected && !showCorrect && '✗ Your answer'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Explanation */}
                      {q.explanation && (
                        <div style={{
                          padding: '14px 18px', borderRadius: 'var(--radius-md)',
                          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                          marginBottom: 12, lineHeight: 1.6,
                        }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            💡 Explanation
                          </div>
                          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {q.explanation}
                          </p>
                        </div>
                      )}

                      {/* Misconception Tag */}
                      {!isCorrect && ans?.misconception_tag && (
                        <div style={{
                          padding: '12px 16px', borderRadius: 'var(--radius-md)',
                          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                          marginBottom: 12,
                        }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)' }}>
                            ⚠️ Misconception:
                          </span>{' '}
                          <span style={{ fontSize: '0.85rem', color: '#78350f' }}>
                            {ans.misconception_tag.replace(/_/g, ' ')} — This is a common error pattern. Revisit this concept.
                          </span>
                        </div>
                      )}

                      {/* Confidence insight */}
                      {ans && <ConfidenceInsight confidence={ans.confidence} isCorrect={ans.is_correct} />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 36 }}>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn btn-primary"
          onClick={() => navigate(`/quiz/${roomCode}?retake=true`)}
          style={{ padding: '14px 28px' }}
        >
          🔄 Retake Test (Practice)
        </motion.button>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/')}
          style={{ padding: '14px 28px' }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
