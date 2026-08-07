# Sub2API 模型广场

[English](README.md) | 简体中文 | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

一个用于嵌入 Sub2API 的只读模型展示页面。页面使用 React、TypeScript 和 Ant Design，模型图标来自 `@lobehub/icons`，模型元数据来自 [models.dev](https://models.dev/)。

服务不提供配置页面、管理员接口或写入接口。它会自动展示至少包含一个已启用且可调度账号的启用、非专属 Sub2API 分组中的可用模型以及倍率。

## 配置

| 变量                      | 必填 | 默认值                        | 说明                                             |
| ------------------------- | ---- | ----------------------------- | ------------------------------------------------ |
| `NOTICE_MESSAGE`        | 否   | Compose 中提供示例            | 页面顶部显示的一条通知，留空则不显示             |
| `TZ`                    | 否   | `Asia/Singapore`            | 每天 00:00 同步和倍率历史记录所使用的本地时区    |
| `CACHE_FILE`            | 否   | `./data/catalog-cache.json` | 元数据缓存文件                                   |
| `HISTORY_FILE`          | 否   | `./data/rate-history.json`  | 分组倍率历史文件                                 |
| `SUB2API_URL`           | 是   | Compose 中提供示例            | Sub2API 内网地址                                 |
| `SUB2API_ADMIN_API_KEY` | 是   | 空                            | 仅由服务端读取分组和可用模型所用的管理员 API Key |

示例：

```env
NOTICE_MESSAGE="Model availability and pricing are subject to change."
TZ=Asia/Singapore
SUB2API_URL="http://sub2api:8080"
SUB2API_ADMIN_API_KEY=""
```

服务启动时会先读取启用且非专属的 Sub2API 分组及其可用模型，再从 models.dev 获取元数据。每个分组的模型集合取该分组内所有已启用且可调度账号的可用模型 ID 并集，并自动去重，因此会遵循账号的模型白名单和映射。之后每 10 分钟检查一次 Sub2API；模型集合发生变化时会立即刷新 models.dev，未变化时只更新分组和价格。models.dev 仍会在本地时间每天 00:00 强制刷新。每日倍率数据会聚合为开、高、低、收并显示为 K 线。管理员 Key 不会发送到浏览器，浏览器访问也不会触发同步。

## 本地开发

```bash
cp .env.example .env
npm install
npm run dev
```

页面地址为 `http://localhost:4173/`，Vite 会将目录请求代理到本地 API 服务。

运行完整校验：

```bash
npm run check
```

## Docker 部署

先在 [`docker-compose.yml`](docker-compose.yml) 中设置 Sub2API 地址、管理员 API Key 和可选通知内容。如需使用 GitHub Actions 发布的镜像，请运行：

```bash
docker compose pull
docker compose up -d
```

如需从源码自行构建，请运行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

示例 Compose 将 `127.0.0.1:6001` 映射到容器端口 `3000`。如需使用其他监听地址或端口，请修改 `docker-compose.yml` 中的端口映射。

Compose 会创建名为 `sub2apiextra-modelsquare-data` 的命名卷，用于保存目录缓存和倍率历史。更新容器或镜像时请保留该卷；只有需要重置历史记录时才删除它。

修改 Compose 环境变量后，使用 `docker compose up -d` 应用配置。不要只执行 `docker compose restart`，因为它会继续使用已有容器中的旧环境变量。

## 嵌入 Sub2API

iframe 地址由用户的浏览器访问，因此必须是浏览器可达的地址。`http://sub2apiextra-modelsquare:3000` 这类 Docker 服务地址通常只能由同一 Docker 网络中的容器解析。

如果仅在内网使用，可以填写用户能够访问的内网 IP 或域名。如果 Sub2API 对公网开放，建议通过同一反向代理将页面发布为 HTTPS 路径或子域名。当 Sub2API 使用 HTTPS 时，iframe 也必须使用 HTTPS，以免被浏览器作为混合内容拦截。

页面默认跟随系统主题，手动选择的主题和语言会保存在浏览器中。界面支持英语、俄语、简体中文和繁体中文（台湾）。如果浏览器首选语言不受支持，则使用英语。
