/**
 * Migrates existing collection data from the JSON export into Supabase.
 *
 * Usage:
 *   npx ts-node scripts/migrate-collection.ts <path-to-export.json>
 *
 * Example:
 *   npx ts-node scripts/migrate-collection.ts ~/Downloads/pokemon-collection-2026-05-12.json
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL         = 'https://wmwpjkfgapqyyjsjuhos.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_KEY env var before running.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface ExportRow {
  card_id:       string;
  collection_id: string;
  quantity:      number;
  binder_tag:    string | null;
  foil_type:     string | null;
  added_at:      string;
  updated_at:    string;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx ts-node scripts/migrate-collection.ts <export.json>');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), 'utf-8');
  const { collection }: { collection: ExportRow[] } = JSON.parse(raw);

  console.log(`Migrating ${collection.length} cards…`);

  // Upsert in batches of 200
  const BATCH = 200;
  let imported = 0;

  for (let i = 0; i < collection.length; i += BATCH) {
    const batch = collection.slice(i, i + BATCH).map(row => ({
      card_id:       row.card_id,
      collection_id: row.collection_id,
      quantity:      row.quantity ?? 1,
      binder_tag:    row.binder_tag ?? null,
      foil_type:     row.foil_type ?? null,
      added_at:      row.added_at,
      updated_at:    row.updated_at,
    }));

    const { error } = await supabase
      .from('collection')
      .upsert(batch, { onConflict: 'card_id,collection_id' });

    if (error) {
      console.error(`Batch ${i / BATCH + 1} failed:`, error.message);
      process.exit(1);
    }

    imported += batch.length;
    process.stdout.write(`\r${imported}/${collection.length} imported…`);
  }

  console.log(`\nDone. ${imported} cards imported.`);
}

main();
