# Портативный runtime для Windows Server 2012

Docker на WS2012 недоступен. Ближайший аналог «не мусорить в системе»:

**весь Python лежит в папке проекта** (`runtime\python`), в систему ничего не ставится.  
Удалили каталог приложения — сервер чистый.

```text
amirs_update_4\
  runtime\python\     ← свой Python + библиотеки
  backend\            ← код + static + data
  deploy\portable\    ← скрипты
```

## Подготовка (нужен интернет один раз)

На сервере **или** на любом ПК с Windows x64:

1. Убедитесь, что собран UI: есть `backend\static\index.html`
2. Запустите:

```bat
deploy\portable\prepare-runtime.bat
```

Скрипт через PowerShell скачает **Python Embeddable 3.11**, поставит pip и зависимости в `runtime\python`.

> На Server 2012 файл `.bat` с русским текстом в UTF-8 ломает `cmd`.  
> Поэтому сообщения установки на английском; инструкция — здесь.

### Если PowerShell ругается на ExecutionPolicy

Скрипт уже запускается с `-ExecutionPolicy Bypass`. Если политика домена блокирует — выполните вручную:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\portable\prepare-runtime.ps1
```

### Нет интернета на WS2012

1. Выполните `prepare-runtime.bat` на машине с сетью  
2. Скопируйте на сервер **весь** каталог проекта (включая `runtime\python` и `backend\static`)  
3. На сервере только запуск / служба

### Ручная загрузка (если скачивание не работает)

В папку `runtime\` положите:

- `python-embed.zip` — [python-3.11.9-embed-amd64.zip](https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip)  
- `get-pip.py` — https://bootstrap.pypa.io/get-pip.py  

Затем снова `prepare-runtime.bat`.

## Запуск

Если используете готовый пакет `dist\amirs-portable\` — запускайте **`start.bat` из этой папки**.

Из исходников проекта:

```bat
deploy\portable\start.bat
```

Брандмауэр:

```bat
deploy\open-firewall.bat
```

или в пакете: `open-firewall.bat`

> Все `.bat` специально **без русского текста** (только латиница).  
> На WS2012 UTF-8 с кириллицей ломает `cmd.exe`.

## Служба Windows

NSSM: `deploy\nssm\nssm.exe` → https://nssm.cc/download

```bat
deploy\portable\install-service.bat
```

Удаление службы:

```bat
deploy\portable\uninstall-service.bat
```

## Обновление приложения

1. Остановите службу  
2. Замените код / `backend\static`  
3. При смене зависимостей: снова `prepare-runtime.bat`  
4. Запустите службу  

`backend\data` не трогайте — там база.

## Сравнение вариантов

| Способ | Мусор в системе | WS2012 |
|--------|-----------------|--------|
| Docker | нет | нет |
| Системный Python + venv | Python в Program Files | да (`deploy\install.bat`) |
| **Portable runtime** | только папка проекта | **да** |

## Если python.exe не стартует на 2012

Установите **Universal C Runtime** (обновление KB2999226) и актуальные Visual C++ Redistributable x64 — часто нужно для Python 3.8+ на старых серверах.
