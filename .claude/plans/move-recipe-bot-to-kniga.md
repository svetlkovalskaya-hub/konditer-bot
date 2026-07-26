# План: вынести бота «Книга рецептов» в отдельную папку Kniga

**Дата:** 2026-07-26

## Текущее положение

Бот книги рецептов сейчас встроен в проект `Konditer`:
- `src/bot/max-recipe/index.js`
- `src/bot/max-recipe/keyboards.js`
- `src/bot/max-recipe/session.js`
- `src/services/recipeParser.js`
- `src/services/recipeService.js`
- изменения в `src/db/index.js` (таблица `recipes`)
- изменения в `src/config/index.js` (`MAX_RECIPE_BOT_TOKEN`)
- изменения в `src/index.js` (запуск бота)
- изменения в `.env.example`
- зависимость `cheerio` в `package.json`

## Цель

Сделать бота книги рецептов самостоятельным мини-проектом внутри рабочей папки:
```
C:/Users/User/My AI/Konditer/Kniga/
```

Вернуть основной проект `Konditer` в состояние до добавления recipe-бота.

## Структура Kniga

```
Kniga/
├── .env.example
├── package.json
├── README.md
└── src/
    ├── index.js                 # сервер + запуск MAX-бота
    ├── config/
    │   └── index.js             # MAX_RECIPE_BOT_TOKEN, порт, data/uploads
    ├── db/
    │   └── index.js             # SQLite + таблица recipes
    ├── services/
    │   ├── recipeParser.js      # парсинг рецептов
    │   └── recipeService.js     # CRUD и поиск
    └── bot/
        └── max-recipe/
            ├── index.js         # обработчики бота
            ├── keyboards.js     # клавиатуры
            └── session.js       # сессии
```

## Что переносим

1. Код бота, сервисов и клавиатур — без изменений логики.
2. Таблицу `recipes` — в отдельную базу `Kniga/data/recipes.db`.
3. Конфигурацию — только `MAX_RECIPE_BOT_TOKEN`.
4. Зависимость `cheerio` — в `Kniga/package.json`.

## Что откатываем в Konditer

1. `src/index.js` — убрать `require('./bot/max-recipe')` и `maxRecipeBot.init()`.
2. `src/config/index.js` — убрать `maxRecipeBotToken`.
3. `src/db/index.js` — убрать создание таблицы `recipes` и её индексы.
4. `.env.example` — убрать `MAX_RECIPE_BOT_TOKEN`.
5. `package.json` и `package-lock.json` — удалить `cheerio`.
6. Удалить папку `src/bot/max-recipe/` и файлы `src/services/recipeParser.js`, `src/services/recipeService.js`.

## Порядок действий

1. Создать папку `Kniga/src/...` и скопировать/создать файлы проекта.
2. Настроить `Kniga/package.json` и `Kniga/.env.example`.
3. Адаптировать пути и импорты внутри Kniga (config, db, services).
4. Откатить изменения в основном проекте Konditer.
5. Удалить перенесённые файлы из Konditer.
6. Проверить синтаксис обоих проектов.
7. Подготовить отчёт.

## Проверка

- `node --check` для всех JS-файлов в Kniga и Konditer.
- Запуск `npm start` в Kniga не падает (без токена бот просто не стартует).
- Запуск `npm start` в Konditer возвращается к прежнему поведению.

## Риски

- Нужно аккуратно сохранить работу бота — логику не меняем.
- Удаление `cheerio` из Konditer безопасно, так как она использовалась только recipe-ботом.
