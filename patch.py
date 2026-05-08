with open('server.js', 'r') as f:
    content = f.read()

old = """  const payload = {
    model:      model      || 'claude-sonnet-4-20250514',
    max_tokens: max_tokens || 1000,
    messages,
  };
  if (system) payload.system = system;

  console.log(`[FELIX AI] generate  model=${payload.model}  mode=${_mode || '?'}  tokens=${payload.max_tokens}`);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || `Anthropic error ${upstream.status}`;
      console.error(`[FELIX AI] upstream ${upstream.status}:`, msg);
      return sendError(res, upstream.status, msg);
    }

    console.log(`[FELIX AI] ok  stop=${data.stop_reason}  out_tokens=${data.usage?.output_tokens}`);
    return sendJson(res, 200, data);

  } catch (err) {
    console.error('[FELIX AI] fetch failed:', err.message);
    return sendError(res, 502, 'Could not reach Anthropic API. Check your internet connection.');
  }"""

new = """  // Build OpenAI-compatible messages for Groq (system goes as a message, not top-level)
  const groqMessages = [];
  if (system) groqMessages.push({ role: 'system', content: system });
  groqMessages.push(...messages);

  const payload = {
    model:      model      || 'llama-3.3-70b-versatile',
    max_tokens: max_tokens || 1000,
    messages:   groqMessages,
  };

  console.log(`[FELIX AI] generate  model=${payload.model}  mode=${_mode || '?'}  tokens=${payload.max_tokens}`);

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
      console.error(`[FELIX AI] upstream ${upstream.status}:`, msg);
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

    console.log(`[FELIX AI] ok  stop=${normalized.stop_reason}  out_tokens=${normalized.usage.output_tokens}`);
    return sendJson(res, 200, normalized);

  } catch (err) {
    console.error('[FELIX AI] fetch failed:', err.message);
    return sendError(res, 502, 'Could not reach Groq API. Check your internet connection.');
  }"""

assert old in content, "Pattern not found!"
content = content.replace(old, new)

with open('server.js', 'w') as f:
    f.write(content)

print("Done")
