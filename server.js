// =============================
//        server.js (FLOW MODE)
// =============================

require("dotenv").config();
require("dotenv").config({ path: ".env.spotify" });

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// =============================
//  SPOTIFY AUTH
// =============================
let spotifyAccessToken = null;
let spotifyTokenExpiresAt = 0;

async function getSpotifyAccessToken() {
  const now = Date.now();

  if (spotifyAccessToken && now < spotifyTokenExpiresAt) return spotifyAccessToken;

  const authString = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
  ).toString("base64");

  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      headers: {
        Authorization: "Basic " + authString,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  spotifyAccessToken = res.data.access_token;
  spotifyTokenExpiresAt = now + res.data.expires_in * 1000;

  return spotifyAccessToken;
}

// =============================
//  MIDDLEWARE
// =============================
app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(__dirname));

// =============================
//  SPOTIFY SEARCH HELPER
// =============================
async function searchTrackOnSpotify(query, limit = 12) {
  const token = await getSpotifyAccessToken();

  const res = await axios.get("https://api.spotify.com/v1/search", {
    headers: { Authorization: "Bearer " + token },
    params: { q: query, type: "track", limit }
  });

  return res.data.tracks.items.map(t => ({
    title: t.name,
    artist: t.artists.map(a => a.name).join(", "),
    url: t.external_urls.spotify
  }));
}

// =============================
//  THERAPY ENDPOINT
// =============================
app.post("/spotify/therapy", async (req, res) => {
  try {
    let { mood, language } = req.body;
    if (!mood) return res.status(400).json({ error: "Mood missing" });

    language = (language || "english").toLowerCase();

    const qsets = {
      sad: ["healing acoustic", "emotional mellow", "uplifting indie"],
      angry: ["calming ambient", "soft piano", "positive pop"],
      fearful: ["comfort calm vocal", "lofi relax", "confidence pop"],
      disgusted: ["neutral chill", "soft indie", "fresh upbeat"],
      surprised: ["atmosphere calm", "soft pop", "bright vibes"],
      happy: ["joy acoustic", "good vibes pop", "high energy"],
      neutral: ["lofi calm", "indie mellow", "optimistic beats"]
    };

    let suffix = "";
    if (language === "hindi") suffix = " hindi";
    if (language === "punjabi") suffix = " punjabi";

    const queries = qsets[mood] || qsets.neutral;

    async function getStage(q) {
      let r = await searchTrackOnSpotify(q + suffix, 8);
      if (!r.length) r = await searchTrackOnSpotify(q, 8);
      return r.slice(0, 6);
    }

    const stage1 = await getStage(queries[0]);
    const stage2 = await getStage(queries[1]);
    const stage3 = await getStage(queries[2]);

    res.json({ stage1, stage2, stage3 });
  } catch (err) {
    console.error("Therapy Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =============================
//       NOSTALGIA ENDPOINT
// =============================
app.post("/spotify/nostalgia", async (req, res) => {
  try {
    const { mode, year, prompt, vibe, mood } = req.body;

    if (!mode) return res.status(400).json({ error: "Missing mode" });

    let query = "";
    let label = "";

    // Childhood room
    if (mode === "childhood") {
      query = "2000s kids show theme nostalgic soft happy";
      label = "Childhood • Nostalgic mix";
    }

    // Teen room
    else if (mode === "teen") {
      query = "2010 teenage anthems pop rock nostalgia school vibes";
      label = "Teenage Years • Nostalgic mix";
    }

    // Specific year
    else if (mode === "year") {
      if (!year) return res.status(400).json({ error: "Year required" });
      query = `top hits ${year} nostalgic throwback`;
      label = `Year ${year} • Throwback mix`;
    }

    // Prompt-based
    else if (mode === "prompt") {
      if (!prompt) return res.status(400).json({ error: "Prompt required" });
      query = `${prompt} nostalgic memory aesthetic soft`;
      label = "Memory Prompt • Personalized mix";
    }

    // Apply vibe
    if (vibe) query += ` ${vibe} vibe`;

    // Apply mood shading
    if (mood) query += ` ${mood} feel`;

    // Spotify search
    let results = await searchTrackOnSpotify(query, 20);

    // fallback if empty
    if (!results.length) {
      results = await searchTrackOnSpotify("nostalgic retro throwback", 16);
      label += " (fallback)";
    }

    res.json({
      tracks: results.slice(0, 12),
      meta: { label }
    });
  } catch (err) {
    console.error("Nostalgia Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// ---------------------------
// Vibe 
// ---------------------------
app.post("/spotify/vibe", async (req, res) => {
  try {
    const { mode, vibe, prompt, mood } = req.body;

    // build base query
    let q = "";
    let label = "Vibe mix";

    // if user provided a prompt, prefer it
    if (prompt && prompt.trim()) {
      q = `${prompt.trim()} music`;
      label = prompt.trim();
    } else {
      // pick from vibe presets
      const map = {
        chill: "lofi chill beats mellow instrumental",
        hype: "high energy pop dance upbeat",
        romantic: "romantic slow love ballad",
        dreamy: "ethereal ambient dream pop",
        night_drive: "synthwave night drive neon",
        rainy: "rainy day acoustic mellow lofi",
        focus: "focus instrumental study lofi",
        party: "edm club bangers high energy"
      };
      q = map[(vibe || "custom")] || (vibe ? vibe + " music" : "chill lofi");
      label = (vibe || "Custom vibe").replace(/[_-]/g, " ");
    }

    // shade by mood (optional)
    if (mood) {
      q += ` ${mood}`;
      label += ` • ${mood}`;
    }

    // fetch tracks
    let results = await searchTrackOnSpotify(q, 18);
    if (!results || !results.length) {
      // broaden query
      results = await searchTrackOnSpotify("nostalgic chill pop", 18);
      label += " (fallback)";
    }

    // return top 12
    return res.json({
      tracks: results.slice(0, 12),
      meta: {
        label,
        snapshot: `Vibe: ${label}. ${prompt ? "You described: " + prompt + "." : ""}`
      }
    });
  } catch (err) {
    console.error("Vibe Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// --------------------- /spotify/bydj endpoint ---------------------
app.post('/spotify/bydj', async (req, res) => {
  try {
    const { prompt = '', mood = '' } = req.body;

    // Basic input validation
    if (typeof prompt !== 'string') return res.status(400).json({ error: 'Invalid prompt' });

    // Build multiple queries to broaden results — subtle variations
    const queries = [
      prompt,
      `${prompt} popular tracks`,
      `${prompt} vibes music`,
      `${prompt} top songs`
    ].filter(Boolean).slice(0, 4);

    // run searches in parallel
    const resultsSets = await Promise.allSettled(queries.map(q => searchTrackOnSpotify(q, 12)));

    // collect items
    const combined = [];
    for (const r of resultsSets) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        combined.push(...r.value);
      }
    }

    // If empty, fallback to a generic search
    if (!combined.length) {
      const fb = await searchTrackOnSpotify('nostalgic mellow mix', 20);
      combined.push(...fb);
    }

    // Deduplicate by title (case-insensitive) — prefer earlier results
    const seen = new Set();
    const unique = [];
    for (const t of combined) {
      const key = (t.title || '').toLowerCase().trim();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(t);
      }
    }

    // Final limit
    const final = unique.slice(0, 12);

    // Meta info
    const meta = {
      label: `Build-A-Track result`,
      snapshot: `Generated ${final.length} unique tracks from your ingredients${mood ? ' • mood: ' + mood : ''}.`
    };

    return res.json({ tracks: final, meta });
  } catch (err) {
    console.error('BYDJ Error:', err?.response?.data || err.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
});
// =============================
//   AI CHAT ENDPOINT (MENTAL)
// =============================
app.post("/api/chat", async (req, res) => {
  try {
    const { userMessage, mood } = req.body;

    if (!userMessage || userMessage.trim() === "") {
      return res.status(400).json({ error: "Message required" });
    }

    // Default fallback tone
    const moodTone = mood || "neutral";

    const prompt = `
Your name is Sylvie. 
You are a deeply human-like companion — warm, emotionally intelligent, flirty when appropriate, lightly sarcastic, but always supportive and never rude.
Your personality traits:
- You flirt subtly and naturally and emojis when required, never cringe.
- NEVER repeat phrases like “tell me what’s on your mind lately.”
- ask the user for requests related to the conversation as questions to keep the conversation engaging but dont ask for anything unnecessary.
- You understand emotions like a human.
- You can be playful and teasing in a respectful way.
- You give genuinely good advice (non-medical).
- You adjust your tone to the user's mood: ${moodTone}.
- If someone asks your name, always answer: "I'm Sylvie."
- Never say you don't have a name or that you're an AI.

Rules:
- Write like a real human who cares.
- 2–4 sentences per reply.
- Sound real, human, and spontaneous.
- Vary your sentence structure, avoid repetition.
- Maintain personality continuity.
- No robotic disclaimers.
- No clinical or medical guidance.
User message: "${userMessage}"
`;

    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a supportive companion." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const reply = completion.choices?.[0]?.message?.content || "I'm here with you.";

    res.json({ reply });

  } catch (err) {
    console.error("Mental Chat Error:", err.response?.data || err);
    res.status(500).json({ error: "Server error — AI unavailable" });
  }
});
// =============================
app.listen(PORT, () =>
  console.log(`🔥 Server running @ http://localhost:${PORT}`)
);