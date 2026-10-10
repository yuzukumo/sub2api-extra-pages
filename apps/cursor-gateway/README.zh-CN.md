# Cursor Gateway

[English](README.md) | 简体中文

使用 Go 后端和 Mantine 前端，让 Cursor 接入已有的 Sub2API 账号。用户使用 Sub2API 邮箱、密码登录，勾选已有 key，获得一个聚合 key 和一个 Base URL

每次模型调用仍使用该模型对应的原 key，由 Sub2API 按原分组倍率、余额和额度计费并记录用量。无需 composite 分组，也不引入另一套计费。Bifrost 使用官方镜像，在 Docker 内网运行，无需二次开发

## 部署

部署时一起复制 `docker-compose.yml` 和整个 `deploy` 目录，保持相对路径不变。`deploy/bifrost-entrypoint.sh` 和 `deploy/bifrost.json` 必须是普通文件。缺少文件时会明确报错，不会自动创建同名目录

直接修改 [docker-compose.yml](docker-compose.yml) 中的 `SUB2API_URL`，指向现有 Sub2API，然后在当前目录运行

```sh
docker compose up -d
```

打开 `http://localhost:6001`。网关和 Bifrost 都需要能够访问填写的 Sub2API 地址。默认的 `http://sub2api:8080` 要求 Sub2API 加入同一个 Compose 网络，也可以直接填写可访问的 Sub2API HTTPS 地址

端口默认只绑定本机。公网部署时使用 HTTPS 反向代理，保留原始 `Host`，正确设置 `X-Forwarded-Proto`，网关会自动生成公开访问地址。反向代理应覆盖外部传入的转发头，并关闭 `/v1/` 和 `/chat/completions` 路径的响应缓冲

Bifrost 不发布端口，内部管理员密码已内置，首次启动会自动生成加密密钥。两个具名卷分别保存网关状态、Bifrost 配置及加密密钥，备份时一起保留

`LIMIT_CONTEXT_TO_FIRST_TIER` 默认是 `"true"`。对于 models.dev 中按上下文分段计费的模型，网关取 `limit.context` 和 `cost.tiers[].tier.size` 中第一个上下文分段阈值的较小值，作为 Cursor 读取的上下文窗口。没有上下文分段计费的模型保持完整窗口。改为 `"false"` 并重新创建网关容器后，所有模型都显示完整窗口。这个开关调整 Cursor 发现的上下文大小，不截断请求，也不改变 Sub2API 的计费规则

## 用户使用流程

使用自己的 Sub2API 邮箱和密码登录，在「Key 选择」中查看已有 key 和分组倍率，勾选需要给 Cursor 使用的可用 key 并保存。网关自动聚合所选 key 提供的全部模型，所有用户流程一致，无需独立的网关管理员，也无需配置模型

「概览」显示聚合 key 和 Base URL。在 Cursor 的 OpenAI API 设置中填入这两个值，Base URL 以 `/v1` 结尾，也兼容不填写 `/v1`。聚合 key 使用 Sub2API 同款格式，`sk-` 后接 64 位随机十六进制字符。Cursor 从 `/v1/models` 或 `/models` 读取所选 key 的模型列表

取消全部选择会停用聚合 key 的模型访问权限。没有原始 key 的用户先在 Sub2API 创建。网关拒绝列表以外的模型请求，模型发现和思考等级选择器的显示仍取决于所用的 Cursor 版本

## 转发与权限

网关后端使用用户自己的 Sub2API access token 读取该用户的 key，无需提供 Sub2API 管理员 API key。原始 key 和 Sub2API token 不会返回浏览器，网关状态和 Bifrost 保存的凭据均加密存储

支持 OpenAI、Anthropic 和 Grok 分组。一个原 key 对应一种格式，同一用户勾选的 key 之间模型名称不能重复。遇到重复模型时，在修改 Bifrost 凭据之前就会拒绝这次选择

思考等级仅从 [models.dev provider 数据](https://models.dev/api.json?type=all) 读取，使用对应 provider 和模型的 `reasoning_options` 中 `type: "effort"` 的 `values`，作为 `thinking.levels` 和 `capabilities.reasoning_effort` 写入模型列表。同时返回 `api_types: ["chat_completions"]` 和能力字段，供 Cursor 的本地供应商发现逻辑读取。没有 effort 枚举时使用默认的 `low`、`medium`、`high`。只读模型页显示等级来源为 models.dev 或默认三级。数据缓存在现有网关卷中，每 3 小时同步一次，无用户请求时也会同步。失败自动重试 2 次，仍失败就保留旧缓存并等待下一轮同步。网关同时接受 `reasoning_effort` 和 `reasoning.effort`，按这些等级检查显式 effort 后转发。调用 Bifrost 的 `/cursor/v1/chat/completions` 集成，将 Cursor 请求转换为 Responses，再返回 Chat Completions 格式，支持流式工具调用。Anthropic 经 Bifrost 转为原生 Messages 请求

OpenAI 来源模型没有收到 Cursor 的 effort 时，网关固定向上游传递 `xhigh`。用户显式选择的 effort 会保留并校验，其他来源模型没有 effort 时保持原样

Cursor Private Inference 3.24.12 读取网关的能力字段后，仍按客户端内置模型规则生成思考等级选项。它的选择器不读取 `thinking.levels`，也不使用返回的 effort 列表生成选项。这一版为 `gpt-5.6-sol` 和 `grok-4.7` 提供四档，为 Haiku 4.5 不提供 effort 控件。仅修改网关模型元数据无法覆盖这部分客户端行为

OpenAI 到达 Sub2API 的 `/v1/responses`，保留上游提示词缓存所需的 Responses 调用路径。使用 Responses 不代表一定命中缓存，实际命中仍取决于模型、提示词和上游策略。工具、缓存相关字段会继续传递，流式响应即时刷新，不在网关缓冲

推理请求超过 30 秒未同步时，会重新检查用户和原 key 状态。轮换聚合 key 后旧 key 失效。重启网关不会丢失聚合 key，但网页登录需要重新登录

登录支持密码、TOTP、Cloudflare Turnstile 和腾讯验证码。启用验证码的站点需要按验证码服务要求添加网关域名。目前不支持阿里云验证码，登录页会明确提示

## 本地 Docker 调试

同时启动网关、官方 Bifrost、本地独立 Sub2API、PostgreSQL 和 Redis

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

网关地址为 `http://localhost:6001`，本地 Sub2API 为 `http://localhost:8081`。本地管理员邮箱为 `admin@example.com`，密码为 `local-admin-password`。测试配置和密码直接写在 [docker-compose.local.yml](docker-compose.local.yml) 中，无需 `.env`

## 验证

在 Docker 中运行后端回归测试和静态检查

```sh
docker run --rm -v "$PWD:/app" -w /app golang:1.27.2-alpine3.24 sh -c 'go test ./... && go vet ./...'
```

生产镜像构建会检查 TypeScript 并编译前端。后端测试覆盖所选 key 隔离、中断同步恢复、登录 token 轮换、重复模型、取消选择、加密状态、所选模型权限、models.dev 同步重试和持久缓存、分段计费上下文限制、思考等级转换，以及流式工具和用量字段。在 `frontend` 目录执行 `npm test` 可运行前端回归测试。GitHub Actions 为 PR 运行测试和双架构构建，仅在推送或手动运行时发布镜像。浏览器检查可另行人工进行

最终网关镜像只包含 Go 二进制、CA 证书和前端构建产物，Node、Go 编译环境不进入运行镜像
