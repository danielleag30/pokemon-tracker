import { corsHeaders, corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient } from '../_shared/supabase.ts';

function cid(url: URL): string {
  return (url.searchParams.get('c') ?? 'default').trim().toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  // Strip /functions/v1/collection prefix to get the sub-path
  const path = url.pathname
    .replace(/^\/(?:functions\/v1\/)?collection\/?/, '')
    .replace(/^\//, '');
  const supabase = makeClient();

  try {
    // GET /stats
    if (req.method === 'GET' && path === 'stats') {
      const id = cid(url);
      const [{ count: unique }, totalRes, dupRes, bindersRes] = await Promise.all([
        supabase.from('collection').select('*', { count: 'exact', head: true }).eq('collection_id', id),
        supabase.from('collection').select('quantity').eq('collection_id', id),
        supabase.from('collection').select('*', { count: 'exact', head: true }).eq('collection_id', id).gt('quantity', 1),
        supabase.from('collection').select('binder_tag').eq('collection_id', id).not('binder_tag', 'is', null),
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
      const { data } = await supabase
        .from('collection').select('*').eq('collection_id', cid(url)).order('card_id');
      return new Response(
        JSON.stringify({ exportDate: new Date().toISOString(), version: '1.0', collection: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="pokemon-collection.json"' } }
      );
    }

    // GET / — list all
    if (req.method === 'GET' && path === '') {
      const { data, error } = await supabase
        .from('collection').select('*').eq('collection_id', cid(url)).order('added_at', { ascending: false });
      if (error) return err(error.message);
      return json(data);
    }

    // POST /import
    if (req.method === 'POST' && path === 'import') {
      const body = await req.json();
      const { collection, merge = true } = body;
      if (!Array.isArray(collection)) return err('collection must be an array', 400);
      const id = cid(url);

      const rows = collection.map((c: { card_id: string; quantity?: number; binder_tag?: string | null }) => ({
        card_id: c.card_id,
        collection_id: id,
        quantity: c.quantity ?? 1,
        binder_tag: c.binder_tag ?? null,
      }));

      if (merge) {
        const { data: existing } = await supabase
          .from('collection')
          .select('card_id, quantity')
          .eq('collection_id', id)
          .in('card_id', rows.map(r => r.card_id));

        const existingMap = new Map(
          (existing ?? []).map((e: { card_id: string; quantity: number }) => [e.card_id, e.quantity])
        );

        const mergedRows = rows.map(row => ({
          ...row,
          quantity: (existingMap.get(row.card_id) ?? 0) + row.quantity,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('collection')
          .upsert(mergedRows, { onConflict: 'card_id,collection_id' });
        if (error) return err(error.message);
      } else {
        const { error } = await supabase.from('collection')
          .upsert(rows, { onConflict: 'card_id,collection_id' });
        if (error) return err(error.message);
      }

      return json({ success: true, imported: rows.length });
    }

    // POST /batch
    if (req.method === 'POST' && path === 'batch') {
      const { cards } = await req.json();
      if (!Array.isArray(cards)) return err('cards must be an array', 400);
      const id = cid(url);

      const results = [];
      for (const c of cards as { cardId: string; quantity?: number; binderTag?: string | null; foilType?: string | null }[]) {
        const { data: existing } = await supabase
          .from('collection').select('*').eq('card_id', c.cardId).eq('collection_id', id).single();

        if (existing) {
          const { data } = await supabase.from('collection')
            .update({
              quantity: existing.quantity + (c.quantity ?? 1),
              binder_tag: c.binderTag ?? existing.binder_tag,
              foil_type: c.foilType ?? existing.foil_type,
              updated_at: new Date().toISOString(),
            })
            .eq('card_id', c.cardId).eq('collection_id', id).select().single();
          results.push(data);
        } else {
          const { data } = await supabase.from('collection')
            .insert({ card_id: c.cardId, collection_id: id, quantity: c.quantity ?? 1, binder_tag: c.binderTag ?? null, foil_type: c.foilType ?? null })
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
      const id = cid(url);

      const { data: existing } = await supabase
        .from('collection').select('*').eq('card_id', cardId).eq('collection_id', id).single();

      if (existing) {
        const { data } = await supabase.from('collection')
          .update({
            quantity: existing.quantity + quantity,
            binder_tag: binderTag ?? existing.binder_tag,
            foil_type: foilType ?? existing.foil_type,
            updated_at: new Date().toISOString(),
          })
          .eq('card_id', cardId).eq('collection_id', id).select().single();
        return json(data);
      }

      const { data, error } = await supabase.from('collection')
        .insert({ card_id: cardId, collection_id: id, quantity, binder_tag: binderTag ?? null, foil_type: foilType ?? null })
        .select().single();
      if (error) return err(error.message);
      return json(data);
    }

    // PUT /:cardId
    if (req.method === 'PUT') {
      const cardId = decodeURIComponent(path);
      const { quantity, binderTag, foilType } = await req.json();
      const id = cid(url);

      const { data: existing } = await supabase
        .from('collection').select('*').eq('card_id', cardId).eq('collection_id', id).single();
      if (!existing) return err('Card not in collection', 404);

      if (quantity !== undefined && quantity <= 0) {
        await supabase.from('collection').delete().eq('card_id', cardId).eq('collection_id', id);
        return json({ deleted: true });
      }

      const { data, error } = await supabase.from('collection')
        .update({
          quantity: quantity ?? existing.quantity,
          binder_tag: binderTag !== undefined ? binderTag : existing.binder_tag,
          foil_type: foilType ?? existing.foil_type,
          updated_at: new Date().toISOString(),
        })
        .eq('card_id', cardId).eq('collection_id', id).select().single();
      if (error) return err(error.message);
      return json(data);
    }

    // DELETE /:cardId
    if (req.method === 'DELETE') {
      const cardId = decodeURIComponent(path);
      const { error, count } = await supabase
        .from('collection').delete({ count: 'exact' }).eq('card_id', cardId).eq('collection_id', cid(url));
      if (error) return err(error.message);
      if ((count ?? 0) === 0) return err('Card not found', 404);
      return json({ success: true });
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
