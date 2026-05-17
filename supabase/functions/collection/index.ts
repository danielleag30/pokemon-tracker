import { corsHeaders, corsResponse, json, err } from '../_shared/cors.ts';
import { makeUserClient } from '../_shared/supabase.ts';

async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { uid: null, userClient: null };

  const userClient = makeUserClient(authHeader);
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { uid: null, userClient: null };
  return { uid: user.id, userClient };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/(?:functions\/v1\/)?collection\/?/, '')
    .replace(/^\//, '');

  const { uid, userClient } = await getUser(req);
  if (!uid || !userClient) return err('Unauthorized', 401);

  try {
    // GET /stats
    if (req.method === 'GET' && path === 'stats') {
      const [{ count: unique }, totalRes, dupRes, bindersRes] = await Promise.all([
        userClient.from('collection').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        userClient.from('collection').select('quantity').eq('user_id', uid),
        userClient.from('collection').select('*', { count: 'exact', head: true }).eq('user_id', uid).gt('quantity', 1),
        userClient.from('collection').select('binder_tag').eq('user_id', uid).not('binder_tag', 'is', null),
      ]);

      const total = totalRes.data?.reduce((s: number, r: { quantity: number }) => s + r.quantity, 0) ?? 0;

      const binderMap: Record<string, number> = {};
      for (const row of (bindersRes.data ?? []) as { binder_tag: string }[]) {
        if (row.binder_tag) binderMap[row.binder_tag] = (binderMap[row.binder_tag] ?? 0) + 1;
      }
      const binders = Object.entries(binderMap)
        .map(([binder_tag, count]) => ({ binder_tag, count }))
        .sort((a, b) => b.count - a.count);

      return json({ uniqueCards: unique ?? 0, totalCards: total, duplicates: dupRes.count ?? 0, binders });
    }

    // GET /export
    if (req.method === 'GET' && path === 'export') {
      const { data } = await userClient
        .from('collection').select('*').eq('user_id', uid).order('card_id');
      return new Response(
        JSON.stringify({ exportDate: new Date().toISOString(), version: '2.0', collection: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="pokemon-collection.json"' } }
      );
    }

    // GET / — list all
    if (req.method === 'GET' && path === '') {
      const { data, error } = await userClient
        .from('collection').select('*').eq('user_id', uid).order('added_at', { ascending: false });
      if (error) return err(error.message);
      return json(data);
    }

    // POST /import
    if (req.method === 'POST' && path === 'import') {
      const body = await req.json();
      const { collection, merge = true } = body;
      if (!Array.isArray(collection)) return err('collection must be an array', 400);

      const rows = collection.map((c: { card_id: string; quantity?: number; binder_tag?: string | null }) => ({
        card_id: c.card_id,
        user_id: uid,
        quantity: c.quantity ?? 1,
        binder_tag: c.binder_tag ?? null,
      }));

      if (merge) {
        const { data: existing } = await userClient
          .from('collection')
          .select('card_id, quantity')
          .in('card_id', rows.map(r => r.card_id));

        const existingMap = new Map(
          (existing ?? []).map((e: { card_id: string; quantity: number }) => [e.card_id, e.quantity])
        );

        const mergedRows = rows.map(row => ({
          ...row,
          quantity: (existingMap.get(row.card_id) ?? 0) + row.quantity,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await userClient.from('collection')
          .upsert(mergedRows, { onConflict: 'card_id,user_id' });
        if (error) return err(error.message);
      } else {
        const { error } = await userClient.from('collection')
          .upsert(rows, { onConflict: 'card_id,user_id' });
        if (error) return err(error.message);
      }

      return json({ success: true, imported: rows.length });
    }

    // POST /batch
    if (req.method === 'POST' && path === 'batch') {
      const { cards } = await req.json();
      if (!Array.isArray(cards)) return err('cards must be an array', 400);

      const results = [];
      for (const c of cards as { cardId: string; quantity?: number; binderTag?: string | null; foilType?: string | null }[]) {
        const { data: existing } = await userClient
          .from('collection').select('*').eq('card_id', c.cardId).eq('user_id', uid).single();

        if (existing) {
          const { data } = await userClient.from('collection')
            .update({
              quantity: existing.quantity + (c.quantity ?? 1),
              binder_tag: c.binderTag ?? existing.binder_tag,
              foil_type: c.foilType ?? existing.foil_type,
              updated_at: new Date().toISOString(),
            })
            .eq('card_id', c.cardId).eq('user_id', uid).select().single();
          results.push(data);
        } else {
          const { data } = await userClient.from('collection')
            .insert({ card_id: c.cardId, user_id: uid, quantity: c.quantity ?? 1, binder_tag: c.binderTag ?? null, foil_type: c.foilType ?? null })
            .select().single();
          results.push(data);
        }
      }

      return json({ success: true, entries: results });
    }

    // POST / — add one
    if (req.method === 'POST' && path === '') {
      const { cardId, quantity = 1, binderTag, foilType } = await req.json();
      if (!cardId) return err('cardId required', 400);

      const { data: existing } = await userClient
        .from('collection').select('*').eq('card_id', cardId).eq('user_id', uid).single();

      if (existing) {
        const { data } = await userClient.from('collection')
          .update({
            quantity: existing.quantity + quantity,
            binder_tag: binderTag ?? existing.binder_tag,
            foil_type: foilType ?? existing.foil_type,
            updated_at: new Date().toISOString(),
          })
          .eq('card_id', cardId).eq('user_id', uid).select().single();
        return json(data);
      }

      const { data, error } = await userClient.from('collection')
        .insert({ card_id: cardId, user_id: uid, quantity, binder_tag: binderTag ?? null, foil_type: foilType ?? null })
        .select().single();
      if (error) return err(error.message);
      return json(data);
    }

    // PUT /:cardId
    if (req.method === 'PUT') {
      const cardId = decodeURIComponent(path);
      const { quantity, binderTag, foilType } = await req.json();

      const { data: existing } = await userClient
        .from('collection').select('*').eq('card_id', cardId).eq('user_id', uid).single();
      if (!existing) return err('Card not in collection', 404);

      if (quantity !== undefined && quantity <= 0) {
        await userClient.from('collection').delete().eq('card_id', cardId).eq('user_id', uid);
        return json({ deleted: true });
      }

      const { data, error } = await userClient.from('collection')
        .update({
          quantity: quantity ?? existing.quantity,
          binder_tag: binderTag !== undefined ? binderTag : existing.binder_tag,
          foil_type: foilType ?? existing.foil_type,
          updated_at: new Date().toISOString(),
        })
        .eq('card_id', cardId).eq('user_id', uid).select().single();
      if (error) return err(error.message);
      return json(data);
    }

    // DELETE /:cardId
    if (req.method === 'DELETE') {
      const cardId = decodeURIComponent(path);
      const { error, count } = await userClient
        .from('collection').delete({ count: 'exact' }).eq('card_id', cardId).eq('user_id', uid);
      if (error) return err(error.message);
      if ((count ?? 0) === 0) return err('Card not found', 404);
      return json({ success: true });
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
