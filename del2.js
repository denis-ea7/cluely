const WebSocket = require("ws");
const Mic = require("mic");
const https = require("https");
const readline = require("readline");

const WS_URL = "wss://server2.meetingaitools.com/transcribe";
const CHAT_URL = "https://lite.meetingaitools.com/v1/chat/completions";
const TOKEN = "sk-J--S5q2AN323UnA3mFSD4A";
const MODEL = "gpt-4.1";

let mic;
let ws;
let lastText = "";
let lastSent = "";
let timer = null;

// ======================================================
// GPT STREAM FUNCTION
// ======================================================
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

// ======================================================
// MIC START / STOP
// ======================================================
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

function stopMic() {
  if (mic) {
    mic.stop();
    console.log("🛑 Микрофон остановлен");
  }
}

// ======================================================
// START WS STREAM
// ======================================================
function startStream() {
  return new Promise((resolve) => {
    ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    ws.on("open", () => {
      console.log("\n🌐 Подключено к WebSocket");

      ws.send(
        JSON.stringify({
          type: "start",
          intent: "transcription",
          language: "ru",
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
        })
      );

      // запуск микрофона
      startMic((chunk) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      });

      // таймер GPT
      timer = setInterval(async () => {
        if (lastText && lastText !== lastSent) {
          lastSent = lastText;
          // await streamChatAnswer(lastSent);
        }
      }, 1000);

      resolve();
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

    ws.on("close", () => {
      console.log("🔌 WS закрыт");
      clearInterval(timer);
    });

    ws.on("error", (e) => console.error("WS ошибка:", e.message));
  });
}

// ======================================================
// STOP WS STREAM
// ======================================================
function stopStream() {
  return new Promise((resolve) => {
    console.log("\n🛑 Остановка стрима...");

    clearInterval(timer);

    stopMic();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "manual_stop");
    }

    setTimeout(resolve, 200); // дать время закрыться
  });
}

// ======================================================
// HOTKEY: SPACE → stop 3 seconds → restart
// ======================================================
function setupKeyboard() {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  console.log('\n⛔ Нажми ПРОБЕЛ чтобы остановить стрим на 3 секунды');

  process.stdin.on("keypress", async (str, key) => {
    if (key.name === "space") {
      console.log("\n⏸ Пауза 3 секунды...");
      await streamChatAnswer(lastSent);
      await stopStream();
      await new Promise((r) => setTimeout(r, 3000));
      console.log("▶ Продолжаем");
      startStream();
    }

    if (key.ctrl && key.name === "c") {
      console.log("\n⏹ Завершение...");
      await stopStream();
      process.exit(0);
    }
  });
}

// ======================================================
// RUN
// ======================================================
(async () => {
  setupKeyboard();
  await startStream();
})();
