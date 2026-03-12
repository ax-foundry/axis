import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Set AUTH_REQUIRED=false to disable authentication (e.g. local dev or staging).
// Defaults to enabled when unset.
export async function middleware(request: NextRequest) {
  if (process.env.AUTH_REQUIRED === 'false') {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signIn = new URL('/auth/signin', request.url);
    signIn.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!auth/|api/auth|api/config|_next/static|_next/image|favicon\\.ico).*)'],
};
