# Быстрый деплой на 109.61.108.37

## Шаг 1: Подключение к серверу

```bash
ssh denis@109.61.108.37
# Пароль: wss81lv9
```

## Шаг 2: Загрузка проекта на сервер

### Вариант A: Через SCP (с локальной машины)

```bash
# С локальной машины выполните:
cd /Users/denisevseev/bybit
scp -r free-cluely denis@109.61.108.37:~/cluely/
```

### Вариант B: Через Git (если репозиторий)

```bash
# На сервере:
mkdir -p ~/cluely
cd ~/cluely
git clone <your-repo-url> free-cluely
```

## Шаг 3: Установка Docker (если еще не установлен)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker denis
newgrp docker

# Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## Шаг 4: Запуск деплоя

```bash
cd ~/cluely/free-cluely/deploy

# Проверьте, что .env файл на месте
ls -la .env

# Запустите деплой
./deploy.sh

# Или вручную:
docker compose up -d --build
```

## Шаг 5: Проверка

```bash
# Проверка всех сервисов
curl http://localhost:4000/health  # API
curl http://localhost:8089/health  # Key-Agent
curl http://localhost:3005         # Site

# Просмотр логов
docker compose logs -f
```

## Готово! 🎉

Сервисы доступны:
- **API**: http://109.61.108.37:4000
- **Key-Agent**: http://109.61.108.37:8089  
- **Site**: http://109.61.108.37:3005

## Управление

```bash
# Остановка
docker compose down

# Перезапуск
docker compose restart

# Логи
docker compose logs -f api
docker compose logs -f key-agent
docker compose logs -f site
```

