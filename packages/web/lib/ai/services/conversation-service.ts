import { Project } from '@/lib/db/schemas/project';
import { connectMongoose } from '@/lib/db/mongodb';
import { getAsyncAIService, AsyncAIServiceConfig } from '@/lib/ai/async-ai-service';
import { AsyncSandboxToolExecutor } from '@/lib/ai/async-sandbox-tool-executor';
import { MessageService } from './message-service';
import { TaskService } from './task-service';
import { StreamingService } from './streaming-service';
import { loadUserAISettings } from '@/lib/ai/load-user-settings';
import {
  GeminiEventType,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ServerGeminiStreamEvent,
} from '@catalyst/core';
import {
  ConversationEvent,
  StreamContext,
  UserContext,
  AIServiceSettings,
} from './types';

export class ConversationService {
  private messageService: MessageService;
  private taskService: TaskService;

  constructor() {
    this.messageService = new MessageService();
    this.taskService = new TaskService();
  }

  /**
   * Process a conversation message with streaming
   */
  async processMessage(
    projectId: string,
    message: string,
    user: UserContext,
    streamingService: StreamingService
  ): Promise<void> {
    await connectMongoose();
    
    // Create and save user message
    const userMessage = await this.messageService.createUserMessage(
      projectId,
      user.userId,
      message
    );
    
    streamingService.sendUserMessage(userMessage._id);

    // Declare aiMessage outside try block so it's accessible in catch
    let aiMessage: any;

    try {
      // Load user's AI settings
      const userSettings = await loadUserAISettings(user.userId);
      
      // Initialize async AI service
      const aiConfig = this.buildAsyncAIConfig(projectId, user.userId, userSettings);
      const aiService = await getAsyncAIService(aiConfig);
      
      // Note: With async AI service, history is managed internally
      // The async service will load and manage conversation context automatically
      console.log(`📚 Using async AI service for project ${projectId}`);
      
      // Create initial task
      const task = await this.taskService.createTask(projectId, user.userId, message);
      
      // Create AI message early for progressive updates
      aiMessage = await this.messageService.createAIMessage(
        projectId,
        user.userId,
        task._id.toString(),
        userMessage._id.toString(),
        {
          model: aiConfig.model || 'gemini-2.0-flash-latest',
          tokenCount: 0,
          toolCalls: 0,
          toolResponses: 0,
          hasTask: true,
        }
      );
      
      streamingService.sendAIStart(task._id, aiMessage._id);

      // Process the message with AI
      const result = await this.processAIResponse(
        aiService,
        message,
        projectId,
        {
          projectId,
          userId: user.userId,
          message,
          userMessage,
          task,
          aiMessage,
        },
        streamingService
      );

      // Complete the task
      const finalTask = await this.taskService.completeTask(
        task._id,
        result.response,
        {
          model: aiConfig.model,
          toolCalls: result.toolCalls,
          toolResponses: result.toolResponses,
        }
      );

      // Update final message state
      await this.messageService.updateAIMessage(
        aiMessage._id,
        result.response,
        result.parts,
        {
          tokenCount: result.response.length,
          toolCalls: result.toolCalls,
          toolResponses: result.toolResponses,
        }
      );

      // Update project last accessed time
      await Project.findByIdAndUpdate(projectId, {
        lastAccessed: new Date(),
      });

      // Auto-commit and push any file changes
      if (result.executor && result.executor.commitChanges) {
        try {
          await result.executor.commitChanges();
          console.log('🔄 Auto-commit and push completed for project:', projectId);
        } catch (commitError) {
          console.error('Failed to auto-commit and push changes:', commitError);
        }
      }

      streamingService.sendAIComplete(aiMessage._id, finalTask._id.toString());
    } catch (error) {
      console.error('AI processing error:', error);
      
      // Update task as failed
      const task = await this.taskService.getLatestTask(projectId, user.userId);
      if (task) {
        await this.taskService.failTask(
          task._id,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      // Handle error message
      if (aiMessage) {
        await this.messageService.updateAIMessage(
          aiMessage._id,
          'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
          [{
            type: 'text',
            data: 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
          }],
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );
      } else {
        // If aiMessage wasn't created yet, create an error message
        await this.messageService.createAIMessage(
          projectId,
          user.userId,
          undefined,
          userMessage._id.toString(),
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );
      }

      streamingService.sendError(
        'AI processing failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      streamingService.close();
    }
  }

  /**
   * Process AI response with tool handling
   */
  private async processAIResponse(
    aiService: any,
    message: string,
    projectId: string,
    context: StreamContext,
    streamingService: StreamingService
  ): Promise<{
    response: string;
    parts: any[];
    toolCalls: number;
    toolResponses: number;
    executor?: any;
  }> {
    const executor = new AsyncSandboxToolExecutor(projectId, aiService.config);
    const conversationEvents: ConversationEvent[] = [];
    const allToolCalls: ToolCallRequestInfo[] = [];
    const allToolResponses: ToolCallResponseInfo[] = [];
    const responseChunks: string[] = [];
    const pendingToolCalls: ToolCallRequestInfo[] = [];
    const currentTextBuffer = { value: '' };

    // Process initial message
    await aiService.sendMessage(message, projectId, async (event: ServerGeminiStreamEvent) => {
      await this.handleStreamEvent(
        event,
        currentTextBuffer,
        responseChunks,
        conversationEvents,
        pendingToolCalls,
        allToolCalls,
        context,
        streamingService
      );
    });

    // Save any remaining buffered text
    if (currentTextBuffer.value) {
      await this.saveBufferedText(
        currentTextBuffer.value,
        conversationEvents,
        context.aiMessage
      );
      currentTextBuffer.value = '';
    }

    // Execute tools and continue conversation if needed
    while (pendingToolCalls.length > 0) {
      const toolResponses = await this.executeToolCalls(
        pendingToolCalls,
        executor,
        context,
        conversationEvents,
        allToolResponses,
        streamingService
      );
      
      pendingToolCalls.length = 0; // Clear the array

      // Send tool responses back to AI for continuation
      await aiService.sendMessage(toolResponses.parts, projectId, async (event: ServerGeminiStreamEvent) => {
        await this.handleStreamEvent(
          event,
          currentTextBuffer,
          responseChunks,
          conversationEvents,
          pendingToolCalls,
          allToolCalls,
          context,
          streamingService
        );
      });
    }

    // Save any remaining buffered text from continuation
    if (currentTextBuffer.value) {
      await this.saveBufferedText(
        currentTextBuffer.value,
        conversationEvents,
        context.aiMessage
      );
    }

    // Build final parts array from conversation events
    // This is used to reconstruct the message parts
    const parts = conversationEvents.map(event => {
      if (event.type === 'text') {
        return { type: 'text', data: event.content };
      } else if (event.type === 'tool_call' && event.toolCall) {
        const toolCall = context.aiMessage.parts.find(
          (p: any) => p.type === 'tool-call' && p.data.id === event.toolCall!.callId
        );
        return toolCall || {
          type: 'tool-call',
          data: {
            id: event.toolCall.callId,
            tool: event.toolCall.name,
            params: event.toolCall.args,
            status: 'pending',
          }
        };
      }
      return null;
    }).filter(Boolean);

    return {
      response: responseChunks.join(''),
      parts,
      toolCalls: allToolCalls.length,
      toolResponses: allToolResponses.length,
      executor,
    };
  }

  /**
   * Handle stream events from AI
   */
  private async handleStreamEvent(
    event: ServerGeminiStreamEvent,
    currentTextBuffer: { value: string },
    responseChunks: string[],
    conversationEvents: ConversationEvent[],
    pendingToolCalls: ToolCallRequestInfo[],
    allToolCalls: ToolCallRequestInfo[],
    context: StreamContext,
    streamingService: StreamingService
  ): Promise<void> {
    switch (event.type) {
      case GeminiEventType.Content:
        currentTextBuffer.value += event.value;
        responseChunks.push(event.value);
        streamingService.sendAIContent(event.value);
        break;

      case GeminiEventType.ToolCallRequest:
        // Save any buffered text first
        if (currentTextBuffer.value) {
          await this.saveBufferedText(
            currentTextBuffer.value,
            conversationEvents,
            context.aiMessage
          );
          currentTextBuffer.value = '';
        }

        // Add tool call
        conversationEvents.push({
          type: 'tool_call',
          toolCall: event.value,
        });
        pendingToolCalls.push(event.value);
        allToolCalls.push(event.value);

        // Update message with tool call
        await this.messageService.addToolCallPart(context.aiMessage._id, {
          id: event.value.callId,
          tool: event.value.name,
          params: event.value.args,
          status: 'pending',
        });

        streamingService.sendToolCallStart(
          event.value.name,
          event.value.callId,
          event.value.args
        );
        break;

      case GeminiEventType.Error:
        const errorMessage = typeof event.value === 'string' 
          ? event.value 
          : event.value?.error?.message || event.value?.message || 'Unknown AI error';
        throw new Error(errorMessage);

      case GeminiEventType.UserCancelled:
        throw new Error('Request cancelled by user');
    }
  }

  /**
   * Save buffered text to message
   */
  private async saveBufferedText(
    text: string,
    conversationEvents: ConversationEvent[],
    aiMessage: any
  ): Promise<void> {
    conversationEvents.push({
      type: 'text',
      content: text,
    });
    
    await this.messageService.addTextPart(aiMessage._id, text);
  }

  /**
   * Execute pending tool calls
   */
  private async executeToolCalls(
    toolCalls: ToolCallRequestInfo[],
    executor: AsyncSandboxToolExecutor,
    context: StreamContext,
    conversationEvents: ConversationEvent[],
    allToolResponses: ToolCallResponseInfo[],
    streamingService: StreamingService
  ): Promise<{ parts: any[] }> {
    const toolResponses: { parts: any[] } = { parts: [] };

    for (const toolCall of toolCalls) {
      // Update task with tool call
      await this.taskService.addToolCallToTask(context.task._id, toolCall);

      try {
        console.log(`🛠️ Executing tool from conversation: ${toolCall.name}`, {
          callId: toolCall.callId,
          argsKeys: Object.keys(toolCall.args || {}),
        });

        // Set up streaming callback for bash commands
        if (['bash', 'run_bash_command', 'run_shell_command'].includes(toolCall.name)) {
          executor.setOutputStreamCallback(toolCall.callId, (chunk: string) => {
            streamingService.sendToolCallOutput(toolCall.name, toolCall.callId, chunk);
          });
        }

        const toolResponse = await executor.executeToolCall(toolCall);
        console.log(`✅ Tool execution completed for ${toolCall.name}`);
        allToolResponses.push(toolResponse);

        // Update task with result
        await this.taskService.updateToolCallResult(
          context.task._id,
          toolCall.callId,
          toolResponse.error ? 'failed' : 'completed',
          toolResponse.responseParts
        );

        // Extract output text
        const outputText = this.extractToolOutput(toolResponse);

        // Add to response parts
        toolResponses.parts.push({
          functionResponse: {
            id: toolCall.callId,
            name: toolCall.name,
            response: { output: outputText },
          },
        });

        // Update message with tool response
        await this.messageService.updateToolCallResult(
          context.aiMessage._id,
          toolCall.callId,
          'completed',
          toolResponse.resultDisplay || outputText
        );

        streamingService.sendToolCallEnd(
          toolCall.name,
          toolCall.callId,
          true,
          outputText,
          toolResponse.resultDisplay
        );
      } catch (error) {
        console.error(`🚨 Tool execution failed for ${toolCall.name}:`, error);
        
        // Handle error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        toolResponses.parts.push({
          functionResponse: {
            id: toolCall.callId,
            name: toolCall.name,
            response: { error: errorMessage },
          },
        });

        await this.messageService.updateToolCallResult(
          context.aiMessage._id,
          toolCall.callId,
          'failed',
          errorMessage,
          errorMessage
        );

        streamingService.sendToolCallEnd(
          toolCall.name,
          toolCall.callId,
          false,
          undefined,
          undefined,
          errorMessage
        );
      }
    }

    return toolResponses;
  }

  /**
   * Extract output text from tool response
   */
  private extractToolOutput(toolResponse: ToolCallResponseInfo): string {
    if (
      Array.isArray(toolResponse.responseParts) &&
      toolResponse.responseParts.length > 0 &&
      typeof toolResponse.responseParts[0] === 'object' &&
      'text' in toolResponse.responseParts[0]
    ) {
      return toolResponse.responseParts[0].text;
    }
    
    if (typeof toolResponse.responseParts === 'string') {
      return toolResponse.responseParts;
    }
    
    return JSON.stringify(toolResponse.responseParts);
  }

  /**
   * Build async AI service configuration
   */
  private buildAsyncAIConfig(
    projectId: string,
    userId: string,
    userSettings: AIServiceSettings | null
  ): AsyncAIServiceConfig {
    return {
      projectId: projectId,
      sandboxId: projectId,
      provider: userSettings?.provider as 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'custom' | undefined,
      apiKey: userSettings?.apiKey,
      model: userSettings?.model,
      customEndpoint: userSettings?.customEndpoint,
      userMemory: userSettings?.userMemory,
      // Set temperature to 1.0 for OpenAI provider (it doesn't support 0)
      temperature: userSettings?.provider === 'openai' ? 1.0 : 0.7,
    };
  }

}