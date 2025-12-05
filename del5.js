const { app, BrowserWindow } = require("electron");
const { getLoopbackStream } = require("electron-audio-loopback");
const { LiveClient } = require("@deepgram/sdk");

const DEEPGRAM_API_KEY = "179f5732c4176f66663bf7bcd3073e21f55cae9e";

app.whenReady().then(async () => {
  console.log("=== Electron ready ===");

  const win = new BrowserWindow({
    width: 300,
    height: 200,
    webPreferences: { nodeIntegration: true }
  });

  win.loadURL("data:text/html,<h2>Deepgram Debug</h2>");

  console.log("Получаем системный звук...");
  const loopback = await getLoopbackStream();
  console.log("Loopback stream ID:", loopback.id);

  const systemStream = await win.webContents.executeJavaScript(`
    navigator.mediaDevices.getUserMedia({
      audio: { deviceId: "${loopback.id}" },
      video: false
    })
  `);

  console.log("MediaStream получен, подключаемся к Deepgram...");

  // === CONNECT TO DEEPGRAM ===
  const client = new LiveClient(DEEPGRAM_API_KEY);

  const dg = client.listen.live({
    model: "nova",
    punctuate: true,
    encoding: "linear16",
    sample_rate: 44100,
  });

  dg.on("open", () => console.log("🟢 Deepgram WebSocket OPENED"));
  dg.on("close", () => console.log("🔴 Deepgram WebSocket CLOSED"));
  dg.on("error", (err) => console.error("❌ Deepgram ERROR:", err));

  dg.on("transcriptReceived", (data) => {
    console.log("📥 RAW TRANSCRIPT EVENT:", JSON.stringify(data));
    const text = data.channel.alternatives[0]?.transcript;
    if (text && text.trim()) console.log(">>", text);
  });

  // SEND PCM FROM BROWSER TO MAIN
  const { ipcMain } = require("electron");

  ipcMain.on("pcm", (event, buffer) => {
    dg.send(buffer);
  });

  // Start audio capture in renderer
  await win.webContents.executeJavaScript(`
    const audioCtx = new AudioContext({ sampleRate: 44100 });
    const src = audioCtx.createMediaStreamSource(${systemStream});
    const proc = audioCtx.createScriptProcessor(4096, 1, 1);

    proc.onaudioprocess = e => {
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) i16[i] = f32[i] * 0x7fff;

      require("electron").ipcRenderer.send("pcm", i16.buffer);
    };

    src.connect(proc);
    proc.connect(audioCtx.destination);
  `);

  console.log("🎧 Система запущена: слушаем системный звук…");
});
