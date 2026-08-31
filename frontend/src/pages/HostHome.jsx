import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { motion } from 'framer-motion';

const API = 'http://localhost:8000';

export default function HostHome() {
  const { user, token, isAuthenticated, logout } = useAuthStore();
  const [quizzes, setQuizzes] = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const navigate = useNavigate();

  // Redirect to auth only when we're sure the user is not logged in
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true, state: { from: '/host/dashboard' } });
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch quizzes when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchQuizzes();
    }
  }, [isAuthenticated, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQuizzes = async () => {
    setLoadingQuizzes(true);
    try {
      const res = await fetch(`${API}/api/quizzes/`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // DRF pagination returns {count, results:[...]} — extract safely
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        setQuizzes(list);
      }
    } catch (err) {
      console.error('fetchQuizzes error:', err);
    } finally {
      setLoadingQuizzes(false);
    }
  };

  const startQuiz = async (quizId) => {
    try {
      const res = await fetch(`${API}/api/rooms/create/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          quiz: quizId,               // FK field name the serializer expects
          host: user?.username || 'Host',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.host_token) {
          sessionStorage.setItem('host_token', data.host_token);
        }
        navigate(`/host/${data.code}`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Could not create room: ' + (err.detail || JSON.stringify(err)));
      }
    } catch (err) {
      console.error('startQuiz error:', err);
      alert('Could not reach server. Is Django running?');
    }
  };
  const deleteQuiz = async (quizId) => {
    if (!window.confirm("Are you sure you want to delete this quiz? This action cannot be undone.")) return;
    try {
      const res = await fetch(`${API}/api/quizzes/${quizId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${token}` },
      });
      if (res.ok) {
        setQuizzes(prev => prev.filter(q => q.id !== quizId));
      } else {
        alert("Failed to delete quiz.");
      }
    } catch (err) {
      console.error("deleteQuiz error:", err);
      alert("Could not reach server.");
    }
  };
  // Show a redirect message if not authenticated (before useEffect fires)
  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 16,
      }}>
        <p style={{ color: '#64748b' }}>Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ padding: '40px 20px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>
            Welcome back, {user?.full_name || user?.username || 'Host'} 👋
          </h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '0.95rem' }}>
            Manage your quizzes and live sessions
          </p>
        </div>
        <button
          onClick={async () => { await logout(); navigate('/'); }}
          className="btn btn-ghost"
        >
          Logout
        </button>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 44, alignItems: 'center' }}>
        <Link
          to="/create"
          className="btn btn-primary"
          style={{ padding: '14px 32px', fontSize: '1rem', borderRadius: 14 }}
        >
          + Create New Quiz
        </Link>
        <Link
          to="/student-dashboard"
          className="btn btn-ghost"
          style={{ padding: '14px 24px', fontSize: '0.95rem', borderRadius: 14, border: '1.5px solid rgba(99,102,241,0.25)' }}
        >
          🎓 Switch to Student View
        </Link>
      </div>

      {/* Quiz list */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Your Saved Quizzes</h2>
        {loadingQuizzes && (
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
      </div>

      {!loadingQuizzes && quizzes.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card"
          style={{ padding: 56, textAlign: 'center' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📝</div>
          <h3 style={{ marginBottom: 8, color: '#0f172a' }}>No quizzes yet</h3>
          <p style={{ color: '#64748b', marginBottom: 24 }}>
            Create your first quiz to get started
          </p>
          <Link to="/create" className="btn btn-primary">Create a Quiz →</Link>
        </motion.div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {quizzes.map((q, i) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card"
            style={{
              padding: '18px 24px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '1rem', fontWeight: 700 }}>
                {q.title}
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {q.created_at ? new Date(q.created_at).toLocaleDateString() : ''}
                {q.question_count > 0 ? ` · ${q.question_count} questions` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() => deleteQuiz(q.id)}
                className="btn btn-ghost btn-sm"
                style={{ color: '#ef4444', borderColor: 'transparent' }}
              >
                Delete
              </button>
              <Link
                to={`/create?edit=${q.id}`}
                className="btn btn-ghost btn-sm"
              >
                Edit
              </Link>
              <button
                onClick={() => startQuiz(q.id)}
                className="btn btn-primary btn-sm"
              >
                Launch →
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
