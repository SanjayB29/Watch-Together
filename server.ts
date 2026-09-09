import { createServer } from 'http';
import next from 'next';
import { setupSignalingServer } from './src/server/signaling';
import { setTunnelUrl } from './src/server/tunnelStore';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Attach WebSocket signaling server to the HTTP server instance
  setupSignalingServer(server);

  server.listen(port, hostname, async () => {
    console.log(`> CineLink server ready on http://localhost:${port}`);
    console.log(`> WebSocket signaling endpoint at ws://localhost:${port}/ws`);

    // Auto-start a Cloudflare Quick Tunnel so anyone on the internet can join.
    // Skipped in production (deploy to a real host instead).
    if (dev) {
      try {
        const { tunnel, Tunnel } = await import('cloudflared');
        const t = Tunnel.quick(`http://localhost:${port}`);

        t.once('url', (publicUrl: string) => {
          setTunnelUrl(publicUrl);
          const inner = Math.max(publicUrl.length, 55);
          const bar   = '─'.repeat(inner + 4);
          const pad   = (s: string) => `│  ${s.padEnd(inner)}  │`;
          console.log('');
          console.log(`┌${bar}┐`);
          console.log(pad('🌐 Public tunnel active — share this link with viewers'));
          console.log(pad(publicUrl));
          console.log(`└${bar}┘`);
          console.log('');
        });

        t.on('error', (err: Error) => {
          console.warn('> Cloudflare tunnel error:', err.message);
        });

        // Clean up the tunnel process when the server exits.
        const stop = () => { t.stop(); process.exit(0); };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
      } catch (e: any) {
        console.warn('> Cloudflare tunnel could not start (viewers can still join on your local network):', e?.message ?? e);
      }
    }
  });
});
