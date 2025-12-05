#!/usr/bin/env node

/**
 * Deepgram‑стрим ОДНОВРЕМЕННО:
 *  - микрофон (пользователь)
 *  - системный звук через BlackHole 2ch (собеседник)
 *
 * В консоли выводим:
 *   пользователь: ...
 *   собеседник:  ...
 *
 * Запуск:
 *   cd /Users/denisevseev/bybit/free-cluely
 *   npm run deepgram:live
 *
 * Переменные окружения (опционально):
 *   MIC_DEVICE      — устройство для микрофона (по умолчанию системный input)
 *   SYSTEM_DEVICE   — устройство для системного звука (по умолчанию "BlackHole 2ch")
 *   DG_LANGUAGE     — язык (по умолчанию "ru")
 *   DG_MODEL        — модель (по умолчанию "nova-2")
 */

const record = require('node-record-lpcm16');
const WebSocket = require('ws');

// === Конфиг ===
const DEEPGRAM_WS = 'wss://api.deepgram.com/v1/listen';
// Тестовый ключ (ТОЛЬКО для локальных тестов!)
const apiKey = '179f5732c4176f66663bf7bcd3073e21f55cae9e';

const language = process.env.DG_LANGUAGE || 'ru';
const model = process.env.DG_MODEL || 'nova-2';

// Устройства
const micDevice = process.env.MIC_DEVICE || undefined; // системный input по умолчанию
const systemDevice = process.env.SYSTEM_DEVICE || 'BlackHole 2ch';

// 16 kHz mono Linear16
const baseRecordOptions = {
  sampleRate: 16000,
  channels: 1,
  audioType: 'wav',
};

console.log('======================================');
console.log('  Deepgram LIVE (mic + system)');
console.log('======================================');
console.log(`Микрофон:            ${micDevice || '<системный input по умолчанию>'}`);
console.log(`Системный звук:      ${systemDevice}`);
console.log(`Язык:                ${language}`);
console.log(`Модель:              ${model}`);
console.log('Подключаюсь к Deepgram (2 соединения)...\n');

const params = new URLSearchParams({
  encoding: 'linear16',
  sample_rate: String(baseRecordOptions.sampleRate),
  channels: String(baseRecordOptions.channels),
  model,
  language,
  punctuate: 'true',
  interim_results: 'false',
  diarize: 'false',
});

function createDeepgramConnection(label, onTranscript) {
  const wsUrl = `${DEEPGRAM_WS}?${params.toString()}`;
  const socket = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Token ${apiKey}`,
    },
  });

  socket.on('open', () => {
    console.log(`🟢 Deepgram WebSocket OPENED (${label})`);
  });

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg.is_final) return;
      if (!(msg.channel && msg.channel.alternatives && msg.channel.alternatives[0])) return;

      const alt = msg.channel.alternatives[0];
      const text = (alt.transcript || '').trim();
      if (!text) return;

      onTranscript(text);
    } catch (e) {
      console.error(`Ошибка парсинга сообщения Deepgram (${label}):`, e.message);
    }
  });

  socket.on('close', () => {
    console.log(`\n🔴 Deepgram WebSocket CLOSED (${label})`);
  });

  socket.on('error', (err) => {
    console.error(`❌ Deepgram ERROR (${label}):`, err.message);
  });

  return socket;
}

// Соединения для микрофона и системного звука
const dgMic = createDeepgramConnection('mic', (text) => {
  console.log(`пользователь: ${text}`);
});

const dgSystem = createDeepgramConnection('system', (text) => {
  console.log(`собеседник: ${text}`);
});

// Рекордеры
let micRecorder;
let systemRecorder;

function startMicRecorder() {
  const options = { ...baseRecordOptions };
  if (micDevice) options.device = micDevice;

  micRecorder = record.record(options);
  const stream = micRecorder.stream();

  console.log('🎙  Микрофон запущен. Говори в микрофон.');

  stream.on('data', (chunk) => {
    if (dgMic.readyState === WebSocket.OPEN) {
      dgMic.send(chunk);
    }
  });

  stream.on('error', (err) => {
    console.error('Ошибка аудиопотока (mic):', err);
  });
}

function startSystemRecorder() {
  const options = { ...baseRecordOptions, device: systemDevice };

  systemRecorder = record.record(options);
  const stream = systemRecorder.stream();

  console.log('💻 Системный звук запущен (BlackHole / многовыходное устройство).');

  stream.on('data', (chunk) => {
    if (dgSystem.readyState === WebSocket.OPEN) {
      dgSystem.send(chunk);
    }
  });

  stream.on('error', (err) => {
    console.error('Ошибка аудиопотока (system):', err);
  });
}

// Старт после установления обоих соединений
let openedCount = 0;
function tryStartRecorders() {
  openedCount += 1;
  if (openedCount === 2) {
    startMicRecorder();
    startSystemRecorder();
  }
}

dgMic.on('open', tryStartRecorders);
dgSystem.on('open', tryStartRecorders);

function shutdown(reason) {
  console.log(`\nОстанавливаю стрим (${reason})...`);
  if (micRecorder) {
    try {
      micRecorder.stop();
    } catch (e) {
      // ignore
    }
  }
  if (systemRecorder) {
    try {
      systemRecorder.stop();
    } catch (e) {
      // ignore
    }
  }

  if (dgMic.readyState === WebSocket.OPEN) dgMic.close();
  if (dgSystem.readyState === WebSocket.OPEN) dgSystem.close();

  // Небольшая задержка, чтобы сокеты успели корректно закрыться
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => shutdown('Ctrl+C'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

