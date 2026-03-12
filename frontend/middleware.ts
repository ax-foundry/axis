import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Set AUTH_REQUIRED=false to disable authentication (e.g. local dev or staging).
// Defaults to enabled when unset.
const authRequired = process.env.AUTH_REQUIRED !== 'false';

export default authRequired
  ? withAuth({ pages: { signIn: '/auth/signin' } })
  : function middleware(_request: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon\\.ico).*)'],
};
