// api/e.ts — Analytics forwarder.
//
// The browser posts events to this same-origin path; this function relays them
// to our Umami instance. It replaces a static rewrite in vercel.json, for one
// reason: a rewrite has to name the destination in a committed file, and this
// repo is mirrored publicly. Here the address is an environment variable, so it
// is not in the repository at all and the mirror cannot leak it by omission.
//
// The client contract is unchanged — src/lib/analytics.ts still posts to
// /api/e, so the CSP still sees a same-origin request and there is still no
// third-party script anywhere in the page.
//
// Edge runtime: this runs near the visitor rather than in one fixed region,
// which keeps European traffic in Europe on its way to an instance in fra1.
// It also needs no Node APIs — everything below is Web-standard.

export const config = { runtime: 'edge' };

// No @types/node in this project, and an edge function has no Node APIs beyond
// this. Declaring the shape locally beats pulling in the whole Node surface.
declare const process: { env: Record<string, string | undefined> };

/** Nine enum-only events; none comes close. Anything larger is not ours. */
const MAX_BODY_BYTES = 2048;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }

  const upstream = process.env.UMAMI_URL;
  if (!upstream) {
    // Misconfigured rather than misused. The client swallows every failure, so
    // this is invisible to users but plain in the network tab when looking.
    return new Response(null, { status: 503 });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  // A public POST path deserves a shape check. It cannot be used as an open
  // proxy — the destination is fixed — but this keeps junk out of the dataset.
  try {
    const parsed = JSON.parse(body);
    if (parsed?.type !== 'event' || typeof parsed?.payload?.name !== 'string') {
      return new Response(null, { status: 400 });
    }
  } catch {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Umami derives browser and device from the user-agent, and needs a
        // real one at all — it drops requests without it.
        'User-Agent': request.headers.get('user-agent') ?? '',
        // Without this the visitor hash would be computed from this function's
        // address, collapsing every visitor into one and quietly making the
        // visitor counts wrong rather than absent.
        'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
      },
      body,
    });
    return new Response(null, { status: res.ok ? 204 : 502 });
  } catch {
    // Upstream unreachable — a dropped analytics event is not worth an error.
    return new Response(null, { status: 502 });
  }
}
