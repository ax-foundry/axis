import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// API key injection is handled in app/api/[...path]/route.ts (Node.js runtime)
// so that headers are reliably forwarded to the Cloud Run backend.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}
