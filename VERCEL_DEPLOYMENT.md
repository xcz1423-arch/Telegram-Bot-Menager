# Deploying XC BOT CONTROL on Vercel

XC BOT CONTROL is configured for **Vercel Serverless Functions + Vite SPA** with zero always-running VPS or background workers required.

---

## 1. Architecture Overview on Vercel

- **Frontend (`dist/`):** Built by `npm run build` (`vite build`) with vendor chunk splitting and immutable asset caching (`/assets/*`).
- **Backend API (`/api/index.ts`):** Express API (`server/app.ts`) running as a Node.js 22.x Vercel Serverless Function (`maxDuration: 30s`), handling `/api/*` via `vercel.json` rewrites.
- **Stateless Auth & Security:** Admin sessions use `HttpOnly; Secure; SameSite=Lax` cookies signed with **HMAC-SHA256** (`XC_MASTER_KEY`) so login sessions stay valid across serverless cold starts and multi-instance scaling, paired with CSRF token validation (`X-CSRF-Token`).
- **Server-Side Secret Isolation:** Bot tokens (`TELEGRAM_BOT_TOKEN`, `XC_BOT_TOKENS`) and keys are stored exclusively on the server, encrypted with **AES-256-GCM**, and never sent to browser code or client bundles.
- **Telegram Webhooks:** Incoming Telegram updates post directly to `https://<your-vercel-domain>/api/webhook/<botKey>` with `X-Telegram-Bot-Api-Secret-Token` verification and `update_id` duplicate protection.

> **Important Note on Serverless Storage:** Vercel Serverless Functions provide an ephemeral writable `/tmp` filesystem per instance. Setting `XC_MASTER_KEY`, `XC_ADMIN_PASSWORD`, and `TELEGRAM_BOT_TOKEN` / `XC_BOT_TOKENS` in Vercel Environment Variables ensures your admin login and bot connections automatically hydrate on every cold start. For durable cross-restart configuration exports, use **Settings & Backup -> Export Safe Backup**.

---

## 2. Step-by-Step GitHub + Vercel Deployment

### Step 1: Push Repository to GitHub
Make sure `.env*` and `storage/` remain ignored (already configured in `.gitignore`):

```bash
git init
git add .
git commit -m "Configure XC BOT CONTROL for Vercel production deployment"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### Step 2: Import Project in Vercel
1. Sign in to [vercel.com](https://vercel.com) and click **Add New -> Project**.
2. Select **Import Git Repository** and pick your GitHub repository.
3. Verify the Build & Output settings (automatically detected from `vercel.json`):
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Node.js Version:** `22.x` (configured in `package.json` `"engines"`)

### Step 3: Configure Environment Variables in Vercel
Before clicking **Deploy**, expand **Environment Variables** in the Vercel import screen (or go to **Project Settings -> Environment Variables** later) and add these **Server-Side** variables (never prefix with `VITE_`):

| Variable | Required | Value / How to Generate |
| :--- | :---: | :--- |
| `XC_MASTER_KEY` | **Yes** | 64-char hex key. Generate via `openssl rand -hex 32` |
| `XC_ADMIN_USERNAME` | **Yes** | Your admin username (e.g. `admin`) |
| `XC_ADMIN_PASSWORD` | **Yes** | Strong admin password (min 8 chars) |
| `XC_ADMIN_DISPLAY_NAME` | Optional | Console display name (default: `Lead Developer`) |
| `XC_RECOVERY_CODE` | **Yes** | Secret code for the **Forgot Password** reset flow |
| `TELEGRAM_BOT_TOKEN` | Optional | Single Telegram Bot Token from `@BotFather` |
| `XC_BOT_TOKENS` | Optional | Multiple bots as comma-separated tokens or JSON array: `[{"token":"123:ABC","name":"Prod Bot"}]` |
| `XC_SEED_DEMO` | Optional | `false` for clean production, or `true` to auto-seed sandbox bots |
| `APP_URL` | Optional | Custom domain e.g. `https://bots.yourdomain.com` (leave unset to use `*.vercel.app` automatically) |

### Step 4: Deploy & Configure Telegram Webhooks
1. Click **Deploy** in Vercel.
2. Open your deployed URL (`https://<project>.vercel.app`) and sign in with `XC_ADMIN_USERNAME` and `XC_ADMIN_PASSWORD`.
3. If you added `TELEGRAM_BOT_TOKEN` or `XC_BOT_TOKENS`, open **Bot Fleet** and click **Revalidate** on each bot to pull live `@BotFather` metadata (`getMe`).
4. Open **Webhooks & Updates -> Webhook Manager**: the **HTTPS Webhook Endpoint URL** automatically populates with `https://<your-vercel-domain>/api/webhook/<botKey>`. Click **Set Webhook** to register it with Telegram.

---

## 3. Deploying via Vercel CLI (Alternative)

```bash
npm i -g vercel
vercel login
vercel env add XC_MASTER_KEY production
vercel env add XC_ADMIN_USERNAME production
vercel env add XC_ADMIN_PASSWORD production
vercel env add XC_RECOVERY_CODE production
vercel --prod
```

---

## 4. Local Production Verification

```bash
npm run lint
npm test
npm run build
NODE_ENV=production npm start
```
