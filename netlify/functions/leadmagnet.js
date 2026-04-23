// Netlify Function: /netlify/functions/leadmagnet
// Generiert 12 Lead-Magnet-Ideen als breite Mischung aus:
// PDF-Guide, Checkliste, Workbook, Template, Swipe-File, Mini-Kurs, Quiz, Audio/Video-Training, Cheatsheet, Script, Case-Study
// Output pro Idee: title, format, promise (hook), outline (3-5 bullets), traffic_source
// 3 Ziele: list (Email-Liste), call (Call-Buchung), launch (Produkt-Launch)
//
// ENV-Variablen:
//   ANTHROPIC_API_KEY  = sk-ant-...
//   ALLOWED_ORIGIN     = https://... (optional, Default "*")

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const VALID_FORMATS = [
  'pdf-guide', 'checkliste', 'workbook', 'template', 'swipe-file',
  'mini-kurs', 'quiz', 'audio-training', 'video-masterclass',
  'cheatsheet', 'script', 'case-study'
];

// ---------------------------------------------------------------------------
// Ziel-Instruktionen
// ---------------------------------------------------------------------------
const GOAL_INSTRUCTIONS = {
  list:
    'Ziel: EMAIL-LISTE aufbauen. Die Ideen müssen niedrige Einstiegshürde haben, schnell konsumierbar sein (5-20 Min), und einen sofortigen Quick-Win liefern. Das Versprechen muss so konkret sein, dass die Zielgruppe innerhalb von Sekunden versteht WAS sie bekommen. Formate bevorzugt: Checkliste, Template, Cheatsheet, Swipe-File, 1-Pager PDF. Aber auch Quiz funktioniert stark.',
  call:
    'Ziel: CALL-BUCHUNG. Die Ideen positionieren den Anbieter als Expert:in und führen den Lead logisch auf ein Gespräch (Strategie-Call, Erstgespräch, Diagnostic-Call). Die Inhalte müssen ein Problem so scharf diagnostizieren, dass die Leser:in am Ende denkt "okay, ich brauche individuelle Hilfe". Formate bevorzugt: Workbook, PDF-Guide, Quiz (mit individueller Auswertung), Audio-Training, Case-Study. Der nächste Schritt im Funnel ist ein Call — das soll sich im Inhalt vorbereiten.',
  launch:
    'Ziel: PRODUKT-LAUNCH vorbereiten. Die Ideen schaffen Problem-Bewusstsein und Lösungs-Verlangen für das kommende Angebot. Sie liefern einen Teil der Transformation — aber nicht genug, dass das Hauptangebot überflüssig wird. Formate bevorzugt: Mini-Kurs (3-5 Email-Lektionen), Video-Masterclass, Case-Study, Workbook. Der Inhalt soll neugierig machen auf das WIE — das WIE kommt im Produkt.',
};

// ---------------------------------------------------------------------------
// SYSTEM-PROMPT
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Du bist Conversion-Stratege für deutschsprachige Coaches, Berater und Solopreneure. Du entwickelst Lead-Magnet-Ideen, die WIRKLICH konvertieren — also nicht generisches "10 Tipps für XY", sondern spezifische, greifbare Inhalte mit einem klaren, unwiderstehlichen Versprechen.

AUFGABE: Liefere GENAU 12 unterschiedliche Lead-Magnet-Ideen als breite Mischung verschiedener Formate.

KRITISCH — Was einen guten Lead-Magnet ausmacht:
- Ein konkretes, messbares Versprechen (nicht "mehr Klarheit" — sondern "Die exakten 7 Sätze, mit denen ich meine Discovery-Calls eröffne")
- Greifbar und spezifisch (benutze Zahlen, Namen, Zeitangaben wenn sinnvoll)
- Löst EIN Problem — nicht drei
- Passt exakt auf die Schwelle vor dem eigentlichen Angebot
- Ist in 5-30 Minuten konsumierbar

FORMATE (nutze eine Mischung — jedes Format höchstens 2-3x):
- "pdf-guide" — strukturierter PDF-Ratgeber (5-15 Seiten)
- "checkliste" — punktebasierte Checkliste (1-2 Seiten)
- "workbook" — interaktives Arbeitsbuch mit Übungen und Freiflächen
- "template" — fertige Vorlage zum Ausfüllen oder Kopieren
- "swipe-file" — Sammlung copy-paste-fähiger Texte/Beispiele
- "mini-kurs" — 3-5 Email-Lektionen oder kurze Video-Serie
- "quiz" — interaktives Quiz mit individueller Auswertung
- "audio-training" — kurzes Audio (10-20 Min) + Begleit-PDF
- "video-masterclass" — aufgezeichnetes Video-Training (20-45 Min)
- "cheatsheet" — 1-Pager visuelle Übersicht
- "script" — wortwörtliche Formulierungen/Scripts für ein Gespräch
- "case-study" — detaillierte Fallstudie eines Kundenerfolgs

Verwende NUR genau diese Bezeichnungen (lowercase, mit Bindestrich wenn oben).

OUTPUT PRO IDEE:
1. "title" — der Titel, der auf der Opt-in-Page steht. Spezifisch, konkret, kein Fluff. Max. 12 Wörter. Beispiele: "Die 5-Minuten-Discovery-Call-Eröffnung, die 80% unserer Calls in Kunden verwandelt" / "Das Ernährungs-Trouble-Shooting-Flowchart: Finde in 3 Fragen deine eigentliche Blockade" / "17 Instagram-DM-Openers für Coaches, die sich nicht nach Verkaufen anfühlen"
2. "format" — eines aus der Format-Liste oben
3. "promise" — das Versprechen in 1 Satz (max. 18 Wörter). Was bekommt der Leser konkret? Was kann er danach was er vorher nicht konnte?
4. "outline" — 3-5 Bullets, die den tatsächlichen Inhalt beschreiben (jeweils max. 14 Wörter). Konkrete Kapitel/Module/Punkte — NICHT nochmal das Versprechen umformuliert.
5. "traffic_source" — 1 Satz, wo/wie dieser Lead-Magnet am besten beworben wird (z.B. "Reel mit dem Problem + Link in Bio" oder "Story-Sequenz nach einem Pain-Point-Post" oder "Carousel mit 3 Bullets aus dem Inhalt"). Max. 18 Wörter.

VARIATION — kritisch:
- Jede Idee muss sich DEUTLICH von den anderen unterscheiden
- Verschiedene Pain-Points/Aha-Momente der Zielgruppe ansprechen
- Mix aus "Quick-Win-Tools" und "Diagnose-Instrumenten" und "Transformation-Startern"
- Verschiedene emotionale Trigger: Zeit sparen, Fehler vermeiden, Klarheit bekommen, Gelegenheit nicht verpassen, besser wirken

Antworte AUSSCHLIESSLICH als reines JSON-Objekt. Kein Markdown, keine Erklärung drumherum:

{
  "ideas": [
    {
      "title": "...",
      "format": "checkliste",
      "promise": "...",
      "outline": ["...", "...", "...", "...", "..."],
      "traffic_source": "..."
    }
  ]
}

WICHTIG: Keine Füll-Ideen. Jede der 12 Ideen muss konkret und ernst umsetzbar sein.`;

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
function buildUserMessage({ niche, audience, offer, goal }) {
  const goalInstr = GOAL_INSTRUCTIONS[goal] || GOAL_INSTRUCTIONS.list;
  const parts = [];
  parts.push(`Nische: ${niche || 'nicht angegeben'}`);
  parts.push(`Zielgruppe (konkret): ${audience}`);
  parts.push(`Hauptangebot / Produkt / Service: ${offer}`);
  parts.push('');
  parts.push(goalInstr);
  parts.push('');
  parts.push('Entwickle jetzt GENAU 12 unterschiedliche Lead-Magnet-Ideen im geforderten JSON-Format. Mische die Formate (jedes Format max. 2-3x).');
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
  const goal = typeof payload.goal === 'string' ? payload.goal : 'list';

  if (!audience) return json(400, { error: 'Das Feld "audience" ist erforderlich.' });
  if (!offer) return json(400, { error: 'Das Feld "offer" ist erforderlich.' });

  const userMessage = buildUserMessage({ niche, audience, offer, goal });

  // Token-Budget — 12 Ideen mit Outline brauchen Platz
  const maxTokens = 5200;

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
      niche, audience, offer, goal,
      ideas: null,
      raw: textOut,
      parseError: 'Antwort konnte nicht als JSON interpretiert werden.',
      usage: data.usage || null,
    });
  }

  // Normalisierung
  const rawIdeas = Array.isArray(parsedJson.ideas) ? parsedJson.ideas : [];
  const ideas = rawIdeas.map(i => {
    const formatRaw = typeof i.format === 'string' ? i.format.trim().toLowerCase() : '';
    const format = VALID_FORMATS.includes(formatRaw) ? formatRaw : 'pdf-guide';
    const outline = Array.isArray(i.outline)
      ? i.outline.map(b => String(b || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    return {
      title: typeof i.title === 'string' ? i.title.trim() : '',
      format,
      promise: typeof i.promise === 'string' ? i.promise.trim() : '',
      outline,
      traffic_source: typeof i.traffic_source === 'string' ? i.traffic_source.trim() : '',
    };
  }).filter(i => i.title && i.promise);

  return json(200, {
    model: MODEL,
    niche, audience, offer, goal,
    ideas,
    raw: textOut,
    usage: data.usage || null,
  });
};
