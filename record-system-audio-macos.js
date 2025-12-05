#!/usr/bin/env node

/**
 * Простая утилита для записи системного звука на macOS.
 *
 * Предпосылки:
 * - Выполнен скрипт `auto-audio-setup.sh`, который ставит BlackHole и
 *   настраивает системный вывод/ввод (BlackHole 2ch как input).
 * - Приложению выдан доступ к микрофону в настройках macOS.
 *
 * Использование:
 *   # по умолчанию пишет в ./record-YYYY-MM-DD_HH-mm-ss.wav с девайса BlackHole 2ch
 *   npm run record:system-audio:mac
 *
 *   # указать свой файл:
 *   node record-system-audio-macos.js ./my-output.wav
 *
 *   # указать длительность (в секундах) и/или своё устройство:
 *   AUDIO_DEVICE="BlackHole 2ch" DURATION_SEC=60 node record-system-audio-macos.js ./short.wav
 */

const fs = require('fs');
const path = require('path');
const record = require('node-record-lpcm16');

function makeTimestampedFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '_' + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');

  return `record-${ts}.wav`;
}

// Можно переопределить формат через env:
//   AUDIO_TYPE=flac / wav / ogg и т.п. (поддержка зависит от sox)
const audioType = process.env.AUDIO_TYPE || 'wav';

// Путь к выходному файлу:
// - если указан как первый аргумент -> используем его;
// - иначе создаём уникальный файл с таймштампом в текущей директории.
const userPath = process.argv[2];
const autoFilename = makeTimestampedFilename().replace(/\.wav$/i, `.${audioType}`);
const outputPath = path.resolve(process.cwd(), userPath || autoFilename);

// Можно переопределить устройство и длительность через env:
const audioDevice = process.env.AUDIO_DEVICE || 'BlackHole 2ch';
const durationSecEnv = process.env.DURATION_SEC;
const durationMs =
  durationSecEnv && !Number.isNaN(Number(durationSecEnv)) ? Number(durationSecEnv) * 1000 : null;

const recordOptions = {
  sampleRate: 16000,
  channels: 1,
  audioType,
  device: audioDevice,
};

console.log('======================================');
console.log('  macOS system audio recorder (Node)');
console.log('======================================');
console.log(`Устройство захвата: "${audioDevice}"`);
console.log(`Файл вывода:       ${outputPath}`);
if (durationMs) {
  console.log(`Ограничение по времени: ${durationMs / 1000} сек`);
} else {
  console.log('Ограничение по времени: нет (остановка по Ctrl+C)');
}
console.log('Начинаю запись...\n');

const fileStream = fs.createWriteStream(outputPath, { encoding: 'binary' });

// node-record-lpcm16 экспортирует метод `.record(options)`,
// который создаёт Recording и сразу запускает его.
const recorder = record.record(recordOptions);
const recordingStream = recorder.stream();

recordingStream.on('error', (err) => {
  console.error('[record] Ошибка записи:', err);
  try {
    recorder.stop();
  } catch (e) {
    // ignore
  }
  process.exitCode = 1;
});

fileStream.on('error', (err) => {
  console.error('[fs] Ошибка записи файла:', err);
  try {
    recorder.stop();
  } catch (e) {
    // ignore
  }
  process.exitCode = 1;
});

recordingStream.pipe(fileStream);

function stopRecording(reason) {
  console.log(`\nОстанавливаю запись (${reason})...`);
  try {
    recorder.stop();
  } catch (e) {
    // ignore
  }
  // Даём потоку дописать данные
  fileStream.end(() => {
    console.log(`Готово. Файл сохранён в: ${outputPath}`);
    process.exit(0);
  });
}

if (durationMs) {
  setTimeout(() => stopRecording('по таймеру'), durationMs);
}

process.on('SIGINT', () => {
  stopRecording('Ctrl+C');
});


