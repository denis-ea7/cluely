# Инструкция по деплою на сервер 109.61.108.37

## Подготовка

### 1. Подключение к серверу

```bash
ssh denis@109.61.108.37
# Пароль: wss81lv9
```

### 2. Установка Docker и Docker Compose (если еще не установлены)

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Добавление пользователя в группу docker
sudo usermod -aG docker denis
newgrp docker
```

### 3. Клонирование/загрузка проекта

```bash
# Создать директорию
mkdir -p ~/cluely
cd ~/cluely

# Загрузить проект (через git или scp)
# Если через git:
git clone <your-repo-url> free-cluely

# Или через scp с локальной машины:
# scp -r /Users/denisevseev/bybit/free-cluely denis@109.61.108.37:~/cluely/
```

### 4. Настройка переменных окружения

```bash
cd ~/cluely/free-cluely/deploy

# Файл .env уже создан с ключами из del2.js и .env
# Проверьте содержимое:
cat .env

# При необходимости отредактируйте пароли БД и секреты:
nano .env
```

### 5. Запуск всех сервисов

```bash
cd ~/cluely/free-cluely/deploy

# Сборка и запуск всех контейнеров
docker compose up -d --build

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f
```

### 6. Проверка работы сервисов

```bash
# Проверка API
curl http://localhost:4000/health

# Проверка key-agent
curl http://localhost:8089/health

# Проверка сайта
curl http://localhost:3005

# Проверка БД
docker exec -it cluely-db psql -U cluely -d cluely_db -c "SELECT version();"
```

## Порты и доступ

- **API**: `http://109.61.108.37:4000`
- **Key-Agent**: `http://109.61.108.37:8089`
- **Site**: `http://109.61.108.37:3005`
- **Postgres**: `localhost:5432` (только внутри Docker сети)

## Настройка firewall (если нужно)

```bash
# Разрешить порты
sudo ufw allow 4000/tcp
sudo ufw allow 8089/tcp
sudo ufw allow 3005/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
```

## Управление сервисами

```bash
# Остановка
docker compose down

# Перезапуск
docker compose restart

# Перезапуск конкретного сервиса
docker compose restart api

# Просмотр логов
docker compose logs -f api
docker compose logs -f key-agent
docker compose logs -f site

# Обновление кода
cd ~/cluely/free-cluely
git pull  # или загрузить новую версию
cd deploy
docker compose up -d --build
```

## Резервное копирование БД

```bash
# Создание бэкапа
docker exec cluely-db pg_dump -U cluely cluely_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановление из бэкапа
cat backup_*.sql | docker exec -i cluely-db psql -U cluely cluely_db
```

## Мониторинг

```bash
# Использование ресурсов
docker stats

# Проверка здоровья контейнеров
docker compose ps
```

## Troubleshooting

### Проблема: Контейнеры не запускаются

```bash
# Проверьте логи
docker compose logs

# Проверьте, не заняты ли порты
sudo netstat -tulpn | grep -E '4000|8089|3005|5432'
```

### Проблема: БД не подключается

```bash
# Проверьте, что БД запущена
docker compose ps db

# Проверьте логи БД
docker compose logs db

# Попробуйте пересоздать БД (ВНИМАНИЕ: удалит данные!)
docker compose down -v
docker compose up -d db
```

### Проблема: Key-agent не получает ключи

```bash
# Проверьте, что API доступен
curl http://localhost:4000/health

# Проверьте токен авторизации в docker-compose.yml
# Должен совпадать KEYS_SECRET в .env и BACKEND_AUTH_TOKEN в key-agent
```

## Автозапуск при перезагрузке сервера

```bash
# Docker Compose уже настроен на автозапуск через restart: unless-stopped
# Но можно добавить systemd сервис для гарантии:

sudo nano /etc/systemd/system/cluely.service
```

Содержимое файла:
```ini
[Unit]
Description=Cluely Services
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/denis/cluely/free-cluely/deploy
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Активация
sudo systemctl daemon-reload
sudo systemctl enable cluely
sudo systemctl start cluely
```

## Настройка клиентского приложения

После деплоя, в Electron приложении настройте `.env`:

```bash
KEY_AGENT_URL=http://109.61.108.37:8089
SITE_URL=http://109.61.108.37:3005
DEEPLINK_SCHEME=cluely
```

Готово! Все сервисы должны работать на сервере.

