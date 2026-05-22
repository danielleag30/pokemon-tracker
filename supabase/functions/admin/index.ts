import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, makeUserClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Unauthorized', 401);

  const userClient = makeUserClient(authHeader);
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return err('Unauthorized', 401);

  // Check admin using service client to bypass RLS
  const serviceClient = makeClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return err('Forbidden', 403);

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/(?:functions\/v1\/)?admin\/?/, '')
    .replace(/^\//, '');

  try {
    // GET /users — profiles joined with card counts via SQL
    if (req.method === 'GET' && path === 'users') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_users');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /feedback/chat — chat_feedback joined with profiles via SQL
    if (req.method === 'GET' && path === 'feedback/chat') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_chat_feedback');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /feedback/general — general_feedback joined with profiles via SQL
    if (req.method === 'GET' && path === 'feedback/general') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_general_feedback');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
