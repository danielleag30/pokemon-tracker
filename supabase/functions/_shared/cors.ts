// Allowed browser origins, comma-separated, in the ALLOWED_ORIGIN secret.
//
// The native iOS build is not served from the Vercel domain. WKWebView gives
// Capacitor its own origin (capacitor://localhost, or https://localhost when
// the scheme is overridden), so a single hard-coded origin blocks the app at
// the door. Access-Control-Allow-Origin accepts exactly one value, never a
// list, so the matching origin has to be echoed back per request -- which
// means the header cannot be a static constant any more.
//
// Falls back to '*' when ALLOWED_ORIGIN is unset, which keeps
// `supabase functions serve` usable locally.

const NATIVE_ORIGINS = [
  'capacitor://localhost', // Capacitor iOS default scheme
  'ionic://localhost',     // older Capacitor/Ionic builds
  'https://localhost',     // when iosScheme is overridden to https
];

const configured = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowlist = new Set([...configured, ...NATIVE_ORIGINS]);
const allowAll = configured.length === 0;

function resolveOrigin(requestOrigin: string | null): string {
  if (allowAll) return '*';
  if (requestOrigin && allowlist.has(requestOrigin)) return requestOrigin;
  // Deny by default: hand back the primary web origin so a request from
  // anywhere else fails the browser's own check.
  return configured[0];
}

const METHOD_AND_HEADER_POLICY = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Kept for the handful of call sites that spread these into a Response they
// build themselves. The origin here is a placeholder: serveWithCors
// overwrites Access-Control-Allow-Origin on the way out, per request.
export const corsHeaders = {
  ...METHOD_AND_HEADER_POLICY,
  'Access-Control-Allow-Origin': allowAll ? '*' : configured[0],
};

export function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function err(message: string, status = 500) {
  return json({ error: message }, status);
}

// Drop-in replacement for Deno.serve: same arity, so handlers need no other
// change. Answers preflight itself and stamps the correct origin onto every
// response the handler produces, including ones built with `new Response`.
export function serveWithCors(handler: (req: Request) => Response | Promise<Response>) {
  Deno.serve(async (req) => {
    const origin = resolveOrigin(req.headers.get('Origin'));

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...METHOD_AND_HEADER_POLICY, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' },
      });
    }

    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  });
}
