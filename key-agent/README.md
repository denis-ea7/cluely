Key Agent (AI Keys)
===================

Small Node service that fetches AI keys from your backend and serves them to the app. Caches keys in RAM.

**SECURITY**: Keys come ONLY from backend - no hardcoded defaults or env fallbacks.

Quick Start
-----------
```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
export BACKEND_KEYS_URL=https://your-backend.com/api/keys
export BACKEND_AUTH_TOKEN=your-token  # optional

# 3. Run
npm start
# or
node index.js
```

Environment Variables
--------------------
- **BACKEND_KEYS_URL** (REQUIRED): Absolute URL to your backend endpoint returning keys
- **BACKEND_AUTH_TOKEN** (optional): Bearer token for backend authentication
- **PORT** (optional): Port to listen on (default: 8089)
- **CACHE_TTL_MS** (optional): Cache time in milliseconds (default: 300000 = 5 minutes)
- **CORS_ORIGIN** (optional): Allowed origin for CORS

**Note**: If `BACKEND_KEYS_URL` is not set, the service will exit with error.

Expected Backend Response
-------------------------
Your backend must return JSON in this format:

```json
{
  "primary": {
    "token": "sk-***",
    "wsUrl": "wss://server2.meetingaitools.com/transcribe",
    "chatUrl": "https://lite.meetingaitools.com/v1/chat/completions",
    "model": "gpt-4.1"
  },
  "gemini": {
    "apiKeys": ["GEMINI_KEY_1", "GEMINI_KEY_2"]
  },
  "ollama": {
    "url": "http://localhost:11434",
    "model": "llama3.2"
  }
}
```

Endpoints
---------
- `GET /health` - Health check
- `GET /keys` - Get cached keys
- `GET /keys?force=1` - Force refresh keys from backend

App Integration
---------------
In the Electron app `.env` file, set:
- `KEY_AGENT_URL`: URL of this service, e.g. `http://your-host:8089`
- `KEY_AGENT_CLIENT_TOKEN`: Optional client token (if you add client auth)

The app will:
- Block startup until keys are fetched from key-agent (if `KEY_AGENT_URL` is set)
- Use keys from backend only - no hardcoded defaults

Production Deployment
--------------------
Use PM2 for process management:

```bash
pm2 start index.js --name key-agent
pm2 save
pm2 startup
```

See `../START.md` for full deployment instructions.

