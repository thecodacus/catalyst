import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { Task } from '@/lib/db/schemas/task';

interface RouteParams {
  params: Promise<{
    taskId: string;
  }>;
}

// POST /api/tasks/[taskId]/cancel - Cancel task
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withAuth(request, async (req, user) => {
    try {
      const { taskId } = await params;
      await connectMongoose();

      const task = await Task.findOne({
        _id: taskId,
        userId: user.userId,
        status: { $in: ['queued', 'processing'] },
      });

      if (!task) {
        return NextResponse.json(
          { error: 'Task not found or cannot be cancelled' },
          { status: 404 },
        );
      }

      // Update task status
      task.status = 'cancelled';
      task.cancelledBy = user.userId;
      task.completedAt = new Date();
      task.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Task cancelled by user',
        data: null,
      });

      await task.save();

      // TODO: Cancel task in queue if still pending

      return NextResponse.json({ success: true, task });
    } catch (error) {
      console.error('Error cancelling task:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
