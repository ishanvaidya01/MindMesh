import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../stores/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';

function AuthPage() {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(!location.state?.signUp);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const login    = useAuthStore(state => state.login);
  const register = useAuthStore(state => state.register);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const navigate = useNavigate();

  // Destination to go after login (from router state, or default to home)
  const from = location.state?.from || '/';

  // If already authenticated, redirect immediately without waiting for submit
  useEffect(() => {
    if (isAuthenticated) {
      const destination = location.state?.from || '/';
      navigate(destination, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);

    try {
      let res;
      if (isLogin) {
        res = await login(username, password);
      } else {
        res = await register(username, password, fullName);
      }

      if (res.success) {
        // The useEffect above will fire when isAuthenticated becomes true
        // but we also navigate here directly to avoid any delay
        navigate(from, { replace: true });
      } else {
        setError(res.error || (isLogin
          ? 'Login failed. Check your username and password.'
          : 'Registration failed. Username may already be taken.'));
      }
    } catch {
      setError('Something went wrong. Is the server running?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', padding: 20, position: 'relative',
    }}>

      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 28, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          padding: '48px 44px',
          borderRadius: 28,
          width: '100%',
          maxWidth: '420px',
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Brand mark */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1 0%, #f43f5e 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
            fontSize: '1.5rem',
          }}>🧠</div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
            {isLogin ? 'Welcome back' : 'Join MindMesh'}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '8px 0 0' }}>
            {isLogin ? 'Sign in to your account' : 'Create your free account today'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key={error}
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              style={{
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 12,
                color: '#dc2626',
                fontSize: '0.875rem',
                marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 8,
                overflow: 'hidden',
              }}
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{
              display: 'block', fontSize: '0.78rem', fontWeight: 700,
              color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
            }}>Email Address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              autoComplete="email"
              autoFocus
              required
              disabled={submitting}
            />
          </div>

          {/* Full Name — only shown on sign-up */}
          <AnimatePresence>
            {!isLogin && (
              <motion.div
                key="fullname"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <label style={{
                  display: 'block', fontSize: '0.78rem', fontWeight: 700,
                  color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
                }}>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Priya Sharma"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="form-input"
                  style={{ width: '100%' }}
                  autoComplete="name"
                  disabled={submitting}
                />
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6 }}>
                  This is how your name appears in dashboards
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label style={{
              display: 'block', fontSize: '0.78rem', fontWeight: 700,
              color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
            }}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              disabled={submitting}
            />
          </div>

          <motion.button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !username.trim() || !password.trim()}
            whileHover={{ scale: submitting ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ padding: '14px', fontSize: '1rem', marginTop: 4, width: '100%', borderRadius: 14 }}
          >
            {submitting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{
                  width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite', display: 'inline-block',
                }} />
                {isLogin ? 'Signing in…' : 'Creating account…'}
              </span>
            ) : (isLogin ? 'Sign In' : 'Create Account')}
          </motion.button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
            {isLogin ? 'New to MindMesh? ' : 'Already have an account? '}
          </span>
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); setUsername(''); setPassword(''); setFullName(''); }}
            style={{
              background: 'none', border: 'none', color: '#6366f1',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
              fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
              textDecorationColor: 'transparent', transition: 'text-decoration-color 0.2s',
            }}
            onMouseEnter={e => e.target.style.textDecorationColor = '#6366f1'}
            onMouseLeave={e => e.target.style.textDecorationColor = 'transparent'}
          >
            {isLogin ? 'Create account' : 'Sign in'}
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(15,23,42,0.06)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/join')}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit',
            }}
          >
            Just want to take a quiz?{' '}
            <span style={{ color: '#6366f1', fontWeight: 600 }}>Quick Join →</span>
          </button>
        </div>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AuthPage;
