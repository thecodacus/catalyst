'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskCard, ToolCallDisplay } from './message-parts';
import { ITask } from '@/lib/db/schemas/task';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { Response } from '@/components/response';

// Message part types following Vercel AI SDK pattern
type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'task'; task: ITask }
  | { type: 'tool-call'; toolCall: ToolCall }
  | { type: 'file'; file: { name: string; path: string; content?: string } }
  | { type: 'code'; language: string; code: string };

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // For backward compatibility
  parts: MessagePart[]; // New flexible message parts
  timestamp: Date;
  metadata?: {
    model?: string;
    tokenCount?: number;
    projectId?: string;
  };
}

interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
  streamingOutput?: string;
}

interface ChatInterfaceProps {
  projectId: string;
}

export function ChatInterface({ projectId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [activeTasks, setActiveTasks] = useState<ITask[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch conversation history on mount
  useEffect(() => {
    const fetchConversationHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const response = await apiClient.getConversation(projectId);

        // Transform database messages to UI format
        const transformedMessages: Message[] = response.map(
          (msg: {
            _id: string;
            role: 'user' | 'assistant' | 'system';
            content: string;
            parts?: Array<{
              type: string;
              data: unknown;
              text?: string;
            }>;
            createdAt: string;
            updatedAt?: string;
            userId?: string;
            metadata?: unknown;
          }) => ({
            id: msg._id,
            role: msg.role,
            content: msg.content,
            parts: msg.parts?.map((part) => {
              if (part.type === 'task' && part.data) {
                const taskData = part.data as { _id?: string; taskId?: string };
                // If data is already a full task object (from server enrichment)
                if (taskData._id) {
                  return { type: 'task', task: taskData as ITask };
                }
                // If data only contains taskId
                else if (taskData.taskId) {
                  return {
                    type: 'task',
                    task: {
                      _id: taskData.taskId,
                      projectId: projectId,
                      userId: msg.userId || '',
                      type: 'code_generation',
                      status: 'completed',
                      priority: 5,
                      prompt: msg.content,
                      progress: {
                        percentage: 100,
                        currentStep: 'Completed',
                        totalSteps: 1,
                        completedSteps: 1,
                      },
                      toolCalls: [],
                      results: [],
                      logs: [],
                      createdAt: new Date(msg.createdAt),
                      updatedAt: new Date(msg.updatedAt || msg.createdAt),
                      retryCount: 0,
                    },
                  };
                }
              } else if (part.type === 'tool-call' && part.data) {
                // Handle tool call parts from database
                const toolData = part.data as { 
                  id?: string; 
                  callId?: string; 
                  tool?: string; 
                  name?: string; 
                  params?: Record<string, unknown>; 
                  args?: Record<string, unknown>; 
                  status?: string; 
                  result?: unknown 
                };
                return {
                  type: 'tool-call',
                  toolCall: {
                    id: toolData.id || toolData.callId,
                    tool: toolData.tool || toolData.name,
                    params: toolData.params || toolData.args || {},
                    status: toolData.status || 'completed',
                    result: toolData.result
                  }
                };
              } else if (part.type === 'text') {
                return { type: 'text', text: part.data || part.text };
              }
              return part;
            }) || [{ type: 'text', text: msg.content }],
            timestamp: new Date(msg.createdAt),
            metadata: msg.metadata,
          }),
        );

        setMessages(transformedMessages);
      } catch (error) {
        console.error('Failed to fetch conversation history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchConversationHistory();
  }, [projectId]);

  // Fetch active tasks for this project on mount only
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const tasks = await apiClient.getProjectTasks(projectId);
        setActiveTasks(
          tasks.filter((task: ITask) =>
            ['queued', 'processing'].includes(task.status),
          ),
        );
      } catch (error) {
        console.error('Failed to fetch tasks:', error);
      }
    };

    fetchTasks();
    
    // No polling needed - tasks should be updated via WebSocket or SSE if needed
  }, [projectId]);

  const handleInterrupt = async () => {
    if (!isLoading || !currentTaskId) return;

    try {
      // Abort the current request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Cancel the task on the server
      if (currentTaskId) {
        await apiClient.cancelTask(currentTaskId);
        toast.success('AI processing interrupted');
      }

      // Reset states
      setIsLoading(false);
      setCurrentTaskId(null);
      abortControllerRef.current = null;
    } catch (error) {
      console.error('Failed to interrupt:', error);
      toast.error('Failed to interrupt AI');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      parts: [{ type: 'text', text: input.trim() }],
      timestamp: new Date(),
      metadata: { projectId },
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create AI message placeholder
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      parts: [],
      timestamp: new Date(),
      metadata: { projectId },
    };
    setMessages((prev) => [...prev, aiMessage]);

    // Track the message parts in order
    const messageParts: MessagePart[] = [];
    let currentTextBuffer = '';
    let isAccumulatingText = false;

    // Create a new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Use streaming API with abort signal
      await apiClient.sendMessageStream(projectId, input.trim(), (event) => {
        // Event type is now properly included in the event object
        switch (event.type) {
          case 'user_message':
            // User message already added above
            break;
          
          case 'ai_start':
            // Update with task ID if provided
            if (event.taskId) {
              setCurrentTaskId(event.taskId);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId
                    ? { ...msg, metadata: { ...msg.metadata, taskId: event.taskId } }
                    : msg
                )
              );
            }
            break;
          
          case 'ai_content':
            // Accumulate text content
            currentTextBuffer += event.content || '';
            isAccumulatingText = true;
            
            // Update the message with current parts plus the accumulating text
            const updatedParts = [...messageParts];
            if (isAccumulatingText && currentTextBuffer) {
              updatedParts.push({ type: 'text', text: currentTextBuffer });
            }
            
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      content: messageParts
                        .filter(p => p.type === 'text')
                        .map(p => p.text)
                        .join('') + currentTextBuffer,
                      parts: updatedParts,
                    }
                  : msg
              )
            );
            break;
          
          case 'tool_call_start':
            // If we were accumulating text, save it as a part first
            if (isAccumulatingText && currentTextBuffer) {
              messageParts.push({ type: 'text', text: currentTextBuffer });
              currentTextBuffer = '';
              isAccumulatingText = false;
            }
            
            // Debug logging
            console.log('Tool call start event:', event);
            
            // Add the tool call
            const toolCall: ToolCall = {
              id: event.callId,
              tool: event.tool,
              params: event.params || {},
              status: 'running',
            };
            messageParts.push({ type: 'tool-call', toolCall });
            
            // Update message with all parts
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      content: messageParts
                        .filter(p => p.type === 'text')
                        .map(p => p.text)
                        .join(''),
                      parts: [...messageParts],
                    }
                  : msg
              )
            );
            break;
          
          case 'tool_call_output':
            // Handle streaming output from tool calls (e.g., bash commands)
            console.log('Tool call output event:', event);
            
            // Find the tool call in our parts array
            const outputToolIndex = messageParts.findIndex(
              (p) => p.type === 'tool-call' && p.toolCall.id === event.callId
            );
            
            if (outputToolIndex !== -1) {
              const updatedParts = [...messageParts];
              const existingPart = updatedParts[outputToolIndex] as { type: 'tool-call'; toolCall: ToolCall };
              
              // Append output to the tool call
              updatedParts[outputToolIndex] = {
                type: 'tool-call',
                toolCall: {
                  ...existingPart.toolCall,
                  streamingOutput: (existingPart.toolCall.streamingOutput || '') + (event.output || '')
                }
              };
              
              // Replace messageParts with the new array
              messageParts.splice(0, messageParts.length, ...updatedParts);
              
              // Update message with streaming output
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId
                    ? {
                        ...msg,
                        parts: [...messageParts],
                      }
                    : msg
                )
              );
            }
            break;
          
          case 'tool_call_end':
            // Debug logging
            console.log('Tool call end event:', event);
            
            // Update the tool call status in our parts array
            const toolIndex = messageParts.findIndex(
              (p) => p.type === 'tool-call' && p.toolCall.id === event.callId
            );
            
            if (toolIndex !== -1) {
              // Create a new array with updated tool call to trigger re-render
              const updatedParts = [...messageParts];
              const existingPart = updatedParts[toolIndex] as { type: 'tool-call'; toolCall: ToolCall };
              
              // Create a new tool call object
              updatedParts[toolIndex] = {
                type: 'tool-call',
                toolCall: {
                  ...existingPart.toolCall,
                  status: event.success ? 'completed' : 'failed',
                  result: event.success && event.result ? event.result : 
                          !event.success && event.error ? { error: event.error } : 
                          existingPart.toolCall.result
                }
              };
              
              // Replace messageParts with the new array
              messageParts.splice(0, messageParts.length, ...updatedParts);
              
              console.log('Updated tool call:', updatedParts[toolIndex].toolCall);
            }
            
            // Update message with modified parts
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      parts: [...messageParts],
                    }
                  : msg
              )
            );
            break;
          
          case 'ai_complete':
            // Save any remaining text buffer
            if (isAccumulatingText && currentTextBuffer) {
              messageParts.push({ type: 'text', text: currentTextBuffer });
            }
            
            // Update final message
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      id: event.messageId || msg.id,
                      content: messageParts
                        .filter(p => p.type === 'text')
                        .map(p => p.text)
                        .join(''),
                      parts: [...messageParts],
                    }
                  : msg
              )
            );
            setIsLoading(false);
            setCurrentTaskId(null);
            abortControllerRef.current = null;
            break;
          
          case 'error':
            console.error('Streaming error:', event);
            toast.error(event.message || 'Failed to process message');
            setIsLoading(false);
            break;
        }
      }, abortController.signal);
    } catch (error: any) {
      // Check if it's an abort error
      if (error?.name === 'AbortError') {
        console.log('Request was aborted');
        // Already handled in handleInterrupt
        return;
      }
      
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
      
      // Remove the placeholder AI message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
      
      // Fallback message
      const fallbackMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content:
          'I can help you with coding tasks. Try asking me to generate code, refactor existing code, or analyze your project.',
        parts: [
          {
            type: 'text',
            text: 'I can help you with coding tasks. Try asking me to generate code, refactor existing code, or analyze your project.',
          },
        ],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await apiClient.cancelTask(taskId);
      toast.success('Task cancelled');
    } catch (error) {
      console.error('Failed to cancel task:', error);
      toast.error('Failed to cancel task');
    }
  };

  const renderMessagePart = (part: MessagePart, index: number) => {
    switch (part.type) {
      case 'text':
        return (
          <Response key={index}>
            {part.text}
          </Response>
        );

      case 'task':
        return (
          <TaskCard
            key={index}
            task={part.task}
            onCancel={handleCancelTask}
            onViewDetails={(taskId) => {
              // TODO: Implement task details view
              console.log('View task details:', taskId);
            }}
          />
        );

      case 'tool-call':
        return <ToolCallDisplay key={index} toolCall={part.toolCall} />;

      case 'code':
        // The Response component will handle code blocks within markdown
        return (
          <Response key={index}>
            {`\`\`\`${part.language}\n${part.code}\n\`\`\``}
          </Response>
        );

      case 'file':
        return (
          <div key={index} className="mt-2 p-2 bg-muted rounded-md text-sm">
            <p className="font-medium">📄 {part.file.name}</p>
            <p className="text-xs text-muted-foreground">{part.file.path}</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Active tasks banner */}
      {activeTasks.length > 0 && (
        <div className="border-b bg-muted/30 px-4 py-2 flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            {activeTasks.length} active task{activeTasks.length > 1 ? 's' : ''}{' '}
            running
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {isLoadingHistory ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">
              Start a conversation to begin coding with AI assistance
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[80%] space-y-2',
                  message.role === 'user' && 'items-end',
                )}
              >
                {/* Render message parts if available, otherwise fall back to content */}
                {message.parts && message.parts.length > 0 ? (
                  message.parts.map((part, index) => {
                    // For text parts, render with appropriate styling
                    if (part.type === 'text') {
                      return (
                        <div
                          key={index}
                          className={cn(
                            'rounded-lg px-4 py-2',
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted',
                          )}
                        >
                          {renderMessagePart(part, index)}
                        </div>
                      );
                    }
                    // For non-text parts, render without wrapper styling
                    return (
                      <div key={index}>
                        {renderMessagePart(part, index)}
                      </div>
                    );
                  })
                ) : (
                  <div
                    className={cn(
                      'rounded-lg px-4 py-2',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted',
                    )}
                  >
                    <Response>{message.content}</Response>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t p-4 flex-shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to help with your code..."
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
            {isLoading && currentTaskId && (
              <Button
                type="button"
                onClick={handleInterrupt}
                size="icon"
                variant="destructive"
                title="Stop AI processing"
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
