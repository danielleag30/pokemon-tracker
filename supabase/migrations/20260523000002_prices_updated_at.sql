ALTER TABLE cards_vectors
  ADD COLUMN IF NOT EXISTS prices_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS cards_vectors_prices_updated_at_idx
  ON cards_vectors (prices_updated_at);
