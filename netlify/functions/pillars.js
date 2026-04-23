// Netlify Function: /netlify/functions/pillars
// Generiert Content-Säulen (3/4/5) mit je 10 konkreten Post-Ideen.
// Pro Idee: Format + Hook-Andeutung.
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const VALID_FORMATS = ['single', 'carousel', 'reel', 'story'];

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist Content-Stratege für deutschsprachige Coaches, Berater und Solopreneure. Du entwickelst Content-Strategien, die wirklich funktionieren — keine Template-Strategien, keine generischen "Content-Pyramiden".

AUFGABE: Entwickle ein vollständiges Content-Säulen-System für die gegebene Person/Marke. Liefere N Säulen (die genaue Zahl wird in der User-Message genannt) mit je 10 konkreten Post-Ideen.

QUALITÄTS-REGELN FÜR DIE SÄULEN:
- Die Säulen ERGEBEN SICH aus Zielgruppe + Angebot. Keine Standard-Namen wie "Expertise / Persönlich / Social Proof / Verkauf" blind übernehmen, wenn sie nicht exakt passen.
- Säulen-Namen sind konkret und eigenständig (max. 3 Wörter, keine abstrakten Oberbegriffe wie "Mindset" oder "Motivation").
- Jede Säule hat einen klaren, unterschiedlichen Zweck.
- Anteile (share_percent) der Säulen addieren sich zu 100.

QUALITÄTS-REGELN FÜR DIE POST-IDEEN:
- Jede Post-Idee ist ein konkretes Thema, nicht eine Themen-Kategorie. NICHT: "Über Selbstzweifel sprechen" — SONDERN: "Warum ich mein 10k-Angebot abgelehnt habe, obwohl ich es gebraucht hätte".
- Pro Säule müssen die 10 Ideen sich deutlich voneinander unterscheiden — verschiedene Blickwinkel, verschiedene Post-Formate.
- Die Ideen sind direkt umsetzbar — jemand soll morgen eines davon posten können.
- Keine Buzzwords, keine "5 Tipps"-Allgemeinplätze (außer der Winkel ist wirklich scharf).

PRO POST-IDEE LIEFERE:
1. topic — Die konkrete Post-Idee. 1 Satz, max. 20 Wörter. So formuliert, dass klar ist, worum der Post geht.
2. format — GENAU einer dieser Werte: "single" (Einzelpost), "carousel" (Karussell), "reel" (Reel), "story" (Story-Sequenz). Wähle das Format, das zum Thema passt.
3. hook — 1 Satz, max. 15 Wörter — die Hook-Andeutung, mit der der Post anfangen könnte. Soll Neugier wecken. NICHT die vollständige Caption, nur die Idee für die erste Zeile.

PRO SÄULE LIEFERE:
1. name — max. 3 Wörter, konkret
2. description — 1–2 Sätze: Was ist der Zweck dieser Säule, welche Rolle spielt sie?
3. share_percent — Zahl (z.B. 40 für 40%)
4. ideas — Array mit GENAU 10 Post-Ideen

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Kein Markdown, keine Erklärung außerhalb:

{
  "pillars": [
    {
      "name": "...",
      "description": "...",
      "share_percent": 40,
      "ideas": [
        { "topic": "...", "format": "single|carousel|reel|story", "hook": "..." },
        ... (10 Ideen)
      ]
    },
    ... (weitere Säulen)
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
function buildUserMessage({ niche, audience, offer, uniqueness, pillarCount }) {
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  parts.push(`Zielgruppe: ${audience}`);
  parts.push(`Angebot: ${offer}`);
  if (uniqueness) {
    parts.push(`Besonderheit / eigener Winkel: ${uniqueness}`);
  }
  parts.push('');
  parts.push(`Entwickle GENAU ${pillarCount} Content-Säulen mit je 10 konkreten Post-Ideen. Jede Idee mit topic, format und hook. Die share_percent-Werte müssen sich zu 100 addieren.`);
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
  const uniqueness = typeof payload.uniqueness === 'string' ? payload.uniqueness.trim() : '';
  let pillarCount = parseInt(payload.pillarCount, 10);
  if (![3, 4, 5].includes(pillarCount)) pillarCount = 4;

  if (!audience) return json(400, { error: 'Das Feld "Zielgruppe" ist erforderlich.' });
  if (!offer) return json(400, { error: 'Das Feld "Angebot" ist erforderlich.' });

  const userMessage = buildUserMessage({ niche, audience, offer, uniqueness, pillarCount });

  // Token-Budget
  const maxTokens =
    pillarCount === 5 ? 4000 :
    pillarCount === 4 ? 3300 :
                        2600;

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
      niche, audience, offer, uniqueness, pillarCount,
      pillars: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
      usage: data.usage || null,
    });
  }

  // Normalisierung
  const rawPillars = Array.isArray(parsedJson.pillars) ? parsedJson.pillars : [];
  const pillars = rawPillars.map(p => {
    const ideas = Array.isArray(p.ideas) ? p.ideas.map(i => {
      const fmt = typeof i.format === 'string' ? i.format.trim().toLowerCase() : '';
      return {
        topic: typeof i.topic === 'string' ? i.topic.trim() : '',
        format: VALID_FORMATS.includes(fmt) ? fmt : 'single',
        hook: typeof i.hook === 'string' ? i.hook.trim() : '',
      };
    }).filter(i => i.topic) : [];
    return {
      name: typeof p.name === 'string' ? p.name.trim() : '',
      description: typeof p.description === 'string' ? p.description.trim() : '',
      share_percent: Number.isFinite(p.share_percent) ? Math.round(p.share_percent) : null,
      ideas,
    };
  });

  return json(200, {
    model: MODEL,
    niche, audience, offer, uniqueness, pillarCount,
    pillars,
    raw: textOut,
    usage: data.usage || null,
  });
};
