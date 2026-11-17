// M0 placeholder: the worker process boots and shuts down cleanly.
// BullMQ processors (ingestion, conversation, scoring, follow-ups, webhooks) arrive from M2.
// In dev, Node runs this TypeScript file directly (type stripping); `pnpm build` compiles it to dist/.

function log(msg: string): void {
  console.log(
    JSON.stringify({ level: 'info', service: 'worker', time: new Date().toISOString(), msg }),
  );
}

const keepAlive = setInterval(() => undefined, 60_000);

function shutdown(signal: string): void {
  log(`received ${signal}, shutting down`);
  clearInterval(keepAlive);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('worker started (no processors yet)');
