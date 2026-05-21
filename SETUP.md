# AfyaWork MVP — Setup Guide

## 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `afyawork`, choose a strong DB password, select region closest to Tanzania
3. Wait for project to provision (~2 min)
4. Go to **SQL Editor** → paste the full contents of `supabase/schema.sql` → Run

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Find your keys at: Supabase Dashboard → Project Settings → API

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 3. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## 4. Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import project
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PLATFORM_FEE_RATE` = `0.186`
4. Deploy → Vercel handles the rest

## 5. Supabase Auth Settings (Production)

In Supabase Dashboard → Authentication → Settings:
- Enable **Email Confirmations** for production
- Add your Vercel domain to **Site URL** and **Redirect URLs**

## Test Flow

1. Register as a **Healthcare Facility** → post a shift
2. Register as a **Clinical Officer** → browse and apply
3. Back to facility → open the shift → approve the CO
4. Check CO's My Applications → status updates to Approved live
