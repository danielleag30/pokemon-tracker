-- Fix collection primary key: (card_id, collection_id) → (card_id, user_id)
-- collection_id defaulted to 'default' for every row, making the PK effectively
-- (card_id, 'default') — causing PK collisions when two users own the same card.

ALTER TABLE public.collection DROP CONSTRAINT IF EXISTS collection_pkey;

DROP INDEX IF EXISTS public.idx_collection_card_user;
DROP INDEX IF EXISTS public.idx_collection_id;

ALTER TABLE public.collection ADD PRIMARY KEY (card_id, user_id);

ALTER TABLE public.collection DROP COLUMN IF EXISTS collection_id;
