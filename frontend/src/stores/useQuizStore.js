/**
 * Quiz Store — CRUD state for quiz management.
 * Communicates with the REST API.
 */

import { create } from 'zustand';
import useAuthStore from './useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const useQuizStore = create((set, get) => ({
  quizzes: [],
  currentQuiz: null,
  rooms: [],
  loading: false,
  error: null,

  // ------------------------------------------------------------------
  // Quiz CRUD
  // ------------------------------------------------------------------

  fetchQuizzes: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/quizzes/`);
      const data = await res.json();
      set({ quizzes: data.results || data, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchQuiz: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/quizzes/${id}/`);
      if (!res.ok) throw new Error('Quiz not found');
      const data = await res.json();
      set({ currentQuiz: data, loading: false });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  createQuiz: async (quizData) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/quizzes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quizData),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(JSON.stringify(errData));
      }
      const data = await res.json();
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  uploadPdf: async (file, onProgress) => {
    set({ loading: true, error: null });
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch(`${API_BASE}/quizzes/upload-pdf/`, {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload PDF');
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      const questions = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.status === 'processing') {
                if (onProgress) onProgress(`Processing page ${data.page} of ${data.total}...`);
              } else if (data.status === 'result') {
                if (data.data && data.data.questions) {
                  questions.push(...data.data.questions);
                }
              } else if (data.status === 'error') {
                console.error('OCR Error on page', data.page, ':', data.message);
                alert(`Error parsing page ${data.page}: ${data.message}`);
                if (onProgress) onProgress(null);
              } else if (data.status === 'done') {
                if (onProgress) onProgress(null); // Clear progress
              }
            } catch (e) {
              console.warn('JSON parse error on SSE chunk', e);
            }
          }
        }
      }
      set({ loading: false });
      return questions;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  deleteQuiz: async (id) => {
    try {
      await fetch(`${API_BASE}/quizzes/${id}/`, { method: 'DELETE' });
      set((state) => ({
        quizzes: state.quizzes.filter(q => q.id !== id),
      }));
    } catch (err) {
      set({ error: err.message });
    }
  },

  // ------------------------------------------------------------------
  // Room management
  // ------------------------------------------------------------------

  createRoom: async (quizId, hostName) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/rooms/create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz: quizId, host: hostName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(JSON.stringify(errData));
      }
      const data = await res.json();
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  joinRoom: async (roomCode, displayName) => {
    set({ loading: true, error: null });
    try {
      // Import auth store to get token for linking user to participant
      const token = useAuthStore.getState?.()?.token;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Token ${token}`;

      const res = await fetch(`${API_BASE}/rooms/${roomCode}/join/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ display_name: displayName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to join room');
      }
      const data = await res.json();
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  fetchRoom: async (roomCode) => {
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/`);
      if (!res.ok) throw new Error('Room not found');
      return await res.json();
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  fetchRooms: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/rooms/`);
      const data = await res.json();
      set({ rooms: data.results || data, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // ------------------------------------------------------------------
  // History & Debrief
  // ------------------------------------------------------------------

  fetchHistory: async (roomCode) => {
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/history/`);
      if (!res.ok) throw new Error('History not found');
      return await res.json();
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  fetchDebrief: async (roomCode) => {
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/debrief/`);
      if (!res.ok && res.status !== 202) throw new Error('Debrief not found');
      return await res.json();
    } catch (err) {
      set({ error: err.message });
      return null;
    }
  },

  fetchBranchTree: async (roomCode) => {
    try {
      const res = await fetch(`${API_BASE}/rooms/${roomCode}/branch-tree/`);
      if (!res.ok) throw new Error('Branch tree not found');
      return await res.json();
    } catch (err) {
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useQuizStore;
