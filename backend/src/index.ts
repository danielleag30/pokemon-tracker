import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './database';
import { collectionRouter } from './routes/collection';
import { cardsRouter } from './routes/cards';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/collection', collectionRouter);
app.use('/api/cards', cardsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Pokemon Tracker API running on port ${PORT}`);
});
