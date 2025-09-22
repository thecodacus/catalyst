import { Content, Part } from '@google/generative-ai';
import OpenAI from 'openai';

// Types for function calls and responses
interface FunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

interface FunctionResponse {
  id?: string;
  name?: string;
  response: string | Record<string, unknown>;
}

/**
 * Utility class for converting between Gemini and OpenAI message formats
 * Replicates the logic from OpenAIContentGenerator
 */
export class OpenAIConverter {
  /**
   * Convert Gemini Content array to OpenAI messages format
   */
  static convertToOpenAIFormat(
    contents: Content[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    console.log('🔍 Converting contents to OpenAI format:', contents.length, 'entries');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      console.log(`📝 Processing content[${i}]:`, {
        role: typeof content === 'object' ? content.role : 'string',
        partsCount: typeof content === 'object' && content.parts ? content.parts.length : 0,
      });
      if (typeof content === 'string') {
        messages.push({ role: 'user' as const, content });
      } else if ('role' in content && 'parts' in content) {
        // Check if this content has function calls or responses
        const functionCalls: FunctionCall[] = [];
        const functionResponses: FunctionResponse[] = [];
        const textParts: string[] = [];

        for (const part of content.parts || []) {
          if (typeof part === 'string') {
            textParts.push(part);
          } else if ('text' in part && part.text) {
            textParts.push(part.text);
          } else if ('functionCall' in part && part.functionCall) {
            functionCalls.push(part.functionCall);
            console.log('  🔧 Found functionCall:', part.functionCall.name, part.functionCall.id);
          } else if ('functionResponse' in part && part.functionResponse) {
            functionResponses.push(part.functionResponse);
            console.log('  📤 Found functionResponse:', {
              id: part.functionResponse.id,
              name: part.functionResponse.name,
              response: part.functionResponse.response,
            });
          }
        }

        // Handle function responses (tool results)
        if (functionResponses.length > 0) {
          for (const funcResponse of functionResponses) {
            let responseContent: string;
            
            // Handle different response formats
            if (typeof funcResponse.response === 'string') {
              responseContent = funcResponse.response;
            } else if (typeof funcResponse.response === 'object' && funcResponse.response !== null) {
              // Handle { output: "..." } format
              if ('output' in funcResponse.response && typeof funcResponse.response.output === 'string') {
                responseContent = funcResponse.response.output;
              } else if ('error' in funcResponse.response) {
                responseContent = `Error: ${funcResponse.response.error}`;
              } else {
                // Fallback to JSON string
                responseContent = JSON.stringify(funcResponse.response);
              }
            } else {
              responseContent = String(funcResponse.response);
            }
            
            const toolMessage = {
              role: 'tool' as const,
              tool_call_id: funcResponse.id || '',
              content: responseContent,
            };
            console.log('  ✅ Creating tool message:', toolMessage);
            messages.push(toolMessage);
          }
        }
        // Handle model messages with function calls
        else if (content.role === 'model' && functionCalls.length > 0) {
          const toolCalls = functionCalls.map((fc, index) => ({
            id: fc.id || `call_${index}`,
            type: 'function' as const,
            function: {
              name: fc.name || '',
              arguments: JSON.stringify(fc.args || {}),
            },
          }));

          messages.push({
            role: 'assistant' as const,
            content: textParts.join('\n') || null,
            tool_calls: toolCalls,
          });
        }
        // Handle regular text messages
        else {
          const role =
            content.role === 'model'
              ? ('assistant' as const)
              : ('user' as const);
          const text = textParts.join('\n');
          if (text || content.role === 'user') {
            messages.push({ role, content: text });
          }
        }
      }
    }

    console.log('📊 Total messages before cleanup:', messages.length);
    messages.forEach((msg, idx) => {
      console.log(`  [${idx}] ${msg.role}:`, 
        msg.role === 'tool' ? `tool_call_id=${(msg as any).tool_call_id}` : 
        msg.role === 'assistant' && (msg as any).tool_calls ? `${(msg as any).tool_calls.length} tool calls` : 
        'text message'
      );
    });
    
    // Clean up orphaned tool calls to prevent OpenAI API errors
    const cleaned = OpenAIConverter.cleanOrphanedToolCalls(messages);
    console.log('📊 Total messages after cleanup:', cleaned.length);
    return cleaned;
  }

  /**
   * Clean up orphaned tool calls from message history to prevent OpenAI API errors
   */
  private static cleanOrphanedToolCalls(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const cleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const toolCallIds = new Set<string>();
    const toolResponseIds = new Set<string>();

    // First pass: collect all tool call IDs and tool response IDs
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            toolCallIds.add(toolCall.id);
          }
        }
      } else if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        toolResponseIds.add(message.tool_call_id);
      }
    }

    // Second pass: filter out orphaned messages
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        // Filter out tool calls that don't have corresponding responses
        const validToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && toolResponseIds.has(toolCall.id),
        );

        if (validToolCalls.length > 0) {
          // Keep the message but only with valid tool calls
          const cleanedMessage = { ...message };
          cleanedMessage.tool_calls = validToolCalls;
          cleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          // Keep the message if it has text content, but remove tool calls
          const cleanedMessage = { ...message };
          delete (cleanedMessage as any).tool_calls;
          cleaned.push(cleanedMessage);
        }
        // If no valid tool calls and no content, skip the message entirely
      } else if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        // Only keep tool responses that have corresponding tool calls
        if (toolCallIds.has(message.tool_call_id)) {
          cleaned.push(message);
        }
      } else {
        // Keep all other messages as-is
        cleaned.push(message);
      }
    }

    return cleaned;
  }

  /**
   * Merge consecutive assistant messages to avoid OpenAI errors
   */
  static mergeConsecutiveMessages(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const merged: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'assistant' && merged.length > 0) {
        const lastMessage = merged[merged.length - 1];

        // If the last message is also an assistant message, merge them
        if (lastMessage.role === 'assistant') {
          // Combine content
          const combinedContent = [
            typeof lastMessage.content === 'string' ? lastMessage.content : '',
            typeof message.content === 'string' ? message.content : '',
          ]
            .filter(Boolean)
            .join('\n');

          // Combine tool calls
          const lastToolCalls =
            'tool_calls' in lastMessage ? lastMessage.tool_calls || [] : [];
          const currentToolCalls =
            'tool_calls' in message ? message.tool_calls || [] : [];
          const combinedToolCalls = [...lastToolCalls, ...currentToolCalls];

          // Update the last message with combined data
          (lastMessage as any).content = combinedContent || null;
          if (combinedToolCalls.length > 0) {
            (lastMessage as any).tool_calls = combinedToolCalls;
          }

          continue; // Skip adding the current message since it's been merged
        }
      }

      // Add the message as-is if no merging is needed
      merged.push(message);
    }

    return merged;
  }
}