import { createServer } from 'node:http';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler } from './lib/http.js';
import { reportEnvironment, warnAboutSmsGateway } from './lib/env.js';
import { rateLimit } from './lib/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { ridersRouter } from './routes/riders.js';
import { requestsRouter } from './routes/requests.js';
import { paymentsRouter } from './routes/payments.js';
import { consentRouter } from './routes/consent.js';
import { adminRouter } from './routes/admin/index.js';
import { setupSocket } from './ws/index.js';
import { startSweeper, stopSweeper } from './services/sweeper.js';
import { ensureSeedAdmin } from './services/admin/adminAccountService.js';

/**
 * Browser origins allowed to call this API.
 *
 * In production the front ends are on a different host (Vercel) from the API,
 * so this is the list that has to be right. An unset WEB_ORIGINS reflects
 * whatever origin asks, which is fine for local development and wrong for a
 * live deployment — `reportEnvironment()` refuses to boot in production
 * without it.
 */
function corsOptions(): CorsOptions {
  const allowed = new Set([
    ...config.webOrigins,
    ...(config.admin.origin ? [config.admin.origin] : []),
    ...(config.isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : []),
  ]);

  return {
    origin(origin, cb) {
      // No Origin header: a same-origin request, a health check, or curl.
      if (!origin) return cb(null, true);
      if (!allowed.size) return cb(null, true);
      cb(null, allowed.has(origin.replace(/\/+$/, '')));
    },
    // Both apps authenticate with bearer tokens, so cookies are never needed
    // and enabling them would only widen what a hostile page could attempt.
    credentials: false,
  };
}

async function boot() {
  if (!reportEnvironment()) process.exit(1);

  // Fail fast with a helpful message when the database is unreachable.
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error(
      `\nCould not reach PostgreSQL at ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}\n` +
        'Check DATABASE_URL, then run: npm run db:migrate\n' +
        `(${err instanceof Error ? err.message : err})\n`
    );
    process.exit(1);
  }

  const app = express();
  // Render, Vercel and every other managed host sit behind a proxy; without
  // this, req.ip is the proxy and per-IP rate limiting would be worthless.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // This process serves JSON and document images, never HTML, so the
      // browser-facing policies belong on the static host instead.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: config.isDev ? false : { maxAge: 15_552_000, includeSubDomains: true },
    })
  );
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '100kb' }));

  /**
   * Health check. Touches the database on purpose: a free-tier Postgres pauses
   * after a week of inactivity, and the uptime pinger that keeps this service
   * awake also keeps the database awake through this query.
   */
  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: true, time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, db: false, time: new Date().toISOString() });
    }
  });

  // Phone-code requests are the one unauthenticated write on the consumer side.
  // authService already limits per phone number; this limits per source.
  app.use(
    '/api/auth/request-otp',
    rateLimit({ name: 'otp', windowMs: 15 * 60 * 1000, max: 30 })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/riders', ridersRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/consent', consentRouter);

  // Ops console (admin spec §2.4): its own API namespace, its own session model,
  // and never linked from any consumer-facing page.
  //
  // When ADMIN_ORIGIN is set, the admin API answers only that origin rather
  // than the whole WEB_ORIGINS list. Bearer tokens mean CORS is not the
  // security boundary here — this is defence in depth, and it costs one line.
  if (config.admin.origin) {
    const allowed = new Set([
      config.admin.origin,
      ...(config.isDev ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : []),
    ]);
    app.use(
      '/api/admin',
      cors({ origin: (origin, cb) => cb(null, !origin || allowed.has(origin)), credentials: false })
    );
  }
  app.use('/api/admin', adminRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(errorHandler);

  const server = createServer(app);
  const io = new Server(server, {
    cors: corsOptions() as { origin: CorsOptions['origin'] },
    serveClient: false,
    // Free hosts idle out quiet connections; a slightly longer window keeps a
    // parked rider connected rather than reconnecting every couple of minutes.
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });
  setupSocket(io);

  server.listen(config.port, () => {
    console.log(`\n  MotoConnect API listening on port ${config.port}`);
    console.log(`  Environment: ${config.isDev ? 'development' : 'production'}`);
    console.log(`  Database: ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}`);
    console.log(
      config.paypack.clientId
        ? '  PayPack: configured (live cashin)'
        : '  PayPack: TEST MODE — payments are simulated (set PAYPACK_CLIENT_ID/SECRET to go live)'
    );
    console.log(`  Email: ${config.email.serverToken ? 'Postmark configured' : 'NOT configured (setup links log to console)'}`);
    console.log('  WebSocket: /socket.io');
    console.log(`  Ops console API: /api/admin  (UI: ${config.admin.consoleUrl})\n`);
    warnAboutSmsGateway();
  });

  // §2.2 — creates the single seed super_admin on a fresh database and emails a
  // one-time setup link. No password is ever seeded; see adminAccountService.
  await ensureSeedAdmin().catch((err) => {
    console.error('Seed admin bootstrap failed:', err instanceof Error ? err.message : err);
  });

  startSweeper(config.sweepIntervalMs);

  /**
   * Graceful shutdown. Managed hosts send SIGTERM on every deploy and, on a
   * free plan, on every idle spin-down. Without this the process is killed
   * mid-query and connections are left for Postgres to time out — which on a
   * small connection allowance is how a redeploy locks you out of your own
   * database.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n  ${signal} received — shutting down.`);

    stopSweeper();
    io.close();

    const forced = setTimeout(() => {
      console.error('  Shutdown took too long; exiting anyway.');
      process.exit(1);
    }, 10_000);
    forced.unref();

    server.close(async () => {
      await pool.end().catch(() => {});
      clearTimeout(forced);
      console.log('  Closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // A rejected promise nobody handled should be loud, not a silent no-op that
  // leaves the process running in a state nobody reasoned about.
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
  });
}

boot().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
