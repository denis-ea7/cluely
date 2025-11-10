// realtime_auto_stream.js
// транскрипция по WebSocket + автоотправка текста в GPT каждые 5 секунд

const WebSocket = require("ws");
const Mic = require("mic");
const https = require("https");

const WS_URL = "wss://server2.meetingaitools.com/transcribe";
const CHAT_URL = "https://lite.meetingaitools.com/v1/chat/completions";
const TOKEN = "sk-J--S5q2AN323UnA3mFSD4A";
const MODEL = "gpt-4.1";

let mic;
let lastText = "";
let lastSent = "";
let timer;

// === функция стрима ответа GPT ===
function streamChatAnswer(text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [{ role: "user", content: text }],
    });

    const req = https.request(
      CHAT_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.setEncoding("utf8");
        console.log(`\n🤖 Ответ на: "${text}"`);
        res.on("data", (chunk) => {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.replace("data:", "").trim();
            if (data === "[DONE]") {
              console.log("\n[готово]");
              resolve();
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content;
              if (delta) process.stdout.write(delta);
            } catch {}
          }
        });
      }
    );

    req.on("error", (err) => console.error("GPT ошибка:", err.message));
    req.write(payload);
    req.end();
  });
}

// === микрофон ===
function startMic(sendChunk) {
  mic = Mic({
    rate: "16000",
    channels: "1",
    bitwidth: "16",
    encoding: "signed-integer",
    endian: "little",
  });
  const stream = mic.getAudioStream();
  stream.on("data", (chunk) => sendChunk(chunk));
  stream.on("error", (err) => console.error("🎙️ Ошибка микрофона:", err.message));
  mic.start();
  console.log("🎙️ Микрофон запущен.");
}

// === websocket ===
const ws = new WebSocket(WS_URL, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});

ws.on("open", () => {
  console.log("🌐 Подключено к WebSocket, handshake...");
  ws.send(
    JSON.stringify({
      type: "start",
      intent: "transcription",
      language: "ru",
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
    })
  );

  startMic((chunk) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
  });

  // каждые 5 сек отправлять последний текст, если он изменился
  timer = setInterval(async () => {
    if (lastText && lastText !== lastSent) {
      lastSent = lastText;
      await streamChatAnswer(lastSent);
    }
  }, 5000);
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.type === "interim" && msg.text) {
      lastText = msg.text;
      process.stdout.write(`\r💬 ${msg.text.slice(-80)}   `);
    }
  } catch {
    console.log("RAW:", data.toString());
  }
});

ws.on("error", (e) => console.error("WS ошибка:", e.message));
ws.on("close", (c, r) => {
  clearInterval(timer);
  console.log("\n🔒 WS закрыт", c, r.toString());
});

process.on("SIGINT", () => {
  console.log("\n⏹️ Завершение...");
  clearInterval(timer);
  if (mic) mic.stop();
  ws.close(1000, "client_shutdown");
  process.exit(0);
});
