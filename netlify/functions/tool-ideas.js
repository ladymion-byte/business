// Netlify Function: /netlify/functions/tool-ideas
// Generiert 5 konkrete AI-Tool-Ideen für eine bestimmte Nische/Branche.
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist Produkt-Stratege für AI-gestützte Mini-Tools. Du hilfst deutschsprachigen Coaches, Beratern und Solopreneuren, konkrete Mini-Web-Tools zu entwickeln, die sie für ihre Branche bauen und anbieten können — ähnlich wie ein Hook-Generator oder ein Caption-Creator.

AUFGABE: Generiere EXAKT 5 konkrete Tool-Ideen für die gegebene Branche/Nische. Jede Idee muss so spezifisch sein, dass man sie direkt bauen kann.

WAS EIN "TOOL" HIER BEDEUTET:
- Ein kleines Web-Tool mit Formular (1–5 Input-Felder) + AI-Call + strukturierter Output
- KEIN großes SaaS-Produkt, keine komplexe App
- Muss in 1–2 Tagen baubar sein
- Löst ein klares, konkretes Problem der Zielgruppe
- Ergebnis ist sofort nutzbar (Copy-Paste, Download, etc.)

QUALITÄTS-ANFORDERUNGEN:
- Jede Tool-Idee muss für die spezifische Nische passen — keine generischen "Content-Planer" oder "Post-Ideen-Generatoren", die für jede Branche gleich wären
- Adressiere echte, spezifische Pain Points der Zielgruppe
- Die 5 Ideen müssen sich thematisch deutlich unterscheiden (nicht 5 Varianten des gleichen Tools)
- Tool-Namen: prägnant, merkbar, auf Deutsch oder angemessen englisch (z.B. "Angebots-Text Polisher" oder "First-Session Prep")
- Vermeide Buzzwords und generische Marketing-Sprache

PRO TOOL-IDEE LIEFERE:
1. name — prägnanter Tool-Name (max. 4 Wörter)
2. description — was das Tool macht, in 1–2 klaren Sätzen (max. 30 Wörter)
3. audience — für wen genau, spezifisch (nicht "Coaches allgemein")
4. pain_point — das konkrete Problem, das es löst, aus Sicht der Zielgruppe formuliert (1 Satz)
5. inputs — 2–5 Input-Felder, die der Nutzer ausfüllt (kurze Feld-Namen, z.B. "Thema des Workshops", "Dauer", "Zielgruppe")
6. outputs — 2–4 konkrete Output-Elemente, die der Nutzer zurückbekommt
7. monetization — eine klare Monetarisierungs-Idee (z.B. "Kostenlos als Lead-Magnet — E-Mail-Opt-in im Tausch gegen Ergebnis", "19€ Einmal-Zugang", "Bestandteil eines 99€/Monat-Bundles mit 5 weiteren Tools", "Kostenlos auf Instagram-Landing, Upsell zum Coaching-Call")

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Keine Einleitung, kein Markdown-Codeblock, keine Erklärung außerhalb:

{
  "ideas": [
    {
      "name": "...",
      "description": "...",
      "audience": "...",
      "pain_point": "...",
      "inputs": ["...", "...", "..."],
      "outputs": ["...", "..."],
      "monetization": "..."
    },
    { ... 4 weitere ... }
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
function buildUserMessage({ niche, specifier }) {
  const parts = [];
  parts.push(`Branche / Nische: ${niche || 'nicht angegeben'}`);
  if (specifier && specifier.trim()) {
    parts.push(`Spezifizierung / Sub-Nische: ${specifier.trim()}`);
  }
  parts.push('');
  parts.push('Generiere jetzt 5 konkrete Tool-Ideen im geforderten JSON-Format.');
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
  const specifier = typeof payload.specifier === 'string' ? payload.specifier : '';

  if (!niche) {
    return json(400, { error: 'Das Feld "niche" ist erforderlich.' });
  }

  const userMessage = buildUserMessage({ niche, specifier });

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
        max_tokens: 2800,
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

  let ideas = null;
  if (parsedJson && typeof parsedJson === 'object') {
    if (Array.isArray(parsedJson.ideas)) {
      ideas = parsedJson.ideas;
    } else if (Array.isArray(parsedJson)) {
      ideas = parsedJson;
    }
  }

  if (!ideas) {
    return json(200, {
      model: MODEL,
      niche,
      specifier,
      ideas: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
      usage: data.usage || null,
    });
  }

  return json(200, {
    model: MODEL,
    niche,
    specifier,
    ideas,
    raw: textOut,
    usage: data.usage || null,
  });
};
