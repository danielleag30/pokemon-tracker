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
    // GET /users
    if (req.method === 'GET' && path === 'users') {
      const { data, error: qErr } = await serviceClient
        .from('profiles')
        .select('id, username, is_child, created_at')
        .order('created_at', { ascending: false });
      if (qErr) return err(qErr.message);

      // Get card counts per user
      const { data: collectionData } = await serviceClient
        .from('collection')
        .select('user_id, card_id');

      const countMap: Record<string, number> = {};
      for (const row of (collectionData ?? []) as { user_id: string; card_id: string }[]) {
        countMap[row.user_id] = (countMap[row.user_id] ?? 0) + 1;
      }

      const users = (data ?? []).map((p: { id: string; username: string; is_child: boolean; created_at: string }) => ({
        ...p,
        card_count: countMap[p.id] ?? 0,
      }));

      return json(users);
    }

    // GET /feedback/chat
    if (req.method === 'GET' && path === 'feedback/chat') {
      const { data, error: qErr } = await serviceClient
        .from('chat_feedback')
        .select('id, user_id, message, reply, rating, note, page_context, intent, created_at, profiles(username)')
        .order('created_at', { ascending: false });
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /feedback/general
    if (req.method === 'GET' && path === 'feedback/general') {
      const { data, error: qErr } = await serviceClient
        .from('general_feedback')
        .select('id, user_id, rating, note, created_at, profiles(username)')
        .order('created_at', { ascending: false });
      if (qErr) return err(qErr.message);
      return json(data);
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
