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

          try {
            // Send user message event
            sendEvent(SSEEventType.UserMessage, { messageId: userMessage._id });

            // Initialize AI service for CodeSandbox VM environment
            const aiConfig: AIServiceConfig = {
              // The AI service will auto-detect the provider based on environment variables
              // SandboxConfig will handle the sandbox repo paths properly
              targetDir: SANDBOX_REPO_PATH,
              cwd: SANDBOX_REPO_PATH,
              isSandboxed: true,
              sandboxId: projectId, // We'll use projectId as the sandbox identifier
            };

            const aiService = await getAIService(aiConfig);
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

            // Send AI start event
            sendEvent(SSEEventType.AIStart, { taskId: task._id });

            await aiService.sendMessage(message, projectId, async (event) => {
              switch (event.type) {
                case GeminiEventType.Content:
                  // Buffer text content
                  currentTextBuffer += event.value;
                  responseChunks.push(event.value);

                  // Send content update event
                  sendEvent(SSEEventType.AIContent, { content: event.value });
                  break;

                case GeminiEventType.ToolCallRequest:
                  // Save any buffered text as an event
                  if (currentTextBuffer) {
                    conversationEvents.push({
                      type: 'text',
                      content: currentTextBuffer,
                    });
                    currentTextBuffer = '';
                  }

                  // Add tool call event
                  conversationEvents.push({
                    type: 'tool_call',
                    toolCall: event.value,
                  });
                  pendingToolCalls.push(event.value);
                  allToolCalls.push(event.value);

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
                    conversationEvents[successToolCallIndex].toolCall!.result =
                      responseText;
                  }

                  // Send tool call end event with result
                  sendEvent(SSEEventType.ToolCallEnd, {
                    tool: toolCall.name,
                    callId: toolCall.callId,
                    success: true,
                    result: outputText,
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
                    conversationEvents[errorToolCallIndex].toolCall!.result = {
                      error:
                        error instanceof Error
                          ? error.message
                          : 'Unknown error',
                    };
                  }

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
                      responseChunks.push(event.value);
                      // We don't add to conversationEvents here because we'll handle
                      // all remaining text at the end
                      // Send content update event
                      sendEvent(SSEEventType.AIContent, {
                        content: event.value,
                      });
                      break;

                    case GeminiEventType.ToolCallRequest:
                      // Queue up any new tool calls
                      pendingToolCalls.push(event.value);
                      allToolCalls.push(event.value);

                      // Also add to conversation events so they appear in the message
                      conversationEvents.push({
                        type: 'tool_call',
                        toolCall: event.value,
                      });

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

            // Create message parts in the correct order from conversation events
            const messageParts = [];
            let fullContent = '';

            // Add text before tool responses (collected during initial response)
            conversationEvents.forEach((event) => {
              if (event.type === 'text') {
                fullContent += event.content || '';
                messageParts.push({
                  type: 'text',
                  data: event.content || '',
                });
              } else if (event.type === 'tool_call' && event.toolCall) {
                messageParts.push({
                  type: 'tool-call',
                  data: {
                    id: event.toolCall.callId,
                    tool: event.toolCall.name,
                    params: event.toolCall.args,
                    status: 'completed',
                    result: event.toolCall.result, // Include the result we set earlier
                  },
                });
              }
            });

            // Add any remaining response chunks that came after tool calls
            const remainingText = responseChunks
              .join('')
              .substring(fullContent.length);
            if (remainingText) {
              messageParts.push({
                type: 'text',
                data: remainingText,
              });
            }

            // Create AI response message with ordered parts
            const aiMessage = new Message({
              projectId,
              userId: user.userId,
              role: 'assistant',
              content: response,
              parts: messageParts,
              taskId: finalTask._id.toString(),
              parentMessageId: userMessage._id.toString(),
              metadata: {
                model: aiConfig.model,
                tokenCount: response.length, // Rough estimate
                toolCalls: allToolCalls.length,
                toolResponses: allToolResponses.length,
                hasTask: true,
              },
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

            // Create fallback AI message
            const fallbackMessage = new Message({
              projectId,
              userId: user.userId,
              role: 'assistant',
              content:
                'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
              parts: [
                {
                  type: 'text',
                  data: 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
                },
              ],
              parentMessageId: userMessage._id.toString(),
              metadata: {
                error:
                  aiError instanceof Error ? aiError.message : 'Unknown error',
              },
            });

            await fallbackMessage.save();

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
