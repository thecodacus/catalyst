import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Project } from '@/lib/db/schemas/project';
import { Types } from 'mongoose';
import { MessageService } from '@/lib/ai/services/message-service';
import { ConversationService } from '@/lib/ai/services/conversation-service';
import { StreamingService } from '@/lib/ai/services/streaming-service';

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
      const messageService = new MessageService();
      const messages = await messageService.getConversationHistory(projectId);

      return NextResponse.json(messages);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
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

      // Create a ReadableStream for SSE
      const stream = new ReadableStream({
        async start(controller) {
          const streamingService = new StreamingService(controller);
          const conversationService = new ConversationService();

          try {
            await conversationService.processMessage(
              projectId,
              message,
              {
                userId: user.userId,
                email: user.email || '',
              },
              streamingService
            );
          } catch (error) {
            console.error('Error processing message:', error);
            streamingService.sendError(
              'Processing failed',
              error instanceof Error ? error.message : 'Unknown error'
            );
            streamingService.close();
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