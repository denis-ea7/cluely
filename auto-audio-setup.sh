#!/bin/bash
set -e

echo "[1] Проверяю наличие BlackHole..."
if ! system_profiler SPAudioDataType | grep -q "BlackHole"; then
  echo "BlackHole не найден, устанавливаю..."
  brew install blackhole-2ch || brew install blackhole-16ch
fi

echo "[2] Определяю версию macOS..."
sw_vers

echo "[3] Проверяю наличие утилиты SwitchAudioSource..."
if ! command -v SwitchAudioSource &> /dev/null; then
  brew install switchaudio-osx
fi

echo "[4] Перезапускаю CoreAudio..."
sudo killall coreaudiod || true
sleep 1

echo "[5] Настраиваю системный вывод и ввод..."
# Пробуем использовать Multi-Output, если есть, иначе ставим BlackHole
if SwitchAudioSource -a | grep -q "Многовыходное устройство"; then
  SwitchAudioSource -s "Многовыходное устройство" -t output
else
  echo "Многовыходное устройство не найдено, выбираю BlackHole напрямую"
  SwitchAudioSource -s "BlackHole 2ch" -t output
fi

SwitchAudioSource -s "BlackHole 2ch" -t input

echo "[OK] Настройка завершена."

