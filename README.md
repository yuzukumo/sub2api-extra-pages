# Sub2API Extra Pages

English | [简体中文](README.zh-CN.md) | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

This repository contains independently deployable pages designed to be embedded in Sub2API.

## Applications

| Application | Directory | Description |
| --- | --- | --- |
| Model Square | [`apps/model-square`](apps/model-square/) | Displays model, provider, context-window, and pricing information |
| Document Viewer | [`apps/document-viewer`](apps/document-viewer/) | Displays multiple Markdown documents in a configured order |

Each application is a self-contained project with its own source code, dependencies, environment variables, Dockerfile, Compose file, and documentation. Applications do not share containers, ports, volumes, or APIs.

## Container images

GitHub Actions publishes the images to GitHub Container Registry. The Compose files use these `latest` images by default:

- `ghcr.io/yuzukumo/sub2api-extra-pages-model-square:latest`
- `ghcr.io/yuzukumo/sub2api-extra-pages-document-viewer:latest`

Each application also includes `docker-compose.local.yml` for local builds.

## Default ports

All containers listen on port `3000` internally. Host ports are assigned sequentially and bind to `127.0.0.1` by default.

| Application | Host port | Container port |
| --- | --- | --- |
| Model Square | `6001` | `3000` |
| Document Viewer | `6002` | `3000` |

## License

[MIT](LICENSE)
