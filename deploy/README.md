# Развёртывание на Windows Server 2012 / 2012 R2

> Есть вариант **без мусора на сервере** — Docker: [DOCKER.md](DOCKER.md)  
> *(на Server 2012 Docker недоступен)*.  
> Ближайший аналог контейнера для **WS2012**: портативный Python в папке проекта — [portable/README.md](portable/README.md).

Веб-приложение (FastAPI + SQLite) слушает TCP-порт и отдаёт уже собранный интерфейс из `backend\static`.

## Что нужно на сервере

| Компонент | Нужно? | Примечание |
|-----------|--------|------------|
| **Python 3.9–3.11 x64** | Да | С [python.org](https://www.python.org/downloads/). Отметьте **Add to PATH**. На Server 2012 надёжнее **3.11**, не 3.12+ |
| **Node.js** | Нет* | Нужен только чтобы собрать интерфейс. Можно собрать на другом ПК и скопировать `backend\static` |
| **NSSM** | Для службы | [nssm.cc/download](https://nssm.cc/download) → `win64\nssm.exe` → положить в `deploy\nssm\nssm.exe` |

\*Если `backend\static\index.html` уже есть в копии проекта — Node на сервере не нужен.

## Куда копировать

Рекомендуемый путь, например:

```text
C:\Apps\amirs_update_4\
```

Скопируйте весь проект **кроме** (по желанию, чтобы меньше весить):

- `frontend\node_modules`
- `.venv` (создастся на сервере заново)

**Обязательно** должны быть:

- `backend\` (код + `static\` с собранным UI)
- `deploy\`
- `backend\requirements.txt`
- `start.bat` / скрипты в `deploy\`

База появится сама: `backend\data\data.db`.

## Пошагово

### 1. Установка Python

1. Установите Python 3.11 x64.
2. В CMD проверьте:

```bat
python --version
```

### 2. Копирование и установка приложения

Откройте CMD **в папке проекта** (или через Проводник) и выполните:

```bat
deploy\install.bat
```

Скрипт создаст `.venv` и поставит зависимости.

### 3. Брандмауэр

От администратора:

```bat
deploy\open-firewall.bat
```

Откроет входящий TCP-порт из `deploy\settings.bat` (по умолчанию **8000**).

### 4. Запуск

**Вариант А — вручную (проверка):**

```bat
deploy\start-server.bat
```

Откройте в браузере: `http://127.0.0.1:8000` или `http://<IP-сервера>:8000`.

**Вариант Б — служба Windows (рекомендуется):**

1. Скачайте NSSM, положите `nssm.exe` в `deploy\nssm\`.
2. От администратора:

```bat
deploy\install-service.bat
```

Служба `AmirsVersions` стартует автоматически после перезагрузки.  
Логи: `backend\data\service-stdout.log`, `service-stderr.log`.

Остановка / удаление службы:

```bat
deploy\uninstall-service.bat
```

### 5. Порт и хост

Правьте `deploy\settings.bat`:

```bat
set AMIRS_HOST=0.0.0.0
set AMIRS_PORT=8000
set AMIRS_SERVICE_NAME=AmirsVersions
```

После смены порта снова выполните `open-firewall.bat` и переустановите службу.

## Сеть

- Клиенты в LAN: `http://192.168.x.x:8000` (подставьте IP сервера).
- Узнайте IP: `ipconfig`.
- Если не открывается с других ПК: проверьте брандмауэр Windows **и** антивирус/сетевые политики домена.

HTTPS из коробки нет (внутренняя сеть). При необходимости поставьте IIS / nginx как обратный прокси с сертификатом.

## Резервное копирование

Копируйте файл:

```text
backend\data\data.db
```

При работе сервера лучше остановить службу на время копии или копировать также `-wal`/`-shm`, если есть:

```text
backend\data\data.db
backend\data\data.db-wal
backend\data\data.db-shm
```

## Обновление версии

1. Остановите службу (`deploy\uninstall-service.bat` или `nssm stop AmirsVersions`).
2. Сохраните `backend\data\` (база).
3. Замените код (и при необходимости `backend\static`).
4. `deploy\install.bat` (обновит пакеты).
5. Снова `deploy\install-service.bat`.

## Сборка UI на другом компьютере

```bat
cd frontend
npm install
npm run build
```

Скопируйте на сервер каталог `backend\static` целиком.

## Типичные проблемы

| Симптом | Что проверить |
|---------|----------------|
| `python` не найден | PATH, переустановка Python с «Add to PATH», новый CMD |
| Страница пустая / нет UI | Есть ли `backend\static\index.html` |
| С других ПК не открывается | `open-firewall.bat`, IP, служба запущена, `0.0.0.0` в settings |
| Служба не стартует | `backend\data\service-stderr.log`, путь без кириллицы предпочтительнее |
| Старый Excel не открывается после экспорта | Обновите код экспорта на сервере и перезапустите службу |

## Быстрый чеклист

1. [ ] Python 3.11 x64 + PATH  
2. [ ] Проект скопирован, есть `backend\static`  
3. [ ] `deploy\install.bat`  
4. [ ] `deploy\open-firewall.bat` (админ)  
5. [ ] `deploy\start-server.bat` — проверка в браузере  
6. [ ] NSSM + `deploy\install-service.bat`  
7. [ ] Импорт Excel / настройка актуальных версий в интерфейсе  
