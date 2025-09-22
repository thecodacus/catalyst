import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { Task } from '@/lib/db/schemas/task';
import { Message } from '@/lib/db/schemas/message';
import { Types } from 'mongoose';
import { getAIService, AIServiceConfig } from '@/lib/ai/ai-service';
import {
  GeminiEventType,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '@catalyst/core';
import { SANDBOX_REPO_PATH } from '@/lib/constants/sandbox-paths';
import { loadUserAISettings } from '@/lib/ai/load-user-settings';

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// GET /api/projects/[projectId]/conversation - Get conversation history
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;

      // Validate projectId is a valid ObjectId
      if (!Types.ObjectId.isValid(projectId)) {
        return NextResponse.json(
          { error: 'Invalid project ID' },
          { status: 400 },
        );
      }

      await connectMongoose();

      // Verify user has access to project
      const project = await Project.findOne({
        _id: projectId,
        $or: [{ userId: user.userId }, { 'collaborators.userId': user.userId }],
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 },
        );
      }

      // Get conversation from database
      const messages = await Message.find({ projectId })
        .sort({ createdAt: 1 }) // Oldest first
        .limit(100); // Limit to last 100 messages

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

      return NextResponse.json(enrichedMessages);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}

// SSE event types
enum SSEEventType {
  UserMessage = 'user_message',
  AIStart = 'ai_start',
  AIContent = 'ai_content',
  ToolCallStart = 'tool_call_start',
  ToolCallOutput = 'tool_call_output',
  ToolCallEnd = 'tool_call_end',
  AIComplete = 'ai_complete',
  Error = 'error',
}

// POST /api/projects/[projectId]/conversation - Send message with SSE streaming
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { projectId } = await params;
      const { message } = await req.json();

      // Validate projectId is a valid ObjectId
      if (!Types.ObjectId.isValid(projectId)) {
        return NextResponse.json(
          { error: 'Invalid project ID' },
          { status: 400 },
        );
      }

      if (!message) {
        return NextResponse.json(
          { error: 'Message is required' },
          { status: 400 },
        );
      }

      await connectMongoose();

      // Verify user has access to project
      const project = await Project.findOne({
        _id: projectId,
        $or: [
          { userId: user.userId },
          {
            collaborators: {
              $elemMatch: {
                userId: user.userId,
                role: { $in: ['owner', 'editor'] },
              },
            },
          },
        ],
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found or insufficient permissions' },
          { status: 404 },
        );
      }

      // Create and save user message
      const userMessage = new Message({
        projectId,
        userId: user.userId,
        role: 'user',
        content: message,
        parts: [{ type: 'text', data: message }],
      });

      await userMessage.save();

      // Create a ReadableStream for SSE
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // Helper to send SSE events
          const sendEvent = (type: string, data: unknown) => {
            const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(event));
          };

          // Declare aiMessage outside try block so it's accessible in catch
          let aiMessage: any;

          try {
            // Send user message event
            sendEvent(SSEEventType.UserMessage, { messageId: userMessage._id });

            // Load user's AI settings
            const userSettings = await loadUserAISettings(user.userId);
            
            // Initialize AI service with user settings for CodeSandbox VM environment
            const aiConfig: AIServiceConfig = {
              targetDir: SANDBOX_REPO_PATH,
              cwd: SANDBOX_REPO_PATH,
              isSandboxed: true,
              sandboxId: projectId, // We'll use projectId as the sandbox identifier
              // Pass user settings directly to AI service
              provider: userSettings?.provider as 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'custom' | undefined,
              apiKey: userSettings?.apiKey,
              model: userSettings?.model,
              customEndpoint: userSettings?.customEndpoint,
              // Set temperature to 1.0 for OpenAI provider (it doesn't support 0)
              temperature: userSettings?.provider === 'openai' ? 1.0 : 0.7,
            };

            const aiService = await getAIService(aiConfig);
            
            // Load conversation history
            const previousMessages = await Message.find({ 
              projectId,
              createdAt: { $lt: userMessage.createdAt }
            })
              .sort({ createdAt: 1 })
              .limit(50); // Limit to last 50 messages to avoid context overflow
            
            // Convert messages to Content[] format for GeminiClient
            const history: any[] = [];
            
            for (const msg of previousMessages) {
              const content: any = {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: []
              };
              
              // Add parts in order if they exist
              if (msg.parts && msg.parts.length > 0) {
                // Process parts in the order they were saved
                for (const part of msg.parts) {
                  if (part.type === 'text' && part.data) {
                    // Add all text parts, not just those different from content
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
            
            // Set history on the AI service
            if (history.length > 0) {
              console.log(`📚 Loading ${history.length} messages into AI context for project ${projectId}`);
              
              // Debug: Log the last few messages to see their structure
              if (previousMessages.length > 0) {
                const lastMsg = previousMessages[previousMessages.length - 1];
                console.log('Last message from DB:', {
                  id: lastMsg._id,
                  role: lastMsg.role,
                  contentLength: lastMsg.content?.length || 0,
                  partsCount: lastMsg.parts?.length || 0,
                  parts: lastMsg.parts?.map((p: any) => ({
                    type: p.type,
                    dataPreview: p.type === 'text' ? 
                      `${(p.data as string || '').substring(0, 30)}...` : 
                      p.type === 'tool-call' ? 
                      `${p.data.tool} (${p.data.status})` : 
                      'other'
                  }))
                });
              }
              
              try {
                aiService.geminiClient.setHistory(history);
              } catch (historyError) {
                console.error('Failed to set conversation history:', historyError);
                // Continue without history rather than failing entirely
              }
            }
            
            // Create initial task
            const task = new Task({
              projectId: projectId,
              userId: user.userId,
              type: 'code_generation',
              prompt: message,
              priority: 5,
              status: 'processing',
              progress: {
                percentage: 10,
                currentStep: 'Processing with AI',
                totalSteps: 3,
                completedSteps: 0,
              },
              logs: [
                {
                  timestamp: new Date(),
                  level: 'info',
                  message: 'Starting AI processing',
                },
              ],
            });

            await task.save();

            // Import necessary modules
            const { SandboxToolExecutor } = await import(
              '@/lib/ai/sandbox-tool-executor'
            );
            const executor = new SandboxToolExecutor(
              projectId,
              aiService.config,
            );

            // Track all events in order
            interface ConversationEvent {
              type: 'text' | 'tool_call';
              content?: string;
              toolCall?: ToolCallRequestInfo;
            }

            const conversationEvents: ConversationEvent[] = [];
            const allToolCalls: ToolCallRequestInfo[] = [];
            const allToolResponses: ToolCallResponseInfo[] = [];
            const responseChunks: string[] = [];
            let currentTextBuffer = '';

            // Use the streaming API with manual tool execution
            const pendingToolCalls: ToolCallRequestInfo[] = [];

            // Create AI message early for progressive updates
            aiMessage = new Message({
              projectId,
              userId: user.userId,
              role: 'assistant',
              content: '...', // Use placeholder to avoid validation error
              parts: [],
              taskId: task._id.toString(),
              parentMessageId: userMessage._id.toString(),
              metadata: {
                model: aiConfig.model,
                tokenCount: 0,
                toolCalls: 0,
                toolResponses: 0,
                hasTask: true,
              },
            });
            await aiMessage.save();

            // Send AI start event with message ID
            sendEvent(SSEEventType.AIStart, { 
              taskId: task._id,
              messageId: aiMessage._id 
            });

            await aiService.sendMessage(message, projectId, async (event) => {
              switch (event.type) {
                case GeminiEventType.Content:
                  // Buffer text content
                  currentTextBuffer += event.value;
                  responseChunks.push(event.value);

                  // Send content update event for streaming
                  sendEvent(SSEEventType.AIContent, { content: event.value });
                  break;

                case GeminiEventType.ToolCallRequest:
                  // Save any buffered text as an event and to message
                  if (currentTextBuffer) {
                    conversationEvents.push({
                      type: 'text',
                      content: currentTextBuffer,
                    });
                    
                    // Update message content and parts with complete text segment
                    if (aiMessage.content === '...') {
                      aiMessage.content = currentTextBuffer;
                    } else {
                      aiMessage.content += currentTextBuffer;
                    }
                    aiMessage.parts.push({ type: 'text', data: currentTextBuffer });
                    aiMessage.markModified('parts');
                    aiMessage.metadata.tokenCount = aiMessage.content.length;
                    await aiMessage.save();
                    
                    currentTextBuffer = '';
                  }

                  // Add tool call event
                  conversationEvents.push({
                    type: 'tool_call',
                    toolCall: event.value,
                  });
                  pendingToolCalls.push(event.value);
                  allToolCalls.push(event.value);

                  // Update message with tool call
                  aiMessage.parts.push({
                    type: 'tool-call',
                    data: {
                      id: event.value.callId,
                      tool: event.value.name,
                      params: event.value.args,
                      status: 'pending',
                    },
                  });
                  aiMessage.markModified('parts');
                  aiMessage.metadata.toolCalls = allToolCalls.length;
                  await aiMessage.save();

                  // Send tool call start event with parameters
                  sendEvent(SSEEventType.ToolCallStart, {
                    tool: event.value.name,
                    callId: event.value.callId,
                    params: event.value.args,
                  });
                  break;

                case GeminiEventType.Error:
                  throw new Error(event.value.error.message);
              }
            });

            // Save any remaining buffered text
            if (currentTextBuffer) {
              conversationEvents.push({
                type: 'text',
                content: currentTextBuffer,
              });
              
              // Update message content and parts with final text segment
              if (aiMessage.content === '...') {
                aiMessage.content = currentTextBuffer;
              } else {
                aiMessage.content += currentTextBuffer;
              }
              aiMessage.parts.push({ type: 'text', data: currentTextBuffer });
              aiMessage.markModified('parts');
              aiMessage.metadata.tokenCount = aiMessage.content.length;
              await aiMessage.save();
              
              currentTextBuffer = '';
            }

            // Execute tools and continue conversation if needed
            while (pendingToolCalls.length > 0) {
              const toolCallsToProcess = [...pendingToolCalls];
              pendingToolCalls.length = 0; // Clear the array

              const toolResponses: {
                parts: Array<{
                  functionResponse: {
                    id: string;
                    name: string;
                    response: { output?: string; error?: string };
                  };
                }>;
              } = { parts: [] };

              // Execute each tool call
              for (const toolCall of toolCallsToProcess) {
                // Update task with tool call
                const latestTask = await Task.findById(task._id);
                if (latestTask) {
                  latestTask.toolCalls.push({
                    id: toolCall.callId,
                    tool: toolCall.name,
                    params: toolCall.args,
                    status: 'pending',
                    startedAt: new Date(),
                  });
                  latestTask.progress.currentStep = `Executing ${toolCall.name}`;
                  latestTask.progress.percentage = 50;
                  await latestTask.save();
                }

                try {
                  console.log(
                    `🛠️ Executing tool from conversation: ${toolCall.name}`,
                    {
                      callId: toolCall.callId,
                      argsKeys: Object.keys(toolCall.args || {}),
                    },
                  );

                  // Set up streaming callback for bash commands
                  console.log(`🔧 Setting up tool execution for ${toolCall.name}`);
                  if (['bash', 'run_bash_command', 'run_shell_command'].includes(toolCall.name)) {
                    executor.setOutputStreamCallback(toolCall.callId, (chunk: string) => {
                      // Stream bash output directly to the client
                      sendEvent(SSEEventType.ToolCallOutput, {
                        tool: toolCall.name,
                        callId: toolCall.callId,
                        output: chunk,
                      });
                    });
                  }

                  const toolResponse = await executor.executeToolCall(toolCall);
                  console.log(`✅ Tool execution completed for ${toolCall.name}:`, {
                    callId: toolCall.callId,
                    hasResponseParts: !!toolResponse.responseParts,
                    hasResultDisplay: !!toolResponse.resultDisplay,
                    error: !!toolResponse.error
                  });
                  allToolResponses.push(toolResponse);

                  // Update task with result
                  const taskAfterExecution = await Task.findById(task._id);
                  if (taskAfterExecution) {
                    const tc = taskAfterExecution.toolCalls.find(
                      (t: { id: string }) => t.id === toolCall.callId,
                    );
                    if (tc) {
                      tc.status = toolResponse.error ? 'failed' : 'completed';
                      tc.result = toolResponse.responseParts;
                      tc.completedAt = new Date();
                    }
                    await taskAfterExecution.save();
                  }

                  // Add to response parts with proper formatting
                  const outputText =
                    Array.isArray(toolResponse.responseParts) &&
                    toolResponse.responseParts.length > 0 &&
                    typeof toolResponse.responseParts[0] === 'object' &&
                    'text' in toolResponse.responseParts[0]
                      ? toolResponse.responseParts[0].text
                      : typeof toolResponse.responseParts === 'string'
                        ? toolResponse.responseParts
                        : JSON.stringify(toolResponse.responseParts);

                  toolResponses.parts.push({
                    functionResponse: {
                      id: toolCall.callId,
                      name: toolCall.name,
                      response: {
                        output: outputText,
                      },
                    },
                  });

                  // Update the corresponding tool call with result
                  const successToolCallIndex = conversationEvents.findIndex(
                    (event) =>
                      event.type === 'tool_call' &&
                      event.toolCall &&
                      event.toolCall.callId === toolCall.callId,
                  );

                  if (
                    successToolCallIndex !== -1 &&
                    conversationEvents[successToolCallIndex].toolCall
                  ) {
                    const responseText =
                      Array.isArray(toolResponse.responseParts) &&
                      toolResponse.responseParts.length > 0 &&
                      typeof toolResponse.responseParts[0] === 'object' &&
                      'text' in toolResponse.responseParts[0]
                        ? toolResponse.responseParts[0].text
                        : '';
                    (conversationEvents[successToolCallIndex].toolCall as any).result =
                      responseText;
                  }

                  // Update message with tool response
                  console.log(`🔍 Looking for tool call ${toolCall.callId} in message parts:`, 
                    aiMessage.parts.map((p: any) => ({
                      type: p.type,
                      id: p.type === 'tool-call' ? p.data?.id : 'n/a'
                    }))
                  );
                  
                  const toolCallPartIndex = aiMessage.parts.findIndex(
                    (part: any) =>
                      part.type === 'tool-call' &&
                      part.data.id === toolCall.callId,
                  );
                  
                  console.log(`🔍 Tool call part index: ${toolCallPartIndex}`);
                  
                  if (toolCallPartIndex !== -1) {
                    // Update the tool call part
                    (aiMessage.parts[toolCallPartIndex] as any).data.status = 'completed';
                    (aiMessage.parts[toolCallPartIndex] as any).data.result = toolResponse.resultDisplay || outputText;
                    
                    // Mark the parts array as modified for Mongoose
                    aiMessage.markModified('parts');
                    
                    // Debug log what we're storing
                    const resultValue = toolResponse.resultDisplay || outputText;
                    console.log(`💾 Storing tool response for ${toolCall.name}:`, {
                      callId: toolCall.callId,
                      status: 'completed',
                      resultType: toolResponse.resultDisplay ? 'resultDisplay' : 'outputText',
                      resultPreview: typeof resultValue === 'string' ? 
                        resultValue.substring(0, 100) + '...' : 
                        typeof resultValue === 'object' ? 'object' : 'unknown',
                      fullPart: (aiMessage.parts[toolCallPartIndex] as any).data
                    });
                  } else {
                    console.log(`⚠️ Tool call part not found for ${toolCall.name} (${toolCall.callId})`);
                  }
                  aiMessage.metadata.toolResponses = allToolResponses.length;
                  await aiMessage.save();

                  // Send tool call end event with result
                  sendEvent(SSEEventType.ToolCallEnd, {
                    tool: toolCall.name,
                    callId: toolCall.callId,
                    success: true,
                    result: outputText,
                    resultDisplay: toolResponse.resultDisplay,
                  });
                } catch (error) {
                  console.error(
                    `🚨 Tool execution failed for ${toolCall.name}:`,
                    {
                      callId: toolCall.callId,
                      error:
                        error instanceof Error
                          ? error.message
                          : 'Unknown error',
                      stack: error instanceof Error ? error.stack : undefined,
                      argsKeys: Object.keys(toolCall.args || {}),
                    },
                  );
                  const errorResponse: ToolCallResponseInfo = {
                    callId: toolCall.callId,
                    responseParts: [
                      {
                        text: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      },
                    ],
                    resultDisplay: undefined,
                    error:
                      error instanceof Error
                        ? error
                        : new Error('Unknown error'),
                    errorType: undefined,
                  };
                  allToolResponses.push(errorResponse);

                  // Add error response
                  toolResponses.parts.push({
                    functionResponse: {
                      id: toolCall.callId,
                      name: toolCall.name,
                      response: {
                        error:
                          error instanceof Error
                            ? error.message
                            : 'Unknown error',
                      },
                    },
                  });

                  // Update the corresponding tool call with error
                  const errorToolCallIndex = conversationEvents.findIndex(
                    (event) =>
                      event.type === 'tool_call' &&
                      event.toolCall &&
                      event.toolCall.callId === toolCall.callId,
                  );

                  if (
                    errorToolCallIndex !== -1 &&
                    conversationEvents[errorToolCallIndex].toolCall
                  ) {
                    (conversationEvents[errorToolCallIndex].toolCall as any).result = {
                      error:
                        error instanceof Error
                          ? error.message
                          : 'Unknown error',
                    };
                  }

                  // Update message with tool error
                  const errorToolCallPartIndex = aiMessage.parts.findIndex(
                    (part: any) =>
                      part.type === 'tool-call' &&
                      part.data.id === toolCall.callId,
                  );
                  if (errorToolCallPartIndex !== -1) {
                    (aiMessage.parts[errorToolCallPartIndex] as any).data.status = 'failed';
                    (aiMessage.parts[errorToolCallPartIndex] as any).data.error = error instanceof Error ? error.message : 'Unknown error';
                    // Also store error as result for consistency
                    (aiMessage.parts[errorToolCallPartIndex] as any).data.result = error instanceof Error ? error.message : 'Unknown error';
                    // Mark as modified for Mongoose
                    aiMessage.markModified('parts');
                  }
                  await aiMessage.save();

                  // Send tool call end event for error
                  sendEvent(SSEEventType.ToolCallEnd, {
                    tool: toolCall.name,
                    callId: toolCall.callId,
                    success: false,
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              }

              // Send tool responses back to AI for continuation
              await aiService.sendMessage(
                toolResponses.parts, // Send the function responses
                projectId,
                async (event) => {
                  switch (event.type) {
                    case GeminiEventType.Content:
                      // Buffer continuation text
                      currentTextBuffer += event.value;
                      responseChunks.push(event.value);
                      // Send content update event
                      sendEvent(SSEEventType.AIContent, {
                        content: event.value,
                      });
                      break;

                    case GeminiEventType.ToolCallRequest:
                      // Save any buffered text as an event and to message
                      if (currentTextBuffer) {
                        conversationEvents.push({
                          type: 'text',
                          content: currentTextBuffer,
                        });
                        
                        // Update message with continuation text
                        aiMessage.parts.push({ type: 'text', data: currentTextBuffer });
                        aiMessage.markModified('parts');
                        aiMessage.metadata.tokenCount = aiMessage.content.length;
                        await aiMessage.save();
                        
                        currentTextBuffer = '';
                      }
                      
                      // Queue up any new tool calls
                      pendingToolCalls.push(event.value);
                      allToolCalls.push(event.value);

                      // Also add to conversation events so they appear in the message
                      conversationEvents.push({
                        type: 'tool_call',
                        toolCall: event.value,
                      });

                      // Update message with tool call
                      aiMessage.parts.push({
                        type: 'tool-call',
                        data: {
                          id: event.value.callId,
                          tool: event.value.name,
                          params: event.value.args,
                          status: 'pending',
                        },
                      });
                      aiMessage.markModified('parts');
                      aiMessage.metadata.toolCalls = allToolCalls.length;
                      await aiMessage.save();

                      // Send tool call start event with parameters
                      sendEvent(SSEEventType.ToolCallStart, {
                        tool: event.value.name,
                        callId: event.value.callId,
                        params: event.value.args,
                      });
                      break;

                    case GeminiEventType.Error:
                      console.error('Continuation error:', event.value);
                      break;
                  }
                },
              );
            }

            // Save any remaining buffered text from continuation
            if (currentTextBuffer) {
              conversationEvents.push({
                type: 'text',
                content: currentTextBuffer,
              });
              
              // Update message with final continuation text
              aiMessage.parts.push({ type: 'text', data: currentTextBuffer });
              aiMessage.markModified('parts');
              aiMessage.metadata.tokenCount = aiMessage.content.length;
              await aiMessage.save();
              
              currentTextBuffer = '';
            }

            const response = responseChunks.join('');

            // Reload task to get latest state after all updates
            const finalTask = await Task.findById(task._id);
            if (!finalTask) {
              throw new Error('Task not found after processing');
            }

            // Update task as completed
            finalTask.status = 'completed';
            finalTask.progress.percentage = 100;
            finalTask.progress.currentStep = 'Completed';
            finalTask.progress.completedSteps = finalTask.progress.totalSteps;
            finalTask.results.push({
              type: 'ai_response',
              content: response,
              metadata: {
                model: aiConfig.model,
                toolCalls: allToolCalls.length,
                toolResponses: allToolResponses.length,
              },
            });
            await finalTask.save();

            // Update final message state
            // The message has been saved progressively, now just update final metadata
            aiMessage.content = response;
            aiMessage.taskId = finalTask._id.toString();
            aiMessage.metadata.tokenCount = response.length;
            aiMessage.metadata.toolCalls = allToolCalls.length;
            aiMessage.metadata.toolResponses = allToolResponses.length;
            
            // Debug: Log what we're saving
            console.log(`📝 Final message structure for ${aiMessage._id}:`, {
              partsCount: aiMessage.parts.length,
              partTypes: aiMessage.parts.map((p: any) => ({
                type: p.type,
                hasData: !!p.data,
                dataPreview: p.type === 'text' ? (p.data as string).substring(0, 50) + '...' : 
                             p.type === 'tool-call' ? `${(p.data as any).tool} - ${(p.data as any).status}` : 
                             'other'
              }))
            });
            
            await aiMessage.save();

            // Update project last accessed time
            await Project.findByIdAndUpdate(projectId, {
              lastAccessed: new Date(),
            });

            // Auto-commit and push any file changes made by tools
            try {
              await executor.commitChanges();
              console.log(
                '🔄 Auto-commit and push completed for project:',
                projectId,
              );
            } catch (commitError) {
              console.error(
                'Failed to auto-commit and push changes:',
                commitError,
              );
            }

            // Send completion event
            sendEvent(SSEEventType.AIComplete, {
              messageId: aiMessage._id,
              taskId: finalTask._id.toString(),
            });

            // Close the stream
            controller.close();
          } catch (aiError) {
            console.error('AI processing error:', aiError);
            console.error(
              'Stack trace:',
              aiError instanceof Error ? aiError.stack : 'No stack trace',
            );

            // Update task as failed
            const task = await Task.findOne({
              projectId,
              userId: user.userId,
            }).sort({ createdAt: -1 });
            if (task) {
              task.status = 'failed';
              task.error =
                aiError instanceof Error ? aiError.message : 'Unknown error';
              task.progress.currentStep = 'Failed';
              await task.save();
            }

            // Update AI message with error if it exists
            if (aiMessage) {
              aiMessage.content = 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.';
              if (!aiMessage.parts.some((part: any) => part.type === 'text' && part.data.includes('error'))) {
                aiMessage.parts.push({
                  type: 'text',
                  data: 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
                });
                aiMessage.markModified('parts');
              }
              aiMessage.metadata.error = aiError instanceof Error ? aiError.message : 'Unknown error';
              await aiMessage.save();
            } else {
              // If aiMessage wasn't created yet, create an error message
              const errorMessage = new Message({
                projectId,
                userId: user.userId,
                role: 'assistant',
                content: 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
                parts: [{
                  type: 'text',
                  data: 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
                }],
                parentMessageId: userMessage._id.toString(),
                metadata: {
                  error: aiError instanceof Error ? aiError.message : 'Unknown error',
                },
              });
              await errorMessage.save();
            }

            // Send error event
            sendEvent(SSEEventType.Error, {
              error: 'AI processing failed',
              message:
                aiError instanceof Error ? aiError.message : 'Unknown error',
            });

            controller.close();
          }
        },
      });

      // Return the streaming response
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      console.error('Error sending message:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
