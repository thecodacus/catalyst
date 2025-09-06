import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths that require authentication
const protectedPaths = ['/dashboard', '/projects', '/settings'];

// Paths that should redirect to dashboard if authenticated
const authPaths = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path requires authentication
  const isProtectedPath = protectedPaths.some((path) =>
    pathname.startsWith(path),
  );
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path));

  // Get the token from cookies (Next.js will set this when using API routes)
  const token = request.cookies.get('auth-token');

  if (isProtectedPath && !token) {
    // Redirect to login if accessing protected route without token
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isAuthPath && token) {
    // Redirect to dashboard if accessing auth pages while logged in
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
