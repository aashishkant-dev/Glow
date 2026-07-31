require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const compression = require('compression');

const authRoutes      = require('./routes/auth');
const customerRoutes  = require('./routes/customer');
const providerRoutes       = require('./routes/provider');
const adminRoutes     = require('./routes/admin');
const adminAuthRoutes = require('./routes/adminAuth');
const documentRoutes  = require('./routes/documents');
const postRoutes      = require('./routes/posts');
const messageRoutes   = require('./routes/messages');
const leadRoutes      = require('./routes/leads');
const providerApplicantRoutes = require('./routes/providerApplicants');
const publicRoutes    = require('./routes/public');

const app = express();

app.set('trust proxy', 1);

app.use(compression());

// ── HTTP request/response logger ──────────────────────────────────────────────
// Logs every request with method, path, status, duration, and authenticated userId.
// Skips /health to avoid log noise from Railway health-check pings.
app.use((req, _res, next) => {
  req._startAt = process.hrtime.bigint();
  next();
});

app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.path === '/health') return; // suppress health-check noise
    const ns      = process.hrtime.bigint() - (req._startAt || 0n);
    const ms      = Number(ns / 1_000_000n);
    const userId  = req.user?.id ? ` uid=${req.user.id.slice(-6)}` : '';
    const adminId = req.adminId  ? ` adm=${req.adminId.slice(-6)}`  : '';
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${ms}ms${userId}${adminId}`
    );
  });
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.socket.io"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc:      ["'self'", "data:", "https:", "blob:"],
      connectSrc:  ["'self'", "https:", "wss:", "ws:"],
      fontSrc:     ["'self'", "https:", "data:"],
      objectSrc:   ["'none'"],
    },
  },
}));

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim());
// Always-allowed first-party origins (so the admin panel + PWA work regardless
// of the CORS_ORIGIN env on a given environment). Any *.glow.app and any
// of our Vercel projects (incl. preview deploys) are trusted.
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname === 'glow.app' || hostname.endsWith('.glow.app')) return true;
    // our Vercel projects + their preview deploys
    if (/^(glow-pwa|glow-dev-pwa|glow-landing|admin)[a-z0-9-]*\.vercel\.app$/.test(hostname)) return true;
    if (/^glow[a-z0-9-]*\.vercel\.app$/.test(hostname)) return true;
    if (/^admin-[a-z0-9-]+-aashishkants-projects\.vercel\.app$/.test(hostname)) return true;
  } catch { /* malformed origin */ }
  return false;
}
const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.options('*', cors(corsOptions)); // handle preflight for all routes
app.use(cors(corsOptions));

app.use(express.json({ limit: '15mb' }));

app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Admin panel static files served at /admin-ui — SPA fallback for all sub-paths
app.use('/admin-ui', express.static(path.join(__dirname, '../admin')));
app.get('/admin-ui/*', (_req, res) => res.sendFile(path.join(__dirname, '../admin/index.html')));
app.get('/admin-ui',   (_req, res) => res.sendFile(path.join(__dirname, '../admin/index.html')));
app.get('/admin',  (_req, res) => res.redirect(301, '/admin-ui/'));
app.get('/admin/', (_req, res) => res.redirect(301, '/admin-ui/'));

const authLimiter           = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests.' }, standardHeaders: true, legacyHeaders: false });
const adminLimiter          = rateLimit({ windowMs: 60 * 1000, max: 600, message: { error: 'Too many admin requests.' }, standardHeaders: true, legacyHeaders: false });
const apiLimiter            = rateLimit({ windowMs: 60 * 1000, max: 200, message: { error: 'Too many requests.' }, standardHeaders: true, legacyHeaders: false });
const sensitiveAdminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many admin actions.' }, standardHeaders: true, legacyHeaders: false });

app.use('/auth',  authLimiter);
app.use('/admin', adminLimiter);
app.use('/',      apiLimiter);

app.use('/auth',      authRoutes);
app.use('/jobs',      providerRoutes);
app.use('/admin',     adminRoutes);
app.use('/admin',     sensitiveAdminLimiter, adminAuthRoutes);
app.use('/documents', documentRoutes);
app.use('/posts',     postRoutes);
app.use('/messages',  messageRoutes);
app.use('/leads',     leadRoutes);
app.use('/provider-applicants', providerApplicantRoutes);
app.use('/public',    publicRoutes);
app.use('/',          customerRoutes);

app.get('/health', async (_req, res) => {
  let dbOk = false;
  try {
    const prisma = require('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {}

  let redisOk = false;
  try {
    const { getClient } = require('./utils/cache');
    const rc = getClient();
    if (rc) { await rc.ping(); redisOk = true; }
  } catch {}

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    service:  'glow-api',
    provider: 'railway',
    services: { postgres: dbOk ? 'ok' : 'down', redis: redisOk ? 'ok' : 'unavailable' },
    uptime:   Math.floor(process.uptime()),
    ts:       Date.now(),
  });
});

app.get('/', (_req, res) => res.redirect('/health'));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  // Below this handler, individual routes' own try/catch blocks already
  // return a generic 'Server error' string — this top-level handler only
  // fires for errors that escape those (malformed JSON body parsing, the
  // CORS origin check, multer file-filter errors, etc). Those raw messages
  // (body-parser's internal text, an Error object's .message) were being
  // echoed straight to any client in production with no NODE_ENV gate at
  // all. A genuine 5xx (unexpected crash) never leaks its message in
  // production; a deliberate sub-500 error (validation-style, intentionally
  // thrown with a real client-facing message) still does, since those are
  // meant to be shown to the user.
  const safeToShow = status < 500 || process.env.NODE_ENV !== 'production';
  res.status(status).json({ error: safeToShow ? (err.message || 'Internal server error') : 'Internal server error' });
});

module.exports = app;
