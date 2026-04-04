import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

function getAuthHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const userId = request.headers.get('x-user-id');
  if (userId) {
    headers['X-User-Id'] = userId;
  }

  return headers;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, agent = 'chatbot', thread_id, model, stream_tokens = true, query_mode = 'normal' } = body;

  const params = new URLSearchParams({ agent_id: agent });
  const url = `${BACKEND_URL}/agent/stream?${params.toString()}`;

  const headers = getAuthHeaders(request);

  const backendResponse = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      agent,
      thread_id,
      model,
      stream_tokens,
      query_mode,
    }),
  });

  if (!backendResponse.ok) {
    const error = await backendResponse.text();
    return new Response(error, { status: backendResponse.status });
  }

  return new Response(backendResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}