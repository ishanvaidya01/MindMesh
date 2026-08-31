/**
 * Room Store — live room state driven by WebSocket messages.
 *
 * All state mutations come from WebSocket events (via the message handler).
 * This is the client-side analog of the event engine.
 */

import { create } from 'zustand';

const useRoomStore = create((set, get) => ({
  // Room metadata
  roomCode: null,
  host: null,
  status: 'lobby', // lobby | live | paused | ended

  // Participants
  participants: [],

  // Current question
  currentQuestion: null,
  timeRemaining: 0,
  timerInterval: null,
  questionIndex: -1,

  // Answer state (for current participant)
  selectedOption: null,
  confidence: 50,
  answered: false,
  answerResult: null, // { is_correct, misconception_tag }
  hasSeenExplainer: false,
  advanced: false, // self-paced: waiting for next question

  // 🌟 Self-paced personal question state
  personalQuestion: null,      // current question for THIS student (may differ from host's)
  personalQuestionIndex: -1,   // student's own index
  personalTotalQuestions: 0,   // total questions in quiz
  personalQuizComplete: false, // student finished all questions

  // 🌟 Host: per-student progress map { participantId: { questionIndex, totalQuestions, completed } }
  studentProgress: {},

  // Leaderboard
  leaderboard: { standard: [], calibration: [] },
  activeLeaderboardTab: 'standard',

  // Clusters & graphs
  clusters: [],
  clusterGraphData: { nodes: [], links: [] },
  lifelineGraphData: { nodes: [], links: [] },

  // Answer stats (enhanced)
  answersReceived: 0,
  totalParticipants: 0,
  questionCounts: {},  // question_id → count (for students per question graph)
  correctCounts: {},   // question_id → correct count

  // Session ended data
  sessionEnded: false,

  // 🌟 AI Hints (keyed by question_id)
  hints: {},  // { question_id: hint_text }
  currentHint: null,

  // ------------------------------------------------------------------
  // WebSocket message handler
  // ------------------------------------------------------------------
  handleMessage: (data) => {
    const type = data.type;
    const handlers = {
      state_sync: get()._handleStateSync,
      authenticated: get()._handleAuthenticated,
      participant_joined: get()._handleParticipantJoined,
      question_pushed: get()._handleQuestionPushed,
      answer_confirmed: get()._handleAnswerConfirmed,
      leaderboard_update: get()._handleLeaderboardUpdate,
      cluster_update: get()._handleClusterUpdate,
      answer_stats: get()._handleAnswerStats,
      session_paused: () => set({ status: 'paused' }),
      session_resumed: () => set({ status: 'live' }),
      session_ended: get()._handleSessionEnded,
      hint_delivered: get()._handleHintDelivered,
      // 🌟 Self-paced student messages
      student_question: get()._handleStudentQuestion,
      student_quiz_complete: get()._handleStudentQuizComplete,
      student_progress_update: get()._handleStudentProgressUpdate,
      room_reset: get()._handleRoomReset,
      advance_confirmed: () => {}, // legacy no-op
      error: (d) => console.error('[Room] Server error:', d.message),
    };

    const handler = handlers[type];
    if (handler) {
      handler(data);
    } else {
      console.warn('[Room] Unhandled message type:', type);
    }
  },

  // ------------------------------------------------------------------
  // Internal handlers
  // ------------------------------------------------------------------
  _handleStateSync: (data) => {
    set({
      roomCode: data.room_code || get().roomCode,
      host: data.host || get().host,
      status: data.status ?? get().status,
      questionIndex: data.current_question_index ?? get().questionIndex,
      currentQuestion: data.question || get().currentQuestion,
      leaderboard: data.leaderboard || get().leaderboard,
      clusters: data.clusters || get().clusters,
      clusterGraphData: data.graph_data || get().clusterGraphData,
      participants: data.participants || get().participants,
      selectedOption: null,
      confidence: 50,
      answered: false,
      answerResult: null,
      advanced: false,
      currentHint: null,
    });

    if (data.question) {
      get()._startTimer(data.question.time_limit_seconds);
    }
  },

  _handleAuthenticated: (data) => {
    console.log(`[Room] Authenticated as ${data.role}: ${data.display_name || data.host_name}`);
  },

  _handleParticipantJoined: (data) => {
    set((state) => ({
      participants: [
        ...state.participants.filter(p => p.id !== data.participant_id),
        { id: data.participant_id, name: data.display_name },
      ],
    }));
  },

  _handleQuestionPushed: (data) => {
    const question = data.question;
    set({
      currentQuestion: question,
      status: data.status || 'live',
      questionIndex: data.question_index ?? (get().questionIndex + 1),
      selectedOption: null,
      confidence: 50,
      answered: false,
      answerResult: null,
      answersReceived: 0,
      advanced: false,
      currentHint: null,
      // Reset personal question to match host's first question push
      personalQuestion: question,
      personalQuestionIndex: data.question_index ?? 0,
      personalTotalQuestions: data.total_questions || 0,
    });

    get()._startTimer(question.time_limit_seconds);
  },

  _handleAnswerConfirmed: (data) => {
    set({
      answered: true,
      hasSeenExplainer: true,
      answerResult: {
        is_correct: data.is_correct,
        misconception_tag: data.misconception_tag,
      },
    });
  },

  _handleLeaderboardUpdate: (data) => {
    set({ leaderboard: data.leaderboard });
  },

  _handleClusterUpdate: (data) => {
    set({
      clusters: data.clusters,
      clusterGraphData: data.graph_data || get().clusterGraphData,
    });
  },

  _handleAnswerStats: (data) => {
    set({
      answersReceived: data.answers_received,
      totalParticipants: data.total_participants,
      questionCounts: data.question_counts || get().questionCounts,
      correctCounts: data.correct_counts || get().correctCounts,
    });
  },

  _handleSessionEnded: (data) => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);
    set({
      status: 'ended',
      sessionEnded: true,
      leaderboard: data.leaderboard || get().leaderboard,
      timerInterval: null,
    });
  },

  _handleLifelineReceived: (data) => {},

  _handleLifelineGraphUpdate: (data) => {
    set({ lifelineGraphData: data.graph_data });
  },

  _handleGhostTick: (data) => {
    if (data.question) {
      get()._handleQuestionPushed({ question: data.question });
    }
  },

  // 🌟 AI Hint handler
  _handleHintDelivered: (data) => {
    const questionId = data.question_id;
    const hintText   = data.hint_text;
    if (!hintText) return;
    set((state) => ({
      hints:       { ...state.hints, [questionId]: hintText },
      currentHint: hintText,
    }));
  },

  // 🌟 Self-paced: student received their personal next question
  _handleStudentQuestion: (data) => {
    set({
      personalQuestion: data.question,
      personalQuestionIndex: data.question_index,
      personalTotalQuestions: data.total_questions,
      // Reset answer state for new question
      selectedOption: null,
      confidence: 50,
      answered: false,
      answerResult: null,
      currentHint: null,
    });
    // Restart timer for the new question
    if (data.question?.time_limit_seconds) {
      get()._startTimer(data.question.time_limit_seconds);
    }
    // Persist progress to localStorage so reconnect can restore it
    try {
      const roomCode = get().roomCode || sessionStorage.getItem('room_code');
      if (roomCode) {
        localStorage.setItem(`mindmesh_progress_${roomCode}`, JSON.stringify({
          questionIndex: data.question_index,
          totalQuestions: data.total_questions,
          questionId: data.question?.id,
          questionStartedAt: Date.now(),
          timeLimit: data.question?.time_limit_seconds,
        }));
      }
    } catch (e) {}
  },

  // 🌟 Self-paced: student completed all questions
  _handleStudentQuizComplete: (data) => {
    set({ personalQuizComplete: true });
  },

  // 🌟 Host: track per-student question progress
  _handleStudentProgressUpdate: (data) => {
    set((state) => ({
      studentProgress: {
        ...state.studentProgress,
        [data.participant_id]: {
          questionIndex: data.question_index,
          totalQuestions: data.total_questions,
          completed: data.completed,
        },
      },
    }));
  },

  // 🌟 Room reset (host restarted the quiz)
  _handleRoomReset: () => {
    set({
      status: 'lobby',
      currentQuestion: null,
      personalQuestion: null,
      personalQuestionIndex: -1,
      personalTotalQuestions: 0,
      personalQuizComplete: false,
      studentProgress: {},
      questionIndex: -1,
      selectedOption: null,
      confidence: 50,
      answered: false,
      answerResult: null,
      advanced: false,
      sessionEnded: false,
      answersReceived: 0,
      questionCounts: {},
      correctCounts: {},
      currentHint: null,
      hints: {},
    });
  },

  // ------------------------------------------------------------------
  // Timer
  // ------------------------------------------------------------------
  _startTimer: (seconds) => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);

    set({ timeRemaining: seconds });

    const interval = setInterval(() => {
      const { timeRemaining } = get();
      if (timeRemaining <= 0) {
        clearInterval(interval);
        set({ timerInterval: null });
        return;
      }
      set({ timeRemaining: timeRemaining - 1 });
    }, 1000);

    set({ timerInterval: interval });
  },

  _handleHintDelivered: (data) => {
    const questionId = data.question_id;
    const hintText   = data.hint_text;
    if (!hintText) return;
    set((state) => ({
      hints:       { ...state.hints, [questionId]: hintText },
      currentHint: hintText,
    }));
  },

  // Actions (called by UI components)
  // ------------------------------------------------------------------
  selectOption: (optionId) => {
    if (!get().answered) {
      set({ selectedOption: optionId });
    }
  },

  setConfidence: (value) => {
    set({ confidence: value });
  },

  submitAnswer: (sendFn, latencyMs = 0) => {
    const { selectedOption, confidence, currentQuestion, personalQuestion, answered } = get();
    if (!selectedOption || answered) return;

    // Use the student's personal question if available (self-paced Q2+),
    // otherwise fall back to the host-pushed question (Q1)
    const activeQuestion = personalQuestion || currentQuestion;

    sendFn({
      type: 'answer_submitted',
      option_id: selectedOption,
      confidence,
      latency_ms: latencyMs,
      question_id: activeQuestion?.id,
    });

    set({ answered: true, hasSeenExplainer: true });
  },

  setActiveLeaderboardTab: (tab) => {
    set({ activeLeaderboardTab: tab });
  },

  resetRoom: () => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);

    set({
      roomCode: null,
      host: null,
      status: 'lobby',
      participants: [],
      currentQuestion: null,
      timeRemaining: 0,
      timerInterval: null,
      questionIndex: -1,
      selectedOption: null,
      confidence: 50,
      answered: false,
      answerResult: null,
      hasSeenExplainer: false,
      advanced: false,
      leaderboard: { standard: [], calibration: [] },
      clusters: [],
      clusterGraphData: { nodes: [], links: [] },
      answersReceived: 0,
      totalParticipants: 0,
      questionCounts: {},
      correctCounts: {},
      sessionEnded: false,
      hints: {},
      currentHint: null,
      personalQuestion: null,
      personalQuestionIndex: -1,
      personalTotalQuestions: 0,
      personalQuizComplete: false,
      studentProgress: {},
    });
  },
}));

export default useRoomStore;
