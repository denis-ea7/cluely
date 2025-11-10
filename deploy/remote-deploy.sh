#!/bin/bash

# Скрипт для удаленного деплоя на сервер 109.61.108.37
# Использование: ./remote-deploy.sh

set -e

SERVER="denis@109.61.108.37"
REMOTE_DIR="~/cluely"
LOCAL_DIR="/Users/denisevseev/bybit/free-cluely"

echo "🚀 Начало удаленного деплоя на $SERVER..."

# Проверка SSH подключения
echo "📡 Проверка подключения к серверу..."
if ! ssh -o ConnectTimeout=5 $SERVER "echo 'Connection OK'" 2>/dev/null; then
    echo "❌ Не удалось подключиться к серверу"
    echo "Проверьте:"
    echo "  1. Доступность сервера: ping 109.61.108.37"
    echo "  2. SSH ключи или пароль (wss81lv9)"
    echo ""
    echo "Выполните вручную:"
    echo "  ssh $SERVER"
    exit 1
fi

echo "✅ Подключение установлено"

# Создание директории на сервере
echo "📁 Создание директорий на сервере..."
ssh $SERVER "mkdir -p $REMOTE_DIR"

# Загрузка файлов
echo "📤 Загрузка файлов на сервер..."
cd "$LOCAL_DIR"

# Загрузка deploy директории
echo "  - Загрузка deploy/..."
scp -r deploy/ $SERVER:$REMOTE_DIR/

# Загрузка server
echo "  - Загрузка server/..."
scp -r server/ $SERVER:$REMOTE_DIR/free-cluely/

# Загрузка key-agent
echo "  - Загрузка key-agent/..."
scp -r key-agent/ $SERVER:$REMOTE_DIR/free-cluely/

# Загрузка cluely-site
echo "  - Загрузка cluely-site/..."
scp -r cluely-site/ $SERVER:$REMOTE_DIR/free-cluely/

echo "✅ Файлы загружены"

# Установка Docker (если нужно)
echo "🐳 Проверка Docker..."
ssh $SERVER "command -v docker >/dev/null 2>&1 || {
    echo 'Установка Docker...'
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    sudo usermod -aG docker denis
}"

# Установка Docker Compose (если нужно)
ssh $SERVER "command -v docker-compose >/dev/null 2>&1 || {
    echo 'Установка Docker Compose...'
    sudo curl -L 'https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)' -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
}"

# Запуск деплоя
echo "🚀 Запуск деплоя на сервере..."
ssh $SERVER "cd $REMOTE_DIR/free-cluely/deploy && chmod +x deploy.sh && ./deploy.sh"

echo ""
echo "🎉 Деплой завершен!"
echo ""
echo "Проверьте сервисы:"
echo "  - API: http://109.61.108.37:4000/health"
echo "  - Key-Agent: http://109.61.108.37:8089/health"
echo "  - Site: http://109.61.108.37:3005"
echo ""
echo "Просмотр логов: ssh $SERVER 'cd $REMOTE_DIR/free-cluely/deploy && docker compose logs -f'"

