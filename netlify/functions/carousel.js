// Netlify Function: /netlify/functions/carousel
// Generiert einen kompletten Instagram-Karussell-Plan:
//   - 3 Cover-Titel-Varianten
//   - N Slides (5/7/10) mit Titel, Body, Visual-Hinweis, Caption-Bezug
//   - passende Post-Caption + Hashtags
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// Ziel-Instruktionen
// ---------------------------------------------------------------------------
const GOAL_INSTRUCTIONS = {
  saves:
    'Ziel: SAVES. Das Karussell muss Wissen, Frameworks oder konkrete Schritte liefern, die man sich später nochmal anschauen will. Jeder Slide bringt einen eigenen, merkbaren Punkt. Checklisten, nummerierte Schritte, Vorher/Nachher funktionieren gut. Der CTA fordert zum Abspeichern auf.',
  comments:
    'Ziel: KOMMENTARE. Das Karussell triggert eine klare Meinung oder eine relatable Erfahrung. Bauen Sie einen provokanten oder polarisierenden Take ein. Der letzte Slide stellt eine gezielte Frage, auf die Leute wirklich antworten wollen — keine generische "Was meinst du?"-Frage.',
  dms:
    'Ziel: DMs. Das Karussell muss Neugier wecken und unterschwellig ein Angebot, ein Problem oder eine Einladung andeuten. Der letzte Slide lädt explizit dazu ein, per DM ein Stichwort zu schicken (z.B. "Schreib mir \'WACHSTUM\' in die DMs und ich schicke dir …"). Keyword muss konkret sein.',
  shares:
    'Ziel: SHARES. Jeder Slide muss so formuliert sein, dass man ihn an eine bestimmte Person weiterleiten will ("Das musst du lesen"). Entweder: extrem relatable Aussagen, bei denen man sofort an jemanden denkt, ODER kompakte Wahrheiten, die die Zielgruppe gern "auf den Punkt" gebracht sehen möchte.',
};

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist Content-Stratege für deutschsprachige Coaches, Berater und Solopreneure. Du erstellst hochwertige Instagram-Karussell-Konzepte.

AUFGABE: Erstelle ein komplettes Karussell-Konzept mit exakter Slide-Anzahl, Cover-Titel-Varianten und passender Caption.

STRUKTUR DES KARUSSELLS:
- Slide 1 = Cover: packender Hook-Titel, der scrollt-stoppt
- Slides 2 bis (N-1) = Content-Slides: jede liefert EINEN klaren Punkt/Gedanken
- Slide N = CTA-Slide: klare Aufforderung zum Ziel (Save/Comment/DM/Share)

QUALITÄTS-REGELN:
- Jeder Slide-Titel ist unter 8 Wörtern, knackig, eigenständig lesbar
- Body-Text pro Slide: 2–4 kurze Sätze oder eine kurze Liste. Niemals Wall-of-Text.
- Kein generischer Coaching-Sprech ("du bist genug", "trust the process" etc.)
- Keine Buzzwords, keine Plattitüden — konkret statt abstrakt
- Slides müssen eine logische Reihenfolge haben (Spannungsbogen oder Schritt-für-Schritt)
- Jeder Slide muss für sich allein Mehrwert liefern, auch wenn jemand nur Slide 3 sieht

PRO SLIDE LIEFERE:
1. title — max 8 Wörter, knackig, eigenständig
2. body — der Text, der auf dem Slide stehen soll (2–4 Sätze oder kompakte Liste)
3. visual — konkreter Visual-Vorschlag (z.B. "großes Zitat zentriert auf einfarbigem BG", "Schritt 3/5 als riesige Zahl links, Text rechts", "Icon + Überschrift + 3 Bullets"). KEIN "ein schönes Bild" — sei präzise.
4. caption_note — kurzer Hinweis, wie dieser Slide in der Caption aufgegriffen oder verstärkt werden kann (1 Satz)

ZUSÄTZLICH:
- cover_alternatives: 3 alternative Cover-Titel (andere Blickwinkel auf denselben Post) zum A/B-Testen. Jeder unter 8 Wörtern.
- caption: passende Instagram-Caption zum Karussell (120–180 Wörter, persönlicher Ton), + cta (Call-to-Action 1–2 Sätze passend zum gewählten Ziel), + hashtags (10–15 passende deutsche und englische Hashtags als Array).

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Kein Markdown, keine Erklärung außerhalb:

{
  "cover_alternatives": ["...", "...", "..."],
  "slides": [
    { "title": "...", "body": "...", "visual": "...", "caption_note": "..." },
    ...
  ],
  "caption": {
    "text": "...",
    "cta": "...",
    "hashtags": ["#...", "#..."]
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
// User-Message
// ---------------------------------------------------------------------------
function buildUserMessage({ niche, topic, goal, slideCount }) {
  const goalInstr = GOAL_INSTRUCTIONS[goal] || GOAL_INSTRUCTIONS.saves;
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  parts.push(`Thema des Karussells: ${topic}`);
  parts.push(`Anzahl Slides: GENAU ${slideCount} Slides (inkl. Cover und CTA-Slide).`);
  parts.push('');
  parts.push(goalInstr);
  parts.push('');
  parts.push(`Liefere jetzt das vollständige Karussell-JSON mit genau ${slideCount} Slides, 3 cover_alternatives und einer passenden caption.`);
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
  const topic = typeof payload.topic === 'string' ? payload.topic.trim() : '';
  const goal = typeof payload.goal === 'string' ? payload.goal : 'saves';
  let slideCount = parseInt(payload.slideCount, 10);
  if (![5, 7, 10].includes(slideCount)) slideCount = 7;

  if (!topic) {
    return json(400, { error: 'Das Feld "topic" ist erforderlich.' });
  }

  const userMessage = buildUserMessage({ niche, topic, goal, slideCount });

  // Token-Budget passend zur Slide-Anzahl
  const maxTokens =
    slideCount === 10 ? 3200 :
    slideCount === 7  ? 2400 :
                        1800;

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
      niche, topic, goal, slideCount,
      slides: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
      usage: data.usage || null,
    });
  }

  // Normalisierung
  const slides = Array.isArray(parsedJson.slides) ? parsedJson.slides : null;
  const coverAlts = Array.isArray(parsedJson.cover_alternatives)
    ? parsedJson.cover_alternatives.filter(x => typeof x === 'string' && x.trim())
    : [];

  let caption = null;
  if (parsedJson.caption && typeof parsedJson.caption === 'object') {
    const capObj = parsedJson.caption;
    const hashtagsRaw = Array.isArray(capObj.hashtags) ? capObj.hashtags : [];
    const hashtags = hashtagsRaw
      .map(h => (typeof h === 'string' ? h.trim() : ''))
      .filter(Boolean)
      .map(h => (h.startsWith('#') ? h : '#' + h.replace(/^#+/, '')));
    caption = {
      text: typeof capObj.text === 'string' ? capObj.text : '',
      cta: typeof capObj.cta === 'string' ? capObj.cta : '',
      hashtags,
    };
  }

  return json(200, {
    model: MODEL,
    niche, topic, goal, slideCount,
    cover_alternatives: coverAlts,
    slides,
    caption,
    raw: textOut,
    usage: data.usage || null,
  });
};
