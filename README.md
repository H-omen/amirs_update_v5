# Учёт версий АМИРС / Судимость

Веб-приложение для внутренней сети: какие версии программ установлены на судебных участках, быстрая отметка обновления.

## Возможности

- Вкладки **Амирс** и **Судимость**
- Таблица участков: версия, ПИ №, даты, адрес, IP, архивация, путь к базе
- Цвета: зелёный — актуальная версия, красный — устарела
- Фильтр «только устаревшие» и поиск
- Клик по строке → быстрая отметка (версия, дата, кто обновил)
- История изменений по участку
- Настройка актуальной версии и импорт CSV из Google-таблицы

## Требования

- Python 3.11+
- Node.js 18+ (только для сборки интерфейса)

## Первый запуск (разработка)

### 1. Backend

```bat
python -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
.venv\Scripts\uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

API: http://127.0.0.1:8000/api/health  
Документация API: http://127.0.0.1:8000/docs

### 2. Frontend (в другом терминале)

```bat
cd frontend
npm install
npm run dev
```

Откройте http://127.0.0.1:5173 — запросы `/api` проксируются на backend.

### 3. Данные

В интерфейсе: **Настройки** → импорт CSV (экспорт листа Google-таблицы)  
или **Создать участки** 1–68 без данных.

Пример файла: [sample_data/amirs_sample.csv](sample_data/amirs_sample.csv)

## Продакшен на Windows Server (LAN)

### Контейнер (без установки Python на сервер)

См. **[deploy/DOCKER.md](deploy/DOCKER.md)**.

```bat
deploy\docker-up.bat
```

или `docker compose up -d --build` → `http://<IP>:8000`

> **Windows Server 2012:** Docker официально не поддерживается.  
> Аналог без установки Python в систему: **[deploy/portable/README.md](deploy/portable/README.md)**  
> (`deploy\portable\prepare-runtime.bat` — Python только в папке `runtime\`).  
> Либо классическая установка: `deploy\install.bat` + NSSM.

### Без Docker (Python + служба)

Пошагово для **Windows Server 2012 / 2012 R2**: [deploy/README.md](deploy/README.md).

Кратко:

1. Установите **Python 3.11 x64** (Add to PATH).
2. Скопируйте проект на сервер (с уже собранным `backend\static` или соберите через `npm run build`).
3. Выполните `deploy\install.bat`.
4. От администратора: `deploy\open-firewall.bat`.
5. Проверка: `deploy\start-server.bat` → `http://<IP>:8000`.
6. Постоянная работа: NSSM + `deploy\install-service.bat`.

Порт и имя службы — в `deploy\settings.bat`.

База SQLite: `backend/data/data.db` (делайте копию файла для резерва).

## Формат импорта

Поддерживаются **Excel (.xlsx)** и **CSV**.

Файл как `Амирс.xlsx` с листами **Амирс** и **Судимость** можно загрузить целиком (режим «Оба листа»).

### Лист Амирс

| Колонка | Пример |
|---------|--------|
| № с/у | 1 |
| Версия базы | 1.7.8.4387 |
| ПИ № | 2 |
| Дата последнего обновления | 08.07.2024 |
| Адрес | г. Вологда, … |
| Дата резервной копии | Ежедневно |
| Дата проверки | 03.07.2023 |
| IP Адрес | 172.23.6.2 |
| Архивация | + |
| Расположение базы | C:\Database\MAGISTRACY.FDB |

### Лист Судимость

| Колонка | Куда попадает |
|---------|----------------|
| № с/у | номер участка |
| Версия базы | версия |
| Патч | дата проверки |
| Дата | дата обновления |
| Адрес | адрес |
| Готовность | поле резервной копии / статуса |

## Структура

```
backend/          FastAPI + SQLite
frontend/         Vite + React + TypeScript
start.bat         Запуск сервера
sample_data/      Пример CSV
```
