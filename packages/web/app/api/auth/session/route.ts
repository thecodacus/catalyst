import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, tokenPayload) => {
    try {
      await connectMongoose();

      const user = await User.findById(tokenPayload.userId);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        user: user.toJSON(),
      });
    } catch (error) {
      console.error('Session error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  });
}
