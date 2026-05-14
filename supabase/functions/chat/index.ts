import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient } from '../_shared/supabase.ts';

const OLLAMA_URL   = () => Deno.env.get('OLLAMA_CLOUD_URL') ?? 'https://api.ollama.com/v1';
const OLLAMA_TOKEN = () => Deno.env.get('OLLAMA_CLOUD_TOKEN') ?? '';
const OLLAMA_MODEL = () => Deno.env.get('OLLAMA_CLOUD_MODEL') ?? 'gemma4:31b-cloud';
const MATCH_COUNT  = 8;

interface ChatRequest {
  message: string;
  collectionId: string;
  pageContext?: {
    page?: string;
    setId?: string;
    regionId?: string;
    visibleCardIds?: string[];
  };
}

async function embed(text: string): Promise<number[]> {
  // @ts-ignore — Supabase AI session available in edge runtime
  const session = new Supabase.ai.Session('gte-small');
  const result = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(result as ArrayLike<number>);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('Method not allowed', 405);

  try {
    const body: ChatRequest = await req.json();
    const { message, collectionId, pageContext } = body;

    if (!message?.trim()) return err('message is required', 400);
    if (!collectionId?.trim()) return err('collectionId is required', 400);

    const supabase = makeClient();

    // Embed the query
    const queryEmbedding = await embed(message);

    // Vector search for relevant cards
    const { data: matchedCards } = await supabase.rpc('match_cards', {
      query_embedding: queryEmbedding,
      match_count: MATCH_COUNT,
    });

    // Get what the user owns
    const { data: owned } = await supabase
      .from('collection')
      .select('card_id, quantity, foil_type')
      .eq('collection_id', collectionId.trim().toUpperCase());

    const ownedMap = new Map(
      (owned ?? []).map((r: { card_id: string; quantity: number; foil_type: string | null }) =>
        [r.card_id, { quantity: r.quantity, foil_type: r.foil_type }]
      )
    );

    // Build context for the prompt
    const cardContext = (matchedCards ?? [])
      .map((c: { card_id: string; name: string; set_name: string; types: string[]; rarity: string; hp: string; evolves_from: string }) => {
        const owned = ownedMap.get(c.card_id);
        const ownership = owned
          ? `(you own ${owned.quantity}x${owned.foil_type ? `, ${owned.foil_type}` : ''})`
          : '(not in your collection)';
        return `- ${c.name} [${c.card_id}] from ${c.set_name} | ${c.types?.join('/')} | ${c.rarity} | HP: ${c.hp}${c.evolves_from ? ` | Evolves from: ${c.evolves_from}` : ''} ${ownership}`;
      })
      .join('\n');

    const collectionSummary = `The user's collection ID is "${collectionId}". They own ${ownedMap.size} unique cards.`;

    const pageCtx = pageContext
      ? `Current page: ${pageContext.page ?? 'unknown'}${pageContext.setId ? `, viewing set: ${pageContext.setId}` : ''}${pageContext.regionId ? `, region: ${pageContext.regionId}` : ''}.`
      : '';

    const systemPrompt = `You are a helpful Pokémon TCG collection assistant. You help users track, understand, and grow their card collections.

${collectionSummary}
${pageCtx}

Relevant cards from the database:
${cardContext || 'No specific cards matched this query.'}

Answer the user's question conversationally. When referencing specific cards, include their card ID in brackets like [base1-4]. Keep responses concise and friendly. If asked about card values, note that prices fluctuate.`;

    // Call Ollama Cloud (OpenAI-compatible)
    const ollamaRes = await fetch(`${OLLAMA_URL()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OLLAMA_TOKEN()}`,
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      console.error('Ollama error:', errText);
      return err('AI service unavailable', 502);
    }

    const ollamaData = await ollamaRes.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const reply = ollamaData.choices?.[0]?.message?.content ?? 'Sorry, I could not generate a response.';

    // Extract card IDs mentioned in the reply for inline display
    const mentionedCardIds = [...reply.matchAll(/\[([a-z0-9]+-[a-zA-Z0-9]+)\]/g)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6);

    return json({ reply, cardIds: mentionedCardIds });
  } catch (e) {
    console.error('Chat error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
