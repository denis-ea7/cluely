# Примеры curl запросов для тестирования API

## Получение токена (Login)

```bash
curl -X POST http://109.61.108.37:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}'
```

**Успешный ответ:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "premium": false,
  "premiumUntil": null
}
```

**Ошибка:**
```json
{
  "error": "invalid_credentials"
}
```

## Регистрация нового пользователя

```bash
curl -X POST http://109.61.108.37:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"new-user@example.com","password":"secure-password"}'
```

**Успешный ответ:**
```json
{
  "ok": true
}
```

## Получение информации о пользователе

```bash
# Замените YOUR_TOKEN на реальный токен из login
curl -X GET http://109.61.108.37:4000/user/info \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Успешный ответ:**
```json
{
  "id": "uuid-here",
  "email": "user@example.com",
  "premium": false,
  "premiumUntil": null,
  "createdAt": "2025-11-29T..."
}
```

## Проверка health endpoint

```bash
curl http://109.61.108.37:4000/health
```

**Ответ:**
```json
{
  "ok": true
}
```

## Получение ключей от key-agent

```bash
curl http://109.61.108.37:8089/keys
```

**Ответ:**
```json
{
  "primary": {
    "token": "sk-...",
    "wsUrl": "wss://...",
    "chatUrl": "https://...",
    "model": "gpt-4.1"
  },
  "gemini": {
    "apiKeys": ["key1", "key2"]
  }
}
```

## Проверка health key-agent

```bash
curl http://109.61.108.37:8089/health
```

## Пример для Windows (PowerShell)

```powershell
# Login
$body = @{
    email = "your-email@example.com"
    password = "your-password"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://109.61.108.37:4000/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

## Пример для Windows (cmd)

```cmd
curl -X POST http://109.61.108.37:4000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"your-email@example.com\",\"password\":\"your-password\"}"
```

## Сохранение токена в переменную (bash)

```bash
# Получить токен и сохранить
TOKEN=$(curl -s -X POST http://109.61.108.37:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}' \
  | jq -r '.token')

# Использовать токен
curl -X GET http://109.61.108.37:4000/user/info \
  -H "Authorization: Bearer $TOKEN"
```

## Сохранение токена в переменную (PowerShell)

```powershell
# Получить токен
$response = Invoke-RestMethod -Uri "http://109.61.108.37:4000/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body (@{
        email = "your-email@example.com"
        password = "your-password"
    } | ConvertTo-Json)

$token = $response.token

# Использовать токен
Invoke-RestMethod -Uri "http://109.61.108.37:4000/user/info" `
    -Headers @{Authorization = "Bearer $token"}
```

