# Cursor Gateway

English | [简体中文](README.zh-CN.md)

A Go gateway with a Mantine interface for connecting Cursor to an existing Sub2API account. Users sign in with their Sub2API email and password, select their existing keys, and receive one aggregate key and one base URL

Each request uses the original key for its model, so Sub2API continues to apply that key's group multiplier, balance, quota, and usage accounting. No composite group or second billing system is involved. Bifrost runs as an internal service using its official image, without a fork

## Deploy

Copy `docker-compose.yml` and the entire `deploy` directory together, keeping their relative paths. Both `deploy/bifrost-entrypoint.sh` and `deploy/bifrost.json` must be regular files. Missing files stop deployment with an error instead of being created as directories

Edit `SUB2API_URL` directly in [docker-compose.yml](docker-compose.yml) to point to your existing Sub2API, then run these commands from this directory

```sh
docker compose up -d
```

Open `http://localhost:6001`. The gateway and Bifrost must both be able to reach the configured Sub2API URL. The default `http://sub2api:8080` requires Sub2API to share the Compose network. An accessible HTTPS Sub2API URL also works

The gateway port binds to localhost. For a public deployment, put it behind your HTTPS reverse proxy and forward the original `Host` and `X-Forwarded-Proto`. The gateway derives its public URL from those headers. Configure the proxy to overwrite forwarded headers and disable response buffering for `/v1/` and `/chat/completions`

Bifrost has no published port. Its internal administrator password is built in, and its encryption secret is generated on first boot. The two named volumes preserve gateway state, Bifrost keys, and their encryption secrets. Back up both volumes together

`LIMIT_CONTEXT_TO_FIRST_TIER` defaults to `"true"`. For models with context-based pricing tiers in models.dev, the gateway advertises the smaller of `limit.context` and the first `cost.tiers[].tier.size` threshold to Cursor. Models without context tiers keep their full context window. Set it to `"false"` to advertise full context for every model, then recreate the gateway container. This controls Cursor's discovered context window, without truncating requests or changing Sub2API billing

## User workflow

Sign in with your Sub2API credentials. **Key selection** shows your existing keys and group multipliers. Select the active keys you want to use in Cursor and save. The gateway aggregates every model provided by those keys automatically. All users follow the same workflow, without a separate gateway administrator or model configuration

The **Overview** page shows your aggregate key and base URL. Paste them into Cursor's OpenAI API settings. The URL ends in `/v1`, and URLs without `/v1` also work. The key uses Sub2API's `sk-` prefix followed by 64 random hexadecimal characters. Cursor reads the selected keys' models from `/v1/models` or `/models`

Selecting no keys disables access to all models through the aggregate key. Users without source keys first create them in Sub2API. Requests for models outside the selected keys are rejected. Model discovery and the reasoning selector still depend on the Cursor version in use

## Request handling

The gateway uses the user's Sub2API access token on the server to read their keys. It does not need a Sub2API administrator API key. Original key values and Sub2API access tokens are never returned to the browser. Gateway state is encrypted on disk, and Bifrost encrypts its stored credentials

OpenAI, Anthropic, and Grok groups are supported. Each source key must belong to one format, and model IDs across a user's selected keys must be unique. Duplicate model IDs cause selection to fail before Bifrost credentials are changed

The model list includes `thinking.levels` and `capabilities.reasoning_effort`, read exclusively from [models.dev provider data](https://models.dev/api.json?type=all). It also advertises `api_types: ["chat_completions"]` and capability fields for Cursor's local provider discovery. The gateway uses `reasoning_options` entries with `type: "effort"` for the matching provider and model. Models without an effort enum use `low`, `medium`, and `high`. The read-only model page shows whether levels came from models.dev or the default. Metadata is cached in the gateway volume and refreshed every three hours, even without user requests. Failed refreshes retry twice, then retain the previous snapshot until the next scheduled refresh. Explicit `reasoning_effort` and `reasoning.effort` values are accepted and checked against these levels. Requests use Bifrost's `/cursor/v1/chat/completions` integration, which translates Cursor requests to Responses and returns Chat Completions responses, including streamed tool calls. Anthropic requests use its native Messages endpoint through Bifrost

When an OpenAI source model receives no effort from Cursor, the gateway forwards `xhigh`. Explicit effort values are preserved and validated. Other providers leave an unspecified effort unchanged

Cursor Private Inference 3.24.12 uses its own model rules to build reasoning controls after discovering the gateway's capability fields. Its picker ignores `thinking.levels` and does not use the advertised effort list to generate options. This version offers four levels for `gpt-5.6-sol` and `grok-4.7`, and no effort control for Haiku 4.5. Publishing model metadata cannot override that client behavior

OpenAI reaches Sub2API's `/v1/responses`, preserving the Responses path needed for upstream prompt caching. A Responses request alone does not guarantee a cache hit. Cache hits depend on the upstream model, prompt, and provider policy. Tool and cache fields are passed through, and streaming responses are flushed without buffering

Source key and user status are refreshed on inference after 30 seconds. Rotating the aggregate key invalidates the previous key. Restarting the gateway preserves aggregate keys but requires signing in again

Password login, TOTP, Cloudflare Turnstile, and Tencent captcha are supported. Add the gateway domain to the captcha provider's allowed domains when needed. Aliyun captcha is currently unsupported and is shown as a sign-in limitation

## Local Docker environment

Run the gateway, official Bifrost image, a separate Sub2API, PostgreSQL, and Redis together

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

The gateway is available at `http://localhost:6001` and the local Sub2API at `http://localhost:8081`. The local administrator account is `admin@example.com` with password `local-admin-password`. Test settings and passwords are written directly in [docker-compose.local.yml](docker-compose.local.yml). No `.env` file is required

## Verification

Run backend regression tests and static checks in Docker

```sh
docker run --rm -v "$PWD:/app" -w /app golang:1.27.2-alpine3.24 sh -c 'go test ./... && go vet ./...'
```

The production Docker build checks TypeScript and builds the frontend. Backend tests cover selected key isolation, interrupted synchronization recovery, rotated login tokens, duplicate models, deselection, encrypted state, selected model restrictions, models.dev refresh retries and persistent caching, pricing tier context limits, reasoning normalization, and streamed tool and usage fields. Frontend regression tests run with `npm test` in `frontend`. GitHub Actions runs tests and builds both architectures for pull requests, and publishes images only on pushes or manual runs. Browser testing can be performed separately

The final gateway image contains only the Go binary, CA certificates, and compiled frontend assets. Node and Go build tools stay in build stages
