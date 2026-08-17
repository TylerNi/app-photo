import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { resolve } from 'node:path';
import { requireAuth } from './auth.js';
import { config } from './config.js';
import './db.js';
import { router as authRouter } from './routes/auth.js';
import { router as mediaRouter } from './routes/media.js';
import { router as pushRouter } from './routes/push.js';
import { router as snapRouter } from './routes/snap.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cookieParser(config.sessionSecret));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, mediaRouter);
app.use('/api', requireAuth, snapRouter);
app.use('/api', requireAuth, pushRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route inconnue.' });
});

app.use(express.static(config.webDir));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(resolve(config.webDir, 'index.html'));
});

app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: 'internal', message: 'Erreur interne.' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`app-photo écoute sur le port ${config.port}`);
});
