const mic = require("mic");
const https = require("https");

const API_KEY = "AIzaSyAdK6qRHJrQxROZiwAEkQJbi7uHKFl_nyo";
const MODEL = "gemini-2.5-flash";
const CHUNK_MS = 1500;

let pcmChunks = [];

// ------------ WAV HEADER BUILDER ------------
function pcmToWav(pcmBuffer) {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const wavHeader = Buffer.alloc(44);

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

// ------------ SEND TO GEMINI ------------
function geminiSTT(pcmBuffers) {
  return new Promise((resolve) => {
    const pcmData = Buffer.concat(pcmBuffers);
    const wavFile = pcmToWav(pcmData);
    const base64 = wavFile.toString("base64");

    const payload = JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: "audio/wav",
                data: base64
              }
            },
            {
              text: "Расшифруй речь на русском языке. Верни только текст, без пояснений."
            }
          ]
        }
      ]
    });

    const req = https.request(
      `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
            resolve(text);
          } catch (e) {
            console.log("JSON error:", e.message);
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// ------------ MICROPHONE ------------
function startMic() {
  const micInstance = mic({
    rate: "16000",
    channels: "1",
    bitwidth: "16",
    encoding: "signed-integer",
    endian: "little"
  });

  const stream = micInstance.getAudioStream();
  stream.on("data", (d) => pcmChunks.push(d));

  micInstance.start();
  console.log("🎤 Микрофон включён");

  setInterval(async () => {
    if (!pcmChunks.length) return;
    const chunk = pcmChunks;
    pcmChunks = [];

    const text = await geminiSTT(chunk);
    if (text) console.log("🎯 STT:", text);
  }, CHUNK_MS);
}

startMic();
