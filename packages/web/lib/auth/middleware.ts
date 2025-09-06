import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, TokenPayload } from './jwt';

export async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest, user: TokenPayload) => Promise<NextResponse | Response>,
) {
  const user = await getCurrentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handler(request, user);
}

export async function optionalAuth(
  request: NextRequest,
  handler: (
    req: NextRequest,
    user: TokenPayload | null,
  ) => Promise<NextResponse | Response>,
) {
  const user = await getCurrentUser(request);
  return handler(request, user);
}
