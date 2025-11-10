# Инструкция по запуску

## Архитектура

Система состоит из двух частей:
1. **key-agent** - отдельный Node.js сервис на сервере, который получает ключи с бэкенда
2. **Electron приложение** - основное приложение, которое получает ключи от key-agent

---

## 1. Запуск key-agent (на сервере)

### Установка зависимостей

```bash
cd key-agent
npm install
```

### Настройка переменных окружения

Создайте файл `.env` в папке `key-agent/` или установите переменные окружения:

```bash
# ОБЯЗАТЕЛЬНО: URL вашего бэкенда, который отдает ключи
BACKEND_KEYS_URL=https://your-backend.com/api/keys

# Опционально: токен для авторизации на бэкенде
BACKEND_AUTH_TOKEN=your-secret-token

# Опционально: порт для key-agent (по умолчанию 8089)
PORT=8089

# Опционально: время кэширования ключей в миллисекундах (по умолчанию 5 минут)
CACHE_TTL_MS=300000

# Опционально: разрешенный origin для CORS
CORS_ORIGIN=http://localhost:5180
```

### Запуск key-agent

```bash
# Обычный запуск
node index.js

# Или через npm
npm start

# Или с PM2 (для production)
pm2 start index.js --name key-agent
```

После запуска вы увидите:
```
[key-agent] listening on 8089
[key-agent] fetching keys from: https://your-backend.com/api/keys
```

### Формат ответа бэкенда

Ваш бэкенд должен возвращать JSON в таком формате:

```json
{
  "primary": {
    "token": "sk-J--S5q2AN323UnA3mFSD4A",
    "wsUrl": "wss://server2.meetingaitools.com/transcribe",
    "chatUrl": "https://lite.meetingaitools.com/v1/chat/completions",
    "model": "gpt-4.1"
  },
  "gemini": {
    "apiKeys": ["GEMINI_KEY_1", "GEMINI_KEY_2"]
  },
  "ollama": {
    "url": "http://localhost:11434",
    "model": "llama3.2"
  }
}
```

---

## 2. Запуск Electron приложения

### Вариант A: Production (Docker на сервере 109.61.108.37)

#### 1) Подготовка сервера
- Откройте порты 3005 (site), 4000 (api), 8089 (key-agent). Postgres 5432 оставьте внутренним (или защитите).
- Установите Docker и Docker Compose.

#### 2) Клонирование и запуск
```bash
ssh denis@109.61.108.37
# пароль: wss81lv9
```

Скопируйте проект на сервер и выполните:
```bash
cd /path/to/free-cluely/deploy

# Настройте .env для compose (ключи не хранить в git!)
cat > .env << 'EOF'
PRIMARY_TOKEN=sk-***
PRIMARY_WS_URL=wss://server2.meetingaitools.com/transcribe
PRIMARY_CHAT_URL=https://lite.meetingaitools.com/v1/chat/completions
PRIMARY_MODEL=gpt-4.1
GEMINI_API_KEYS=
EOF

# Запуск стека (db, api, key-agent, site)
docker compose up -d --build
```

После старта:
- API: http://109.61.108.37:4000/health
- KEY-AGENT: http://109.61.108.37:8089/health
- SITE: http://109.61.108.37:3005

#### 3) Настройка приложения (клиент)
В `.env` на клиенте:
```bash
KEY_AGENT_URL=http://109.61.108.37:8089
SITE_URL=http://109.61.108.37:3005
DEEPLINK_SCHEME=cluely
```

### Установка зависимостей

```bash
npm install
```

### Запуск в режиме разработки

```bash
npm start
# или
npm run app:dev
```

### Сборка для production

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win

# Все платформы
npm run dist
```

---

### Вариант B: Development (без key-agent, только для локальной разработки)

Если вы разрабатываете локально и не хотите запускать key-agent, можно использовать переменные окружения напрямую:

```bash
# Primary AI ключи
PRIMARY_TOKEN=sk-***
PRIMARY_WS_URL=wss://server2.meetingaitools.com/transcribe
PRIMARY_CHAT_URL=https://lite.meetingaitools.com/v1/chat/completions
PRIMARY_MODEL=gpt-4.1

# Gemini ключи (через запятую или отдельные переменные)
GEMINI_API_KEYS=key1,key2,key3
# или
GEMINI_API_KEY=key1
GEMINI_API_KEY_1=key1
GEMINI_API_KEY_2=key2

# Опционально: Ollama
USE_OLLAMA=false
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

⚠️ **ВНИМАНИЕ**: В production всегда используйте `KEY_AGENT_URL` для безопасности!

---

## 3. Проверка работы

### Проверка key-agent

```bash
# Проверка здоровья сервиса
curl http://localhost:8089/health

# Получение ключей (если настроен CORS)
curl http://localhost:8089/keys

# Принудительное обновление кэша
curl http://localhost:8089/keys?force=1
```

### Проверка приложения

1. Запустите приложение
2. Проверьте консоль - должны быть сообщения:
   ```
   [main] Initializing ProcessingHelper...
   [ProcessingHelper] Initialized with keys from key-agent backend
   [main] ProcessingHelper initialized successfully
   ```

---

## 4. Troubleshooting

### key-agent не запускается

**Ошибка**: `BACKEND_KEYS_URL is required`

**Решение**: Установите переменную окружения `BACKEND_KEYS_URL`

```bash
export BACKEND_KEYS_URL=https://your-backend.com/api/keys
```

### Приложение не запускается

**Ошибка**: `Cannot start without keys from backend`

**Решение**: 
1. Проверьте, что key-agent запущен и доступен
2. Проверьте `KEY_AGENT_URL` в `.env` файле
3. Проверьте, что бэкенд возвращает ключи в правильном формате

### Ошибка подключения к key-agent

**Ошибка**: `Failed to fetch keys from key-agent`

**Решение**:
1. Проверьте доступность key-agent: `curl http://your-server:8089/health`
2. Проверьте настройки firewall
3. Проверьте `KEY_AGENT_URL` в приложении

---

## 5. Production deployment

### key-agent на сервере

Рекомендуется использовать PM2 для управления процессом:

```bash
# Установка PM2
npm install -g pm2

# Запуск key-agent
cd key-agent
pm2 start index.js --name key-agent

# Сохранение конфигурации
pm2 save
pm2 startup

# Просмотр логов
pm2 logs key-agent

# Перезапуск
pm2 restart key-agent
```

### Electron приложение

Соберите приложение для нужной платформы:

```bash
npm run dist:mac   # для macOS
npm run dist:win   # для Windows
```

Готовые файлы будут в папке `release/`

---

## 6. Безопасность

⚠️ **ВАЖНО**:
- Никогда не коммитьте ключи в git
- Используйте `.env` файлы (они в `.gitignore`)
- В production всегда используйте `KEY_AGENT_URL`
- Настройте firewall для key-agent
- Используйте HTTPS для key-agent в production
- Добавьте авторизацию через `KEY_AGENT_CLIENT_TOKEN` если нужно
- Не держите Postgres доступным снаружи: публикуйте порт только при необходимости или используйте VPN

---

## Быстрый старт

```bash
# 1. На сервере: запустить key-agent
cd key-agent
npm install
export BACKEND_KEYS_URL=https://your-backend.com/api/keys
node index.js

# 2. В приложении: настроить .env
echo "KEY_AGENT_URL=http://your-server:8089" > .env

# 3. Запустить приложение
npm install
npm start
```

