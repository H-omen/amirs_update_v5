# Запуск в Docker

Один контейнер: уже собранный интерфейс + FastAPI + SQLite.  
На хосте не нужны Python, Node и `.venv`.

## Важно: Windows Server 2012

**На Server 2012 / 2012 R2 Docker официально не ставится** (поддержка Docker Engine — с Windows Server 2016+ или Linux).

Варианты:

1. **Рекомендуется:** Linux-ВМ / другой сервер с Docker → этот `docker compose`
2. **На самом 2012:** без контейнера — `deploy\install.bat` + служба NSSM ([README](README.md))
3. Новый хост с Docker Desktop (Win10/11) или Server 2019/2022

---

## Требования

- Docker Engine + Docker Compose v2  
  (Docker Desktop, Linux, Windows Server 2016+ с контейнерами)

## Быстрый старт

В корне проекта:

```bat
docker compose up -d --build
```

Или на Linux:

```bash
docker compose up -d --build
```

Откройте: `http://<IP-хоста>:8000`

Остановка:

```bat
docker compose down
```

Данные (база) сохраняются в `backend/data` на диске хоста — `down` их не удаляет.

## Порт

По умолчанию `8000`. Другой порт:

```bat
set AMIRS_PORT=8080
docker compose up -d --build
```

Linux:

```bash
AMIRS_PORT=8080 docker compose up -d --build
```

## Обновление

```bat
docker compose up -d --build
```

Пересоберёт образ и перезапустит контейнер; `backend/data/data.db` останется.

## Полезные команды

```bat
docker compose ps
docker compose logs -f amirs
docker compose restart amirs
```

Проверка API:

```bat
curl http://127.0.0.1:8000/api/health
```

## Бэкап

Копируйте каталог `backend/data` (как минимум `data.db`, при работе — лучше после `docker compose stop`).

## Если compose ругается на права к data (Linux)

```bash
mkdir -p backend/data
```

На Windows с Docker Desktop обычно достаточно просто создать папку `backend\data`.
