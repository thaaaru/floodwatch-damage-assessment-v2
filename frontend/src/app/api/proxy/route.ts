import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');

  if (!path) {
    return NextResponse.json(
      { error: 'Missing path parameter' },
      { status: 400 }
    );
  }

  try {
    const apiUrl = `https://api.hackandbuild.dev${path}`;
    const url = new URL(apiUrl);

    // Preserve query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== 'path') {
        url.searchParams.append(key, value);
      }
    });

    // Different timeouts for different endpoints
    let timeoutMs = 15000; // default 15 seconds
    if (path.includes('/forecast/all')) {
      timeoutMs = 5000; // forecast is slow, timeout faster
    } else if (path.includes('/weather/all')) {
      timeoutMs = 10000; // weather needs more time
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url.toString(), {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: request.method === 'GET' ? undefined : await request.text(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Try to parse JSON, but handle non-JSON responses gracefully
    let data;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseError) {
        console.error(`JSON parse error for ${path}:`, parseError);
        return NextResponse.json(
          { error: 'Invalid JSON response from API' },
          { status: 502 }
        );
      }
    } else {
      // Non-JSON response - likely an error page or timeout
      const text = await response.text();
      console.warn(`Non-JSON response from ${path}: ${response.status} ${contentType}`);

      if (!response.ok) {
        return NextResponse.json(
          { error: `API returned ${response.status}`, path },
          { status: response.status }
        );
      }

      data = { raw: text };
    }

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`Request timeout for ${path}`);
      return NextResponse.json(
        { error: 'Request timeout - backend service slow to respond' },
        { status: 504 }
      );
    }

    console.error(`Proxy error for ${path}:`, error.message);
    return NextResponse.json(
      { error: 'Proxy request failed', details: error.message },
      { status: 500 }
    );
  }
}
