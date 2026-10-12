# Cursor Gateway

English | [简体中文](README.zh-CN.md)

Sign in with your Sub2API email and password, select existing keys, and get one key and Base URL for Cursor. Each model uses its original key, preserving Sub2API's group multipliers and usage accounting.

## Deploy

1. Copy [docker-compose.yml](docker-compose.yml) and the entire [deploy](deploy/) directory, keeping their relative paths.
2. Set `SUB2API_URL` to your existing Sub2API address.
3. Start the services from this directory:

   ```sh
   docker compose up -d
   ```

Open `http://localhost:6001`. The gateway and Bifrost must both reach Sub2API. The default `http://sub2api:8080` requires a shared Docker network. A reachable HTTPS address also works.

The port binds to localhost. For public access, use an HTTPS reverse proxy. Preserve the original `Host`, set `X-Forwarded-Proto` from the connection, and disable buffering for `/v1/`, `/responses`, and `/messages`.

## Connect Cursor

1. Sign in to the gateway, select keys in **Key selection**, and save.
2. Copy the Base URL and key from **Overview** into Cursor's **Models > Gateway** settings.
3. Choose a model in Cursor. Its model list comes from the gateway automatically.

Use Cursor Local (Private Inference). These links point to the latest official release:

| Platform | Download |
| --- | --- |
| Windows x64 | [Installer](https://api2.cursor.sh/updates/download/golden/win32-x64-user/cursor-local/latest) |
| Windows ARM64 | [Installer](https://api2.cursor.sh/updates/download/golden/win32-arm64-user/cursor-local/latest) |
| macOS Apple Silicon | [DMG](https://api2.cursor.sh/updates/download/golden/darwin-arm64/cursor-local/latest) |
| macOS Intel | [DMG](https://api2.cursor.sh/updates/download/golden/darwin-x64/cursor-local/latest) |
| Linux x64 | [AppImage](https://api2.cursor.sh/updates/download/golden/linux-x64/cursor-local/latest) |
| Linux ARM64 | [AppImage](https://api2.cursor.sh/updates/download/golden/linux-arm64/cursor-local/latest) |

## Settings and behavior

Edit settings directly in `docker-compose.yml`, then run `docker compose up -d`:

| Setting | Default | Purpose |
| --- | --- | --- |
| `SUB2API_URL` | `http://sub2api:8080` | Your existing Sub2API address |
| `LIMIT_CONTEXT_TO_FIRST_TIER` | `"true"` | Limit Cursor's discovered context window to the first models.dev pricing tier. Set `"false"` for the full window |

In **Available models**, each user can customize a model's context window or restore its default. Custom values take precedence over the setting above and survive restarts and temporarily deselecting keys. A successful sync starts the 14-day retention period when a model disappears. If it stays absent, its custom value is removed. Context settings only change the metadata Cursor reads. They do not truncate requests or change billing.

| Topic | Behavior |
| --- | --- |
| Keys and models | Supports OpenAI, Claude, Grok, and Gemini. Each key belongs to one API format, and model names must be unique across selected keys |
| Base URL | Uses `/v1`, with compatibility for URLs without it |
| Protocol | OpenAI and Grok use native Responses, and Claude uses native Messages. Gemini uses Responses in Cursor, with Bifrost converting to the upstream's native Gemini API |
| Reasoning | Levels come from [models.dev](https://models.dev/), falling back to `low`, `medium`, and `high`. OpenAI requests without effort use `xhigh`. Explicit levels are preserved and validated |
| Web search | Cursor sends a separate Responses request using the selected model. Bifrost adapts it for Claude and Gemini. The upstream must support search |
| Caching | OpenAI uses Responses upstream. Cache hits depend on the model, prompt, and upstream policy |

<details>
<summary>Deployment and compatibility notes</summary>

Bifrost uses its official image and runs internally. No Sub2API administrator key is needed. Source keys and login tokens stay on the server and are encrypted at rest. Back up both named volumes together.

Selecting no keys disables model access. Rotating the aggregate key invalidates the old one. Restarting the gateway keeps aggregate keys but requires signing in again.

models.dev metadata refreshes every three hours. Failures retry twice, then keep the previous snapshot until the next refresh. Cursor's own model rules determine which reasoning controls appear.

Login supports password, TOTP, Cloudflare Turnstile, and Tencent captcha. Add the gateway domain to the captcha provider's allowed domains when required. Aliyun captcha is unsupported.

</details>

<details>
<summary>Local development with Docker</summary>

Start the gateway, Bifrost, a separate Sub2API, PostgreSQL, and Redis:

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Gateway: `http://localhost:6001`. Local Sub2API: `http://localhost:8081`. Test administrator: `admin@example.com` / `local-admin-password`.

Backend checks:

```sh
docker run --rm -v "$PWD:/app" -w /app golang:1.27.2-alpine3.24 sh -c 'go test ./... && go vet ./...'
```

GitHub Actions runs backend and frontend tests and publishes amd64 and arm64 images.

</details>
