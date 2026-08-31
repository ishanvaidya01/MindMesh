import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useQuizStore from '../stores/useQuizStore';
import useAuthStore from '../stores/useAuthStore';

export default function JoinPage() {
  const navigate = useNavigate();
  const { joinRoom, loading, error, clearError } = useQuizStore();
  const { isAuthenticated, user } = useAuthStore();

  const [roomCode, setRoomCode] = useState('');
  // Pre-fill name from account if logged in
  const [displayName, setDisplayName] = useState(user?.full_name || user?.username || '');

  // Keep displayName in sync if auth state resolves after mount
  useEffect(() => {
    if (user && !displayName) {
      setDisplayName(user.full_name || user.username || '');
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleJoin(e) {
    e.preventDefault();
    clearError();
    const result = await joinRoom(roomCode.toUpperCase(), displayName);
    if (result) {
      sessionStorage.setItem('session_token', result.session_token);
      sessionStorage.setItem('participant_id', result.participant_id);
      sessionStorage.setItem('display_name', result.display_name);
      sessionStorage.setItem('room_code', result.room_code);
      navigate(`/quiz/${result.room_code}`);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'linear-gradient(135deg, #f8faff 0%, #f1f5ff 50%, #fdf4ff 100%)',
    }}>
      {/* Decorative blob */}
      <div style={{
        position: 'fixed', top: '-10%', right: '-10%', width: 400, height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(244,63,94,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem',
            marginBottom: 24, padding: 0, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back
        </button>

        <div style={{
          background: 'white', borderRadius: 28, padding: '44px 40px',
          border: '1px solid rgba(15,23,42,0.07)',
          boxShadow: '0 24px 64px rgba(15,23,42,0.1), 0 4px 16px rgba(15,23,42,0.05)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: 'linear-gradient(135deg, #f43f5e, #fb923c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: '1.5rem',
              boxShadow: '0 8px 24px rgba(244,63,94,0.3)',
            }}>⚡</div>
            <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.03em' }}>
              Join a Quiz
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
              {isAuthenticated
                ? `Playing as ${user?.full_name || user?.username}`
                : 'Enter the room code your host shared'}
            </p>
          </div>

          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Room Code */}
            <div>
              <label style={{
                display: 'block', fontSize: '0.78rem', fontWeight: 700,
                color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
              }}>Room Code</label>
              <input
                className="form-input"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                required
                autoFocus
                style={{
                  width: '100%', fontFamily: 'var(--font-mono)',
                  fontSize: '2rem', fontWeight: 800, textAlign: 'center',
                  letterSpacing: '0.2em', padding: '16px',
                }}
              />
            </div>

            {/* Display Name */}
            <div>
              <label style={{
                display: 'block', fontSize: '0.78rem', fontWeight: 700,
                color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
              }}>Your Display Name</label>
              <input
                className="form-input"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
                required
                style={{ width: '100%' }}
              />
            </div>

            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)',
                borderRadius: 12, color: '#e11d48', fontSize: '0.875rem',
              }}>
                ⚠️ {error}
              </div>
            )}

            <motion.button
              type="submit"
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading || roomCode.length < 4 || !displayName.trim()}
              style={{
                width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                background: 'linear-gradient(135deg, #f43f5e, #fb923c)',
                color: 'white', fontWeight: 700, fontSize: '1.05rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (loading || roomCode.length < 4 || !displayName.trim()) ? 0.6 : 1,
                boxShadow: '0 8px 24px rgba(244,63,94,0.3)',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Joining…' : 'Join Room →'}
            </motion.button>
          </form>
        </div>

        {/* Student dashboard link if logged in */}
        {isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{ textAlign: 'center', marginTop: 20 }}
          >
            <button
              onClick={() => navigate('/student-dashboard')}
              style={{
                background: 'none', border: 'none', color: '#6366f1',
                cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              📋 View my past sessions →
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
