import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { connectMongoose } from '@/lib/db/mongodb';
import { User } from '@/lib/db/schemas/user';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  return withAuth(request, async (_req, authUser) => {
    try {
      await connectMongoose();
      let paramsObj = await params;

      // Get user with GitHub access token
      const fullUser = await User.findById(authUser.userId).select(
        '+githubAccessToken',
      );

      if (!fullUser?.githubAccessToken) {
        return NextResponse.json(
          { error: 'GitHub not connected', requiresAuth: true },
          { status: 403 },
        );
      }

      // Fetch branches from GitHub
      const branchesResponse = await fetch(
        `https://api.github.com/repos/${paramsObj.owner}/${paramsObj.repo}/branches`,
        {
          headers: {
            Authorization: `Bearer ${fullUser.githubAccessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      if (!branchesResponse.ok) {
        if (branchesResponse.status === 401) {
          // Token is invalid
          return NextResponse.json(
            { error: 'GitHub token expired', requiresAuth: true },
            { status: 403 },
          );
        }

        throw new Error('Failed to fetch branches');
      }

      const branches = await branchesResponse.json();

      return NextResponse.json(branches);
    } catch (error) {
      console.error('GitHub branches error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch branches' },
        { status: 500 },
      );
    }
  });
}
