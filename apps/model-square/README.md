# Sub2API Model Square

English | [简体中文](README.zh-CN.md) | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

A read-only model listing designed to be embedded in Sub2API. The page uses React, TypeScript, and Ant Design. Model icons come from `@lobehub/icons`, and model metadata comes from [models.dev](https://models.dev/).

The service has no configuration page, administration API, or write API. It automatically lists the available models and rate multipliers in active, non-exclusive Sub2API groups that have at least one active, schedulable account.

## Configuration

| Variable                  | Required | Default                       | Description                                                               |
| ------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------- |
| `NOTICE_MESSAGE`          | No       | Example provided in Compose   | A single notice displayed at the top of the page; leave empty to hide it |
| `TZ`                      | No       | `Asia/Singapore`              | Local timezone for daily 00:00 sync and rate-history timestamps          |
| `CACHE_FILE`              | No       | `./data/catalog-cache.json`  | Metadata cache file                                                       |
| `HISTORY_FILE`            | No       | `./data/rate-history.json`   | Sub2API group multiplier history                                          |
| `SUB2API_URL`             | Yes      | Example provided in Compose   | Internal URL of the Sub2API service                                       |
| `SUB2API_ADMIN_API_KEY`   | Yes      | Empty                         | Admin API key used only by this server to read groups and available models |

Example:

```env
NOTICE_MESSAGE="Model availability and pricing are subject to change."
TZ=Asia/Singapore
SUB2API_URL="http://sub2api:8080"
SUB2API_ADMIN_API_KEY=""
```

At startup, the service reads active, non-exclusive Sub2API groups and their available models, then obtains metadata from models.dev. Each group's model set is the deduplicated union of the available model IDs from all of its active, schedulable accounts, so account model whitelists and mappings are respected. It rechecks Sub2API every 10 minutes; a changed model set immediately triggers a models.dev refresh, while an unchanged set only updates groups and prices. Models.dev is also refreshed daily at 00:00 local time. The resulting daily open/high/low/close multiplier history is displayed as a Stock chart. The admin key is never sent to the browser, and browser visits do not trigger synchronization.

The Sub2API service and this container must be able to reach each other over the configured Docker network. Use a dedicated admin API key where possible; the model square never calls write endpoints.

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

Before deployment, set the Sub2API address, admin API key, and optional notice in [`docker-compose.yml`](docker-compose.yml). To use the image published by GitHub Actions, run:

```bash
docker compose pull
docker compose up -d
```

To build from source instead, run:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

The provided Compose file maps `127.0.0.1:6001` to port `3000` in the container. Change the host address or port mapping in `docker-compose.yml` when needed.

Compose creates the named volume `sub2apiextra-modelsquare-data` for the catalog cache and multiplier history. Keep it when replacing the container or image; remove it only when you want to reset the recorded history.

After changing the Compose environment, apply it with `docker compose up -d`. Do not use only `docker compose restart`, because it preserves the old container environment.

## Embedding in Sub2API

The iframe URL is opened by the user's browser and must therefore be reachable from that browser. Docker service names such as `http://sub2apiextra-modelsquare:3000` are normally resolvable only by containers on the same Docker network.

For private-network use, an internal IP address or hostname is sufficient if users can reach it. For a public Sub2API deployment, publish the page through the same reverse proxy as an HTTPS path or subdomain. If Sub2API uses HTTPS, the iframe must also use HTTPS to avoid mixed-content blocking.

The page follows the system theme by default. Manual theme and language choices are stored in the browser. The interface supports English, Russian, Simplified Chinese, and Traditional Chinese (Taiwan). If the browser's preferred language is unsupported, English is used.
