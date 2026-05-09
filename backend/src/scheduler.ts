import cron from 'node-cron';
import { db } from './database';

export function initScheduler(): void {
  // Every Wednesday at midnight (server time)
  cron.schedule('0 0 * * 3', () => {
    try {
      db.exec(`
        DELETE FROM card_cache;
        DELETE FROM set_cards_cache;
        DELETE FROM sets_cache;
      `);
      console.log('Weekly cache cleared:', new Date().toISOString());
    } catch (err) {
      console.error('Cache clear failed:', err);
    }
  });

  console.log('Scheduler started — cache clears every Wednesday at midnight');
}
