import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApp, ensureAppReady } from './server/app.js';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  await ensureAppReady();
  const app = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        let html = fs.readFileSync(indexHtml, 'utf8');
        const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
        const host = req.get('host');
        if (host) {
          const origin = `${proto}://${host}`;
          html = html
            .replaceAll(
              'content="/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"',
              `content="${origin}/assets/aistudio/file_000000007dd8820b9043e2e9eb3cd7c6_34c37a13.png"`
            )
            .replace(
              '</head>',
              `  <meta property="og:url" content="${origin}${req.originalUrl}" />\n    <link rel="canonical" href="${origin}${req.originalUrl}" />\n  </head>`
            );
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } else {
        res.status(404).send('Production build missing. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`XC BOT CONTROL listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
