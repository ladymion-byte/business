// Netlify Function: /netlify/functions/bio
// Optimiert eine bestehende Instagram-Bio:
//   - Kurz-Analyse der Ist-Bio
//   - 3 Bio-Varianten (Professionell / Persönlich / Playful), jeweils max 150 Zeichen
//   - 5 Highlight-Story-Vorschläge
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist Brand-Stratege und Instagram-Bio-Spezialist. Du hilfst deutschsprachigen Coaches, Beratern und Solopreneuren, ihre Instagram-Bio so zu optimieren, dass Fremde in 3 Sekunden verstehen: Für wen bist du da? Was bekommt man von dir? Warum folgen?

AUFGABE: Analysiere die aktuelle Bio, liefere 3 optimierte Bio-Varianten in 3 Stilen (max. 150 Zeichen INKL. Leerzeichen und Emojis) und schlage 5 passende Highlight-Story-Kategorien vor.

HARTE REGELN FÜR JEDE BIO:
- MAXIMAL 150 Zeichen pro Bio (inklusive Leerzeichen, Emojis und Zeilenumbrüche). Zähle mit.
- Zeilenumbrüche sind erlaubt und erwünscht (pro Bio 2–4 Zeilen).
- Jede Bio muss enthalten: (1) Für-wen bist du da (2) Was bekommt man (3) ein klares Unterscheidungsmerkmal ODER eine Einladung.
- KEINE generischen Buzzwords: "Visionärin", "Soulful", "Empowerment", "Journey", "Leidenschaft für …", "Mindset-Queen", "authentisch" etc. sind verboten.
- KEIN "Dein/Deine + Abstraktum" (z.B. "Dein Coach für mehr Klarheit"). Konkret statt abstrakt.
- Emojis sparsam (max. 2–3 pro Bio, nur wenn sie echten Mehrwert liefern — z.B. als visuelle Anker).

DIE 3 STILE:
1. "professionell" — Klar, business-tauglich, direkt. Kein Emotionssprech. Funktioniert auch auf LinkedIn.
2. "persoenlich" — Warm, nahbar, mit Storytelling-Element oder einer konkreten persönlichen Note. Man soll die Person spüren.
3. "playful" — Eigenständig, mit Wortwitz, ungewöhnlicher Perspektive oder leichter Selbstironie. Sticht heraus, bleibt aber professionell.

KURZ-ANALYSE DER IST-BIO:
Liefere 2 konkrete Stärken ("was funktioniert") und 2 konkrete Schwachstellen ("was fehlt / verwässert"). Keine Allgemeinplätze, sondern präzise am vorliegenden Text.

HIGHLIGHT-STORIES:
5 Kategorien-Vorschläge, die direkt zur Zielgruppe und zum Angebot passen. Jede mit Titel (max. 2 Wörter) und 1-Satz-Zweck. KEIN "Über mich" als erste Idee — geh in die Tiefe.

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Kein Markdown, keine Erklärung außerhalb:

{
  "analysis": {
    "works": ["...", "..."],
    "improves": ["...", "..."]
  },
  "bios": [
    {
      "style": "professionell",
      "text": "...",
      "char_count": 0,
      "why": "Ein Satz, warum diese Variante so gebaut ist."
    },
    {
      "style": "persoenlich",
      "text": "...",
      "char_count": 0,
      "why": "..."
    },
    {
      "style": "playful",
      "text": "...",
      "char_count": 0,
      "why": "..."
    }
  ],
  "highlights": [
    { "title": "...", "purpose": "..." },
    { "title": "...", "purpose": "..." },
    { "title": "...", "purpose": "..." },
    { "title": "...", "purpose": "..." },
    { "title": "...", "purpose": "..." }
  ]
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
// User-Message
// ---------------------------------------------------------------------------
function buildUserMessage({ niche, audience, offer, currentBio }) {
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  parts.push(`Zielgruppe: ${audience || 'nicht angegeben'}`);
  parts.push(`Angebot / was die Person anbietet: ${offer || 'nicht angegeben'}`);
  parts.push('');
  parts.push('AKTUELLE BIO (zu optimieren):');
  parts.push('"""');
  parts.push(currentBio);
  parts.push('"""');
  parts.push('');
  parts.push('Liefere jetzt das vollständige JSON mit Analyse, 3 Bio-Varianten (max. 150 Zeichen) und 5 Highlight-Kategorien.');
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

  const niche = typeof payload.niche === 'string' ? payload.niche.trim() : '';
  const audience = typeof payload.audience === 'string' ? payload.audience.trim() : '';
  const offer = typeof payload.offer === 'string' ? payload.offer.trim() : '';
  const currentBio = typeof payload.currentBio === 'string' ? payload.currentBio.trim() : '';

  if (!currentBio) {
    return json(400, { error: 'Bitte gib deine aktuelle Bio ein — das Tool ist ein Optimierer.' });
  }
  if (!audience) {
    return json(400, { error: 'Das Feld "Zielgruppe" ist erforderlich.' });
  }
  if (!offer) {
    return json(400, { error: 'Das Feld "Angebot" ist erforderlich.' });
  }

  const userMessage = buildUserMessage({ niche, audience, offer, currentBio });

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
        max_tokens: 1800,
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

  // Robustes JSON-Parsing
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

  if (!parsedJson || typeof parsedJson !== 'object') {
    return json(200, {
      model: MODEL,
      niche, audience, offer, currentBio,
      bios: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
      usage: data.usage || null,
    });
  }

  // Normalisierung — char_count serverseitig nachrechnen (korrekt inkl. Emojis)
  const bios = Array.isArray(parsedJson.bios) ? parsedJson.bios.map(b => {
    const text = typeof b.text === 'string' ? b.text : '';
    // Unicode-korrekte Zeichen-Zählung (Emojis zählen als 1 Zeichen visuell)
    const count = Array.from(text).length;
    return {
      style: typeof b.style === 'string' ? b.style : '',
      text,
      char_count: count,
      why: typeof b.why === 'string' ? b.why : '',
    };
  }) : null;

  const analysis = parsedJson.analysis && typeof parsedJson.analysis === 'object' ? {
    works: Array.isArray(parsedJson.analysis.works) ? parsedJson.analysis.works.filter(x => typeof x === 'string' && x.trim()) : [],
    improves: Array.isArray(parsedJson.analysis.improves) ? parsedJson.analysis.improves.filter(x => typeof x === 'string' && x.trim()) : [],
  } : null;

  const highlights = Array.isArray(parsedJson.highlights) ? parsedJson.highlights
    .filter(h => h && typeof h === 'object')
    .map(h => ({
      title: typeof h.title === 'string' ? h.title : '',
      purpose: typeof h.purpose === 'string' ? h.purpose : '',
    })) : [];

  return json(200, {
    model: MODEL,
    niche, audience, offer, currentBio,
    analysis,
    bios,
    highlights,
    raw: textOut,
    usage: data.usage || null,
  });
};
