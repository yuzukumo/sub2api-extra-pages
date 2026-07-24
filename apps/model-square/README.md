# Sub2API Model Square

English | [简体中文](README.zh-CN.md) | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

A read-only model listing designed to be embedded in Sub2API. The page uses React, TypeScript, and Ant Design. Model icons come from `@lobehub/icons`, and model metadata comes from [models.dev](https://models.dev/).

The service has no configuration page, administration API, or write API. The list of displayed models is read from `MODEL_IDS` only when the process starts.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MODEL_IDS` | Yes | Example provided in Compose | Comma- or newline-separated model IDs |
| `PRESERVE_MODEL_ID_ORDER` | No | `false` | When `true`, preserve the order in `MODEL_IDS`; otherwise, sort by model ID alphabetically |
| `NOTICE_MESSAGE` | No | Example provided in Compose | A single notice displayed at the top of the page; leave empty to hide it |
| `CACHE_FILE` | No | `./data/catalog-cache.json` | Metadata cache file |

Example:

```env
MODEL_IDS="gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna"
PRESERVE_MODEL_ID_ORDER="false"
NOTICE_MESSAGE="Model availability and pricing are subject to change."
```

The service synchronizes with models.dev immediately at startup and then every day at 00:00 local time. The Compose example sets `TZ` to `Asia/Singapore`; change this environment variable to use another time zone. Browser visits do not trigger synchronization. Unknown IDs remain visible with a generic icon and a metadata-unavailable message. Cards display the base prices and any context-tier prices returned by models.dev.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

The page is available at `http://localhost:4173/`. Vite proxies catalog requests to the local API service.

Run all checks with:

```bash
npm run check
```

## Docker deployment

Edit the model IDs and notice in [`docker-compose.yml`](docker-compose.yml). To use the image published by GitHub Actions, run:

```bash
docker compose pull
docker compose up -d
```

To build from source instead, run:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

The provided Compose file maps `127.0.0.1:6001` to port `3000` in the container. Change the host address or port mapping in `docker-compose.yml` when needed.

After changing the Compose environment, apply it with `docker compose up -d`. Do not use only `docker compose restart`, because it preserves the old container environment.

## Embedding in Sub2API

The iframe URL is opened by the user's browser and must therefore be reachable from that browser. Docker service names such as `http://sub2apiextra-modelsquare:3000` are normally resolvable only by containers on the same Docker network.

For private-network use, an internal IP address or hostname is sufficient if users can reach it. For a public Sub2API deployment, publish the page through the same reverse proxy as an HTTPS path or subdomain. If Sub2API uses HTTPS, the iframe must also use HTTPS to avoid mixed-content blocking.

The page follows the system theme by default. Manual theme and language choices are stored in the browser. The interface supports English, Russian, Simplified Chinese, and Traditional Chinese (Taiwan). If the browser's preferred language is unsupported, English is used.
