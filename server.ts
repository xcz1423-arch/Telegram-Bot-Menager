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

  const resolveOrigin = (req: express.Request): string | null => {
    const proto =
      String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
        .split(',')[0]
        .trim()
        .replace(/[^a-z]/gi, '') || 'https';
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const host = forwardedHost || req.get('host');
    return host ? `${proto}://${host}` : null;
  };

  if (!isProd) {
    const rootIndex = path.resolve(process.cwd(), 'index.html');
    app.use((req, res, next) => {
      const ua = String(req.headers['user-agent'] || '');
      const isSocialCrawler =
        /(Telegram|Twitterbot|WhatsApp|Discordbot|facebookexternalhit|Facebot|meta-externalagent|Slackbot|LinkedInBot|WebpageBot|vkShare|SkypeUriPreview|Applebot|Viber|Line|Pinterest|Snapchat|Embedly|Iframely)/i.test(
          ua
        );
      if (req.method === 'GET' && isSocialCrawler && !req.path.startsWith('/api') && fs.existsSync(rootIndex)) {
        let html = fs.readFileSync(rootIndex, 'utf8');
        const origin = resolveOrigin(req);
        if (origin) {
          html = html
            .replaceAll('https://telegram-bot-menager.vercel.app/og-preview.jpg', `${origin}/og-preview.jpg`)
            .replaceAll('https://telegram-bot-manager.vercel.app/og-preview.jpg', `${origin}/og-preview.jpg`)
            .replaceAll('https://telegram-bot-menager.vercel.app/', `${origin}${req.originalUrl}`)
            .replaceAll('https://telegram-bot-manager.vercel.app/', `${origin}${req.originalUrl}`);
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      }
      next();
    });
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        let html = fs.readFileSync(indexHtml, 'utf8');
        const origin = resolveOrigin(req);
        if (origin) {
          html = html
            .replaceAll(
              'https://telegram-bot-menager.vercel.app/og-preview.jpg',
              `${origin}/og-preview.jpg`
            )
            .replaceAll(
              'https://telegram-bot-manager.vercel.app/og-preview.jpg',
              `${origin}/og-preview.jpg`
            )
            .replaceAll(
              'content="https://telegram-bot-menager.vercel.app/"',
              `content="${origin}${req.originalUrl}"`
            )
            .replaceAll(
              'content="https://telegram-bot-manager.vercel.app/"',
              `content="${origin}${req.originalUrl}"`
            )
            .replace(
              '</head>',
              `    <link rel="canonical" href="${origin}${req.originalUrl}" />\n  </head>`
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
