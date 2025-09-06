import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = useAuthStore.getState().token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      },
    );
  }

  // Authentication
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    const { user, token } = response.data;

    // Store token in auth store
    const { login } = useAuthStore.getState();
    login(user, token);

    return response.data;
  }

  async register(email: string, password: string, name: string) {
    const response = await this.client.post('/auth/register', {
      email,
      password,
      name,
    });
    const { user, token } = response.data;

    // Store token in auth store
    const { login } = useAuthStore.getState();
    login(user, token);

    return response.data;
  }

  async logout() {
    await this.client.post('/auth/logout');
    useAuthStore.getState().logout();
  }

  async refreshToken() {
    const response = await this.client.post('/auth/refresh');
    return response.data;
  }

  async getSession() {
    const response = await this.client.get('/auth/session');
    return response.data;
  }

  // Projects
  async getProjects() {
    const response = await this.client.get('/projects');
    return response.data;
  }

  async createProject(data: { name: string; description?: string }) {
    const response = await this.client.post('/projects', data);
    return response.data;
  }

  async getProject(id: string) {
    const response = await this.client.get(`/projects/${id}`);
    return response.data;
  }

  async updateProject(
    id: string,
    data: Partial<{
      name: string;
      description?: string;
      settings?: Record<string, unknown>;
      tags?: string[];
    }>,
  ) {
    const response = await this.client.put(`/projects/${id}`, data);
    return response.data;
  }

  async deleteProject(id: string) {
    await this.client.delete(`/projects/${id}`);
  }

  // Tasks
  async getProjectTasks(projectId: string) {
    const response = await this.client.get(`/projects/${projectId}/tasks`);
    return response.data;
  }

  async createTask(
    projectId: string,
    data: { prompt: string; priority?: number },
  ) {
    const response = await this.client.post(
      `/projects/${projectId}/tasks`,
      data,
    );
    return response.data;
  }

  async getTask(taskId: string) {
    const response = await this.client.get(`/tasks/${taskId}`);
    return response.data;
  }

  async cancelTask(taskId: string) {
    await this.client.post(`/tasks/${taskId}/cancel`);
  }

  async getTaskLogs(taskId: string) {
    const response = await this.client.get(`/tasks/${taskId}/logs`);
    return response.data;
  }

  // Conversation
  async getConversation(projectId: string) {
    const response = await this.client.get(
      `/projects/${projectId}/conversation`,
    );
    return response.data;
  }

  async sendMessage(projectId: string, message: string) {
    const response = await this.client.post(
      `/projects/${projectId}/conversation`,
      {
        message,
      },
    );
    return response.data;
  }

  // Streaming version of sendMessage using SSE
  async sendMessageStream(
    projectId: string,
    message: string,
    onEvent: (event: { type: string; [key: string]: unknown }) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = useAuthStore.getState().token;
    
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ message }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    let buffer = '';
    let currentEventType = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.substring(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.substring(6);
          try {
            const parsed = JSON.parse(data);
            onEvent({ type: currentEventType, ...parsed });
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
  }

  // VM Operations
  async getFiles(projectId: string, path?: string) {
    const response = await this.client.get(`/projects/${projectId}/files`, {
      params: { path },
    });
    return response.data;
  }

  async readFile(projectId: string, path: string) {
    const response = await this.client.get(
      `/projects/${projectId}/files/content`,
      {
        params: { path }
      }
    );
    return response.data;
  }

  async writeFile(projectId: string, path: string, content: string) {
    const response = await this.client.put(
      `/projects/${projectId}/files/content`,
      {
        path,
        content,
      },
    );
    return response.data;
  }

  async deleteFile(projectId: string, path: string) {
    await this.client.delete(`/projects/${projectId}/files${path}`);
  }

  async executeCommand(projectId: string, command: string, cwd?: string) {
    const response = await this.client.post(`/projects/${projectId}/exec`, {
      command,
      cwd,
    });
    return response.data;
  }

  // Sandbox
  async getSandboxSession(projectId: string) {
    const response = await this.client.get(`/projects/${projectId}/sandbox/session`);
    return response.data;
  }
}

export const apiClient = new ApiClient();
