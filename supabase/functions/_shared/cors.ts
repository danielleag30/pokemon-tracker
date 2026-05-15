// In production, set the ALLOWED_ORIGIN secret to your frontend domain (e.g. https://your-app.vercel.app).
// Falls back to '*' when not set, which is acceptable for local development only.
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
