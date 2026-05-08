// ═══════════════════════════════════════════════════════════════
//  ContentGen AI — Zero-dependency Node.js server
//  Requires Node 18+  •  No npm install needed
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ── Load .env (no dotenv package needed)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 1) return;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !(k in process.env)) process.env[k] = v;
  });
}

const PORT = parseInt(process.env.PORT || '3000', 10);

// ── In-memory API key (env var wins; overridable at runtime)
let runtimeKey = '';
const getKey    = () => runtimeKey || process.env.GROQ_API_KEY || '';

// ── fal.ai image key
let falRuntimeKey = '';
const getFalKey   = () => falRuntimeKey || process.env.FAL_API_KEY || '';

// ── MIME types for static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Helpers ──────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) reject(new Error('Body too large')); });
    req.on('end',  () => resolve(raw));
    req.on('error', reject);
  });
}

function send(res, status, body, ct = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type':   ct,
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendJson(res, status, obj)  { send(res, status, obj); }
function sendError(res, status, msg) { sendJson(res, status, { error: msg }); }

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fall back to index.html for SPA routing
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'content-type': MIME['.html'], 'content-length': d2.length });
        res.end(d2);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const ct  = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': ct, 'content-length': data.length });
    res.end(data);
  });
}

// ── Route handlers ────────────────────────────────────────────

async function handleGenerate(req, res) {
  const apiKey = getKey();
  if (!apiKey) {
    return sendError(res, 401,
      'No API key found. Add GROQ_API_KEY to your .env file, or paste it in Settings → Generation.');
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendError(res, 400, 'Invalid JSON body.');
  }

  const { model, max_tokens, system, messages, _mode } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendError(res, 400, 'messages array is required.');
  }

  // Build OpenAI-compatible messages for Groq (system goes as a message, not top-level)
  const groqMessages = [];
  if (system) groqMessages.push({ role: 'system', content: system });
  groqMessages.push(...messages);

  const payload = {
    model:      model      || 'llama-3.3-70b-versatile',
    max_tokens: max_tokens || 1000,
    messages:   groqMessages,
  };

  console.log(`[ContentGen] generate  model=${payload.model}  mode=${_mode || '?'}  tokens=${payload.max_tokens}`);

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'content-type':  'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || `Groq error ${upstream.status}`;
      console.error(`[ContentGen] upstream ${upstream.status}:`, msg);
      return sendError(res, upstream.status, msg);
    }

    // Normalise Groq's OpenAI-style response to the Anthropic shape the frontend expects
    const choice = data.choices?.[0];
    const normalized = {
      id:          data.id,
      type:        'message',
      role:        'assistant',
      stop_reason: choice?.finish_reason || 'end_turn',
      content: [{ type: 'text', text: choice?.message?.content || '' }],
      usage: {
        input_tokens:  data.usage?.prompt_tokens     || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    };

    console.log(`[ContentGen] ok  stop=${normalized.stop_reason}  out_tokens=${normalized.usage.output_tokens}`);
    return sendJson(res, 200, normalized);

  } catch (err) {
    console.error('[ContentGen] fetch failed:', err.message);
    return sendError(res, 502, 'Could not reach Groq API. Check your internet connection.');
  }
}

async function handleGenerateImage(req, res) {
  const falKey = getFalKey();
  if (!falKey) {
    return sendError(res, 401, 'No fal.ai API key. Add FAL_API_KEY to your .env file.');
  }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'Invalid JSON body.'); }

  const { prompt } = body;
  if (!prompt) return sendError(res, 400, 'prompt is required.');

  console.log(`[ContentGen] generate-image  prompt="${prompt.slice(0,60)}..."`);

  try {
    // Submit request to fal.ai flux/schnell (fast, free tier)
    const submitRes = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'content-type':  'application/json',
        'authorization': `Key ${falKey}`,
      },
      body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1 }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({}));
      return sendError(res, submitRes.status, err?.detail || `fal.ai error ${submitRes.status}`);
    }

    const submitted = await submitRes.json();
    const requestId = submitted.request_id;
    if (!requestId) return sendError(res, 502, 'No request_id from fal.ai');

    // Poll until done (max 60s)
    const start = Date.now();
    while (Date.now() - start < 60000) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://queue.fal.run/fal-ai/flux/schnell/requests/${requestId}/status`, {
        headers: { 'authorization': `Key ${falKey}` },
      });
      const status = await statusRes.json();
      if (status.status === 'COMPLETED') {
        const resultRes = await fetch(`https://queue.fal.run/fal-ai/flux/schnell/requests/${requestId}`, {
          headers: { 'authorization': `Key ${falKey}` },
        });
        const result = await resultRes.json();
        const imageUrl = result?.images?.[0]?.url;
        if (!imageUrl) return sendError(res, 502, 'No image URL in fal.ai response');
        console.log(`[ContentGen] image ok  url=${imageUrl}`);
        return sendJson(res, 200, { imageUrl });
      }
      if (status.status === 'FAILED') {
        return sendError(res, 502, status?.error || 'fal.ai generation failed');
      }
    }
    return sendError(res, 504, 'Image generation timed out after 60s.');

  } catch (err) {
    console.error('[ContentGen] image fetch failed:', err.message);
    return sendError(res, 502, 'Could not reach fal.ai API.');
  }
}

async function handleSaveKey(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'Invalid JSON.'); }
  const { apiKey } = body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return sendError(res, 400, 'Invalid API key format.');
  }
  runtimeKey = apiKey.trim();
  console.log('[ContentGen] API key set at runtime.');
  return sendJson(res, 200, { ok: true });
}

async function handleSaveFalKey(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendError(res, 400, 'Invalid JSON.'); }
  const { falKey } = body;
  if (!falKey || typeof falKey !== 'string' || falKey.trim().length < 10) {
    return sendError(res, 400, 'Invalid fal.ai key format.');
  }
  falRuntimeKey = falKey.trim();
  console.log('[ContentGen] fal.ai key set at runtime.');
  return sendJson(res, 200, { ok: true });
}

// ── Main request handler ──────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method.toUpperCase();

  // ── API routes
  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'ok', hasKey: getKey().length > 10, version: '1.0.0' });
  }

  if (pathname === '/api/check-key' && method === 'GET') {
    return sendJson(res, 200, { hasKey: getKey().length > 10 });
  }

  if (pathname === '/api/save-key' && method === 'POST') {
    return handleSaveKey(req, res);
  }

  if (pathname === '/api/generate' && method === 'POST') {
    return handleGenerate(req, res);
  }

  if (pathname === '/api/generate-image' && method === 'POST') {
    return handleGenerateImage(req, res);
  }

  if (pathname === '/api/save-fal-key' && method === 'POST') {
    return handleSaveFalKey(req, res);
  }

  // 405 for wrong method on known API paths
  if (pathname.startsWith('/api/')) {
    return sendError(res, 405, 'Method not allowed.');
  }

  // ── Static files
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    return sendError(res, 403, 'Forbidden.');
  }

  serveStatic(res, filePath);
});

// ── Start
server.listen(PORT, () => {
  const keyMsg = getKey().length > 10
    ? '✓ API key loaded'
    : '⚠  No API key — add GROQ_API_KEY to .env or use Settings → Generation';
  console.log(`\n  ✦  ContentGen AI`);
  console.log(`  →  http://localhost:${PORT}`);
  console.log(`  ${keyMsg}\n`);
});
