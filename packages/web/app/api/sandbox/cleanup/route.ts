import { NextRequest, NextResponse } from 'next/server';
import { getCodeSandboxService } from '@/lib/sandbox/codesandbox-service';

// POST /api/sandbox/cleanup - Clean up inactive sandboxes
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication to protect this endpoint
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.SANDBOX_CLEANUP_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { maxInactiveMinutes = 30 } = await request.json().catch(() => ({}));

    const sandboxService = getCodeSandboxService();
    await sandboxService.cleanupInactiveSandboxes(maxInactiveMinutes);

    return NextResponse.json({
      success: true,
      message: `Cleanup completed for sandboxes inactive for ${maxInactiveMinutes} minutes`,
    });
  } catch (error) {
    console.error('Sandbox cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup sandboxes' },
      { status: 500 }
    );
  }
}

// GET /api/sandbox/cleanup - Get cleanup status
export async function GET() {
  try {
    const { SandboxSession } = await import('@/lib/db/schemas/sandbox-session');
    const { connectMongoose } = await import('@/lib/db/mongodb');
    
    await connectMongoose();
    
    const stats = await SandboxSession.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          oldestAccess: { $min: '$lastAccessedAt' },
          newestAccess: { $max: '$lastAccessedAt' }
        }
      }
    ]);

    const totalSandboxes = await SandboxSession.countDocuments();
    const inactiveThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const needsCleanup = await SandboxSession.countDocuments({
      status: 'active',
      lastAccessedAt: { $lt: inactiveThreshold }
    });

    return NextResponse.json({
      totalSandboxes,
      needsCleanup,
      stats: stats.reduce((acc, stat) => {
        acc[stat._id] = {
          count: stat.count,
          oldestAccess: stat.oldestAccess,
          newestAccess: stat.newestAccess
        };
        return acc;
      }, {} as Record<string, any>)
    });
  } catch (error) {
    console.error('Error getting sandbox stats:', error);
    return NextResponse.json(
      { error: 'Failed to get sandbox statistics' },
      { status: 500 }
    );
  }
}