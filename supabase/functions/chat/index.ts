import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeUserClient, makeClient } from '../_shared/supabase.ts';

const OLLAMA_URL   = () => Deno.env.get('OLLAMA_CLOUD_URL')   ?? 'https://api.ollama.com/v1';
const OLLAMA_TOKEN = () => Deno.env.get('OLLAMA_CLOUD_TOKEN') ?? '';
const OLLAMA_MODEL = () => Deno.env.get('OLLAMA_CLOUD_MODEL') ?? 'gemma4:31b-cloud';

// Set CHAT_RESULT_CAP to a number to limit results returned to the AI (e.g. "50").
// Leave unset for no cap — safe when user count is low.
const resultCap = (): number | undefined => {
  const val = Deno.env.get('CHAT_RESULT_CAP');
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) || n <= 0 ? undefined : n;
};

// ── Intent detection ──────────────────────────────────────────────────────────

type QueryIntent =
  | 'owned_search'     // "what Charizard cards do I own"
  | 'set_completion'   // "what's missing from Base Set"
  | 'all_sets'         // "which sets am I closest to completing"
  | 'filter_type'      // "what fire type cards do I have"
  | 'filter_supertype' // "what trainer cards do I own"
  | 'filter_subtype'   // "what Stage 2 Pokémon do I have"
  | 'filter_rarity'    // "show me my rarest / most valuable cards"
  | 'foil'             // "what 1st edition cards do I have"
  | 'duplicates'       // "what cards can I trade"
  | 'region'           // "what Kanto cards do I own"
  | 'general';

interface Intent {
  type: QueryIntent;
  filterType?: string;
  filterSupertype?: string;
  filterSubtype?: string;
  foilKeyword?: string;
  regionMin?: number;
  regionMax?: number;
}

const REGIONS: Record<string, [number, number]> = {
  kanto: [1, 151], johto: [152, 251], hoenn: [252, 386],
  sinnoh: [387, 493], unova: [494, 649], kalos: [650, 721],
  alola: [722, 809], galar: [810, 905], paldea: [906, 1025],
};

const TCG_TYPES = [
  'fire', 'water', 'grass', 'electric', 'psychic',
  'fighting', 'darkness', 'metal', 'dragon', 'fairy', 'colorless',
];

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  const ownsWord = /\b(own|have|my|got|do i)\b/.test(m);

  // Duplicates — check before owned so "extra copies" doesn't fall through
  if (/\b(duplicate|trade away|tradeable|spare|extra cop|get rid|sell)\b/.test(m)) {
    return { type: 'duplicates' };
  }

  // Foil / edition
  if (/\b(1st edition|first edition|1st ed)\b/.test(m))  return { type: 'foil', foilKeyword: '1stEdition' };
  if (/\breverse\s*holo\b/.test(m))                       return { type: 'foil', foilKeyword: 'reverseHolofoil' };
  if (/\bholofoil\b/.test(m))                             return { type: 'foil', foilKeyword: 'holofoil' };
  if (/\bholo\b/.test(m) && ownsWord)                    return { type: 'foil', foilKeyword: 'holofoil' };

  // Region
  for (const [name, [min, max]] of Object.entries(REGIONS)) {
    if (m.includes(name)) return { type: 'region', regionMin: min, regionMax: max };
  }

  // Set completion
  if (/\b(missing|complet|finish.*set|how many.*from|need.*complet)\b/.test(m)) {
    return { type: 'set_completion' };
  }
  if (/\b(closest.*complet|most.*complet|which set.*complet|nearly complet)\b/.test(m)) {
    return { type: 'all_sets' };
  }

  // Supertype (before type to avoid trainer/energy confusing type detection)
  if (/\btrainer\b/.test(m) && ownsWord) {
    return { type: 'filter_supertype', filterSupertype: 'Trainer' };
  }
  if (/\benergy\b/.test(m) && ownsWord) {
    return { type: 'filter_supertype', filterSupertype: 'Energy' };
  }

  // Subtype
  if (/\bstage\s*2\b/.test(m))                          return { type: 'filter_subtype', filterSubtype: 'Stage 2' };
  if (/\bstage\s*1\b/.test(m))                          return { type: 'filter_subtype', filterSubtype: 'Stage 1' };
  if (/\bbasic\s*pok[eé]mon\b/.test(m))                 return { type: 'filter_subtype', filterSubtype: 'Basic' };
  if (/\bgx\b/.test(m) && ownsWord)                     return { type: 'filter_subtype', filterSubtype: 'GX' };
  if (/\bvmax\b/.test(m))                               return { type: 'filter_subtype', filterSubtype: 'VMAX' };
  if (/\bv\b/.test(m) && ownsWord && !/vmax/.test(m))  return { type: 'filter_subtype', filterSubtype: 'V' };
  if (/\bmega\b/.test(m) && ownsWord)                   return { type: 'filter_subtype', filterSubtype: 'MEGA' };
  if (/\b(ex card|\bex\b)/.test(m) && ownsWord)         return { type: 'filter_subtype', filterSubtype: 'EX' };

  // Type filter
  for (const t of TCG_TYPES) {
    if (new RegExp(`\\b${t}\\b`).test(m) && ownsWord) {
      return { type: 'filter_type', filterType: t.charAt(0).toUpperCase() + t.slice(1) };
    }
  }

  // Rarity / value — owned
  if (/\b(rarest|valuable|worth|expensive|price|market)\b/.test(m) && ownsWord) {
    return { type: 'filter_rarity' };
  }

  // Collection-aware generic
  if (ownsWord) return { type: 'owned_search' };

  return { type: 'general' };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CardRow = {
  card_id: string; name: string; set_name: string; set_id?: string;
  types: string[]; supertype?: string; subtypes?: string[];
  rarity: string; hp: string; evolves_from: string | null;
  similarity?: number; market_price?: number;
  foil_type?: string; quantity?: number; extras?: number;
  national_pokedex_numbers?: number[];
};

type SetRow = {
  set_id: string; set_name: string;
  total_in_set: number; owned_in_set: number; completion_pct: number;
};

type SetCompRow = {
  total_in_set: number; owned_in_set: number;
  completion_pct: number; missing_card_ids: string[] | null;
};

type OwnedEntry = { card_id: string; quantity: number; foil_type: string | null };

// ── Embed ─────────────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  // @ts-ignore — Supabase.ai available in edge runtime
  const session = new Supabase.ai.Session('gte-small');
  const result = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(result as ArrayLike<number>);
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatCard(
  c: CardRow,
  ownedMap: Map<string, { quantity: number; foil_type: string | null }>,
): string {
  // foil_type on the row itself means this came from a foil/tradeable query
  const owned = ownedMap.get(c.card_id);
  const ownerStr = c.foil_type != null
    ? `(you own ${c.quantity ?? 1}x, ${c.foil_type})`
    : owned
      ? `(you own ${owned.quantity}x${owned.foil_type ? `, ${owned.foil_type}` : ''})`
      : '(not in your collection)';
  const price   = c.market_price ? ` | ~$${c.market_price.toFixed(2)}` : '';
  const subtype = c.subtypes?.length ? ` [${c.subtypes.join('/')}]` : '';
  const type    = c.types?.join('/') ?? c.supertype ?? '';
  return `- ${c.name}${subtype} [${c.card_id}] from ${c.set_name} | ${type} | ${c.rarity} | HP: ${c.hp ?? '—'}${c.evolves_from ? ` | Evolves from: ${c.evolves_from}` : ''}${price} ${ownerStr}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url  = new URL(req.url);
  const path = url.pathname.replace(/.*\/chat\/?/, '');

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Unauthorized', 401);

  try {
    const userClient = makeUserClient(authHeader);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return err('Unauthorized', 401);

    // ── POST /chat/feedback ────────────────────────────────────────────────
    if (req.method === 'POST' && path === 'feedback') {
      const { message, reply, rating, note, pageContext, intent } = await req.json();
      if (![1, -1].includes(rating)) return err('rating must be 1 or -1', 400);
      const { error: fbErr } = await userClient.from('chat_feedback').insert({
        user_id: user.id,
        message: message ?? '',
        reply:   reply   ?? '',
        rating,
        note:         note        ?? null,
        page_context: pageContext  ?? null,
        intent:       intent       ?? null,
      });
      if (fbErr) return err('Failed to save feedback', 500);
      return json({ success: true });
    }

    if (req.method !== 'POST') return err('Method not allowed', 405);

    const body = await req.json();
    const { message, pageContext } = body;
    if (!message?.trim()) return err('message is required', 400);

    // Embed query and fetch collection in parallel
    const [queryEmbedding, ownedResult] = await Promise.all([
      embed(message),
      userClient.from('collection').select('card_id, quantity, foil_type'),
    ]);

    const owned: OwnedEntry[] = ownedResult.data ?? [];
    const ownedMap = new Map(owned.map(r => [r.card_id, { quantity: r.quantity, foil_type: r.foil_type }]));
    const ownedIds = Array.from(ownedMap.keys());
    const totalCards = owned.reduce((s, r) => s + r.quantity, 0);

    const intent = detectIntent(message);
    const contextLines: string[] = [];
    let limitWarning = '';

    // ── Route by intent ────────────────────────────────────────────────────
    if (intent.type === 'owned_search') {
      const cap = resultCap();
      const [ownedMatches, globalMatches] = await Promise.all([
        ownedIds.length > 0
          ? userClient.rpc('match_owned_cards', { query_embedding: queryEmbedding, owned_card_ids: ownedIds, ...(cap ? { match_count: cap } : {}) })
          : Promise.resolve({ data: [] }),
        userClient.rpc('match_cards', { query_embedding: queryEmbedding, ...(cap ? { match_count: cap } : {}) }),
      ]);
      const seen = new Set<string>();
      for (const c of [...(ownedMatches.data ?? []), ...(globalMatches.data ?? [])]) {
        if (!seen.has(c.card_id)) { seen.add(c.card_id); contextLines.push(formatCard(c, ownedMap)); }
      }

    } else if (intent.type === 'set_completion') {
      const setId = pageContext?.setId;
      if (setId) {
        const { data } = await userClient.rpc('get_set_completion', {
          p_set_id: setId, owned_card_ids: ownedIds,
        }) as { data: SetCompRow[] };
        const r = data?.[0];
        if (r) {
          contextLines.push(`Set "${setId}": ${r.owned_in_set}/${r.total_in_set} cards owned (${r.completion_pct}% complete).`);
          const missing = r.missing_card_ids ?? [];
          if (missing.length === 0) {
            contextLines.push('You own every card in this set!');
          } else {
            contextLines.push(`Missing (${missing.length} cards): ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? ` … and ${missing.length - 30} more` : ''}`);
            if (missing.length > 30) limitWarning = `Only the first 30 missing card IDs are shown; ${missing.length - 30} more exist.`;
          }
        }
      } else {
        limitWarning = 'No specific set was detected from your message. Try asking this while viewing a set page, or include the set name.';
      }
      // Add global vector context for discovery flavour
      const { data: gm } = await userClient.rpc('match_cards', { query_embedding: queryEmbedding, match_count: 6 });
      (gm ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));

    } else if (intent.type === 'all_sets') {
      const { data } = await userClient.rpc('get_all_set_completion', { owned_card_ids: ownedIds }) as { data: SetRow[] };
      const rows = data ?? [];
      rows.slice(0, 15).forEach(r =>
        contextLines.push(`- ${r.set_name}: ${r.owned_in_set}/${r.total_in_set} (${r.completion_pct}%)`)
      );
      if (rows.length > 15) limitWarning = `Showing top 15 of ${rows.length} sets you have cards from.`;

    } else if (intent.type === 'filter_type') {
      const { data } = await userClient.rpc('collection_by_filter', {
        owned_card_ids: ownedIds, p_type: intent.filterType ?? null, p_limit: resultCap() ?? 9999,
      });
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));

    } else if (intent.type === 'filter_supertype') {
      const { data } = await userClient.rpc('collection_by_filter', {
        owned_card_ids: ownedIds, p_supertype: intent.filterSupertype ?? null, p_limit: resultCap() ?? 9999,
      });
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));

    } else if (intent.type === 'filter_subtype') {
      const { data } = await userClient.rpc('collection_by_filter', {
        owned_card_ids: ownedIds, p_subtype: intent.filterSubtype ?? null, p_limit: resultCap() ?? 9999,
      });
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));

    } else if (intent.type === 'filter_rarity') {
      const { data } = await userClient.rpc('collection_by_filter', {
        owned_card_ids: ownedIds, p_limit: resultCap() ?? 9999,
      });
      contextLines.push('Your cards sorted by market price (highest first):');
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));

    } else if (intent.type === 'foil') {
      const { data } = await userClient.rpc('get_collection_with_foil', {
        p_foil_type: intent.foilKeyword ?? null,
      });
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));
      if (!(data?.length)) limitWarning = `No cards found matching foil type "${intent.foilKeyword}".`;

    } else if (intent.type === 'duplicates') {
      const { data } = await userClient.rpc('get_tradeable_cards');
      if (!data?.length) {
        contextLines.push('You have no duplicate cards.');
      } else {
        (data ?? []).forEach((c: CardRow) =>
          contextLines.push(`- ${c.name} [${c.card_id}] from ${c.set_name} | qty: ${c.quantity} (${c.extras} extra${(c.extras ?? 0) !== 1 ? 's' : ''}) | ${c.rarity}${c.foil_type ? ` | ${c.foil_type}` : ''}`)
        );
      }

    } else if (intent.type === 'region') {
      const { data } = await userClient.rpc('get_collection_by_region', {
        owned_card_ids: ownedIds, min_dex: intent.regionMin, max_dex: intent.regionMax,
      });
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));
      if (!(data?.length)) limitWarning = 'No owned cards found for that region.';

    } else {
      // General: global vector search only
      const { data } = await userClient.rpc('match_cards', { query_embedding: queryEmbedding, ...(resultCap() ? { match_count: resultCap() } : {}) });
      (data ?? []).forEach((c: CardRow) => contextLines.push(formatCard(c, ownedMap)));
    }

    // ── Build system prompt ────────────────────────────────────────────────
    const collectionSummary = `The user owns ${ownedMap.size} unique cards (${totalCards} total including duplicates).`;
    const pageCtx = pageContext
      ? `Current page: ${pageContext.page ?? 'unknown'}${pageContext.setId ? `, set: ${pageContext.setId}` : ''}${pageContext.regionId ? `, region: ${pageContext.regionId}` : ''}.`
      : '';

    const systemPrompt = `You are a helpful Pokémon TCG collection assistant.

${collectionSummary}
${pageCtx}
Query type: ${intent.type}

Card data:
${contextLines.join('\n') || 'No matching cards found for this query.'}

${limitWarning ? `⚠️ Data note: ${limitWarning}` : ''}

Instructions:
- Reference specific cards using their ID in brackets, e.g. [base1-4].
- If for any reason data appears incomplete, say so honestly.
- Prices shown are last-synced market prices, not live. Say so if asked about current value.
- If a question requires data you do not have (live prices, other users' collections, price trends), say so clearly rather than guessing.
- Keep responses concise and friendly.`;

    // ── Call Ollama Cloud ──────────────────────────────────────────────────
    const t0 = Date.now();
    const ollamaRes = await fetch(`${OLLAMA_URL()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OLLAMA_TOKEN()}`,
      },
      body: JSON.stringify({
        model:    OLLAMA_MODEL(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: message },
        ],
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      console.error('Ollama error:', await ollamaRes.text());
      return err('AI service unavailable', 502);
    }

    const ollamaData = await ollamaRes.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const reply = ollamaData.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';
    const latencyMs = Date.now() - t0;

    // Fire-and-forget chat log (service role bypasses RLS)
    makeClient().from('chat_logs').insert({
      user_id:            user.id,
      message,
      reply,
      intent:             intent.type,
      latency_ms:         latencyMs,
      prompt_tokens:      ollamaData.usage?.prompt_tokens      ?? null,
      completion_tokens:  ollamaData.usage?.completion_tokens  ?? null,
      context_card_count: contextLines.length,
    }).then(() => {}).catch((e: unknown) => console.error('chat_log insert failed:', e));

    const mentionedCardIds = [...reply.matchAll(/\[([a-z0-9]+-[a-zA-Z0-9]+)\]/g)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6);

    return json({ reply, cardIds: mentionedCardIds, intent: intent.type });

  } catch (e) {
    console.error('Chat error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
