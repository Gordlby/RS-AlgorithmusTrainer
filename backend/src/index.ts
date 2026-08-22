import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import storeRouter from './routes/store';
import changeRequestsRouter from './routes/change-requests';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth',            authRouter);
app.use('/admin',           adminRouter);
app.use('/store',           storeRouter);
app.use('/change-requests', changeRequestsRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Start ────────────────────────────────────────────────────────────────────
initDb();
app.listen(PORT, () => {
  console.log(`RS-Algo Backend läuft auf http://localhost:${PORT}`);
});
