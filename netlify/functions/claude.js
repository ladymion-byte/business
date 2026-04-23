// Netlify Function: /netlify/functions/claude
// Zwei Modi:
//   mode = "hooks"    → Instagram-Hook-Generator (5 Hooks mit Typ + Erklärung)
//   mode = "research" → Marktrecherche-Report (Pain Points, Wünsche, Einwände,
//                       Sprache der Zielgruppe, Content-Ideen)
//
// ENV-Variablen (Netlify → Site settings → Environment variables):
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// SYSTEM-PROMPTS
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT_HOOKS = `Du bist ein Instagram-Copywriter, spezialisiert auf Coaches und Berater im deutschsprachigen Raum. Du schreibst Hooks, die in den ersten 3 Sekunden den Scroll stoppen.

Deine Aufgabe: Generiere EXAKT 5 Hooks mit UNTERSCHIEDLICHEN Mechaniken. Pro Hook genau einer der folgenden Typen, keine Wiederholung:
- "Provokante Behauptung" – eine steile These, die gängige Meinungen kippt
- "Schmerzpunkt-Frage" – trifft direkt einen wunden Punkt der Zielgruppe
- "Zahl / Statistik" – nutzt eine konkrete (plausible) Zahl als Scrollstopper
- "Persönliche Story" – Mini-Anekdote, maximal 2 Zeilen
- "Kontroverse / Widerspruch" – stellt eine weit verbreitete Annahme in Frage
- "Fehler-Warnung" – macht auf einen häufigen Fehler aufmerksam
- "Kontrast / Vorher-Nachher" – zeigt eine Transformation
- "Insider-Wissen" – verspricht etwas, das "niemand sagt"

Regeln für jeden Hook:
- 1–2 Zeilen, maximal 22 Wörter
- Deutsch, duzend, direkt
- Keine Floskeln wie "In diesem Post zeige ich dir..."
- Kein "Swipe für mehr", kein "Lies bis zum Ende"
- Maximal 1 Emoji pro Hook (oder keines)
- Keine Klickbait-Lügen

Für jeden Hook zusätzlich: Benenne den Typ und erkläre in 1–2 Sätzen, WARUM der Hook psychologisch funktioniert (welcher Trigger greift: Neugier, Schmerz, Identifikation, Pattern-Interrupt, Autorität, Widerspruch etc.).

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Keine Einleitung, keine Erklärung außerhalb, kein Markdown-Codeblock:

{
  "hooks": [
    {"hook": "...", "type": "Provokante Behauptung", "explanation": "..."},
    {"hook": "...", "type": "...", "explanation": "..."},
    {"hook": "...", "type": "...", "explanation": "..."},
    {"hook": "...", "type": "...", "explanation": "..."},
    {"hook": "...", "type": "...", "explanation": "..."}
  ]
}`;

const SYSTEM_PROMPT_RESEARCH = `Du bist ein Marktforschungs-Experte für deutschsprachige Coaches und Berater. Du lieferst präzise, handlungsrelevante Insights – keine Buzzwords, keine generischen Plattitüden.

Deine Aufgabe: Basierend auf Nische, Zielgruppe und Angebot erstellst du einen kompakten Markt-Report mit fünf Abschnitten. Jeder Abschnitt enthält 4–6 Bulletpoints. Sprache: Deutsch, duzend, konkret.

Abschnitte (in dieser Reihenfolge):
1. "pain_points" – Die echten Schmerzpunkte der Zielgruppe, möglichst verbatim formuliert (wie die Leute es selber sagen würden, nicht aus Marketer-Perspektive)
2. "desires" – Wünsche & gewünschte Transformationen. Was will die Zielgruppe wirklich erreichen?
3. "objections" – Häufige Einwände gegen ein Coaching-/Beratungs-Angebot in dieser Nische ("zu teuer", "ich kann das allein", etc. – aber spezifisch)
4. "language" – Sprache & Begriffe der Zielgruppe: Wörter, Phrasen und Schreibweisen, die in Texten funktionieren, weil die Zielgruppe sie selbst verwendet
5. "content_ideas" – Konkrete Content-Ideen für Instagram-Posts (Hook-Ansätze, Story-Ideen, Carousel-Themen), die genau diese Pain Points / Wünsche adressieren

Regeln:
- Bulletpoints müssen konkret und spezifisch sein – keine Allgemeinplätze wie "mehr Selbstvertrauen"
- Jeder Punkt: 1 Satz, max. 20 Wörter
- Keine Emojis
- Keine Einleitungen ("Hier sind...") oder Abschluss-Floskeln

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Keine Einleitung, keine Erklärung außerhalb, kein Markdown-Codeblock:

{
  "pain_points": ["...", "...", "...", "...", "..."],
  "desires": ["...", "...", "...", "...", "..."],
  "objections": ["...", "...", "...", "...", "..."],
  "language": ["...", "...", "...", "...", "..."],
  "content_ideas": ["...", "...", "...", "...", "..."]
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
function buildHookMessage({ niche, topic, experience }) {
  const nicheLine = niche ? `Nische: ${niche}` : 'Nische: nicht angegeben';
  const topicLine = `Thema des Posts: "${topic}"`;
  const expBlock = experience && experience.trim()
    ? `\n\nPersönliche Erfahrung / Story (integriere das authentisch, wo es passt):\n"${experience.trim()}"`
    : '';
  return `${nicheLine}\n${topicLine}${expBlock}`;
}

function buildResearchMessage({ niche, audience, offer }) {
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  if (audience && audience.trim()) parts.push(`Zielgruppe: ${audience.trim()}`);
  if (offer && offer.trim()) parts.push(`Angebot / Produkt: ${offer.trim()}`);
  parts.push('\nErstelle den Markt-Report.');
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

  const mode = payload.mode === 'research' ? 'research' : 'hooks';

  let systemPrompt, userMessage;
  if (mode === 'hooks') {
    if (!payload.topic || !String(payload.topic).trim()) {
      return json(400, { error: 'Das Feld "topic" ist erforderlich.' });
    }
    systemPrompt = SYSTEM_PROMPT_HOOKS;
    userMessage = buildHookMessage({
      niche: typeof payload.niche === 'string' ? payload.niche.trim() : '',
      topic: String(payload.topic).trim(),
      experience: typeof payload.experience === 'string' ? payload.experience : '',
    });
  } else {
    if (!payload.niche || !String(payload.niche).trim()) {
      return json(400, { error: 'Das Feld "niche" ist erforderlich.' });
    }
    systemPrompt = SYSTEM_PROMPT_RESEARCH;
    userMessage = buildResearchMessage({
      niche: String(payload.niche).trim(),
      audience: typeof payload.audience === 'string' ? payload.audience : '',
      offer: typeof payload.offer === 'string' ? payload.offer : '',
    });
  }

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
        max_tokens: mode === 'research' ? 2800 : 2048,
        system: systemPrompt,
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
  const match = textOut.match(/\{[\s\S]*\}/);
  if (match) {
    try { parsedJson = JSON.parse(match[0]); } catch (e) {}
  }

  if (mode === 'hooks') {
    return json(200, {
      mode, model: MODEL,
      hooks: parsedJson?.hooks || null,
      raw: textOut,
      usage: data.usage || null,
    });
  } else {
    return json(200, {
      mode, model: MODEL,
      report: parsedJson || null,
      raw: textOut,
      usage: data.usage || null,
    });
  }
};
