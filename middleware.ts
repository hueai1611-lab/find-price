import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Lightweight internal gate: HTTP Basic Auth when both env vars are set.
 * If `BASIC_AUTH_USER` or `BASIC_AUTH_PASSWORD` is missing, auth is skipped.
 */
export function middleware(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) {
    return unauthorized();
  }

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const colon = decoded.indexOf(':');
  if (colon === -1) {
    return unauthorized();
  }

  const u = decoded.slice(0, colon);
  const p = decoded.slice(colon + 1);

  if (u !== user || p !== password) {
    return unauthorized();
  }

  return NextResponse.next();
}

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Internal"',
    },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
