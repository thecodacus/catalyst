import { Message } from '@/lib/db/schemas/message';
import { Task } from '@/lib/db/schemas/task';
import { MessagePart, MessageMetadata } from './types';
import { connectMongoose } from '@/lib/db/mongodb';

export class MessageService {
  /**
   * Get conversation history for a project
   */
  async getConversationHistory(
    projectId: string,
    limit: number = 100
  ): Promise<any[]> {
    await connectMongoose();
    
    const messages = await Message.find({ projectId })
      .sort({ createdAt: 1 }) // Oldest first
      .limit(limit);

    // Transform messages to include task details if needed
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        const messageObj = msg.toObject();

        // If message has a taskId, fetch the task details
        if (messageObj.taskId) {
          try {
            const task = await Task.findById(messageObj.taskId);
            if (task && messageObj.parts) {
              // Update task parts with latest task data
              messageObj.parts = messageObj.parts.map(
                (part: { type: string; data: unknown }) => {
                  if (part.type === 'task') {
                    return { type: 'task', data: task.toObject() };
                  }
                  return part;
                },
              );
            }
          } catch (error) {
            console.error('Failed to fetch task for message:', error);
          }
        }

        return messageObj;
      }),
    );

    return enrichedMessages;
  }

  /**
   * Create a new user message
   */
  async createUserMessage(
    projectId: string,
    userId: string,
    message: string
  ): Promise<any> {
    await connectMongoose();
    
    const userMessage = new Message({
      projectId,
      userId,
      role: 'user',
      content: message,
      parts: [{ type: 'text', data: message }],
    });

    await userMessage.save();
    return userMessage;
  }

  /**
   * Create a new AI message
   */
  async createAIMessage(
    projectId: string,
    userId: string,
    taskId?: string,
    parentMessageId?: string,
    metadata?: MessageMetadata
  ): Promise<any> {
    await connectMongoose();
    
    const aiMessage = new Message({
      projectId,
      userId,
      role: 'assistant',
      content: '...', // Use placeholder to avoid validation error
      parts: [],
      taskId: taskId?.toString(),
      parentMessageId: parentMessageId?.toString(),
      metadata: metadata || {},
    });

    await aiMessage.save();
    return aiMessage;
  }

  /**
   * Update AI message content and parts
   */
  async updateAIMessage(
    messageId: string,
    content: string,
    parts: MessagePart[],
    metadata?: Partial<MessageMetadata>
  ): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    message.content = content;
    message.parts = parts;
    if (metadata) {
      message.metadata = { ...message.metadata, ...metadata };
    }
    message.markModified('parts');
    message.markModified('metadata');
    
    await message.save();
  }

  /**
   * Add a text part to message
   */
  async addTextPart(
    messageId: string,
    text: string
  ): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // Update content
    if (message.content === '...') {
      message.content = text;
    } else {
      message.content += text;
    }

    // Add text part
    message.parts.push({ type: 'text', data: text });
    message.markModified('parts');
    
    // Update token count
    if (!message.metadata) message.metadata = {};
    (message.metadata as any).tokenCount = message.content.length;
    
    await message.save();
  }

  /**
   * Add a tool call part to message
   */
  async addToolCallPart(
    messageId: string,
    toolCall: {
      id: string;
      tool: string;
      params: any;
      status: string;
      result?: any;
      error?: string;
    }
  ): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    message.parts.push({
      type: 'tool-call',
      data: toolCall,
    });
    message.markModified('parts');
    
    // Update tool call count
    if (!message.metadata) message.metadata = {};
    const currentCount = (message.metadata as any).toolCalls || 0;
    (message.metadata as any).toolCalls = currentCount + 1;
    
    await message.save();
  }

  /**
   * Update tool call result
   */
  async updateToolCallResult(
    messageId: string,
    callId: string,
    status: 'completed' | 'failed',
    result?: any,
    error?: string
  ): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const toolCallPartIndex = message.parts.findIndex(
      (part: any) =>
        part.type === 'tool-call' &&
        part.data.id === callId,
    );
    
    if (toolCallPartIndex !== -1) {
      (message.parts[toolCallPartIndex] as any).data.status = status;
      if (result !== undefined) {
        (message.parts[toolCallPartIndex] as any).data.result = result;
      }
      if (error) {
        (message.parts[toolCallPartIndex] as any).data.error = error;
      }
      
      message.markModified('parts');
      
      // Update tool response count if completed
      if (status === 'completed' && message.metadata) {
        const currentCount = (message.metadata as any).toolResponses || 0;
        (message.metadata as any).toolResponses = currentCount + 1;
      }
      
      await message.save();
    }
  }

  /**
   * Convert messages to conversation history format for AI
   */
  convertToAIHistory(messages: any[]): any[] {
    const history: any[] = [];
    
    for (const msg of messages) {
      const content: any = {
        role: msg.role === 'user' ? 'user' : 'model',
        parts: []
      };
      
      // Add parts in order if they exist
      if (msg.parts && msg.parts.length > 0) {
        // Process parts in the order they were saved
        for (const part of msg.parts) {
          if (part.type === 'text' && part.data) {
            // Add all text parts
            content.parts.push({ text: part.data as string });
          } else if (part.type === 'tool-call') {
            // Add function call
            content.parts.push({
              functionCall: {
                name: (part.data as any).tool,
                args: (part.data as any).params || {}
              }
            });
            // Add function response immediately after if completed
            if ((part.data as any).status === 'completed' && (part.data as any).result) {
              content.parts.push({
                functionResponse: {
                  name: (part.data as any).tool,
                  response: {
                    output: (part.data as any).result
                  }
                }
              });
            }
          }
        }
      } else if (msg.content && msg.content !== '...') {
        // If no parts but has content, use the content
        content.parts.push({ text: msg.content });
      }
      
      // Only add if there are parts
      if (content.parts.length > 0) {
        history.push(content);
      }
    }
    
    return history;
  }
}