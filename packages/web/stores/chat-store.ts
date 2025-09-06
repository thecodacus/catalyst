import { create } from 'zustand';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  tool: string;
  params: any;
  result?: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface ChatState {
  conversations: Map<string, Message[]>;
  activeConversation: string | null;
  isGenerating: boolean;

  addMessage: (projectId: string, message: Message) => void;
  updateMessage: (
    projectId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  setActiveConversation: (projectId: string | null) => void;
  setGenerating: (isGenerating: boolean) => void;
  clearConversation: (projectId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: new Map(),
  activeConversation: null,
  isGenerating: false,

  addMessage: (projectId, message) =>
    set((state) => {
      const conversations = new Map(state.conversations);
      const messages = conversations.get(projectId) || [];
      conversations.set(projectId, [...messages, message]);
      return { conversations };
    }),

  updateMessage: (projectId, messageId, updates) =>
    set((state) => {
      const conversations = new Map(state.conversations);
      const messages = conversations.get(projectId);
      if (!messages) return state;

      const updatedMessages = messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg,
      );
      conversations.set(projectId, updatedMessages);
      return { conversations };
    }),

  setActiveConversation: (projectId) => set({ activeConversation: projectId }),

  setGenerating: (isGenerating) => set({ isGenerating }),

  clearConversation: (projectId) =>
    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.set(projectId, []);
      return { conversations };
    }),
}));
