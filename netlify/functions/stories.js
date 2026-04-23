// Netlify Function: /netlify/functions/stories
// Generiert eine komplette Instagram-Story-Sequenz:
//   - 5/8/12 Stories nach Wahl
//   - Pro Story: Overlay-Text, Visual-Beschreibung, Sticker-Empfehlung
//   - 4 Ziele: engagement, dms, link, launch
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const VALID_STICKERS = ['poll', 'question', 'quiz', 'slider', 'countdown', 'link', 'music', 'none'];

// ---------------------------------------------------------------------------
// Ziel-Instruktionen
// ---------------------------------------------------------------------------
const GOAL_INSTRUCTIONS = {
  engagement:
    'Ziel: ENGAGEMENT. Maximiere Antworten, Umfrage-Teilnahmen, Frage-Antworten und Slider-Interaktionen. Die Sequenz muss mehrere interaktive Sticker enthalten. Der Opener muss sofort Neugier erzeugen (erstes Bild = zentral). Letzte Story fasst zusammen oder liefert das Ergebnis/den Payoff.',
  dms:
    'Ziel: DMs. Die Sequenz baut gezielt auf einen DM-Impuls hin. Mittendrin wird ein spezifisches Keyword oder ein Angebot angedeutet, das man per DM anfragen kann (z.B. "Schreib mir \'REIHENFOLGE\' — ich schicke dir die Liste"). Der Frage-Sticker am Ende öffnet konkret Gespräche.',
  link:
    'Ziel: LINK-KLICKS. Die Sequenz führt gezielt auf eine Landingpage / ein Angebot / ein Freebie. Story 1 = Hook, Story 2–(N-2) = Problem/Wert/Beweis, vorletzte Story = Zusammenfassung, letzte Story = Link-Sticker mit klarem CTA. Der Link-Sticker-Text muss knackig sein ("JETZT HOLEN", "HIER KLICKEN" ist zu generisch).',
  launch:
    'Ziel: LAUNCH-ANKÜNDIGUNG. Die Sequenz baut Spannung für ein neues Angebot/Produkt/Event auf. Nutze Countdown-Sticker sinnvoll. Erzeuge Dringlichkeit ohne zu drücken. Erste Story teast, mittlere Stories zeigen WAS + FÜR WEN + WARUM, letzte Story ist entweder Vorverkaufs-Ankündigung oder Link.',
};

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist Story-Stratege für deutschsprachige Coaches, Berater und Solopreneure. Du entwickelst Instagram-Story-Sequenzen, die echte Interaktion auslösen.

AUFGABE: Liefere eine komplette Story-Sequenz mit exakter Anzahl Stories. Jede Story hat Overlay-Text, Visual-Beschreibung und (falls sinnvoll) einen Sticker-Vorschlag.

STRUKTUR DER SEQUENZ:
- Story 1 = Opener: Hook, der scroll-stoppt. Muss die Zielgruppe direkt ansprechen oder eine Frage/Aussage bringen, die sofort relatable ist.
- Mittlere Stories = Aufbau: bringen Kontext, Story, Beweis oder Problem/Lösung.
- Letzte Story = CTA passend zum Ziel.

OVERLAY-TEXT (Pflicht pro Story):
- Das, was visuell auf der Story geschrieben steht.
- MAX. 15 Wörter pro Story. Stories sind visuell — kein Roman.
- Keine kompletten Sätze nötig wenn Fragmente stärker sind.
- Emojis sparsam, nur wenn sie echten Mehrwert haben.

VISUAL-BESCHREIBUNG (Pflicht pro Story):
- Konkreter Vorschlag was zu sehen ist. Z.B. "Selfie, du sprichst direkt in Kamera" / "Screenshot einer DM mit unkenntlicher Absender-Info" / "Großes Zitat zentriert auf einfarbigem Accent-BG" / "Hand-Nahaufnahme, Notizbuch mit Stichwort markiert".
- NICHT "ein schönes Bild" — sei spezifisch.
- Max. 15 Wörter.

STICKER-EMPFEHLUNG (pro Story wenn sinnvoll):
Wähle GENAU EINEN aus:
- "poll" (Umfrage, 2 Optionen) — erfordert poll_options: ["A", "B"]
- "question" (Frage-Sticker) — erfordert question_prompt: "..."
- "quiz" (Quiz, 2–4 Optionen, 1 richtig) — erfordert quiz: { question, options: [], correct_index }
- "slider" (Emoji-Slider) — erfordert slider: { question, emoji }
- "countdown" (Countdown auf Event) — erfordert countdown_label: "..."
- "link" (Link-Sticker) — erfordert link_text: "..." (der Button-Text)
- "music" (Musik-Sticker)
- "none" (kein Sticker auf dieser Story)

Nicht jede Story braucht einen Sticker. Opener oft ohne, Peak-Momente mit Interaktions-Sticker, CTA mit Link/Question.

ZUSÄTZLICH — rolle pro Story:
- "opener" für Story 1
- "build" für mittlere Stories
- "cta" für die letzte Story

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Kein Markdown:

{
  "stories": [
    {
      "role": "opener",
      "overlay_text": "...",
      "visual": "...",
      "sticker": "none",
      "sticker_data": null
    },
    {
      "role": "build",
      "overlay_text": "...",
      "visual": "...",
      "sticker": "poll",
      "sticker_data": { "poll_options": ["A", "B"] }
    },
    {
      "role": "cta",
      "overlay_text": "...",
      "visual": "...",
      "sticker": "link",
      "sticker_data": { "link_text": "..." }
    }
  ]
}

WICHTIG: Schreibe kompakt. Max. Wörter beachten. Keine langen Beschreibungen.`;

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
function buildUserMessage({ niche, topic, goal, storyCount }) {
  const goalInstr = GOAL_INSTRUCTIONS[goal] || GOAL_INSTRUCTIONS.engagement;
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  parts.push(`Thema der Story-Sequenz: ${topic}`);
  parts.push(`Anzahl Stories: GENAU ${storyCount}.`);
  parts.push('');
  parts.push(goalInstr);
  parts.push('');
  parts.push(`Liefere jetzt die vollständige Sequenz mit genau ${storyCount} Stories im geforderten JSON-Format.`);
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
  const goal = typeof payload.goal === 'string' ? payload.goal : 'engagement';
  let storyCount = parseInt(payload.storyCount, 10);
  if (![5, 8, 12].includes(storyCount)) storyCount = 8;

  if (!topic) return json(400, { error: 'Das Feld "topic" ist erforderlich.' });

  const userMessage = buildUserMessage({ niche, topic, goal, storyCount });

  // Token-Budget großzügig
  const maxTokens =
    storyCount === 12 ? 4500 :
    storyCount === 8  ? 3200 :
                        2200;

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
      niche, topic, goal, storyCount,
      stories: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
      usage: data.usage || null,
    });
  }

  // Normalisierung
  const rawStories = Array.isArray(parsedJson.stories) ? parsedJson.stories : [];
  const stories = rawStories.map(s => {
    const stickerRaw = typeof s.sticker === 'string' ? s.sticker.trim().toLowerCase() : 'none';
    const sticker = VALID_STICKERS.includes(stickerRaw) ? stickerRaw : 'none';
    return {
      role: typeof s.role === 'string' ? s.role : 'build',
      overlay_text: typeof s.overlay_text === 'string' ? s.overlay_text.trim() : '',
      visual: typeof s.visual === 'string' ? s.visual.trim() : '',
      sticker,
      sticker_data: (s.sticker_data && typeof s.sticker_data === 'object') ? s.sticker_data : null,
    };
  }).filter(s => s.overlay_text);

  return json(200, {
    model: MODEL,
    niche, topic, goal, storyCount,
    stories,
    raw: textOut,
    usage: data.usage || null,
  });
};
