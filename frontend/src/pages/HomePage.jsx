import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../stores/useAuthStore';

export default function HomePage() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backgroundColor: '#f8fafc',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated Mesh Gradient Background Elements */}
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, -100, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: 'absolute', top: '-10%', left: '-10%',
          width: '50vw', height: '50vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }}
      />
      <motion.div
        animate={{
          x: [0, -100, 0],
          y: [0, 100, 0],
          scale: [1, 1.3, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: 'absolute', bottom: '-10%', right: '-10%',
          width: '60vw', height: '60vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }}
      />
      
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, 50, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: 'absolute', top: '20%', right: '20%',
          width: '40vw', height: '40vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }}
      />

      {/* Main Content Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, type: 'spring', bounce: 0.4 }}
        style={{
          position: 'relative', zIndex: 10,
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0,0,0,0.02)',
          borderRadius: 32,
          padding: '60px',
          width: '100%',
          maxWidth: isAuthenticated ? 800 : 450,
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center'
        }}
      >
        {/* Brand Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 24,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', fontSize: '2.5rem',
            boxShadow: '0 15px 30px -5px rgba(236, 72, 153, 0.4)'
          }}>🧠</div>
          <h1 style={{
            fontSize: '3.5rem', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 12px',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            MindMesh
          </h1>
          <p style={{
            color: '#64748b', fontSize: '1.15rem', margin: '0 0 40px', fontWeight: 500, letterSpacing: '-0.01em'
          }}>
            {isAuthenticated 
              ? `Welcome back, ${user?.full_name || user?.username}`
              : 'Collaborative learning, reimagined.'}
          </p>
        </motion.div>

        {/* Dynamic State Content */}
        <AnimatePresence mode="wait">
          {isAuthenticated ? (
            <motion.div
              key="auth-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              style={{ width: '100%' }}
            >
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* Create Quiz Card */}
                <motion.div whileHover={{ scale: 1.03, y: -5 }} whileTap={{ scale: 0.97 }} style={{ flex: '1 1 250px' }}>
                  <Link
                    to="/host/dashboard"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: '40px 30px', borderRadius: 24, textDecoration: 'none',
                      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                      color: 'white', boxShadow: '0 20px 40px -10px rgba(124, 58, 237, 0.5)',
                      height: '100%', gap: 20
                    }}
                  >
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', backdropFilter: 'blur(5px)'
                    }}>✨</div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 800, marginBottom: 6 }}>Create a Quiz</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.85 }}>Host a live session or manage quizzes</span>
                    </div>
                  </Link>
                </motion.div>

                {/* Join Quiz Card */}
                <motion.div whileHover={{ scale: 1.03, y: -5 }} whileTap={{ scale: 0.97 }} style={{ flex: '1 1 250px' }}>
                  <Link
                    to="/join"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: '40px 30px', borderRadius: 24, textDecoration: 'none',
                      background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
                      color: 'white', boxShadow: '0 20px 40px -10px rgba(236, 72, 153, 0.5)',
                      height: '100%', gap: 20
                    }}
                  >
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', backdropFilter: 'blur(5px)'
                    }}>⚡</div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 800, marginBottom: 6 }}>Join a Quiz</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.85 }}>Enter a room code to participate</span>
                    </div>
                  </Link>
                </motion.div>
              </div>

              <motion.button
                whileHover={{ color: '#ef4444' }}
                onClick={async () => { await logout(); }}
                style={{
                  background: 'none', border: 'none', color: '#94a3b8',
                  cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600,
                  marginTop: 36, padding: '8px 16px', borderRadius: 8,
                  transition: 'color 0.2s'
                }}
              >
                Sign out
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="guest-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              style={{ width: '100%' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    to="/auth"
                    style={{
                      display: 'block', padding: '20px 24px', borderRadius: 18,
                      background: '#0f172a', color: 'white',
                      textDecoration: 'none', fontWeight: 700, fontSize: '1.15rem',
                      boxShadow: '0 15px 30px -5px rgba(15, 23, 42, 0.3)',
                      transition: 'all 0.2s', width: '100%'
                    }}
                  >
                    Sign In
                  </Link>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    to="/auth"
                    state={{ signUp: true }}
                    style={{
                      display: 'block', padding: '20px 24px', borderRadius: 18,
                      background: 'rgba(255, 255, 255, 0.5)', color: '#0f172a',
                      border: '2px solid rgba(15, 23, 42, 0.1)', textDecoration: 'none', 
                      fontWeight: 700, fontSize: '1.15rem',
                      transition: 'all 0.2s', width: '100%',
                      backdropFilter: 'blur(10px)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#0f172a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.1)';
                    }}
                  >
                    Create Account
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
