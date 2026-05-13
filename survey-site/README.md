# Celebrity Survey

Статическая анкета для GitHub Pages.

## Как открыть локально

Из папки `survey-site`:

```bash
python3 -m http.server 4173
```

Затем открыть:

```text
http://127.0.0.1:4173
```

## Как опубликовать на GitHub Pages

1. Создать репозиторий на GitHub.
2. Загрузить содержимое папки `survey-site`.
3. В настройках репозитория открыть `Pages`.
4. Source: `Deploy from a branch`.
5. Branch: `main`, folder: `/root`.

После этого GitHub даст публичную ссылку.

## Сбор ответов

GitHub Pages размещает сайт, но сам по себе не хранит ответы. Сейчас после завершения анкеты можно скачать CSV/JSON.

Для автоматического сбора ответов нужно прописать endpoint в `config.js`, например Google Apps Script, который принимает POST и пишет строки в Google Sheets.
