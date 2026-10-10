# Sub2API Extra Pages

English | [简体中文](README.zh-CN.md)

This repository contains independently deployable applications for Sub2API

## Applications

| Application | Directory | Description |
| --- | --- | --- |
| Document Viewer | [`apps/document-viewer`](apps/document-viewer/) | Displays multiple Markdown documents in a configured order |
| Cursor Gateway | [`apps/cursor-gateway`](apps/cursor-gateway/README.md) | Aggregates selected Sub2API keys for Cursor while preserving their original billing |

Each application has its own source code, dependencies, Dockerfile, Compose files, and documentation

## Container images

GitHub Actions publishes the images to GitHub Container Registry. The Compose files use these `latest` images by default:

- `ghcr.io/yuzukumo/sub2api-extra-pages-document-viewer:latest`
- `ghcr.io/yuzukumo/sub2api-extra-pages-cursor-gateway:latest`

Each application also includes `docker-compose.local.yml` for local builds.

## Default ports

The Document Viewer listens on port `3000` internally and binds to `127.0.0.1:6002` on the host by default.

| Application | Host port | Container port |
| --- | --- | --- |
| Document Viewer | `6002` | `3000` |
| Cursor Gateway | `6001` | `3000` |

## License

[MIT](LICENSE)
