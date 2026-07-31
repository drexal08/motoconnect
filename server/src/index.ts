import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { ridersRouter } from './routes/riders.js';
import { requestsRouter } from './routes/requests.js';
import { paymentsRouter } from './routes/payments.js';
import { consentRouter } from './routes/consent.js';
import { setupSocket } from './ws/index.js';
import { startSweeper } from './services/sweeper.js';

async function boot() {
  // Fail fast with a helpful message when the database is unreachable.
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error(
      `\nCould not reach PostgreSQL at ${config.databaseUrl}\n` +
        'Make sure Postgres + PostGIS are running, then: npm run db:migrate && npm run db:seed\n' +
        `(${err instanceof Error ? err.message : err})\n`
    );
    process.exit(1);
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api/auth', authRouter);
  app.use('/api/riders', ridersRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/consent', consentRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(errorHandler);

  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: true, credentials: true },
    serveClient: false,
  });
  setupSocket(io);

  server.listen(config.port, () => {
    console.log(`\n  MotoConnect API listening on http://localhost:${config.port}`);
    console.log(`  Database: ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}`);
    console.log(
      config.paypack.clientId
        ? '  PayPack: configured (live cashin)'
        : '  PayPack: TEST MODE — payments are simulated (set PAYPACK_CLIENT_ID/SECRET to go live)'
    );
    console.log('  WebSocket: /socket.io\n');
  });

  startSweeper(config.sweepIntervalMs);
}

boot().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
