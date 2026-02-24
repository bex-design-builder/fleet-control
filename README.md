# Bobcat Fleet Control

A monitoring and control UI for a fleet of autonomous bobcat vehicles. Three-panel layout: chat, map overview, and vehicle list.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Share this prototype

**Option 1: Get a live link (best for sharing with anyone)**  
1. Push this folder to a GitHub repo.  
2. Go to [vercel.com](https://vercel.com) → Sign in → **Add New** → **Project** → Import your repo.  
3. Click **Deploy**. You’ll get a URL like `bobcat-fleet-app.vercel.app` to share.

**Option 2: Same Wi‑Fi only (no account)**  
```bash
npm run share
```  
Then share the **Network** URL Vite prints (e.g. `http://192.168.1.x:5173`). Anyone on the same Wi‑Fi can open it.

## Build

```bash
npm run build
npm run preview
```

## Stack

- React 18 + Vite
- CSS (no UI framework)
