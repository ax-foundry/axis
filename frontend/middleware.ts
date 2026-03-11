import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const apiKey = process.env.API_GATEWAY_KEY;

  // Clone headers, stripping any client-provided X-Api-Key to prevent spoofing
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-api-key');

  if (apiKey) {
    requestHeaders.set('x-api-key', apiKey);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
