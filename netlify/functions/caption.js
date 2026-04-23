// Netlify Function: /netlify/functions/caption
// Generiert komplette Instagram-Captions (Text + CTA + Hashtags).
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// MAPPINGS (Ziel / Ton / Länge)
// ---------------------------------------------------------------------------
const GOAL_INSTRUCTIONS = {
  saves:
    `ZIEL: Saves. Die Caption muss so wertvoll sein, dass Leute sie sofort abspeichern wollen. Mechaniken: wissensdichter Content (klar strukturierte Liste, Schritt-für-Schritt, Framework, Checkliste), konkrete Learnings, Merksätze. Baue klare Abschnitte / Aufzählungen. Signalisiere früh, dass hier etwas kommt, was man nicht vergessen will.`,
  comments:
    `ZIEL: Kommentare. Die Caption muss echten Dialog auslösen. Mechaniken: am Ende eine klare, konkrete Frage (keine Ja/Nein-Frage) ODER eine bewusst angreifbare These, zu der Leser Stellung beziehen sollen. Die Frage muss sich auf eine echte Alltagserfahrung beziehen, die jede:r aus der Zielgruppe sofort beantworten kann.`,
  dms:
    `ZIEL: DMs. Die Caption muss Leser in die Direktnachricht lotsen. Mechaniken: am Ende ein Trigger-CTA, bei dem Leser ein bestimmtes Wort / Emoji / einen Begriff in die DMs schicken sollen ("Schreib mir das Wort XY in die DMs"). Gib einen klaren, spezifischen Anreiz: was bekommen sie dafür? (Mini-Guide, Checkliste, persönliche Einschätzung, kostenloses Kennenlern-Gespräch, etc.)`,
  shares:
    `ZIEL: Shares. Die Caption muss so relatable oder so pointiert sein, dass Leser sie sofort an jemanden weiterleiten wollen. Mechaniken: ein Aha-Moment, ein "das bin ja ich"-Gefühl, eine Wahrheit, die selten ausgesprochen wird, oder eine steile Beobachtung. Die Caption sollte universell genug sein, dass man sofort jemanden im Kopf hat, den das betrifft.`,
};

const TONE_INSTRUCTIONS = {
  personal:
    `TON: Persönlich & nahbar. Schreibe in Ich-Perspektive. Nutze Mikro-Storytelling: eine kleine, konkrete Szene, ein Gedanke, ein Moment. Zeige Verletzlichkeit, wo es passt. Keine Phrasen wie "Let me tell you..." oder "Heute teile ich...". Einfach direkt rein in die Szene. Duzen. Keine Coaching-Sprache ("Reise", "Transformation", "Mindset-Shift").`,
  inspiring:
    `TON: Inspirierend & motivierend. Fokus auf Möglichkeit, Wachstum, Ermutigung. Warm, aufbauend, aber NICHT kitschig. Vermeide Kalenderspruch-Phrasen wie "Du schaffst das", "Glaub an dich", "Alles ist möglich". Stattdessen: konkrete, bildhafte Sprache, spezifische Erlaubnisse ("Du darfst X sein, auch wenn Y"). Duzen. Empowernd, nicht belehrend.`,
};

const LENGTH_INSTRUCTIONS = {
  short:  `LÄNGE: Kurz. ~50 Wörter (ca. 300 Zeichen). Maximal 2 Absätze. Jeder Satz muss sitzen.`,
  medium: `LÄNGE: Mittel. ~120 Wörter (ca. 700 Zeichen). 3–4 kurze Absätze. Guter Flow, klare Struktur.`,
  long:   `LÄNGE: Lang. ~250 Wörter (ca. 1500 Zeichen). 5–6 Absätze. Mini-Story oder ausführlicher Wissens-Post. Absätze kurz halten (max. 3 Sätze), viel Weißraum.`,
};

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist ein erfahrener Instagram-Copywriter für deutschsprachige Coaches und Berater. Du schreibst Captions, die einen klaren Zweck erfüllen — nicht generische Content-Blöcke.

AUFGABE: Erstelle EINE komplette Instagram-Caption basierend auf Nische, Thema, Ziel, Tonalität und Länge.

FORMAT-REGELN:
- Sprache: Deutsch, duzen.
- Starte mit einem starken Einstieg (Hook in der ersten Zeile). KEIN "Let me tell you...", keine Floskel.
- Absätze durch echte Zeilenumbrüche trennen — kurze Absätze, viel Luft.
- Maximal 2 Emojis in der Caption, sparsam und sinnvoll (oder gar keine).
- Kein "Swipe für mehr", kein "Lies bis zum Ende".
- Keine Klickbait-Lügen.
- Call-to-Action (CTA) IMMER separat — nicht in der Hauptcaption verstecken.
- Hashtags: 8 bis 12 Stück. Mix aus mittelgroßen und kleinen Hashtags. Keine Mega-Tags wie #love, #instagood. Jeder Hashtag muss zur Nische passen.

OUTPUT-FORMAT — antworte AUSSCHLIESSLICH als reines JSON-Objekt. Keine Einleitung, kein Markdown-Codeblock, keine Erklärung außerhalb:

{
  "caption": {
    "text": "Der vollständige Caption-Text mit Zeilenumbrüchen als \\n. OHNE den Call-to-Action. OHNE Hashtags.",
    "cta": "Der klare, auf das Ziel zugeschnittene Call-to-Action. 1–2 Sätze.",
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8"]
  }
}`;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// User-Message aus Frontend-Feldern
// ---------------------------------------------------------------------------
function buildUserMessage({ niche, topic, goal, tone, length }) {
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  parts.push(`Thema des Posts: "${topic}"`);
  parts.push('');
  parts.push(GOAL_INSTRUCTIONS[goal] || GOAL_INSTRUCTIONS.saves);
  parts.push('');
  parts.push(TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.personal);
  parts.push('');
  parts.push(LENGTH_INSTRUCTIONS[length] || LENGTH_INSTRUCTIONS.medium);
  parts.push('');
  parts.push('Erstelle jetzt die Caption im geforderten JSON-Format.');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed. Bitte POST verwenden.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: 'ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in den Netlify Environment Variables konfigurieren.',
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Ungültiges JSON im Request-Body.' });
  }

  const topic = typeof payload.topic === 'string' ? payload.topic.trim() : '';
  if (!topic) {
    return json(400, { error: 'Das Feld "topic" ist erforderlich.' });
  }

  const niche = typeof payload.niche === 'string' ? payload.niche.trim() : '';
  const goal = ['saves', 'comments', 'dms', 'shares'].includes(payload.goal) ? payload.goal : 'saves';
  const tone = ['personal', 'inspiring'].includes(payload.tone) ? payload.tone : 'personal';
  const length = ['short', 'medium', 'long'].includes(payload.length) ? payload.length : 'medium';

  const userMessage = buildUserMessage({ niche, topic, goal, tone, length });

  const maxTokens = length === 'long' ? 2000 : length === 'medium' ? 1400 : 900;

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
        max_tokens: maxTokens,
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

  // JSON aus der Antwort extrahieren
  let parsedJson = null;
  const match = textOut.match(/\{[\s\S]*\}/);
  if (match) {
    try { parsedJson = JSON.parse(match[0]); } catch (e) {}
  }

  const caption = parsedJson?.caption || null;

  return json(200, {
    model: MODEL,
    options: { goal, tone, length, niche },
    caption,
    raw: textOut,
    usage: data.usage || null,
  });
};
