const WebSocket = require("ws");
const record = require("node-record-lpcm16");

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-realtime-mini";

const ws = new WebSocket(
  `wss://api.openai.com/v1/realtime?model=${MODEL}`,
  {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  }
);  

ws.on("open", () => {
  console.log("Connected to OpenAI Realtime API");

  const mic = record.record({
    sampleRateHertz: 16000,
    threshold: 0,
    verbose: false,
    recordProgram: "rec",
    endOnSilence: false,
  });

  const micStream = mic.stream();

  micStream.on("data", (data) => {
    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.toString("base64"),
      })
    );
  });

  setTimeout(() => {
    mic.stop();
    ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    ws.send(
      JSON.stringify({
        type: "response.create",
        response: { modalities: ["text"], instructions: "Ответь подробно." },
      })
    );
  }, 5000  );
});

ws.on("message", (msg) => {
  try {
    const data = JSON.parse(msg);
    if (data.type === "response.text.delta") process.stdout.write(data.delta);
    if (data.type === "response.done") {
      console.log("\n--- Response complete ---");
      process.exit(0);
    }
  } catch (e) {
    console.error("Parse error:", e);
  }
});

ws.on("error", (err) => console.error("WebSocket error:", err));
