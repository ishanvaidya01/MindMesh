import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import useQuizStore from '../stores/useQuizStore';

const COLORS = ['#f43f5e', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#3b82f6'];

export default function DebriefPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { fetchDebrief, fetchHistory } = useQuizStore();
  const [debrief, setDebrief] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    loadData();
  }, [roomCode, retryCount]);

  async function loadData() {
    setLoading(true);
    const [debriefData, historyData] = await Promise.all([
      fetchDebrief(roomCode),
      fetchHistory(roomCode),
    ]);
    setDebrief(debriefData);
    setHistory(historyData);
    setLoading(false);

    // If debrief is still pending, retry after 3s
    if (debriefData?.status === 'pending' && retryCount < 10) {
      setTimeout(() => setRetryCount(c => c + 1), 3000);
    }
  }

  if (loading && !debrief) {
    return (
      <div className="app-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary-400)',
          margin: '0 auto 20px', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-muted)' }}>Generating quiz summary...</p>
      </div>
    );
  }

  const isPending = debrief?.status === 'pending';
  const clusterSummary = debrief?.cluster_summary || {};
  const perQuestion = clusterSummary.per_question || [];

  // Build chart data
  const accuracyData = perQuestion.map(q => ({
    name: `Q${q.order + 1}`,
    accuracy: q.accuracy_pct,
    confidence: q.avg_confidence,
  }));

  const misconceptionPieData = (clusterSummary.most_common_misconceptions || []).map(m => ({
    name: m.tag,
    value: m.total_occurrences,
  }));

  return (
    <div className="app-container" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-title">
          <button onClick={() => navigate('/history')} className="btn btn-ghost btn-sm">← Back</button>
          <div>
            <h2>Quiz Summary</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Room {roomCode} · {history?.quiz_title || ''}
            </span>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="glass-card" style={{ textAlign: 'center', marginBottom: 24, padding: 32 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid var(--glass-border)', borderTopColor: 'var(--accent-400)',
            margin: '0 auto 16px', animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: 'var(--text-secondary)' }}>Quiz summary is being generated...</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>This typically takes 5-15 seconds</p>
        </div>
      )}

      {!isPending && debrief && (
        <>
          {/* Narrative report */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
            style={{ marginBottom: 24 }}
          >
            <div style={{
              fontSize: '0.95rem', lineHeight: 1.8, color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}>
              {/* Render markdown-like content */}
              {(debrief.narrative_text || '').split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return <h2 key={i} style={{ color: 'var(--text-primary)', margin: '24px 0 12px', fontSize: '1.3rem' }}>{line.slice(3)}</h2>;
                }
                if (line.startsWith('### ')) {
                  return <h3 key={i} style={{ color: 'var(--primary-400)', margin: '20px 0 8px', fontSize: '1.05rem' }}>{line.slice(4)}</h3>;
                }
                if (line.startsWith('- ')) {
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, paddingLeft: 8 }}>
                      <span style={{ color: 'var(--primary-400)' }}>•</span>
                      <span dangerouslySetInnerHTML={{
                        __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary)">$1</strong>')
                          .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      }} />
                    </div>
                  );
                }
                if (line.trim() === '') return <br key={i} />;
                return (
                  <p key={i} style={{ marginBottom: 8 }} dangerouslySetInnerHTML={{
                    __html: line.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary)">$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  }} />
                );
              })}
            </div>
          </motion.div>

          {/* Charts */}
          {accuracyData.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Accuracy vs Confidence chart */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-card">
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Accuracy vs Confidence
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={accuracyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#6b6b80" fontSize={12} />
                    <YAxis stroke="#6b6b80" fontSize={12} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: '#151524', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: '#e0e0e8',
                      }}
                    />
                    <Bar dataKey="accuracy" fill="#10b981" name="Accuracy %" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="confidence" fill="#f59e0b" name="Avg Confidence %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Misconception pie chart */}
              {misconceptionPieData.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="glass-card">
                  <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Top Misconceptions
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={misconceptionPieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name} (${value})`}
                        labelLine={true}
                        dataKey="value"
                      >
                        {misconceptionPieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#151524', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, color: '#e0e0e8',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
            </div>
          )}

          {/* Suggested remedial questions */}
          {debrief.suggested_questions && debrief.suggested_questions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card">
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📝 Suggested Remedial Questions
              </h3>
              {debrief.suggested_questions.map((sq, i) => (
                <div key={i} style={{
                  padding: 16, marginBottom: 12, background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${COLORS[i % COLORS.length]}`,
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    Related to: {sq.related_to}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--warning)', marginBottom: 4 }}>
                    Misconception: "{sq.misconception}"
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {sq.suggestion}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
