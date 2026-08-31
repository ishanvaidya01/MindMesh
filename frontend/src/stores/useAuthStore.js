import { create } from 'zustand';

const API = 'http://localhost:8000';

const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token') || null,
  user: null,          // { username, id }
  isAuthenticated: !!localStorage.getItem('token'),
  loading: true,       // true while initial fetchUser is in-flight
  authChecked: false,  // true once the first fetchUser attempt has settled

  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
      set({ token, isAuthenticated: true });
    } else {
      localStorage.removeItem('token');
      set({ token: null, isAuthenticated: false, user: null });
    }
  },

  /**
   * Validate the stored token against the server.
   * Only clears auth if the server explicitly returns 401/403 (invalid token).
   * Network errors are silently ignored — keeps the user logged in optimistically.
   */
  fetchUser: async () => {
    const { token } = get();
    if (!token) {
      set({ loading: false, authChecked: true });
      return;
    }

    set({ loading: true });
    try {
      const res = await fetch(`${API}/api/auth/me/`, {
        headers: { Authorization: `Token ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        set({ user: { username: data.username, full_name: data.full_name || data.username, id: data.id }, isAuthenticated: true });
      } else if (res.status === 401 || res.status === 403) {
        // Token genuinely invalid — clear it
        localStorage.removeItem('token');
        set({ token: null, isAuthenticated: false, user: null });
      }
      // Any other status (5xx, 0 = network error) → leave token intact
    } catch {
      // Network error: keep the user logged in optimistically
    } finally {
      set({ loading: false, authChecked: true });
    }
  },

  linkProgress: async (token) => {
    const sessionToken = sessionStorage.getItem('session_token');
    if (!sessionToken) return;
    try {
      await fetch(`${API}/api/auth/link-progress/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({ session_token: sessionToken }),
      });
      sessionStorage.removeItem('session_token');
    } catch {
      // non-critical
    }
  },

  login: async (username, password) => {
    try {
      const res = await fetch(`${API}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        get().setToken(data.token);
        set({ user: { username: data.username, full_name: data.full_name || data.username, id: data.id }, isAuthenticated: true });
        await get().linkProgress(data.token);
        return { success: true };
      }
      return { success: false, error: data.error || 'Login failed. Check your credentials.' };
    } catch {
      return { success: false, error: 'Cannot reach server. Is it running?' };
    }
  },

  register: async (username, password, fullName = '') => {
    try {
      const res = await fetch(`${API}/api/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, full_name: fullName }),
      });

      const data = await res.json();

      if (res.ok) {
        get().setToken(data.token);
        set({ user: { username: data.username, full_name: data.full_name || fullName || data.username, id: data.id }, isAuthenticated: true });
        await get().linkProgress(data.token);
        return { success: true };
      }
      return { success: false, error: data.error || 'Registration failed. Username may be taken.' };
    } catch {
      return { success: false, error: 'Cannot reach server. Is it running?' };
    }
  },

  logout: async () => {
    const { token } = get();
    if (token) {
      try {
        await fetch(`${API}/api/auth/logout/`, {
          method: 'POST',
          headers: { Authorization: `Token ${token}` },
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem('token');
    set({ token: null, isAuthenticated: false, user: null });
  },
}));

export default useAuthStore;
