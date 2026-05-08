# ✦ FELIX AI

AI-powered content generation dashboard. Generates text, code, and image prompts using Claude (Anthropic).

**Zero dependencies — just Node 18+ and your API key.**

---

## 🚀 Quick Start

### 1. Add your API key
```bash
cp .env.example .env
```
Edit `.env` and set your key:
```
GROQ_API_KEY=sk-ant-your-key-here
```
Get a key at → https://console.groq.com

### 2. Start the server
```bash
node server.js
```
Open **http://localhost:3000**

That's it. No `npm install` required.

---

## 📁 Project Structure

```
FELIX AI-ai/
├── server.js          ← Backend server (pure Node, zero deps)
├── package.json       ← Scripts only, no dependencies
├── .env               ← Your secrets (create from .env.example)
├── .env.example       ← Template
├── .gitignore
├── README.md
└── public/
    └── index.html     ← Full frontend (HTML + CSS + JS)
```

---

## 🔑 API Key — Two Options

| Method | Persists? | How |
|--------|-----------|-----|
| `.env` file | ✅ Yes | Set `ANTHROPIC_API_KEY=sk-ant-...` |
| Settings page | Session only | Open Settings → Generation → paste key |

---

## 🛠 Scripts

| Command | What it does |
|---------|-------------|
| `node server.js` | Start server |
| `npm start` | Same as above |
| `npm run dev` | Start with auto-reload (Node 18.11+) |

---

## 🌐 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health + key status |
| `GET` | `/api/check-key` | Is a key loaded? |
| `POST` | `/api/save-key` | Set key at runtime |
| `POST` | `/api/generate` | Generate content via Claude |

---

## ✦ Features

- **Text** — Blog posts, emails, tweets, product copy
- **Code** — React, TypeScript, Python, CSS, and more
- **Image Prompts** — Optimized for DALL-E, Midjourney, Stable Diffusion
- **18 Built-in Templates** across all three modes
- **Custom Prompts** — Add, edit, delete your own
- **Content Library** — Auto-save with search, filter, export
- **Case Study** — Exportable prompt engineering portfolio page
- **Settings** — Model, tone, tokens, system prompt customisation

---

## ⌨️ Keyboard Shortcuts

| Keys | Action |
|------|--------|
| `Cmd/Ctrl + K` | Jump to Generator |
| `Enter` | Generate |
| `Shift + Enter` | New line in prompt |
| `Escape` | Close modal |

---

## 🔒 Security

- API key is **never sent to the browser** — all Anthropic calls are proxied server-side
- `.env` is excluded from git
