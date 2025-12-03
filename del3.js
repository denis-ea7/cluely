const mic = require("mic");
const https = require("https");

const GOOGLE_KEY = "AIzaSyDEKFqD4057DeO9OPi2KWKRFTNaG3askSs"; 
const CHUNK_DURATION_MS = 1500;

let audioBuffer = [];

// ------------------------------
// GOOGLE SPEECH-TO-TEXT
// ------------------------------
function googleTranscribe(buffer) {
  return new Promise((resolve) => {
    if (!buffer || buffer.length === 0) {
      console.log("⚠️ Пустой буфер → не отправляем в Google");
      return resolve(null);
    }

    console.log(`📦 Отправляем ${buffer.length} чанков в Google...`);

    const audioBytes = Buffer.concat(buffer).toString("base64");

    console.log(`📤 Размер base64 аудио: ${audioBytes.length} символов`);

    const payload = JSON.stringify({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "ru-RU"
      },
      audio: { content: audioBytes }
    });

    console.log("➡️ POST /speech:recognize");

    const req = https.request(
      `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        console.log("📡 Google API статус:", res.statusCode);

        let data = "";
        res.on("data", (chunk) => {
          console.log(`⬇️ Получен чанк ответа: ${chunk.length} байт`);
          data += chunk;
        });

        res.on("end", () => {
          console.log("📩 Ответ Google завершён");
          console.log("RAW ответ:", data);

          try {
            const json = JSON.parse(data);
            const text =
              json?.results?.[0]?.alternatives?.[0]?.transcript || null;

            console.log("📝 Итоговая расшифровка:", text || "нет текста");

            resolve(text);
          } catch (e) {
            console.log("❌ Ошибка JSON парсинга:", e.message);
            resolve(null);
          }
        });
      }
    );

    req.on("error", (err) => {
      console.log("❌ Ошибка запроса:", err.message);
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

// ------------------------------
// START MICROPHONE
// ------------------------------
function startMic() {
  console.log("🎙️ Инициализация микрофона...");

  const micInstance = mic({
    rate: "16000",
    channels: "1",
    bitwidth: "16",
    encoding: "signed-integer",
    endian: "little"
  });

  const micInputStream = micInstance.getAudioStream();

  micInputStream.on("data", (data) => {
    console.log(`🎧 Получен аудио-чанк: ${data.length} байт`);
    audioBuffer.push(data);
  });

  micInputStream.on("startComplete", () => {
    console.log("✔️ Микрофон успешно запущен");
  });

  micInputStream.on("stopComplete", () => {
    console.log("🛑 Микрофон остановлен");
  });

  micInputStream.on("error", (err) => {
    console.log("❌ Ошибка микрофона:", err.message);
  });

  micInstance.start();
  console.log("🎤 Микрофон включён");

  // отправляем каждые CHUNK_DURATION_MS
  setInterval(async () => {
    if (audioBuffer.length > 0) {
      console.log(`⏳ Отправка очередного фрагмента (${audioBuffer.length} чанков)...`);
      const bufferCopy = audioBuffer;
      audioBuffer = [];

      const text = await googleTranscribe(bufferCopy);
      if (text) console.log("🟢 STT:", text);
      else console.log("⚠️ Google не вернул текста");
    } else {
      console.log("...нет данных от микрофона...");
    }
  }, CHUNK_DURATION_MS);
}

// ------------------------------
console.log("🚀 Старт приложения...");
startMic();
