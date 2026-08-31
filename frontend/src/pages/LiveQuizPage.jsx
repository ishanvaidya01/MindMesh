import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useWebSocket from '../stores/useWebSocket';
import useRoomStore from '../stores/useRoomStore';
import useAuthStore from '../stores/useAuthStore';
import Leaderboard from '../components/leaderboard/Leaderboard';

const API_BASE = 'http://localhost:8000/api';

// ─── Timer Circle ────────────────────────────────────────────────────────────
function TimerCircle({ timeRemaining, timeLimit }) {
  const pct = timeLimit > 0 ? timeRemaining / timeLimit : 0;
  const isLow = timeRemaining <= 5;
  return (
    <div style={{ position: 'relative', width: 64, height: 64 }}>
      <svg width="64" height="64" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
        <motion.circle
          cx="32" cy="32" r="28" fill="none"
          stroke={isLow ? 'var(--error)' : 'var(--primary-400)'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={175.9}
          animate={{ strokeDashoffset: 175.9 * (1 - pct) }}
          transition={{ duration: 0.5 }}
        />
      </svg>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem',
        color: isLow ? 'var(--error)' : 'var(--text-primary)',
      }}>
        {timeRemaining}
      </span>
    </div>
  );
}

// ─── AI Hint Banner ────────────────────────────────────────────────────────────
function HintBanner({ hint, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 520, width: 'calc(100% - 40px)', zIndex: 100,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(168,85,247,0.95))',
        backdropFilter: 'blur(12px)',
        borderRadius: 16, padding: '16px 20px',
        boxShadow: '0 16px 48px rgba(99,102,241,0.35)',
        display: 'flex', gap: 12, alignItems: 'flex-start'
      }}
    >
      <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>🤖</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          AI Hint
        </div>
        <p style={{ margin: 0, color: 'white', fontSize: '0.9rem', lineHeight: 1.5, fontWeight: 500 }}>{hint}</p>
      </div>
      <button onClick={onDismiss} style={{
        background: 'rgba(255,255,255,0.2)', border: 'none',
        borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
        color: 'white', fontSize: '0.8rem', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>✕</button>
    </motion.div>
  );
}

// ─── Quiz Complete Screen ─────────────────────────────────────────────────────
function QuizCompleteScreen({ room, roomCode, navigate, isAuthenticated, isPractice }) {
  return (
    <div className="app-container" style={{ maxWidth: 700, margin: '0 auto', paddingTop: 40, paddingBottom: 60 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Hero */}
        <div style={{
          textAlign: 'center', marginBottom: 32,
          background: isPractice
            ? 'linear-gradient(135deg, var(--warning), #f59e0b)'
            : 'linear-gradient(135deg, var(--primary-500), #a78bfa)',
          borderRadius: 'var(--radius-xl)', padding: '40px 32px',
          boxShadow: isPractice
            ? '0 16px 48px rgba(245,158,11,0.25)'
            : '0 16px 48px rgba(99,102,241,0.25)'
        }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>{isPractice ? '🔄' : '🎉'}</div>
          <h2 style={{ color: 'white', margin: '0 0 8px', fontSize: '2rem', fontWeight: 800 }}>
            {isPractice ? 'Practice Complete!' : 'Test Completed!'}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', margin: 0, fontSize: '1rem' }}>
            {isPractice
              ? 'Practice mode — results not counted in leaderboard.'
              : "You've answered all questions. Great work!"}
          </p>
        </div>

        {/* Leaderboard — only show for non-practice */}
        {!isPractice && (
          <div className="glass-card" style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🏆 Live Standings
            </h3>
            <Leaderboard data={room.leaderboard} activeTab={room.activeLeaderboardTab} onTabChange={room.setActiveLeaderboardTab} />
          </div>
        )}

        {/* Save progress prompt */}
        {!isAuthenticated && !isPractice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="glass-card" style={{ marginBottom: 24, border: '1px solid var(--primary-400)' }}>
            <h3 style={{ marginBottom: 8 }}>Don't lose your score!</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Create a free student account to save your progress and see past scores.</p>
            <button className="btn btn-primary" onClick={() => navigate('/auth')}>Save My Progress</button>
          </motion.div>
        )}

        <div className="flex gap-md" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate(`/review/${roomCode}`)}>
            📊 View Analysis
          </button>
          <button className="btn btn-accent" onClick={() => navigate(`/quiz/${roomCode}?retake=true`)}>
            🔄 Retake Test (Practice)
          </button>
          <button className="btn btn-ghost" onClick={() => navigate(isAuthenticated ? '/student-dashboard' : '/')}>
            Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Live Quiz Page ─────────────────────────────────────────────────────────
export default function LiveQuizPage() {
  const { roomCode } = useParams();
  const [searchParams] = useSearchParams();
  const isPractice = searchParams.get('retake') === 'true';
  const navigate = useNavigate();
  const ws = useWebSocket();
  const room = useRoomStore();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const questionStartTime = useRef(Date.now());
  const hintRequestedRef = useRef(null); // track which question we requested a hint for
  const [showHint, setShowHint] = useState(false);
  const [dismissedHint, setDismissedHint] = useState(null);
  // Track which question the student is currently showing (personal, not host-global)
  const [displayQuestion, setDisplayQuestion] = useState(null);
  const [displayQuestionIndex, setDisplayQuestionIndex] = useState(-1);
  const [displayTotalQuestions, setDisplayTotalQuestions] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  // Track result momentarily before auto-advancing
  const [showResult, setShowResult] = useState(false);
  const [wasResumed, setWasResumed] = useState(false);

  // When host pushes first question, set it as the student's display question
  useEffect(() => {
    if (room.currentQuestion && !displayQuestion && !quizComplete) {
      setDisplayQuestion(room.currentQuestion);
      setDisplayQuestionIndex(room.questionIndex);
      setDisplayTotalQuestions(room.personalTotalQuestions || 0);
      questionStartTime.current = Date.now();
    }
  }, [room.currentQuestion]);

  // When student gets a personal next question from backend
  useEffect(() => {
    if (room.personalQuestion) {
      setDisplayQuestion(room.personalQuestion);
      setDisplayQuestionIndex(room.personalQuestionIndex);
      setDisplayTotalQuestions(room.personalTotalQuestions);
      setShowResult(false);
      questionStartTime.current = Date.now();
      if (room.personalQuestion.resumed) {
        setWasResumed(true);
        setTimeout(() => setWasResumed(false), 4000);
      }
    }
  }, [room.personalQuestion, room.personalQuestionIndex]);

  // When student finishes all questions
  useEffect(() => {
    if (room.personalQuizComplete) {
      setQuizComplete(true);
    }
  }, [room.personalQuizComplete]);

  // Show AI hint banner
  useEffect(() => {
    if (room.currentHint && !room.answered && room.currentHint !== dismissedHint) {
      setShowHint(true);
    }
  }, [room.currentHint]);

  // Auto-request hint when timer drops below 10s
  useEffect(() => {
    const activeQ = displayQuestion;
    if (!activeQ || room.answered || room.timeRemaining > 10 || room.timeRemaining <= 0) return;
    if (hintRequestedRef.current === activeQ.id) return; // already requested for this Q
    hintRequestedRef.current = activeQ.id;
    ws.send({ type: 'request_hint', question_id: activeQ.id });
  }, [room.timeRemaining, displayQuestion, room.answered]);

  const handleMessage = useCallback((data) => {
    room.handleMessage(data);
    if (data.type === 'question_pushed') {
      questionStartTime.current = Date.now();
    }
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
      const sessionToken = sessionStorage.getItem('session_token');
      if (sessionToken) {
        ws.joinRoom(sessionToken);
        ws.authenticate(sessionToken);
      }
    }
  }, [ws.connected]);

  // Mid-session join
  useEffect(() => {
    const midJoin = sessionStorage.getItem('mid_session_join');
    if (midJoin) {
      try {
        const q = JSON.parse(midJoin);
        room.handleMessage({ type: 'question_pushed', question: q, status: 'live', question_index: q.order || 0 });
        sessionStorage.removeItem('mid_session_join');
      } catch (e) {}
    }
  }, [ws.connected]);

  function handleSubmitAnswer() {
    const latencyMs = Date.now() - questionStartTime.current;
    // In practice mode, pass practice flag so backend doesn't record it
    if (isPractice) {
      const { selectedOption, confidence, personalQuestion, currentQuestion } = room;
      const activeQuestion = personalQuestion || currentQuestion;
      ws.send({
        type: 'answer_submitted',
        option_id: selectedOption,
        confidence,
        latency_ms: latencyMs,
        question_id: activeQuestion?.id,
        practice: true,
      });
      room.submitAnswer(() => {}, latencyMs); // update local state only
    } else {
      room.submitAnswer((msg) => ws.send(msg), latencyMs);
    }
    setShowResult(true);
    setTimeout(() => {
      handleNextQuestion();
    }, 2000);
  }

  function handleNextQuestion() {
    setShowResult(false);
    ws.send({ type: 'student_advance' });
  }

  function dismissHint() {
    setDismissedHint(room.currentHint);
    setShowHint(false);
  }

  // ── Render: Quiz Complete ──
  if (quizComplete) {
    return <QuizCompleteScreen room={room} roomCode={roomCode} navigate={navigate} isAuthenticated={isAuthenticated} isPractice={isPractice} />;
  }

  // ── Render: Session ended by host ──
  if (room.sessionEnded) {
    return (
      <div className="app-container" style={{ maxWidth: 700, margin: '0 auto', paddingTop: 60, paddingBottom: 60 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 8 }}>🎉</div>
          <h2 style={{ marginBottom: 8 }}>Quiz Session Ended!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Final Standings</p>
          <Leaderboard data={room.leaderboard} activeTab={room.activeLeaderboardTab} onTabChange={room.setActiveLeaderboardTab} />

          {!isAuthenticated && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="glass-card" style={{ marginTop: 40, padding: 24, border: '1px solid var(--primary-400)' }}>
              <h3 style={{ marginBottom: 8 }}>Don't lose your score!</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Create a free student account to save your progress.</p>
              <button className="btn btn-primary" onClick={() => navigate('/auth')}>Save My Progress</button>
            </motion.div>
          )}

          <div className="flex gap-md" style={{ justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate(`/review/${roomCode}`)}>
              📊 View Analysis
            </button>
            <button className="btn btn-accent" onClick={() => navigate(`/quiz/${roomCode}?retake=true`)}>
              🔄 Retake Test (Practice)
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(isAuthenticated ? '/student-dashboard' : '/')}>
              Back to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Render: Lobby ──
  if (room.status === 'lobby' || !displayQuestion) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '3px solid var(--glass-border)',
            borderTopColor: 'var(--primary-400)',
            margin: '0 auto 24px',
            animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <h3 style={{ marginBottom: 8 }}>Waiting for host to start…</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Room <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)' }}>{roomCode}</span>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8 }}>
            {room.participants.length} participant{room.participants.length !== 1 ? 's' : ''} connected
          </p>
        </motion.div>
      </div>
    );
  }

  // ── Render: Paused ──
  if (room.status === 'paused') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8, color: 'var(--warning)' }}>⏸ Paused</h2>
          <p style={{ color: 'var(--text-muted)' }}>The host has paused the session</p>
        </motion.div>
      </div>
    );
  }

  // ── Render: Live Quiz ──
  const question = displayQuestion;
  const questionIdx = displayQuestionIndex;
  const totalQ = displayTotalQuestions || room.personalTotalQuestions || 0;
  // Only show 'Finish Quiz' on the LAST question (totalQ > 1 and we're on it)
  const isLastQuestion = totalQ > 0 && questionIdx + 1 >= totalQ;
  const progressPct = totalQ > 0 ? (questionIdx / totalQ) * 100 : 0;

  return (
    <div className="app-container" style={{ maxWidth: 800, margin: '0 auto', paddingTop: 20, paddingBottom: 80 }}>
      {/* Practice Mode Banner */}
      {isPractice && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)',
          padding: '8px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
          fontSize: '0.82rem', fontWeight: 600, color: '#92400e',
        }}>
          <span>🔄</span> Practice Mode — results not counted in leaderboard
        </div>
      )}
      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem', color: '#64748b' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)',
            padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.8rem',
          }}>Q{questionIdx + 1}{totalQ > 1 ? ` / ${totalQ}` : ''}</span>
          <TimerCircle timeRemaining={room.timeRemaining} timeLimit={question.time_limit_seconds || 30} />
        </div>
        <div style={{ height: 5, background: '#e2e8f0', borderRadius: 99 }}>
          <motion.div
            style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3 }}
        >
          <div className="glass-card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: '1.3rem', lineHeight: 1.5 }}>{question.text}</h2>
          </div>

          {/* Options */}
          <div className="option-grid" style={{ marginBottom: 24 }}>
            {question.options.map((opt, i) => {
              let className = 'option-btn';
              if (room.selectedOption === opt.id) className += ' option-btn--selected';
              if (room.answered) {
                className += ' option-btn--disabled';
                if (room.answerResult && opt.id === room.selectedOption) {
                  className += room.answerResult.is_correct ? ' option-btn--correct' : ' option-btn--wrong';
                }
              }
              return (
                <motion.button
                  key={opt.id}
                  className={className}
                  onClick={() => room.selectOption(opt.id)}
                  disabled={room.answered}
                  whileHover={!room.answered ? { scale: 1.02 } : {}}
                  whileTap={!room.answered ? { scale: 0.98 } : {}}
                >
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{opt.text}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Confidence + Lock In */}
          {!room.answered && room.selectedOption && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
              <div style={{ marginBottom: 16 }}>
                {!room.hasSeenExplainer && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{
                    background: 'rgba(56,189,248,0.1)', border: '1px solid var(--info)',
                    padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem',
                    color: 'var(--text-secondary)'
                  }}>
                    <strong>🎯 Prediction Accuracy:</strong> Being unsure and admitting it scores better than confidently guessing wrong.
                  </motion.div>
                )}
                <p style={{ textAlign: 'center', marginBottom: 12, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>How confident are you?</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { value: 0, label: 'Wild Guess', emoji: '🎲' },
                    { value: 50, label: 'Pretty Sure', emoji: '🤔' },
                    { value: 100, label: 'Certain', emoji: '💯' }
                  ].map(lvl => (
                    <button
                      key={lvl.value}
                      onClick={() => room.setConfidence(lvl.value)}
                      style={{
                        padding: '10px 4px', borderRadius: 'var(--radius-md)',
                        background: room.confidence === lvl.value ? 'var(--primary-500)' : 'var(--glass-bg)',
                        border: `1px solid ${room.confidence === lvl.value ? 'var(--primary-400)' : 'var(--glass-border)'}`,
                        color: room.confidence === lvl.value ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        transition: 'all 0.2s', fontSize: '0.75rem', lineHeight: 1.2, textAlign: 'center',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      <span style={{ fontSize: '1.4rem' }}>{lvl.emoji}</span>
                      <span>{lvl.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <motion.button
                  className="btn btn-primary btn-lg"
                  onClick={handleSubmitAnswer}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{ minWidth: 200 }}
                >
                  🔒 Lock In Answer
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Result Card */}
          {room.answered && room.answerResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card"
              style={{
                textAlign: 'center',
                borderColor: room.answerResult.is_correct ? 'var(--success)' : 'var(--error)',
                background: room.answerResult.is_correct
                  ? 'rgba(16,185,129,0.05)'
                  : 'rgba(244,63,94,0.05)',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>
                {room.answerResult.is_correct ? '✅' : '❌'}
              </div>
              <h3 style={{ color: room.answerResult.is_correct ? 'var(--success)' : 'var(--error)', marginBottom: 4 }}>
                {room.answerResult.is_correct ? 'Correct!' : 'Incorrect'}
              </h3>

              {/* Insight Card */}
              <div style={{
                marginTop: 16, padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)',
                border: '1px solid var(--glass-border)', textAlign: 'left',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12
              }}>
                <div style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                  background: room.confidence === 100 && room.answerResult.is_correct ? 'var(--success-glow)'
                    : room.confidence === 100 && !room.answerResult.is_correct ? 'var(--error-glow)' : 'var(--bg-deep)',
                  border: '1px solid var(--glass-border)'
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>🧠 Your Calibration</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {room.confidence === 100 && room.answerResult.is_correct && '🎯 Perfect! Confident & correct.'}
                    {room.confidence === 100 && !room.answerResult.is_correct && '⚠️ Overconfident on a wrong answer.'}
                    {room.confidence === 50 && room.answerResult.is_correct && '✅ Right! Next time, trust yourself more.'}
                    {room.confidence === 50 && !room.answerResult.is_correct && '🤷 Uncertain & wrong — score preserved.'}
                    {room.confidence === 0 && room.answerResult.is_correct && '😅 Lucky guess! You knew more than you thought.'}
                    {room.confidence === 0 && !room.answerResult.is_correct && '👍 Smart to guess — you knew you didn\'t know.'}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-deep)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>💡 Class Insight</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {room.answerResult.misconception_tag
                      ? <>Common trap: <em style={{ color: 'var(--warning)', fontStyle: 'normal', fontWeight: 600 }}>{room.answerResult.misconception_tag.replace(/_/g, ' ')}</em></>
                      : room.answerResult.is_correct
                        ? <span style={{ color: 'var(--success)' }}>✓ You avoided common traps!</span>
                        : <span style={{ color: 'var(--text-muted)' }}>Review this concept.</span>
                    }
                  </div>
                </div>
              </div>

              {/* Resumed banner */}
              {wasResumed && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 10, padding: '10px 16px', marginBottom: 16,
                    fontSize: '0.82rem', color: '#6366f1', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  ↩️ Resumed from where you left off
                </motion.div>
              )}

            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* AI Hint Banner */}
      <AnimatePresence>
        {showHint && room.currentHint && !room.answered && (
          <HintBanner hint={room.currentHint} onDismiss={dismissHint} />
        )}
      </AnimatePresence>
    </div>
  );
}
