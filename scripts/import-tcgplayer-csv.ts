/**
 * Imports a TCGPlayer portfolio CSV export into a specific user's collection.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx ts-node scripts/import-tcgplayer-csv.ts <path-to-export.csv> <username>
 *
 * Example:
 *   SUPABASE_SERVICE_KEY=... npx ts-node scripts/import-tcgplayer-csv.ts ~/Downloads/export.csv brantley
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const SUPABASE_URL = 'https://wmwpjkfgapqyyjsjuhos.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const TCG_API_BASE = 'https://api.pokemontcg.io/v2';

if (!SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY env var before running.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// TCGPlayer set names that differ from the TCG API set names
const SET_NAME_ALIASES: Record<string, string> = {
  'black and white':                           'black & white',
  'black and white promos':                    'bw black star promos',
  'diamond and pearl':                         'diamond & pearl',
  'ex deoxys':                                 'deoxys',
  'ex holon phantoms':                         'holon phantoms',
  'ex ruby & sapphire':                        'ruby & sapphire',
  'hidden fates: shiny vault':                 'hidden fates shiny vault',
  'legendary treasures: radiant collections':  'legendary treasures',
  "mcdonald's 25th anniversary promos":        "mcdonald's collection 2021",
  "mcdonald's promos 2011":                    "mcdonald's collection 2011",
  "mcdonald's promos 2019":                    "mcdonald's collection 2019",
  "mcdonald's promos 2022":                    "mcdonald's collection 2022",
  "mcdonald's promos 2023":                    "mcdonald's collection 2023",
  'pokemon go':                                'pokémon go',
  'scarlet & violet base set':                 'scarlet & violet',
  'scarlet & violet promo':                    'scarlet & violet black star promos',
  'shining fates: shiny vault':                'shining fates shiny vault',
  'sun & moon base set':                       'sun & moon',
  'sun & moon promo':                          'sm black star promos',
  'sv: 151':                                   '151',
  'sword & shield base set':                   'sword & shield',
  'sword & shield promo':                      'swsh black star promos',
  'undaunted':                                 'hs—undaunted',
  'xy base set':                               'xy',
  'xy promo':                                  'xy black star promos',
};

// Map TCGPlayer "Variance" column → app foil_type
const VARIANCE_TO_FOIL: Record<string, string | null> = {
  'Normal':                 'normal',
  'Reverse Holofoil':       'reverseHolofoil',
  'Holofoil':               'holofoil',
  '1st Edition':            '1stEditionNormal',
  'Poke Ball Reverse Holo': 'reverseHolofoil',
};

interface CsvRow {
  portfolioName: string;
  category:      string;
  setName:       string;
  productName:   string;
  cardNumber:    string;
  rarity:        string;
  variance:      string;
  grade:         string;
  condition:     string;
  avgCostPaid:   string;
  quantity:      number;
  marketPrice:   string;
  priceOverride: string;
  watchlist:     string;
  dateAdded:     string;
  notes:         string;
}

function parseCSV(filePath: string): CsvRow[] {
  const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  // Skip header
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 11) continue;
    rows.push({
      portfolioName: cols[0]?.trim() ?? '',
      category:      cols[1]?.trim() ?? '',
      setName:       cols[2]?.trim() ?? '',
      productName:   cols[3]?.trim() ?? '',
      cardNumber:    cols[4]?.trim() ?? '',
      rarity:        cols[5]?.trim() ?? '',
      variance:      cols[6]?.trim() ?? '',
      grade:         cols[7]?.trim() ?? '',
      condition:     cols[8]?.trim() ?? '',
      avgCostPaid:   cols[9]?.trim() ?? '',
      quantity:      parseInt(cols[10]?.trim() ?? '1', 10) || 1,
      marketPrice:   cols[11]?.trim() ?? '',
      priceOverride: cols[12]?.trim() ?? '',
      watchlist:     cols[13]?.trim() ?? '',
      dateAdded:     cols[14]?.trim() ?? '',
      notes:         cols[15]?.trim() ?? '',
    });
  }
  return rows;
}

// Simple CSV line splitter that handles quoted fields
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function fetchAllSets(): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();
  let page = 1;
  while (true) {
    const res = await fetch(`${TCG_API_BASE}/sets?page=${page}&pageSize=250`);
    const json = await res.json() as { data: { id: string; name: string }[]; totalCount: number };
    for (const s of json.data) {
      nameToId.set(s.name.toLowerCase(), s.id);
    }
    if (json.data.length < 250) break;
    page++;
  }
  return nameToId;
}

// Derive card number from "016/189" → "016", "TG01/TG30" → "TG01"
function extractCardNumber(raw: string): string {
  return raw.includes('/') ? raw.split('/')[0] : raw;
}

function normalizeTCGSetName(name: string): string {
  const lower = name.toLowerCase();
  return SET_NAME_ALIASES[lower] ?? lower;
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const [csvPath, username] = args.filter(a => !a.startsWith('--'));
  if (!csvPath || !username) {
    console.error('Usage: npx ts-node scripts/import-tcgplayer-csv.ts <export.csv> <username>');
    process.exit(1);
  }

  // Look up the user by username
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', username)
    .single();

  if (profileErr || !profile) {
    console.error(`Could not find user with username "${username}":`, profileErr?.message ?? 'not found');
    process.exit(1);
  }
  const userId = profile.id;
  console.log(`Found user: ${profile.username} (${userId})`);

  // Parse CSV
  const rows = parseCSV(csvPath);
  console.log(`Parsed ${rows.length} rows from CSV`);

  // Fetch TCG sets
  console.log('Fetching TCG set list…');
  const setNameToId = await fetchAllSets();
  console.log(`Loaded ${setNameToId.size} sets`);

  // Build collection entries
  const entries: { card_id: string; user_id: string; quantity: number; foil_type: string | null; added_at: string; updated_at: string }[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    if (row.category.toLowerCase() !== 'pokemon') {
      skipped.push(`Non-Pokemon row: ${row.productName}`);
      continue;
    }

    const rawSetName = row.setName;
    let setId = setNameToId.get(normalizeTCGSetName(rawSetName));

    // Fallback: strip "Trainer Gallery" suffix and try again
    if (!setId && rawSetName.toLowerCase().includes('trainer gallery')) {
      const baseName = rawSetName.replace(/\s*Trainer Gallery\s*/i, '').trim();
      setId = setNameToId.get(normalizeTCGSetName(baseName));
    }

    if (!setId) {
      skipped.push(`Unknown set: "${rawSetName}" (card: ${row.productName})`);
      continue;
    }

    const cardNum = extractCardNumber(row.cardNumber);
    const cardId  = `${setId}-${cardNum}`;
    const foilType = VARIANCE_TO_FOIL[row.variance] ?? null;
    const addedAt = row.dateAdded
      ? new Date(row.dateAdded).toISOString()
      : new Date().toISOString();

    entries.push({
      card_id:    cardId,
      user_id:    userId,
      quantity:   row.quantity,
      foil_type:  foilType,
      added_at:   addedAt,
      updated_at: new Date().toISOString(),
    });
  }

  // Deduplicate: same card_id can appear multiple times (e.g. Normal + Holofoil → same TCG ID)
  const dedupMap = new Map<string, typeof entries[0]>();
  for (const e of entries) {
    const existing = dedupMap.get(e.card_id);
    if (existing) {
      existing.quantity += e.quantity;
    } else {
      dedupMap.set(e.card_id, { ...e });
    }
  }
  const deduped = [...dedupMap.values()];
  const dupeCount = entries.length - deduped.length;
  entries.length = 0;
  entries.push(...deduped);

  console.log(`\nResolved ${entries.length} cards (${dupeCount} dupes merged), skipped ${skipped.length}`);

  if (skipped.length > 0) {
    console.log('\nSkipped rows:');
    for (const s of skipped) console.log(' -', s);
  }

  if (entries.length === 0) {
    console.log('Nothing to import.');
    process.exit(0);
  }

  // Confirm before inserting
  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>(resolve => {
      rl.question(`\nImport ${entries.length} cards into "${profile.username}"'s collection? [y/N] `, ans => {
        rl.close();
        if (ans.toLowerCase() !== 'y') {
          console.log('Aborted.');
          process.exit(0);
        }
        resolve();
      });
    });
  }

  const cardIds = entries.map(e => e.card_id);

  // Fetch rows already owned by this user
  const { data: ownedRows } = await supabase
    .from('collection')
    .select('card_id, quantity')
    .eq('user_id', userId)
    .in('card_id', cardIds);

  const ownedMap = new Map(
    (ownedRows ?? []).map((e: { card_id: string; quantity: number }) => [e.card_id, e.quantity])
  );

  // Fetch legacy rows (collection_id = 'default', user_id IS NULL) for the same card_ids
  const { data: legacyRows } = await supabase
    .from('collection')
    .select('card_id, quantity')
    .is('user_id', null)
    .eq('collection_id', 'default')
    .in('card_id', cardIds);

  const legacyMap = new Map(
    (legacyRows ?? []).map((e: { card_id: string; quantity: number }) => [e.card_id, e.quantity])
  );

  // Categorise: already owned with user_id | legacy row to claim | brand new
  const toUpdateOwned  = entries.filter(e => ownedMap.has(e.card_id));
  const toClaimLegacy  = entries.filter(e => !ownedMap.has(e.card_id) && legacyMap.has(e.card_id));
  const toInsertFresh  = entries.filter(e => !ownedMap.has(e.card_id) && !legacyMap.has(e.card_id));

  console.log(`  ${toInsertFresh.length} fresh inserts, ${toClaimLegacy.length} legacy rows to claim, ${toUpdateOwned.length} already-owned to update`);

  const BATCH = 200;
  let imported = 0;

  // Claim legacy rows: set user_id so they become Brantley's proper rows
  for (const entry of toClaimLegacy) {
    const { error } = await supabase
      .from('collection')
      .update({
        user_id:    userId,
        quantity:   entry.quantity,
        foil_type:  entry.foil_type,
        added_at:   entry.added_at,
        updated_at: new Date().toISOString(),
      })
      .eq('card_id', entry.card_id)
      .eq('collection_id', 'default')
      .is('user_id', null);
    if (error) {
      console.error(`\nLegacy claim failed for ${entry.card_id}:`, error.message);
      process.exit(1);
    }
    imported++;
    process.stdout.write(`\r${imported}/${entries.length} imported…`);
  }

  // Insert genuinely new cards in batches
  for (let i = 0; i < toInsertFresh.length; i += BATCH) {
    const batch = toInsertFresh.slice(i, i + BATCH);
    const { error } = await supabase.from('collection').insert(batch);
    if (error) {
      console.error(`\nInsert batch ${Math.floor(i / BATCH) + 1} failed:`, error.message);
      process.exit(1);
    }
    imported += batch.length;
    process.stdout.write(`\r${imported}/${entries.length} imported…`);
  }

  // Update already-owned rows (merge quantity)
  for (const entry of toUpdateOwned) {
    const existingQty = ownedMap.get(entry.card_id) ?? 0;
    const { error } = await supabase
      .from('collection')
      .update({
        quantity:   existingQty + entry.quantity,
        foil_type:  entry.foil_type,
        updated_at: new Date().toISOString(),
      })
      .eq('card_id', entry.card_id)
      .eq('user_id', userId);
    if (error) {
      console.error(`\nUpdate failed for ${entry.card_id}:`, error.message);
      process.exit(1);
    }
    imported++;
    process.stdout.write(`\r${imported}/${entries.length} imported…`);
  }

  console.log(`\nDone. ${imported} cards imported into ${profile.username}'s collection.`);
}

main();
