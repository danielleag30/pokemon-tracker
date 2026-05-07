import { Router, Request, Response } from 'express';
import { db } from '../database';

export const collectionRouter = Router();

// Every request carries ?c=<collectionId> injected by the frontend axios interceptor.
function cid(req: Request): string {
  return (req.query.c as string | undefined)?.trim().toUpperCase() || 'default';
}

collectionRouter.get('/', (req: Request, res: Response) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM collection WHERE collection_id = ? ORDER BY added_at DESC'
    ).all(cid(req));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

collectionRouter.get('/stats', (req: Request, res: Response) => {
  try {
    const id = cid(req);
    const unique = (db.prepare('SELECT COUNT(*) as c FROM collection WHERE collection_id = ?').get(id) as any).c;
    const total  = (db.prepare("SELECT COALESCE(SUM(quantity),0) as t FROM collection WHERE collection_id = ?").get(id) as any).t;
    const dupes  = (db.prepare('SELECT COUNT(*) as c FROM collection WHERE collection_id = ? AND quantity > 1').get(id) as any).c;
    const binders = db.prepare(
      "SELECT binder_tag, COUNT(*) as count FROM collection WHERE collection_id = ? AND binder_tag IS NOT NULL AND binder_tag != '' GROUP BY binder_tag ORDER BY count DESC"
    ).all(id);
    res.json({ uniqueCards: unique, totalCards: total, duplicates: dupes, binders });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

collectionRouter.get('/export', (req: Request, res: Response) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM collection WHERE collection_id = ? ORDER BY card_id'
    ).all(cid(req));
    res.setHeader('Content-Disposition', 'attachment; filename="pokemon-collection.json"');
    res.json({ exportDate: new Date().toISOString(), version: '1.0', collection: rows });
  } catch {
    res.status(500).json({ error: 'Failed to export' });
  }
});

collectionRouter.post('/import', (req: Request, res: Response) => {
  try {
    const { collection, merge = true } = req.body;
    if (!Array.isArray(collection)) return res.status(400).json({ error: 'collection must be an array' });
    const id = cid(req);

    const stmt = db.prepare(`
      INSERT INTO collection (card_id, collection_id, quantity, binder_tag)
      VALUES (@card_id, @collection_id, @quantity, @binder_tag)
      ON CONFLICT(card_id, collection_id) DO UPDATE SET
        quantity = ${merge ? 'quantity + @quantity' : '@quantity'},
        binder_tag = COALESCE(@binder_tag, binder_tag),
        updated_at = datetime('now')
    `);

    db.exec('BEGIN');
    try {
      collection.forEach((c: any) => stmt.run({
        card_id: c.card_id,
        collection_id: id,
        quantity: c.quantity || 1,
        binder_tag: c.binder_tag || null,
      }));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ success: true, imported: collection.length });
  } catch {
    res.status(500).json({ error: 'Failed to import' });
  }
});

collectionRouter.post('/batch', (req: Request, res: Response) => {
  try {
    const { cards } = req.body;
    if (!Array.isArray(cards)) return res.status(400).json({ error: 'cards must be an array' });
    const id = cid(req);

    const stmt = db.prepare(`
      INSERT INTO collection (card_id, collection_id, quantity, binder_tag)
      VALUES (@cardId, @collId, @quantity, @binderTag)
      ON CONFLICT(card_id, collection_id) DO UPDATE SET
        quantity = quantity + @quantity,
        binder_tag = COALESCE(@binderTag, binder_tag),
        updated_at = datetime('now')
    `);

    db.exec('BEGIN');
    let results: unknown[];
    try {
      cards.forEach((c: any) => stmt.run({ cardId: c.cardId, collId: id, quantity: c.quantity || 1, binderTag: c.binderTag || null }));
      results = cards.map((c: any) =>
        db.prepare('SELECT * FROM collection WHERE card_id = ? AND collection_id = ?').get(c.cardId, id)
      );
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ success: true, entries: results });
  } catch {
    res.status(500).json({ error: 'Failed to batch add' });
  }
});

collectionRouter.post('/', (req: Request, res: Response) => {
  try {
    const { cardId, quantity = 1, binderTag } = req.body;
    if (!cardId) return res.status(400).json({ error: 'cardId required' });
    const id = cid(req);

    db.prepare(`
      INSERT INTO collection (card_id, collection_id, quantity, binder_tag)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(card_id, collection_id) DO UPDATE SET
        quantity = quantity + ?,
        binder_tag = COALESCE(?, binder_tag),
        updated_at = datetime('now')
    `).run(cardId, id, quantity, binderTag || null, quantity, binderTag || null);

    res.json(db.prepare('SELECT * FROM collection WHERE card_id = ? AND collection_id = ?').get(cardId, id));
  } catch {
    res.status(500).json({ error: 'Failed to add card' });
  }
});

collectionRouter.put('/:cardId', (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { quantity, binderTag } = req.body;
    const id = cid(req);

    const existing = db.prepare('SELECT * FROM collection WHERE card_id = ? AND collection_id = ?').get(cardId, id);
    if (!existing) return res.status(404).json({ error: 'Card not in collection' });

    if (quantity !== undefined && quantity <= 0) {
      db.prepare('DELETE FROM collection WHERE card_id = ? AND collection_id = ?').run(cardId, id);
      return res.json({ deleted: true });
    }

    db.prepare(`
      UPDATE collection SET
        quantity = COALESCE(?, quantity),
        binder_tag = ?,
        updated_at = datetime('now')
      WHERE card_id = ? AND collection_id = ?
    `).run(quantity ?? null, binderTag ?? null, cardId, id);

    res.json(db.prepare('SELECT * FROM collection WHERE card_id = ? AND collection_id = ?').get(cardId, id));
  } catch {
    res.status(500).json({ error: 'Failed to update card' });
  }
});

collectionRouter.delete('/:cardId', (req: Request, res: Response) => {
  try {
    const result = db.prepare(
      'DELETE FROM collection WHERE card_id = ? AND collection_id = ?'
    ).run(req.params.cardId, cid(req));
    if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove card' });
  }
});
