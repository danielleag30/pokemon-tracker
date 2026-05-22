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
    // GET /users — list all users with card counts
    if (req.method === 'GET' && path === 'users') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_users');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // POST /users — create a user
    if (req.method === 'POST' && path === 'users') {
      const { username, pin, realEmail, isChild } = await req.json();
      if (!username || !pin || !realEmail) return err('username, pin, realEmail required', 400);
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return err('Invalid username format', 400);
      if (!/^\d{6}$/.test(pin)) return err('PIN must be exactly 6 digits', 400);

      const { data: existing } = await serviceClient
        .from('profiles').select('username').eq('username', username).maybeSingle();
      if (existing) return err('Username already taken', 409);

      const synthetic = `${username.toLowerCase()}@pokemontracker.app`;
      const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
        email: synthetic, password: pin, email_confirm: true,
      });
      if (authErr || !authData.user) return err(authErr?.message ?? 'Failed to create user', 500);

      const { error: profileErr } = await serviceClient.from('profiles').insert({
        id: authData.user.id, username, synthetic_email: synthetic,
        real_email: realEmail, is_child: isChild === true,
      });
      if (profileErr) {
        await serviceClient.auth.admin.deleteUser(authData.user.id);
        return err('Failed to save profile: ' + profileErr.message, 500);
      }
      return json({ success: true }, 201);
    }

    // PATCH /users/:id — reset PIN or toggle is_child
    const patchMatch = path.match(/^users\/([^/]+)$/);
    if (req.method === 'PATCH' && patchMatch) {
      const userId = patchMatch[1];
      const body = await req.json();

      if ('resetPin' in body) {
        if (!/^\d{6}$/.test(body.resetPin)) return err('PIN must be exactly 6 digits', 400);
        const { error: updErr } = await serviceClient.auth.admin.updateUserById(userId, { password: body.resetPin });
        if (updErr) return err(updErr.message, 500);
        return json({ success: true });
      }

      if ('isChild' in body) {
        const { error: updErr } = await serviceClient
          .from('profiles').update({ is_child: !!body.isChild }).eq('id', userId);
        if (updErr) return err(updErr.message, 500);
        return json({ success: true });
      }

      return err('Nothing to update', 400);
    }

    // DELETE /users/:id — delete user (cascades collection, chat_logs, feedback)
    if (req.method === 'DELETE' && patchMatch) {
      const userId = patchMatch[1];
      const { error: delErr } = await serviceClient.auth.admin.deleteUser(userId);
      if (delErr) return err(delErr.message, 500);
      return json({ success: true });
    }

    // GET /users/:id/logs — per-user chat history
    const userLogsMatch = path.match(/^users\/([^/]+)\/logs$/);
    if (req.method === 'GET' && userLogsMatch) {
      const userId = userLogsMatch[1];
      const { data, error: qErr } = await serviceClient.rpc('admin_get_user_chat_logs', { p_user_id: userId });
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /metrics — aggregate stats
    if (req.method === 'GET' && path === 'metrics') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_metrics');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /logs — paginated chat log
    if (req.method === 'GET' && path === 'logs') {
      const limit  = Math.min(200, parseInt(url.searchParams.get('limit')  ?? '100', 10));
      const offset = Math.max(0,   parseInt(url.searchParams.get('offset') ?? '0',   10));
      const { data, error: qErr } = await serviceClient.rpc('admin_get_chat_logs', { p_limit: limit, p_offset: offset });
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /logs/volume — chats per day (last 30 days)
    if (req.method === 'GET' && path === 'logs/volume') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_chat_volume');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /logs/intents — intent frequency breakdown
    if (req.method === 'GET' && path === 'logs/intents') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_intent_breakdown');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /feedback/chat
    if (req.method === 'GET' && path === 'feedback/chat') {
      const { data, error: qErr } = await serviceClient.rpc('admin_get_chat_feedback');
      if (qErr) return err(qErr.message);
      return json(data);
    }

    // GET /feedback/general
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
