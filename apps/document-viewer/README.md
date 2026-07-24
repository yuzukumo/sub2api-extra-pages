# Sub2API Document Viewer

English | [简体中文](README.zh-CN.md) | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

A read-only Markdown document viewer designed to be embedded in Sub2API. It uses React, TypeScript, Ant Design, and `@ant-design/x-markdown`, with support for multiple documents, heading navigation, anchors, syntax highlighting, copyable code, image previews, LaTeX, Mermaid, GFM, and system-aware light and dark themes.

The service has no editor, sign-in flow, collaboration features, or administration API.

## Document configuration

The manifest has a fixed path: [`content/documents.json`](content/documents.json). The service requires this file and does not allow its path to be changed through an environment variable. The order of the `documents` array determines the order in the left navigation. The keys in `title` define the document languages shown in the language selector, so configure only the locales you provide.

```json
{
  "title": {
    "en-US": "Documentation",
    "zh-CN": "服务文档",
    "zh-TW": "服務說明文件",
    "ru-RU": "Документация"
  },
  "documents": [
    { "file": "introduction.md" },
    { "file": "guides/api-reference.md" }
  ]
}
```

Each entry contains only `file`. It is the Markdown path relative to each locale directory, the document's unique identifier, and the value used in the `?doc=` query parameter. The navigation label is read from the first `#` heading in the corresponding Markdown file, so every translation must contain a level-one heading.

Changes to files or ordering take effect after a browser refresh. There is no administration page or write API.

Every document must have the same relative path in every locale directory configured in `title`:

```text
content/
├── documents.json
├── en-US/introduction.md
├── ru-RU/introduction.md
├── zh-CN/introduction.md
└── zh-TW/introduction.md
```

Locale directories can contain subdirectories, images, and attachments. Use paths relative to the current Markdown file:

```markdown
![Architecture](./images/architecture.png)
```

## Local development

```bash
npm install
npm run dev
```

The web interface is available at `http://localhost:4174/`. Vite serves the files in `content` directly during development; no local API is started.

Run all checks with:

```bash
npm run check
```

## Docker deployment

To use the image published by GitHub Actions, run:

```bash
docker compose pull
docker compose up -d
```

To build from source instead, run:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Nginx serves the static interface and Markdown files. The provided Compose file maps `127.0.0.1:6002` to port `3000` in the container and mounts `./content` at `/usr/share/nginx/html/content` in read-only mode. Change the host address or port mapping in `docker-compose.yml` when needed.

This is a bind mount rather than a named Docker volume, so it does not appear in `docker volume ls`. Its details are available under `Mounts` in `docker inspect sub2apiextra-documentviewer`.

The page follows the system theme by default. Manual theme and language choices are stored in the browser. The interface supports English, Russian, Simplified Chinese, and Traditional Chinese (Taiwan); the language selector only shows locales configured in `title`. Browser preferences are used when that locale is configured; otherwise, English is used when available, or the first configured locale.
