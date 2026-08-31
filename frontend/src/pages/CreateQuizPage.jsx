import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useQuizStore from '../stores/useQuizStore';
import useAuthStore from '../stores/useAuthStore';

const API = 'http://localhost:8000';

export default function CreateQuizPage() {
  const navigate = useNavigate();
  const { uploadPdf, loading } = useQuizStore();
  const { token, user } = useAuthStore();

  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState(user?.username || '');
  const [saveError, setSaveError] = useState('');
  const [questions, setQuestions] = useState([createEmptyQuestion(0)]);
  const [expandedQIdx, setExpandedQIdx] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(null);

  function createEmptyQuestion(order) {
    return {
      text: '',
      time_limit_seconds: 30,
      order,
      branch_parent: null,
      branch_condition: null,
      options: [
        { text: '', is_correct: true, misconception_tag: '', ai_suggested_tag: null, tag_confirmed_by_host: false },
        { text: '', is_correct: false, misconception_tag: '', ai_suggested_tag: null, tag_confirmed_by_host: false },
        { text: '', is_correct: false, misconception_tag: '', ai_suggested_tag: null, tag_confirmed_by_host: false },
        { text: '', is_correct: false, misconception_tag: '', ai_suggested_tag: null, tag_confirmed_by_host: false },
      ],
    };
  }

  function addQuestion() {
    setQuestions([...questions, createEmptyQuestion(questions.length)]);
    setExpandedQIdx(questions.length);
  }

  function removeQuestion(idx) {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i })));
  }

  function updateQuestion(idx, field, value) {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: value };
    setQuestions(updated);
  }

  function updateOption(qIdx, oIdx, field, value) {
    const updated = [...questions];
    const opts = [...updated[qIdx].options];
    opts[oIdx] = { ...opts[oIdx], [field]: value };

    // If setting this option as correct, unset others
    if (field === 'is_correct' && value) {
      opts.forEach((o, i) => {
        if (i !== oIdx) o.is_correct = false;
      });
    }

    updated[qIdx] = { ...updated[qIdx], options: opts };
    setQuestions(updated);
  }

  function confirmAiTag(qIdx, oIdx) {
    const updated = [...questions];
    const opts = [...updated[qIdx].options];
    opts[oIdx] = { 
      ...opts[oIdx], 
      misconception_tag: opts[oIdx].ai_suggested_tag,
      tag_confirmed_by_host: true 
    };
    updated[qIdx] = { ...updated[qIdx], options: opts };
    setQuestions(updated);
  }

  function rejectAiTag(qIdx, oIdx) {
    const updated = [...questions];
    const opts = [...updated[qIdx].options];
    opts[oIdx] = { 
      ...opts[oIdx], 
      ai_suggested_tag: null,
      tag_confirmed_by_host: false 
    };
    updated[qIdx] = { ...updated[qIdx], options: opts };
    setQuestions(updated);
  }

  async function handlePdfUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    e.target.value = '';

    const newQuestions = await uploadPdf(file, setUploadProgress);
    if (newQuestions && newQuestions.length > 0) {
      // Filter out empty placeholder question if it's the only one
      const currentQs = (questions.length === 1 && !questions[0].text) ? [] : questions;
      
      const formattedQs = newQuestions.map((q, i) => ({
        text: q.text,
        time_limit_seconds: q.time_limit_seconds || 30,
        order: currentQs.length + i,
        branch_parent: null,
        branch_condition: null,
        options: q.options.map((opt, oIdx) => ({
          text: opt.text,
          is_correct: opt.is_correct,
          misconception_tag: '', // User must confirm
          ai_suggested_tag: opt.misconception_tag || null,
          tag_confirmed_by_host: false,
        }))
      }));
      setQuestions([...currentQs, ...formattedQs]);
    }
  }

  async function handleFormSubmit(e, mode) {
    e.preventDefault();
    setSaveError('');

    // Validate
    if (!title.trim()) { setSaveError('Please enter a quiz title.'); return; }
    if (!owner.trim()) { setSaveError('Please enter your name.'); return; }
    const hasEmptyQ = questions.some(q => !q.text.trim());
    if (hasEmptyQ) { setSaveError('Please fill in all question texts.'); return; }
    const hasEmptyOpts = questions.some(q => q.options.some(o => !o.text.trim()));
    if (hasEmptyOpts) { setSaveError('Please fill in all answer options.'); return; }

    const cleanedQuestions = questions.map(q => ({
      ...q,
      options: q.options.map(o => ({
        text: o.text,
        is_correct: o.is_correct,
        misconception_tag: o.misconception_tag?.trim() || null,
      })),
    }));

    // POST to API with auth token so it's linked to the creator
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Token ${token}`;

      const res = await fetch(`${API}/api/quizzes/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: title.trim(), owner: owner.trim(), questions: cleanedQuestions }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError('Save failed: ' + (err.detail || JSON.stringify(err)));
        return;
      }

      const quiz = await res.json();

      if (mode === 'launch') {
        // Create a room for the quiz
        const roomRes = await fetch(`${API}/api/rooms/create/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ quiz: quiz.id, host: owner.trim() }),
        });

        if (!roomRes.ok) {
          setSaveError('Quiz saved but could not create room.');
          navigate('/host/dashboard');
          return;
        }

        const room = await roomRes.json();
        if (room.host_token) sessionStorage.setItem('host_token', room.host_token);
        sessionStorage.setItem('host_name', owner.trim());
        navigate(`/host/${room.code}`);
      } else {
        // Save for Later — go back to dashboard
        navigate('/host/dashboard');
      }
    } catch (err) {
      setSaveError('Network error — is the server running?');
    }
  }

  return (
    <div className="app-container" style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="page-title">
            <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm">← Back</button>
            <h2>Create Quiz</h2>
          </div>
        </div>

        <form onSubmit={e => e.preventDefault()}>
          {/* Quiz metadata */}
          <div className="glass-card" style={{ marginBottom: 24 }}>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                <label className="form-label">Quiz Title</label>
                <input
                  className="form-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Photosynthesis — Common Misconceptions"
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
                <label className="form-label">Your Name</label>
                <input
                  className="form-input"
                  value={owner}
                  onChange={e => setOwner(e.target.value)}
                  placeholder="Host name"
                  required
                />
              </div>
            </div>
          </div>

          {/* Questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AnimatePresence initial={false}>
              {questions.map((q, qIdx) => {
                const isExpanded = expandedQIdx === qIdx;
                return (
                  <motion.div
                    key={qIdx}
                    className="glass-card"
                    layout
                    style={{ overflow: 'hidden', padding: isExpanded ? '20px' : '12px 20px' }}
                  >
                    {/* Header (Always Visible) */}
                    <div 
                      className="flex flex-between" 
                      style={{ alignItems: 'center', cursor: 'pointer' }}
                      onClick={() => setExpandedQIdx(isExpanded ? -1 : qIdx)}
                    >
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: isExpanded ? 'var(--primary-400)' : 'var(--text-primary)' }}>
                        {qIdx + 1}. {q.text ? (q.text.length > 40 ? q.text.slice(0, 40) + '...' : q.text) : 'New Question'}
                      </h3>
                      <div className="flex gap-sm" style={{ alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 0 }}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>⏱ (s)</label>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: 60, padding: '4px 8px', textAlign: 'center' }}
                            value={q.time_limit_seconds}
                            onChange={e => updateQuestion(qIdx, 'time_limit_seconds', parseInt(e.target.value) || 30)}
                            min={5}
                            max={300}
                          />
                        </div>
                        {questions.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeQuestion(qIdx)}
                            style={{ color: 'var(--error)', padding: '4px 8px' }}>✕</button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedQIdx(isExpanded ? -1 : qIdx)} style={{ padding: '4px 8px' }}>
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>

                    {/* Body (Only Visible if Expanded) */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ marginTop: 16 }}
                        >
                          <div className="form-group" style={{ marginBottom: 16 }}>
                            <textarea
                              className="form-textarea"
                              value={q.text}
                              onChange={e => updateQuestion(qIdx, 'text', e.target.value)}
                              placeholder="Enter your question..."
                              required
                              rows={2}
                            />
                          </div>

                          {/* Options */}
                          <div style={{ display: 'grid', gap: 10 }}>
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr 1fr',
                                gap: 8,
                                alignItems: 'center',
                                background: opt.is_correct ? 'rgba(16,185,129,0.05)' : 'var(--bg-elevated)',
                                padding: 8, borderRadius: 12, border: `1px solid ${opt.is_correct ? 'var(--success)' : 'transparent'}`
                              }}>
                                {/* Correct toggle */}
                                <button
                                  type="button"
                                  onClick={() => updateOption(qIdx, oIdx, 'is_correct', true)}
                                  style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    border: `2px solid ${opt.is_correct ? 'var(--success)' : 'var(--glass-border)'}`,
                                    background: opt.is_correct ? 'rgba(16, 185, 129, 0.2)' : 'var(--glass-bg)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: opt.is_correct ? 'var(--success)' : 'var(--text-muted)',
                                    fontSize: '0.9rem', transition: 'all 0.2s', margin: '0 auto'
                                  }}
                                  title={opt.is_correct ? 'Correct answer' : 'Mark as correct'}
                                >
                                  {opt.is_correct ? '✓' : String.fromCharCode(65 + oIdx)}
                                </button>

                                {/* Option text */}
                                <input
                                  className="form-input"
                                  style={{ background: 'var(--glass-bg)' }}
                                  value={opt.text}
                                  onChange={e => updateOption(qIdx, oIdx, 'text', e.target.value)}
                                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                  required
                                />

                                {/* Misconception tag (only for wrong options) */}
                                {!opt.is_correct ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <input
                                      className="form-input"
                                      value={opt.misconception_tag}
                                      onChange={e => updateOption(qIdx, oIdx, 'misconception_tag', e.target.value)}
                                      placeholder="Common mistake label (e.g. sign_error)"
                                      style={{
                                        borderColor: 'rgba(244, 63, 94, 0.2)',
                                        fontSize: '0.85rem',
                                        background: 'var(--glass-bg)'
                                      }}
                                    />
                                    {opt.ai_suggested_tag && !opt.tag_confirmed_by_host && (
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-elevated)', padding: '4px 8px', borderRadius: '4px' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--primary-400)', flex: 1 }}>
                                          AI suggested: <strong style={{ fontFamily: 'var(--font-mono)' }}>{opt.ai_suggested_tag}</strong>
                                        </span>
                                        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => confirmAiTag(qIdx, oIdx)}>Confirm</button>
                                        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--error)' }} onClick={() => rejectAiTag(qIdx, oIdx)}>Reject</button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{
                                    padding: '10px 14px',
                                    fontSize: '0.8rem',
                                    color: 'var(--success)',
                                    fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 8
                                  }}>
                                    ✨ The Correct Answer
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Validation error */}
          {saveError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 16, padding: '12px 16px',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 12, color: '#dc2626', fontSize: '0.875rem',
              }}
            >
              ⚠️ {saveError}
            </motion.div>
          )}

          {/* Add question + Submit */}
          <div className="flex gap-md" style={{ marginTop: 24, alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost" onClick={addQuestion}>
              + Add Question
            </button>
            <label className="btn btn-ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              📄 Upload PDF
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
            </label>
            {uploadProgress && (
              <span style={{ fontSize: '0.85rem', color: 'var(--primary-400)', fontFamily: 'var(--font-mono)' }}>
                {uploadProgress}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={(e) => handleFormSubmit(e, 'save')} className="btn btn-secondary" disabled={loading}>
              {loading ? 'Saving...' : 'Save for Later'}
            </button>
            <button type="button" onClick={(e) => handleFormSubmit(e, 'launch')} className="btn btn-accent" disabled={loading}>
              {loading ? 'Starting...' : `Launch Quick Quiz (${questions.length} Q)`}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
