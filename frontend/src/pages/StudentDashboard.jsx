import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { motion } from 'framer-motion';

const API = 'http://localhost:8000';

export default function StudentDashboard() {
  const { user, token, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  const [scores, setScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(true);

  // Redirect only after we are sure the user is not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchScores();
  }, [isAuthenticated]);

  const fetchScores = async () => {
    setLoadingScores(true);
    try {
      const res = await fetch(`${API}/api/student/scores/`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (res.ok) setScores(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingScores(false);
    }
  };



  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#64748b' }}>Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ padding: '40px 20px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>🎓 Student Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Welcome back, {user?.full_name || user?.username}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/host/dashboard" className="btn btn-ghost" style={{ fontSize: '0.9rem' }}>
            ← Host Dashboard
          </Link>
          <button onClick={async () => { await logout(); navigate('/'); }} className="btn btn-ghost">
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* Left: Join & Discover */}
        <div>
          <h2 style={{ marginBottom: 20 }}>Take a Quiz</h2>

          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12 }}>Join by Room Code</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/join" className="btn btn-accent btn-lg" style={{ width: '100%', textAlign: 'center' }}>
                ⚡ Enter Room Code
              </Link>
            </div>
          </div>


        </div>

        {/* Right: Past Scores */}
        <div>
          <h2 style={{ marginBottom: 20 }}>My Past Scores</h2>
          <div className="glass-card" style={{ padding: 24, minHeight: 300 }}>
            {loadingScores ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
            ) : scores.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                <p style={{ color: 'var(--text-muted)' }}>No quiz scores yet. Join a room to get started!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {scores.map((s, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    style={{
                      padding: '14px 16px',
                      background: 'rgba(99,102,241,0.04)',
                      border: '1px solid rgba(99,102,241,0.1)',
                      borderRadius: 12,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => navigate(`/review/${s.room_code}`)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--primary-400)' }}>{s.quiz_title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(s.date).toLocaleDateString()} · Room {s.room_code}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.points} pts</div>
                      <div style={{ fontSize: '0.8rem', color: '#6366f1' }}>🎯 {s.calibration_score}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
