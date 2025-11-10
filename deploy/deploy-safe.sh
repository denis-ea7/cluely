#!/bin/bash
set -e

SERVER="denis@109.61.108.37"
REMOTE_DIR="/home/denis/cluely/free-cluely"
LOCAL_DIR="/Users/denisevseev/bybit/free-cluely"

echo "🚀 Безопасный деплой Cluely (БД сохраняется)"

echo "📦 Копирование файлов на сервер..."
scp -r ${LOCAL_DIR}/server ${SERVER}:${REMOTE_DIR}/
scp -r ${LOCAL_DIR}/key-agent ${SERVER}:${REMOTE_DIR}/
scp -r ${LOCAL_DIR}/cluely-site ${SERVER}:${REMOTE_DIR}/
scp ${LOCAL_DIR}/deploy/docker-compose.yml ${SERVER}:${REMOTE_DIR}/deploy/

echo "🔄 Обновление контейнеров на сервере (БД не затрагивается)..."
ssh ${SERVER} "cd ${REMOTE_DIR}/deploy && docker compose down api key-agent site && docker compose up -d --build api key-agent site"

echo "⏳ Ожидание запуска сервисов..."
sleep 5

echo "✅ Деплой завершен!"
echo "Проверка статуса: ssh ${SERVER} 'cd ${REMOTE_DIR}/deploy && docker compose ps'"
echo "Логи: ssh ${SERVER} 'cd ${REMOTE_DIR}/deploy && docker compose logs -f'"

