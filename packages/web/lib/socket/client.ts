import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';

type SocketEventHandler = (data?: unknown) => void;

class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<SocketEventHandler>> = new Map();

  connect() {
    if (this.socket?.connected) return;

    const token = useAuthStore.getState().token;
    if (!token) {
      console.error('No auth token available for socket connection');
      return;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.emit('disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.emit('error', error);
    });

    // Auth events
    this.socket.on('auth:success', (data) => {
      this.emit('auth:success', data);
    });

    this.socket.on('auth:error', (data) => {
      this.emit('auth:error', data);
    });

    // Task events
    this.socket.on('task:created', (data) => {
      this.emit('task:created', data);
    });

    this.socket.on('task:update', (data) => {
      this.emit('task:update', data);
    });

    this.socket.on('task:log', (data) => {
      this.emit('task:log', data);
    });

    this.socket.on('task:tool:start', (data) => {
      this.emit('task:tool:start', data);
    });

    this.socket.on('task:tool:complete', (data) => {
      this.emit('task:tool:complete', data);
    });

    this.socket.on('task:notification', (data) => {
      this.emit('task:notification', data);
    });

    // VM events
    this.socket.on('vm:terminal:output', (data) => {
      this.emit('vm:terminal:output', data);
    });

    this.socket.on('vm:file:change', (data) => {
      this.emit('vm:file:change', data);
    });

    this.socket.on('vm:file:delete', (data) => {
      this.emit('vm:file:delete', data);
    });

    // Collaboration events
    this.socket.on('collaborator:cursor', (data) => {
      this.emit('collaborator:cursor', data);
    });

    this.socket.on('collaborator:selection', (data) => {
      this.emit('collaborator:selection', data);
    });

    this.socket.on('collaborator:joined', (data) => {
      this.emit('collaborator:joined', data);
    });

    this.socket.on('collaborator:left', (data) => {
      this.emit('collaborator:left', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Event emitter methods
  on(event: string, callback: SocketEventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: SocketEventHandler) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, data?: unknown) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  // Socket.IO emit wrappers
  joinProject(projectId: string) {
    this.socket?.emit('project:join', { projectId });
  }

  leaveProject(projectId: string) {
    this.socket?.emit('project:leave', { projectId });
  }

  createTask(projectId: string, prompt: string, priority?: number) {
    this.socket?.emit('task:create', { projectId, prompt, priority });
  }

  subscribeToTask(taskId: string) {
    this.socket?.emit('task:subscribe', { taskId });
  }

  unsubscribeFromTask(taskId: string) {
    this.socket?.emit('task:unsubscribe', { taskId });
  }

  cancelTask(taskId: string) {
    this.socket?.emit('task:cancel', { taskId });
  }

  // Terminal operations
  createTerminal(terminalId: string) {
    this.socket?.emit('vm:terminal:create', { terminalId });
  }

  sendTerminalInput(terminalId: string, data: string) {
    this.socket?.emit('vm:terminal:input', { terminalId, data });
  }

  resizeTerminal(terminalId: string, cols: number, rows: number) {
    this.socket?.emit('vm:terminal:resize', { terminalId, cols, rows });
  }

  // File watching
  watchFile(path: string) {
    this.socket?.emit('vm:file:watch', { path });
  }

  unwatchFile(path: string) {
    this.socket?.emit('vm:file:unwatch', { path });
  }

  // Collaboration
  updateCursor(file: string, position: { line: number; column: number }) {
    this.socket?.emit('cursor:move', { file, position });
  }

  updateSelection(file: string, selection: unknown) {
    this.socket?.emit('selection:change', { file, selection });
  }
}

export const socketClient = new SocketClient();
