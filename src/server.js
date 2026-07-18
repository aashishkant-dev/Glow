require('dotenv').config();

const http   = require('http');
const app    = require('./app');
const { initSocket } = require('./socket');
const prisma = require('./lib/prisma');
const { startRequestTimeoutSweep } = require('./jobs/requestTimeoutSweep');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io     = initSocket(server);
app.set('io', io);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down gracefully');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

async function start() {
  // Start listening immediately so Railway healthcheck passes
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Glow API + Socket.io listening on port ${PORT}`);
  });

  // Connect to DB after server is up — health endpoint reports status
  try {
    await prisma.$connect();
    console.log('PostgreSQL connected via Prisma');
    // Open stale dedicated requests to the nearby pool after the timeout.
    startRequestTimeoutSweep(io);
  } catch (err) {
    console.error('Database connection failed:', err.message);
    // Don't exit — Railway will restart; log the error and keep serving
  }
}

start();
