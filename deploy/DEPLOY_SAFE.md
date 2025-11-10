# Безопасный деплой без потери данных БД

Данные БД хранятся в Docker volume `dbdata`. При правильном деплое данные сохраняются.

## Использование скрипта деплоя

```bash
cd /Users/denisevseev/bybit/free-cluely/deploy
./deploy-safe.sh
```

## Ручной деплой

### 1. Копирование файлов на сервер

```bash
cd /Users/denisevseev/bybit/free-cluely

scp -r server denis@109.61.108.37:/home/denis/cluely/free-cluely/
scp -r key-agent denis@109.61.108.37:/home/denis/cluely/free-cluely/
scp -r cluely-site denis@109.61.108.37:/home/denis/cluely/free-cluely/
scp deploy/docker-compose.yml denis@109.61.108.37:/home/denis/cluely/free-cluely/deploy/
```

### 2. На сервере: Обновление (БД НЕ затрагивается)

```bash
ssh denis@109.61.108.37

cd /home/denis/cluely/free-cluely/deploy

docker compose down api key-agent site

docker compose up -d --build api key-agent site

docker compose ps
```

### 3. Проверка

```bash
curl http://localhost:4000/health
curl http://localhost:8089/health
curl http://localhost:3005
```

## Резервное копирование БД

### Создание бэкапа

```bash
ssh denis@109.61.108.37
docker exec cluely-db pg_dump -U cluely cluely_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановление

```bash
docker exec -i cluely-db psql -U cluely cluely_db < backup_20241110_120000.sql
```

## Важно

- Docker volume `dbdata` НЕ удаляется при деплое
- Контейнер БД (`db`) НЕ пересобирается
- Обновляются только: `api`, `key-agent`, `site`
- Миграции БД выполняются автоматически при старте API

