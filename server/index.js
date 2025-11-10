import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import pkg from "pg"

dotenv.config()

const { Pool } = pkg
const app = express()
app.use(express.json())
app.use(cors())

const PORT = process.env.PORT || 4000
const JWT_SECRET = process.env.JWT_SECRET || "change-me"
const BACKEND_KEYS_AUTH = process.env.BACKEND_KEYS_AUTH || "change-me-keys"
const PRIMARY_TOKEN = process.env.PRIMARY_TOKEN
const PRIMARY_WS_URL = process.env.PRIMARY_WS_URL
const PRIMARY_CHAT_URL = process.env.PRIMARY_CHAT_URL
const PRIMARY_MODEL = process.env.PRIMARY_MODEL
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || "")
  .split(/[,\s]+/)
  .map(s => s.trim())
  .filter(Boolean)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
    || `postgresql://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD || "postgres"}@${process.env.POSTGRES_HOST || "db"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "cluely"}`,
})

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `)
}

// Auth: register
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body || {}
    console.log(`[api] Registration attempt for email: ${email ? email.substring(0, 5) + '...' : 'none'}`)
    if (!email || !password) {
      console.log("[api] Registration failed: email or password missing")
      return res.status(400).json({ error: "email_password_required" })
    }
    const hash = await bcrypt.hash(password, 10)
    await pool.query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [email.toLowerCase(), hash])
    console.log(`[api] Registration successful for email: ${email.substring(0, 5)}...`)
    res.json({ ok: true })
  } catch (e) {
    if (String(e?.message || "").includes("duplicate")) {
      console.log("[api] Registration failed: email already exists")
      return res.status(409).json({ error: "email_exists" })
    }
    console.error("[api] Registration error:", e)
    res.status(500).json({ error: "server_error" })
  }
})

// Auth: login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {}
    console.log(`[api] Login attempt for email: ${email ? email.substring(0, 5) + '...' : 'none'}`)
    if (!email || !password) {
      console.log("[api] Login failed: email or password missing")
      return res.status(400).json({ error: "email_password_required" })
    }
    const r = await pool.query("SELECT id, password_hash FROM users WHERE email=$1", [email.toLowerCase()])
    if (!r.rowCount) {
      console.log("[api] Login failed: user not found")
      return res.status(401).json({ error: "invalid_credentials" })
    }
    const user = r.rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      console.log("[api] Login failed: invalid password")
      return res.status(401).json({ error: "invalid_credentials" })
    }
    const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: "7d" })
    console.log(`[api] Login successful, token generated: ${token.substring(0, 20)}...`)
    res.json({ token })
  } catch (e) {
    console.error("[api] Login error:", e)
    res.status(500).json({ error: "server_error" })
  }
})

// Deep link redirect (optional helper): /deeplink?token=xxx -> cluely://auth?token=xxx
app.get("/deeplink", (req, res) => {
  const token = req.query.token
  if (!token) return res.status(400).send("token required")
  const scheme = process.env.DEEPLINK_SCHEME || "cluely"
  res.redirect(`${scheme}://auth?token=${encodeURIComponent(token)}`)
})

// Keys endpoint for key-agent
app.get("/keys", (req, res) => {
  try {
    const auth = req.headers.authorization || ""
    const token = auth.replace(/^Bearer\s+/i, "")
    if (!token || token !== BACKEND_KEYS_AUTH) {
      return res.status(401).json({ error: "unauthorized" })
    }
    if (!PRIMARY_TOKEN || !PRIMARY_WS_URL || !PRIMARY_CHAT_URL || !PRIMARY_MODEL) {
      return res.status(500).json({ error: "primary_keys_not_configured" })
    }
    res.json({
      primary: {
        token: PRIMARY_TOKEN,
        wsUrl: PRIMARY_WS_URL,
        chatUrl: PRIMARY_CHAT_URL,
        model: PRIMARY_MODEL
      },
      gemini: GEMINI_API_KEYS.length ? { apiKeys: GEMINI_API_KEYS } : undefined
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "server_error" })
  }
})

app.get("/health", (_req, res) => res.json({ ok: true }))

initDb()
  .then(() => app.listen(PORT, () => console.log(`[api] listening on ${PORT}`)))
  .catch((e) => {
    console.error("DB init failed:", e)
    process.exit(1)
  })


