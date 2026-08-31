/**
 * WebSocket connection manager — Zustand store.
 *
 * Manages WebSocket lifecycle with auto-reconnect, exponential backoff,
 * and message routing to the room store.
 */

import { create } from 'zustand';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

const useWebSocket = create((set, get) => ({
  socket: null,
  connected: false,
  reconnecting: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  roomCode: null,

  connect: (roomCode) => {
    const state = get();
    if (state.socket && state.connected) {
      state.socket.close();
    }

    const url = `${WS_BASE}/ws/room/${roomCode}/`;
    const socket = new WebSocket(url);

    set({ roomCode, reconnecting: false });

    socket.onopen = () => {
      console.log(`[WS] Connected to room ${roomCode}`);
      set({ socket, connected: true, reconnectAttempts: 0, reconnecting: false });
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { onMessage } = get();
        if (onMessage) {
          onMessage(data);
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    socket.onclose = (event) => {
      console.log(`[WS] Disconnected (code: ${event.code})`);
      set({ connected: false, socket: null });

      // Auto-reconnect unless intentionally closed
      if (event.code !== 1000 && event.code !== 1001) {
        get()._scheduleReconnect();
      }
    };

    socket.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close(1000, 'User disconnected');
    }
    set({ socket: null, connected: false, roomCode: null, reconnectAttempts: 0 });
  },

  send: (message) => {
    const { socket, connected } = get();
    if (socket && connected) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send — not connected');
    }
  },

  authenticate: (sessionToken, hostToken) => {
    get().send({
      type: 'authenticate',
      session_token: sessionToken || undefined,
      host_token: hostToken || undefined,
    });
  },

  joinRoom: (sessionToken) => {
    get().send({
      type: 'join_room',
      session_token: sessionToken,
    });
  },

  // Message handler — set by the room store
  onMessage: null,
  setOnMessage: (handler) => set({ onMessage: handler }),

  _scheduleReconnect: () => {
    const { reconnectAttempts, maxReconnectAttempts, roomCode } = get();

    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    set({ reconnecting: true, reconnectAttempts: reconnectAttempts + 1 });

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    setTimeout(() => {
      if (roomCode) {
        get().connect(roomCode);
      }
    }, delay);
  },
}));

export default useWebSocket;
