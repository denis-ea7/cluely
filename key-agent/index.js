// Simple key-agent service: fetches AI keys from your backend and caches them in RAM.
// Run as a separate Node process on your server: `node index.js`
// SECURITY: Keys come ONLY from backend - no hardcoded defaults or env fallbacks.
// Env:
// - PORT: HTTP port (default 8089)
// - BACKEND_KEYS_URL: absolute URL to fetch keys from (REQUIRED - no fallbacks)
// - BACKEND_AUTH_TOKEN: bearer token or secret for backend auth (optional)
// - CACHE_TTL_MS: cache time (ms) for keys before refresh (default 5 minutes)
// - CORS_ORIGIN: allowed origin for browser-based calls (optional)

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const PORT = Number(process.env.PORT || 8089);
const BACKEND_KEYS_URL = process.env.BACKEND_KEYS_URL;
const BACKEND_AUTH_TOKEN = process.env.BACKEND_AUTH_TOKEN;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 5 * 60 * 1000);
const CORS_ORIGIN = process.env.CORS_ORIGIN;

const app = express();
app.use(express.json());
if (CORS_ORIGIN) {
  app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: false
    })
  );
}

// In-memory cache
let cachedKeys = null;
let cacheTimestamp = 0;

async function fetchKeysFromBackend() {
  if (!BACKEND_KEYS_URL) {
    throw new Error("BACKEND_KEYS_URL is required. Keys must come from backend only.");
  }
  const headers = {};
  if (BACKEND_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${BACKEND_AUTH_TOKEN}`;
  }
  const res = await axios.get(BACKEND_KEYS_URL, { headers, timeout: 15000 });
  // Expected shape (example):
  // {
  //   primary: { token: "sk-***", wsUrl: "wss://...", chatUrl: "https://...", model: "gpt-4.1" },
  //   gemini:  { apiKeys: ["...", "..."] },
  //   ollama:  { url: "http://localhost:11434", model: "llama3.2" } // optional
  // }
  if (!res.data || !Object.keys(res.data).length) {
    throw new Error("Backend returned empty keys response");
  }
  return res.data;
}

async function getKeys(forceRefresh = false) {
  const now = Date.now();
  const isExpired = !cachedKeys || now - cacheTimestamp > CACHE_TTL_MS;
  if (forceRefresh || isExpired) {
    if (!BACKEND_KEYS_URL) {
      throw new Error("BACKEND_KEYS_URL is required. Keys must come from backend only.");
    }
    try {
      cachedKeys = await fetchKeysFromBackend();
      cacheTimestamp = now;
    } catch (e) {
      console.error("[key-agent] Failed to fetch keys from backend:", e.message);
      throw new Error(`Cannot fetch keys from backend: ${e.message}`);
    }
  }
  return cachedKeys;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, updatedAt: cacheTimestamp || null });
});

app.get("/keys", async (req, res) => {
  try {
    const force = String(req.query.force || "") === "1";
    const keys = await getKeys(force);
    res.json(keys);
  } catch (e) {
    console.error("Failed to get keys:", e.message);
    res.status(502).json({ error: "upstream_failed" });
  }
});

// Validate required env on startup
if (!BACKEND_KEYS_URL) {
  console.error("[key-agent] ERROR: BACKEND_KEYS_URL is required. Keys must come from backend only.");
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`[key-agent] listening on ${PORT}`);
  console.log(`[key-agent] fetching keys from: ${BACKEND_KEYS_URL}`);
});


