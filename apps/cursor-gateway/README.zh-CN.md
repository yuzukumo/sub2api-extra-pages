# Cursor Gateway

[English](README.md) | 简体中文

使用 Sub2API 邮箱和密码登录，勾选已有 key，获得一个供 Cursor 使用的聚合 key 和 Base URL。每个模型仍使用原 key 调用，保留 Sub2API 原分组倍率和用量记录。

## 部署

1. 复制 [docker-compose.yml](docker-compose.yml) 和整个 [deploy](deploy/) 目录，保持相对路径不变。
2. 将 `SUB2API_URL` 改为现有 Sub2API 地址。
3. 在当前目录启动服务：

   ```sh
   docker compose up -d
   ```

打开 `http://localhost:6001`。网关和 Bifrost 都需要能访问 Sub2API。默认的 `http://sub2api:8080` 要求服务共享 Docker 网络，也可以填写可访问的 HTTPS 地址。

端口默认只绑定本机。公网使用 HTTPS 反向代理，保留原始 `Host`，由代理设置 `X-Forwarded-Proto`，并关闭 `/v1/`、`/responses` 和 `/messages` 的响应缓冲。

## 接入 Cursor

1. 登录网关，在「Key 选择」中勾选需要使用的 key 并保存。
2. 将「概览」中的 Base URL 和 key 填入 Cursor 的 Models->Gateway 设置。
3. 在 Cursor 中选择模型，模型列表会自动从网关读取。

使用 Cursor Local（Private Inference）版本，以下链接始终指向官方最新版本：

| 平台                | 下载                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Windows x64         | [安装程序](https://api2.cursor.sh/updates/download/golden/win32-x64-user/cursor-local/latest)   |
| Windows ARM64       | [安装程序](https://api2.cursor.sh/updates/download/golden/win32-arm64-user/cursor-local/latest) |
| macOS Apple Silicon | [DMG](https://api2.cursor.sh/updates/download/golden/darwin-arm64/cursor-local/latest)          |
| macOS Intel         | [DMG](https://api2.cursor.sh/updates/download/golden/darwin-x64/cursor-local/latest)            |
| Linux x64           | [AppImage](https://api2.cursor.sh/updates/download/golden/linux-x64/cursor-local/latest)        |
| Linux ARM64         | [AppImage](https://api2.cursor.sh/updates/download/golden/linux-arm64/cursor-local/latest)      |

## 配置与行为

直接修改 `docker-compose.yml`，然后执行 `docker compose up -d`：

| 配置                            | 默认值                  | 作用                                                                                   |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `SUB2API_URL`                 | `http://sub2api:8080` | 现有 Sub2API 地址                                                                      |
| `LIMIT_CONTEXT_TO_FIRST_TIER` | `"true"`              | 按 models.dev 的第一段计费限制 Cursor 读取的上下文窗口，改为`"false"` 则使用完整窗口 |

在「可用模型」中，每个用户可以自定义模型上下文或恢复默认。自定义值优先于上面的配置，重启或暂时取消 key 后仍会保留。成功同步确认模型消失后，连续 14 天未重新出现便清理记录。上下文设置只影响 Cursor 读取的模型信息，不会截断请求，也不会改变计费。

| 项目       | 行为                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Key 与模型 | 支持 OpenAI、Claude、Grok、Gemini。一个 key 对应一种 API 格式，所选 key 之间模型名称不能重复 |
| Base URL   | 使用标准`/v1`，也兼容不带 `/v1` 的地址                                                                                                      |
| 协议       | OpenAI 和 Grok 使用原生 Responses，Claude 使用原生 Messages。Gemini 在 Cursor 中使用 Responses，由 Bifrost 转为上游 Gemini 原生格式 |
| 思考等级   | 来自[models.dev](https://models.dev/)，缺失时使用 `low`、`medium`、`high`。OpenAI 请求未填写 effort 时使用 `xhigh`，显式等级会保留并校验 |
| 联网搜索   | Cursor 使用所选模型单独请求 Responses，Claude 和 Gemini 由 Bifrost 转换。实际搜索需要上游支持 |
| 缓存       | OpenAI 使用 Responses 调用上游，是否命中取决于模型、提示词和上游策略                                                                            |

<details>
<summary>部署与兼容性说明</summary>

Bifrost 使用官方镜像，在内网运行。无需 Sub2API 管理员 key，原始 key 和登录 token 留在服务端并加密存储。备份时一起保留两个具名卷。

取消全部 key 会停用模型访问，轮换聚合 key 后旧 key 失效。重启网关保留聚合 key，但网页登录需要重新登录。

models.dev 每 3 小时同步一次，失败重试 2 次，仍失败则保留旧数据并等待下一轮。Cursor 的客户端内置规则决定思考等级控件是否显示。

登录支持密码、TOTP、Cloudflare Turnstile 和腾讯验证码。启用验证码时，将网关域名加入验证码服务的允许域名。目前不支持阿里云验证码。

</details>

<details>
<summary>本地 Docker 开发</summary>

同时启动网关、Bifrost、独立 Sub2API、PostgreSQL 和 Redis：

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

网关为 `http://localhost:6001`，本地 Sub2API 为 `http://localhost:8081`。测试管理员为 `admin@example.com` / `local-admin-password`。

后端检查：

```sh
docker run --rm -v "$PWD:/app" -w /app golang:1.27.2-alpine3.24 sh -c 'go test ./... && go vet ./...'
```

GitHub Actions 运行后端和前端测试，并发布 amd64、arm64 镜像。

</details>
