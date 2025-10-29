# Инструкция по сборке приложения

Это руководство описывает процесс компиляции приложения под macOS и Windows.

## Предварительные требования

1. **Node.js** (версия 18 или выше)
2. **npm** или **yarn**
3. Для сборки Windows на Mac может потребоваться Wine (опционально)

## Установка зависимостей

```bash
npm install
```

Если возникают проблемы с Sharp:
```bash
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install --ignore-scripts
npm rebuild sharp
```

## Сборка приложения

### Сборка для текущей платформы

Для сборки под текущую операционную систему (Mac соберет Mac версию, Windows - Windows версию):

```bash
npm run dist
```

Или альтернативный способ:
```bash
npm run app:build
```

### Сборка для macOS

На Mac:
```bash
npm run build:mac
```

Результаты будут в папке `release/`:
- **DMG файлы** для x64 (Intel) и arm64 (Apple Silicon)
- Пример: `Meeting Notes Coder-1.0.0-x64.dmg` и `Meeting Notes Coder-1.0.0-arm64.dmg`

### Сборка для Windows

#### На Windows машине:
```bash
npm run build:win
```

Результаты будут в папке `release/`:
- **NSIS установщик** (.exe) для x64 и ia32
- **Portable версия** (.exe) для x64 (не требует установки)

#### На Mac для Windows (кроссплатформенная сборка):

Для сборки Windows версии на Mac нужно установить Wine и использовать docker или VM, либо настроить кроссплатформенную сборку:

```bash
# Вариант 1: Использовать electron-builder с Wine (требует настройки)
brew install --cask wine-stable
npm run build:win

# Вариант 2: Использовать Docker (рекомендуется)
# Создайте Docker образ с Windows или используйте GitHub Actions
```

### Сборка для обеих платформ сразу

Для сборки под Mac и Windows одновременно:
```bash
npm run build:all
```

## Структура собранных файлов

После сборки все файлы будут в папке `release/`:

```
release/
├── mac/
│   ├── Meeting Notes Coder-1.0.0-x64.dmg      # Intel Mac
│   └── Meeting Notes Coder-1.0.0-arm64.dmg    # Apple Silicon
└── win-unpacked/
    ├── Meeting Notes Coder Setup 1.0.0.exe    # Установщик NSIS
    └── Meeting Notes Coder-1.0.0-portable.exe # Portable версия
```

## Дополнительные опции сборки

### Сборка только для определенной архитектуры

**Mac (только Apple Silicon):**
```bash
npm run build && electron-builder --mac --arm64
```

**Mac (только Intel):**
```bash
npm run build && electron-builder --mac --x64
```

**Windows (только x64):**
```bash
npm run build && electron-builder --win --x64
```

### Очистка перед сборкой

```bash
npm run clean
```

Это удалит папки `dist` и `dist-electron` перед новой сборкой.

## Кроссплатформенная сборка

### Вариант 1: Использование GitHub Actions (рекомендуется)

Настройте GitHub Actions workflow для автоматической сборки под все платформы при push.

### Вариант 2: Локальная сборка через Docker

1. Создайте Docker контейнер с необходимыми инструментами
2. Используйте multi-stage build для разных платформ

### Вариант 3: Отдельные машины

- Соберите Mac версию на Mac
- Соберите Windows версию на Windows машине
- Используйте CI/CD для автоматизации

## Решение проблем

### Ошибка: "Cannot find module"

Убедитесь, что все зависимости установлены:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Ошибка при сборке Windows на Mac

Если вы пытаетесь собрать Windows версию на Mac:
- Используйте Wine: `brew install --cask wine-stable`
- Или собирайте на Windows машине или в CI/CD

### Большой размер установщика

Это нормально для Electron приложений. Размер можно уменьшить, используя:
- `asar` архивирование (включено по умолчанию)
- Исключение ненужных зависимостей из `files` в package.json

### Проблемы с иконками

Если иконки отсутствуют, приложение будет собираться с иконкой по умолчанию. Чтобы добавить кастомные иконки:

1. Создайте папку `assets/icons/`
2. Добавьте:
   - `assets/icons/mac/icon.icns` для Mac
   - `assets/icons/win/icon.ico` для Windows
3. Обновите конфигурацию в `package.json`

## Проверка сборки

После сборки проверьте:
1. Запустите собранное приложение
2. Проверьте работу основных функций
3. Убедитесь, что все зависимости включены
4. Протестируйте на чистой системе (без dev зависимостей)

## Публикация

Если настроена публикация в GitHub Releases (см. `package.json` → `build.publish`):

```bash
npm run build:all -- --publish always
```

Это автоматически опубликует релизы в GitHub.

## Полезные команды

```bash
# Разработка
npm start              # Запуск в режиме разработки

# Сборка
npm run build          # Только сборка frontend и electron
npm run dist           # Полная сборка для текущей платформы
npm run build:mac      # Сборка для Mac
npm run build:win      # Сборка для Windows
npm run build:all      # Сборка для всех платформ

# Очистка
npm run clean          # Удаление собранных файлов
```

## Быстрый старт

1. **Для Mac:**
   ```bash
   npm install
   npm run build:mac
   ```

2. **Для Windows (на Windows):**
   ```bash
   npm install
   npm run build:win
   ```

Готовые установщики будут в папке `release/`!

