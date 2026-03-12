import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

// Set AUTH_REQUIRED=false to disable authentication (e.g. local dev or staging).
// Defaults to enabled when unset.
const authRequired = process.env.AUTH_REQUIRED !== 'false';

export default authRequired
  ? withAuth({ pages: { signIn: '/auth/signin' } })
  : () => NextResponse.next();

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon\\.ico).*)'],
};
