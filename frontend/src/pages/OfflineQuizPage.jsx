import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../stores/useAuthStore';

const API_BASE = 'http://localhost:8000/api';

const CONFIDENCE_LEVELS = [
  { value: 0, label: 'Just Guessing', emoji: '🎲', color: '#94a3b8' },
  { value: 50, label: 'Somewhat Sure', emoji: '🤔', color: '#f59e0b' },
  { value: 100, label: 'Certain!', emoji: '🎯', color: '#10b981' },
];

export default function OfflineQuizPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  // Require login — offline attempts must be linked to a student account
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true, state: { from: `/offline-quiz/${roomCode}` } });
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const [loading, setLoading] = useState(true);
  const [roomData, setRoomData] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { question_id: { option_id, confidence } }
  const [selectedOption, setSelectedOption] = useState(null);
  const [confidence, setConfidence] = useState(50);
  const [phase, setPhase] = useState('quiz'); // quiz | results
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState(user?.full_name || user?.username || '');
  const [nameEntered, setNameEntered] = useState(!!(user?.full_name || user?.username));
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    loadRoom();
  }, [roomCode]);

  const loadRoom = async () => {
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/history/`);
      if (!res.ok) throw new Error('Room not found');
      const data = await res.json();
      setRoomData(data);
      setQuestions(data.questions || []);
    } catch (err) {
      alert('Could not load quiz: ' + err.message);
      navigate('/history');
    } finally {
      setLoading(false);
    }
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (displayName.trim()) setNameEntered(true);
  };

  const handleOptionSelect = (optionId) => {
    if (selectedOption) return; // already answered
    setSelectedOption(optionId);
    startTimeRef.current = Date.now(); // reset for next question timing
  };

  const handleNext = () => {
    if (!selectedOption) return;

    const question = questions[currentIdx];
    const latency = Date.now() - startTimeRef.current;

    setAnswers(prev => ({
      ...prev,
      [question.question_id]: {
        question_id: question.question_id,
        option_id: selectedOption,
        confidence: confidence,
        latency_ms: latency,
      }
    }));

    setSelectedOption(null);
    setConfidence(50);
    startTimeRef.current = Date.now();

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
    } else {
      submitAttempt({ ...answers, [question.question_id]: { question_id: question.question_id, option_id: selectedOption, confidence, latency_ms: latency } });
    }
  };

  const submitAttempt = async (finalAnswers) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/offline-attempt/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: Object.values(finalAnswers),
          display_name: displayName,
        })
      });
      const data = await res.json();
      setResults(data);
      setPhase('results');
    } catch (err) {
      alert('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Name entry screen
  if (!nameEntered) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: 20 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: 'white', borderRadius: 24, padding: '48px 40px',
            width: '100%', maxWidth: 420,
            boxShadow: '0 24px 64px rgba(15,23,42,0.1)'
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎯</div>
            <h2 style={{ margin: 0, color: '#0f172a' }}>Offline Attempt</h2>
            <p style={{ color: '#64748b', marginTop: 8 }}>
              <strong>{roomData?.quiz_title}</strong>
              <br />You'll attempt all questions and see how you compare to the live leaderboard.
            </p>
          </div>

          <div style={{
            background: '#eef2ff', borderRadius: 12, padding: '12px 16px',
            marginBottom: 24, fontSize: '0.875rem', color: '#4338ca',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            ✨ Your score will appear in an <strong>Offline Leaderboard</strong> alongside live participants.
          </div>

          <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block', fontSize: '0.8rem', fontWeight: 700,
                color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6
              }}>Your Name</label>
              <input
                className="form-input"
                placeholder="Enter your display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={{ width: '100%' }}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!displayName.trim()} style={{ padding: '14px' }}>
              Start Attempting →
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Quiz phase
  if (phase === 'quiz') {
    const question = questions[currentIdx];
    const progress = ((currentIdx) / questions.length) * 100;

    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        {/* Progress */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem', color: '#64748b' }}>
            <span>Question {currentIdx + 1} of {questions.length}</span>
            <span style={{ fontWeight: 700, color: '#6366f1' }}>{displayName}</span>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99 }}>
            <motion.div
              style={{
                height: '100%', borderRadius: 99,
                background: 'linear-gradient(90deg, #6366f1, #f43f5e)'
              }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
          >
            {/* Question card */}
            <div className="glass-card" style={{ marginBottom: 24, padding: '28px 32px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                Question {currentIdx + 1}
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>
                {question.question_text}
              </h2>
            </div>

            {/* Options */}
            <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
              {(question.options || []).map((opt, i) => {
                const isSelected = selectedOption === opt.id;
                const isCorrect = opt.is_correct;
                const showResult = !!selectedOption;

                let bg = 'white';
                let border = '1px solid rgba(15,23,42,0.1)';
                let color = '#0f172a';

                if (showResult) {
                  if (isCorrect) { bg = '#f0fdf4'; border = '2px solid #22c55e'; color = '#166534'; }
                  else if (isSelected) { bg = '#fef2f2'; border = '2px solid #ef4444'; color = '#dc2626'; }
                  else { bg = '#f8fafc'; color = '#94a3b8'; }
                } else if (isSelected) {
                  bg = '#eef2ff'; border = '2px solid #6366f1'; color = '#4338ca';
                }

                return (
                  <motion.button
                    key={opt.id}
                    whileHover={!selectedOption ? { x: 4 } : {}}
                    whileTap={!selectedOption ? { scale: 0.98 } : {}}
                    onClick={() => handleOptionSelect(opt.id)}
                    disabled={!!selectedOption}
                    style={{
                      width: '100%', padding: '16px 20px', textAlign: 'left',
                      background: bg, border, borderRadius: 14, cursor: selectedOption ? 'default' : 'pointer',
                      color, fontSize: '0.95rem', fontWeight: 500,
                      fontFamily: 'var(--font-sans)',
                      display: 'flex', alignItems: 'center', gap: 12,
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.15)' : '0 1px 3px rgba(15,23,42,0.06)'
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: isSelected || (showResult && isCorrect) ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, flexShrink: 0
                    }}>
                      {showResult ? (isCorrect ? '✓' : (isSelected ? '✗' : String.fromCharCode(65 + i))) : String.fromCharCode(65 + i)}
                    </span>
                    <span>{opt.text}</span>
                    {showResult && isCorrect && <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 700 }}>Correct ✓</span>}
                    {showResult && isSelected && !isCorrect && opt.misconception_tag && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#dc2626' }}>
                        Misconception: {opt.misconception_tag}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Confidence - shown only before answering */}
            {!selectedOption && (
              <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                  How confident are you? (affects Brier calibration score)
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {CONFIDENCE_LEVELS.map(lvl => (
                    <button
                      key={lvl.value}
                      onClick={() => setConfidence(lvl.value)}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: 12,
                        border: `2px solid ${confidence === lvl.value ? lvl.color : 'transparent'}`,
                        background: confidence === lvl.value ? `${lvl.color}15` : '#f8fafc',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        fontWeight: confidence === lvl.value ? 700 : 500,
                        color: confidence === lvl.value ? lvl.color : '#64748b',
                        fontSize: '0.8rem', textAlign: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{lvl.emoji}</div>
                      <div>{lvl.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Next button */}
            {selectedOption && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="btn btn-primary"
                onClick={handleNext}
                disabled={submitting}
                style={{ width: '100%', padding: '16px', fontSize: '1rem' }}
              >
                {submitting ? 'Scoring...' : currentIdx < questions.length - 1 ? 'Next Question →' : '🏆 See My Results'}
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Results phase
  if (phase === 'results' && results) {
    const { offline_leaderboard, your_score, results: questionResults } = results;

    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Score hero */}
          <div className="glass-card" style={{
            textAlign: 'center', padding: '40px 32px', marginBottom: 24,
            background: 'linear-gradient(135deg, #6366f1 0%, #f43f5e 100%)',
            border: 'none'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>🎯</div>
            <h2 style={{ color: 'white', margin: '0 0 4px', fontSize: '2rem' }}>
              {your_score.points} pts
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', margin: 0, fontSize: '1rem' }}>
              Calibration Score: {(your_score.calibration_score * 100).toFixed(0)}% accuracy
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: '8px 0 0', fontSize: '0.875rem' }}>
              {results.answered} of {results.total_questions} answered
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Offline Leaderboard */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>📊 Offline Leaderboard</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {offline_leaderboard.slice(0, 10).map((entry, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 10,
                    background: entry.is_ghost ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(244,63,94,0.1))' : '#f8fafc',
                    border: entry.is_ghost ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: i < 3 ? ['#f59e0b', '#94a3b8', '#cd7c2f'][i] : '#e2e8f0',
                        color: i < 3 ? 'white' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 700, flexShrink: 0
                      }}>
                        {i + 1}
                      </span>
                      <span style={{
                        fontSize: '0.875rem', fontWeight: entry.is_ghost ? 700 : 500,
                        color: entry.is_ghost ? '#6366f1' : '#0f172a'
                      }}>
                        {entry.display_name}
                      </span>
                    </div>
                    <span style={{ fontWeight: 700, color: entry.is_ghost ? '#6366f1' : '#64748b', fontSize: '0.9rem' }}>
                      {entry.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Question breakdown */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>📋 Your Answers</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionResults.map((r, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: r.is_correct ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${r.is_correct ? '#bbf7d0' : '#fecaca'}`
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: r.is_correct ? '#166534' : '#dc2626', marginBottom: 4 }}>
                      {r.is_correct ? '✓ Correct' : '✗ Wrong'} — {r.points_earned > 0 ? `+${r.points_earned} pts` : '0 pts'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {r.question_text.length > 60 ? r.question_text.substring(0, 60) + '...' : r.question_text}
                    </div>
                    {!r.is_correct && r.correct_option_text && (
                      <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: 4 }}>
                        ✓ {r.correct_option_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => navigate(`/review/${roomCode}`, { state: { offlineResults: results } })}
              className="btn btn-primary"
              style={{ padding: '14px 28px' }}
            >
              🔍 Full Review & Explanations
            </button>
            <button
              onClick={() => {
                setPhase('quiz');
                setCurrentIdx(0);
                setAnswers({});
                setSelectedOption(null);
                setConfidence(50);
                setResults(null);
              }}
              className="btn btn-ghost"
              style={{ padding: '14px 28px' }}
            >
              🔄 Reattempt
            </button>
            <button onClick={() => navigate('/history')} className="btn btn-ghost" style={{ padding: '14px 28px' }}>
              ← Back
            </button>
          </div>
        </motion.div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return null;
}
