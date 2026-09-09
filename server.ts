import { createServer } from 'http';
import next from 'next';
import { setupSignalingServer } from './src/server/signaling';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
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

  server.listen(port, hostname, () => {
    console.log(`> CineLink server ready on http://localhost:${port}`);
    console.log(`> WebSocket signaling endpoint at ws://localhost:${port}/ws`);
  });
});
