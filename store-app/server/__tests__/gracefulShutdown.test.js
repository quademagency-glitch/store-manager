const http = require('node:http');
const net = require('node:net');

// Deliberately a bare http.Server, no Express and no Supabase. The behaviour
// under test is socket lifecycle, and involving the app would only add ways for
// this to fail for unrelated reasons.

describe('installGracefulShutdown', () => {
  let server;
  let exitSpy;
  let signalsBefore;

  beforeEach(() => {
    jest.resetModules();
    // process.exit is called at the end of a successful drain; stub it so the
    // test runner survives.
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    signalsBefore = {
      SIGTERM: process.listenerCount('SIGTERM'),
      SIGINT: process.listenerCount('SIGINT'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
    };
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    // Drop the handlers this test installed so suites stay isolated and Node
    // doesn't warn about a listener leak.
    for (const sig of Object.keys(signalsBefore)) {
      const extra = process.listenerCount(sig) - signalsBefore[sig];
      const listeners = process.listeners(sig).slice(-Math.max(extra, 0));
      listeners.forEach((l) => process.removeListener(sig, l));
    }
    if (server?.listening) await new Promise((r) => server.close(r));
  });

  function startServer() {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      // Mirrors worker.js, and is the whole reason closeIdleConnections matters:
      // without it, close() would wait out this timeout on every idle socket.
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
  }

  it('registers signal handlers', async () => {
    await startServer();
    const { installGracefulShutdown } = require('../utils/gracefulShutdown');
    installGracefulShutdown(server, { name: 'test' });

    expect(process.listenerCount('SIGTERM')).toBe(signalsBefore.SIGTERM + 1);
    expect(process.listenerCount('SIGINT')).toBe(signalsBefore.SIGINT + 1);
  });

  it('reports shutting-down state only after a signal', async () => {
    await startServer();
    const { installGracefulShutdown } = require('../utils/gracefulShutdown');
    const { isShuttingDown, shutdown } = installGracefulShutdown(server, { name: 'test' });

    expect(isShuttingDown()).toBe(false);
    shutdown('SIGTERM');
    expect(isShuttingDown()).toBe(true);
  });

  // THE regression test. An idle keep-alive socket holds server.close() open
  // until keepAliveTimeout (65s here) unless closeIdleConnections() reaps it.
  // If someone removes that call, this test hangs and then fails on the 5s
  // timeout rather than passing in milliseconds.
  it('drains promptly with an idle keep-alive socket open', async () => {
    const port = await startServer();
    const { installGracefulShutdown } = require('../utils/gracefulShutdown');

    // Open a real connection, complete one request, then leave it idle.
    const socket = net.connect(port, '127.0.0.1');
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n');
    await new Promise((resolve) => socket.once('data', resolve));

    let onShutdownRan = false;
    const { shutdown } = installGracefulShutdown(server, {
      name: 'test',
      timeoutMs: 5000,
      onShutdown: async () => { onShutdownRan = true; },
    });

    const startedAt = Date.now();
    shutdown('SIGTERM');

    await new Promise((resolve) => {
      const poll = setInterval(() => {
        if (exitSpy.mock.calls.length > 0) {
          clearInterval(poll);
          resolve();
        }
      }, 10);
      // Fail fast rather than hanging the suite for the full jest timeout.
      setTimeout(() => { clearInterval(poll); resolve(); }, 5000).unref();
    });

    const elapsed = Date.now() - startedAt;
    socket.destroy();

    expect(onShutdownRan).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
    // Generous bound, the point is "not 65 seconds", not a precise number.
    expect(elapsed).toBeLessThan(3000);
  });

  it('runs onShutdown cleanup exactly once', async () => {
    await startServer();
    const { installGracefulShutdown } = require('../utils/gracefulShutdown');
    const onShutdown = jest.fn().mockResolvedValue(undefined);
    const { shutdown } = installGracefulShutdown(server, { name: 'test', onShutdown });

    shutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  // The fire-and-forget promises in apiKeyGuard, the demo reseed timer and the
  // audit logger would turn a fatal unhandledRejection into a crash loop.
  it('does not exit the process on an unhandled rejection', async () => {
    await startServer();
    const { installGracefulShutdown } = require('../utils/gracefulShutdown');
    installGracefulShutdown(server, { name: 'test' });

    const handlers = process.listeners('unhandledRejection');
    handlers[handlers.length - 1](new Error('fire and forget'), Promise.resolve());

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
