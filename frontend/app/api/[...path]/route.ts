/**
 * Catch-all proxy for /api/* → Cloud Run backend.
 *
 * next.config.js rewrites do not forward headers modified by Edge Middleware,
 * so we proxy here in the Node.js runtime where we have full header control.
 * The API_GATEWAY_KEY is injected server-side; any client-supplied x-api-key
 * is stripped to prevent spoofing.
 */
import { type NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8500';

const API_KEY = process.env.API_GATEWAY_KEY;

async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const upstream = `${BACKEND_URL}${pathname}${search}`;

  const headers = new Headers(request.headers);
  headers.delete('x-api-key');
  if (API_KEY) headers.set('x-api-key', API_KEY);
  // Remove headers that cause issues when proxying
  headers.delete('host');
  headers.delete('connection');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  const fetchInit: RequestInit & { duplex?: string } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? 'half' : undefined,
  };

  const upstreamResponse = await fetch(upstream, fetchInit);

  const responseHeaders = new Headers(upstreamResponse.headers);
  // Remove hop-by-hop headers
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
