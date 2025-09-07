import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const JWT_SECRET =
  process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: string;
  email?: string;
  plan?: 'free' | 'pro' | 'enterprise';
}

export function generateToken(
  payload: Partial<TokenPayload> & { userId: string },
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

export async function getCurrentUser(
  request: NextRequest,
): Promise<TokenPayload | null> {
  try {
    // First check Authorization header
    let token = getTokenFromRequest(request);
    let tokenSource = 'header';

    // If not in header, check cookies
    if (!token) {
      const cookieStore = await cookies();
      const authCookie = cookieStore.get('auth-token');
      token = authCookie?.value || null;
      tokenSource = 'cookie';
    }

    if (!token) return null;

    const payload = verifyToken(token);
    console.log(`[AUTH] User authenticated from ${tokenSource}:`, {
      userId: payload.userId,
      email: payload.email,
      path: request.nextUrl.pathname,
    });
    
    return payload;
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error);
    return null;
  }
}
