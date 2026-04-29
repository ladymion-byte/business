// Netlify Function: /netlify/functions/outreach
// Generiert personalisierte Instagram-DMs für Allergie-Coaching
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `Du bist ein Experte für Instagram-Marketing im Gesundheitsbereich und spezialisiert auf Allergie-Coaching.

AUFGABE: Schreibe personalisierte Instagram-DM-Nachrichten für ein Allergie-Coaching-Angebot.

QUALITÄTS-REGELN:
- Kein spammy Gefühl – persönlich, menschlich, nicht werbend
- Kein "Hallo [Name]" Platzhalter – direkt und natürlich starten
- Instagram-typisch: locker, keine überlangen Sätze
- Absolut keine Heilsversprechen oder medizinischen Aussagen
- Empathisch auf die Beschwerden eingehen, ohne dramatisch zu sein
- Neugier wecken, nicht pushen

PRO NACHRICHT LIEFERE:
1. title — kurze Beschreibung des Ansatzes (z.B. "Empathischer Einstieg")
2. text — die vollständige Nachricht
3. tipp — kurzer Profi-Tipp warum diese Formulierung funktioniert (1 Satz)

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Kein Markdown, keine Erklärung außerhalb:

{
  "messages": [
    { "title": "...", "text": "...", "tipp": "..." }
  ]
}`;

function corsHeaders() {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

function buildUserMessage({ allergie, zg, ton, cta, laenge, name, kontext, varianten }) {
  const parts = [];
  parts.push(`Allergie-Typ: ${allergie}`);
  parts.push(`Zielgruppe: ${zg}`);
  parts.push(`Ton: ${ton}`);
  parts.push(`Absender / Angebot: ${name}`);
  parts.push(`Nachrichtenlänge: ${laenge}`);
  parts.push(`Call-to-Action: ${cta}`);
  if (kontext) parts.push(`Kontext über die Person: ${kontext}`);
  parts.push('');
  parts.push(`Schreibe genau ${varianten} Nachricht${varianten > 1 ? 'en' : ''}.`);
  return parts.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed. Bitte POST verwenden.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'ANTHROPIC_API_KEY ist nicht gesetzt.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Ungültiges JSON im Request-Body.' });
  }

  const allergie = typeof payload.allergie === 'string' ? payload.allergie.trim() : 'Allergien allgemein';
  const zg       = typeof payload.zg       === 'string' ? payload.zg.trim()       : 'Betroffene Erwachsene';
  const ton      = typeof payload.ton      === 'string' ? payload.ton.trim()      : 'empathisch & verständnisvoll';
  const cta      = typeof payload.cta      === 'string' ? payload.cta.trim()      : 'eine offene Frage stellen';
  const laenge   = typeof payload.laenge   === 'string' ? payload.laenge.trim()   : 'kurz (2-3 Sätze)';
  const name     = typeof payload.name     === 'string' ? payload.name.trim()     : 'Coaching-Angebot';
  const kontext  = typeof payload.kontext  === 'string' ? payload.kontext.trim()  : '';
  let varianten  = parseInt(payload.varianten, 10);
  if (![1, 2, 3].includes(varianten)) varianten = 1;

  const userMessage = buildUserMessage({ allergie, zg, ton, cta, laenge, name, kontext, varianten });

  let apiResponse;
  try {
    apiResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch (err) {
    return json(502, { error: 'Verbindung zur Claude-API fehlgeschlagen: ' + err.message });
  }

  const rawText = await apiResponse.text();

  if (!apiResponse.ok) {
    let parsed;
    try { parsed = JSON.parse(rawText); } catch (e) { parsed = { raw: rawText }; }
    return json(apiResponse.status, {
      error: parsed?.error?.message || 'Claude-API-Fehler',
      status: apiResponse.status,
    });
  }

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { return json(502, { error: 'Claude-Antwort nicht lesbar.' }); }

  const textOut = (data.content && data.content[0] && data.content[0].text) || '';

  let parsedJson = null;
  let cleaned = textOut.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsedJson = JSON.parse(match[0]); } catch (e2) {}
    }
  }

  if (!parsedJson || !Array.isArray(parsedJson.messages)) {
    return json(200, {
      messages: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
    });
  }

  return json(200, {
    model: MODEL,
    messages: parsedJson.messages,
    usage: data.usage || null,
  });
};
