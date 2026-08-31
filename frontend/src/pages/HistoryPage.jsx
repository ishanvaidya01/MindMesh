import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useQuizStore from '../stores/useQuizStore';

// Modal for entering room code to join active room
function JoinActiveRoomModal({ room, onClose }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { joinRoom } = useQuizStore();

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');

    const result = await joinRoom(room.code, name.trim());
    if (result) {
      sessionStorage.setItem('session_token', result.session_token);
      sessionStorage.setItem('participant_id', result.participant_id);
      sessionStorage.setItem('display_name', result.display_name);
      sessionStorage.setItem('room_code', result.room_code);
      // If live and has current question, pass it along
      if (result.current_question) {
        sessionStorage.setItem('mid_session_join', JSON.stringify(result.current_question));
      }
      navigate(`/quiz/${result.room_code}`);
    } else {
      setError('Could not join. The session may have ended.');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        style={{
          background: 'white', borderRadius: 20, padding: 36,
          width: '100%', maxWidth: 400,
          boxShadow: '0 24px 64px rgba(15,23,42,0.15)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a' }}>
              {room.status === 'lobby' ? '⏳ Quiz Lobby' : '⚡ Join Live Session'}
            </h3>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              {room.quiz_title}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1.2rem', color: '#94a3b8'
          }}>✕</button>
        </div>

        {room.status === 'lobby' ? (
          <div style={{
            padding: 20, background: '#fef9c3', borderRadius: 12,
            border: '1px solid #fde68a', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p style={{ color: '#78350f', fontWeight: 600 }}>Quiz hasn't started yet</p>
            <p style={{ color: '#92400e', fontSize: '0.85rem', margin: '4px 0 0' }}>
              Enter your name to wait in the lobby and get notified when it starts.
            </p>
          </div>
        ) : (
          <div style={{
            padding: 12, background: '#f0fdf4', borderRadius: 10,
            border: '1px solid #bbf7d0', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: '#166534'
          }}>
            🎯 You'll join at the current question — scores count!
          </div>
        )}

        {error && (
          <div style={{
            padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 10,
            color: '#dc2626', fontSize: '0.875rem', marginBottom: 16
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleJoin} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{
              display: 'block', fontSize: '0.8rem', fontWeight: 700,
              color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6
            }}>Your Name</label>
            <input
              className="form-input"
              placeholder="Enter your display name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%' }}
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !name.trim()}
            style={{ padding: '14px' }}
          >
            {loading ? 'Joining...' : room.status === 'lobby' ? 'Join Lobby' : '⚡ Join Live Now'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { rooms, fetchRooms, loading } = useQuizStore();
  const [selectedRoom, setSelectedRoom] = useState(null); // for join modal

  useEffect(() => {
    fetchRooms();
  }, []);

  const endedRooms = (rooms || []).filter(r => r.status === 'ended');
  const activeRooms = (rooms || []).filter(r => r.status !== 'ended');

  const handleActiveRoomClick = (room) => {
    setSelectedRoom(room);
  };

  return (
    <div className="app-container" style={{ maxWidth: 900, margin: '0 auto', paddingTop: 32 }}>
      <div className="page-header">
        <div className="page-title">
          <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm">← Back</button>
          <h2>Quiz History</h2>
        </div>
      </div>

      {/* Active rooms */}
      {activeRooms.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Active Rooms
            </h3>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
              boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
              animation: 'pulse 2s ease infinite'
            }} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {activeRooms.map((room, i) => (
              <motion.div
                key={room.id}
                className="glass-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={{ padding: 16, cursor: 'pointer', border: '1px solid rgba(99,102,241,0.1)' }}
                onClick={() => handleActiveRoomClick(room)}
                whileHover={{ x: 4 }}
              >
                <div className="flex flex-between" style={{ alignItems: 'center' }}>
                  <div>
                    <div className="flex gap-sm" style={{ alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-600)', fontSize: '1.05rem' }}>
                        {room.code}
                      </span>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.05em',
                        background: room.status === 'live' ? '#dcfce7' : '#fef9c3',
                        color: room.status === 'live' ? '#166534' : '#92400e',
                        border: room.status === 'live' ? '1px solid #bbf7d0' : '1px solid #fde68a'
                      }}>
                        {room.status === 'live' ? '● LIVE' : room.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                      {room.quiz_title} · {room.participant_count || 0} participants
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(room.created_at).toLocaleDateString()}
                    </span>
                    <span style={{ color: '#6366f1', fontSize: '0.9rem', fontWeight: 600 }}>
                      Join →
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Past/Ended rooms */}
      <div>
        <h3 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Past Sessions
        </h3>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1',
              animation: 'spin 0.8s linear infinite'
            }} />
          </div>
        )}

        {!loading && endedRooms.length === 0 && (
          <div className="glass-card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <p style={{ color: '#94a3b8', marginBottom: 16 }}>No past sessions yet</p>
            <Link to="/create" className="btn btn-primary">Create Your First Quiz</Link>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {endedRooms.map((room, i) => (
            <motion.div
              key={room.id}
              className="glass-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{ padding: 16 }}
            >
              <div className="flex flex-between" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="flex gap-sm" style={{ alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#64748b', fontSize: '0.95rem' }}>
                      {room.code}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
                      borderRadius: 99, background: '#f1f5f9', color: '#64748b',
                      border: '1px solid #e2e8f0'
                    }}>ENDED</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
                    {room.quiz_title}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Hosted by {room.host} · {room.participant_count || 0} participants · {new Date(room.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-sm" style={{ flexShrink: 0, marginLeft: 16 }}>
                  {/* Offline attempt */}
                  <button
                    onClick={() => navigate(`/offline-quiz/${room.code}`)}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.8rem' }}
                  >
                    🎯 Attempt
                  </button>
                  <Link to={`/history/${room.code}`} className="btn btn-ghost btn-sm">
                    Results
                  </Link>
                  <Link to={`/debrief/${room.code}`} className="btn btn-ghost btn-sm">
                    Summary
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Join modal */}
      <AnimatePresence>
        {selectedRoom && (
          <JoinActiveRoomModal
            room={selectedRoom}
            onClose={() => setSelectedRoom(null)}
          />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
