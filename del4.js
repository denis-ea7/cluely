// mic_stream_whisper.js
// Захватывает аудио с микрофона, шлёт чанки в ws://109.61.108.37:8000/ws-stream
// и печатает текст, который возвращает Whisper.

const WebSocket = require('ws');
const record = require('node-record-lpcm16');

const WS_URL = 'ws://109.61.108.37:8000/ws-stream';

const ws = new WebSocket(WS_URL);
let gotFinal = false;

ws.on('open', () => {
  console.log('✅ WebSocket открыт, начинаю запись с микрофона...');

  // Захват аудио: 16-bit PCM, mono, 16 kHz (то, что ждёт сервер)
  const recorder = record.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'raw',      // сырые PCM-данные без WAV-заголовка
    endOnSilence: false,
  });

  const mic = recorder.stream();

  mic.on('data', (chunk) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk); // шлём сырой PCM чанками
    }
  });

  mic.on('error', (err) => {
    console.error('Ошибка микрофона:', err);
  });

  // Ctrl+C — останавливаем, шлём "__end__" для финального текста
  process.on('SIGINT', () => {
    console.log('\n🛑 Остановка. Отправляю __end__ и выхожу...');
    try {
      ws.send('__end__');
    } catch (e) {
      console.error('Ошибка при отправке __end__:', e.message);
    }
    recorder.stop();
    // Даем Whisper время обработать и прислать финальный текст
    setTimeout(() => {
      if (!gotFinal) {
        console.log('⏱ Нет ответа от сервера, выходим.');
        process.exit(0);
      }
    }, 60000);
  });
});

// Получаем текстовые ответы от сервера
ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    // msg = { full, new, final }
    if (msg.new) {
      console.log('➕ new:', msg.new);
      gotFinal = true; // уже есть полезный текст
    }
    if (msg.final) {
      gotFinal = true;
      console.log('✅ FINAL:', msg.full);
      ws.close();
    }
  } catch (e) {
    console.error('Ошибка парсинга сообщения:', e.message, 'raw:', data.toString());
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('WebSocket закрыт');
});