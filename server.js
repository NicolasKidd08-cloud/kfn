// ═══════════════════════════════════════════════════
//  NEXA HUB API  —  deploy free on Railway / Render
//  npm install express cors
//  node server.js
// ═══════════════════════════════════════════════════

const express = require("express");
const cors    = require("cors");
const app     = express();
const PORT    = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── IN-MEMORY STORE ────────────────────────────────
let finds    = [];   // rolling 5-minute find list
let presence = {};   // { username: { userId, username, tag, lastSeen } }

const FIND_TTL     = 5 * 60 * 1000;   // 5 minutes
const PRESENCE_TTL = 2 * 60 * 1000;   // 2 minutes

// purge expired entries periodically
setInterval(() => {
    const now = Date.now();
    finds    = finds.filter(f => now - f.timestamp * 1000 < FIND_TTL);
    for (const k in presence) {
        if (now - presence[k].lastSeen > PRESENCE_TTL) delete presence[k];
    }
}, 15_000);

// ── GET /get-finds ─────────────────────────────────
// Query: ?since=<unix_seconds>   (0 = all recent)
app.get("/get-finds", (req, res) => {
    const since = Number(req.query.since) || 0;
    const out   = finds.filter(f => f.timestamp > since);
    res.json({ finds: out, serverTime: Math.floor(Date.now() / 1000) });
});

// ── POST /report-find ──────────────────────────────
// Body: { name, rarity, genText, jobId, botName, isDuel? }
app.post("/report-find", (req, res) => {
    const { name, rarity, genText, jobId, botName, isDuel } = req.body;
    if (!name || !jobId) return res.status(400).json({ error: "missing name or jobId" });

    // simple dedupe: skip if same name+jobId within last 60 s
    const now      = Math.floor(Date.now() / 1000);
    const existing = finds.find(
        f => f.name === name && f.jobId === jobId && now - f.timestamp < 60
    );
    if (existing) return res.json({ status: "dupe", id: existing.id });

    const entry = {
        id:        crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        name, rarity: rarity || "S", genText: genText || "",
        jobId, botName: botName || "unknown",
        isDuel:    !!isDuel,
        timestamp: now,
    };
    finds.unshift(entry);
    if (finds.length > 500) finds = finds.slice(0, 500);  // cap

    console.log(`[FIND] ${entry.name} | ${entry.genText} | ${entry.botName}`);
    res.json({ status: "ok", id: entry.id });
});

// ── POST /presence ─────────────────────────────────
// Body: { userId, username, tag? }
app.post("/presence", (req, res) => {
    const { userId, username, tag } = req.body;
    if (!username) return res.status(400).json({ error: "missing username" });
    presence[username] = { userId, username, tag: tag || "BOT", lastSeen: Date.now() };
    res.json({ status: "ok" });
});

// ── GET /presence ──────────────────────────────────
app.get("/presence", (_req, res) => {
    res.json({ users: Object.values(presence) });
});

// ── GET /  (health check) ──────────────────────────
app.get("/", (_req, res) => {
    res.json({
        status  : "online",
        finds   : finds.length,
        presence: Object.keys(presence).length,
    });
});

app.listen(PORT, () => console.log(`[Nexa API] running on :${PORT}`));
