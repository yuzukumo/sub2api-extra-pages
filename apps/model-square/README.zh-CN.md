# Sub2API 模型广场

[English](README.md) | 简体中文 | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

一个用于嵌入 Sub2API 的只读模型展示页面。页面使用 React、TypeScript 和 Ant Design，模型图标来自 `@lobehub/icons`，模型元数据来自 [models.dev](https://models.dev/)。

服务不提供配置页面、管理员接口或写入接口。进程仅在启动时从 `MODEL_IDS` 读取需要展示的模型。

## 配置

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MODEL_IDS` | 是 | Compose 中提供示例 | 使用逗号或换行分隔的模型 ID，页面按字母顺序展示 |
| `NOTICE_MESSAGE` | 否 | Compose 中提供示例 | 页面顶部显示的一条通知，留空则不显示 |
| `CACHE_FILE` | 否 | `./data/catalog-cache.json` | 元数据缓存文件 |

示例：

```env
MODEL_IDS=gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna
NOTICE_MESSAGE=Model availability and pricing are subject to change.
```

服务在启动时立即与 models.dev 同步，之后每天在本地时间 00:00 同步一次。示例 Compose 将 `TZ` 设为 `Asia/Singapore`；如需使用其他时区，请修改此环境变量。浏览器访问不会触发同步。未收录的 ID 仍会显示，并使用通用图标和元数据缺失提示。

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

先在 [`docker-compose.yml`](docker-compose.yml) 中修改模型 ID 和通知内容。如需使用 GitHub Actions 发布的镜像，请运行：

```bash
docker compose pull
docker compose up -d
```

如需从源码自行构建，请运行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

示例 Compose 将 `127.0.0.1:6001` 映射到容器端口 `3000`。如需使用其他监听地址或端口，请修改 `docker-compose.yml` 中的端口映射。

修改 Compose 环境变量后，使用 `docker compose up -d` 应用配置。不要只执行 `docker compose restart`，因为它会继续使用已有容器中的旧环境变量。

## 嵌入 Sub2API

iframe 地址由用户的浏览器访问，因此必须是浏览器可达的地址。`http://sub2apiextra-modelsquare:3000` 这类 Docker 服务地址通常只能由同一 Docker 网络中的容器解析。

如果仅在内网使用，可以填写用户能够访问的内网 IP 或域名。如果 Sub2API 对公网开放，建议通过同一反向代理将页面发布为 HTTPS 路径或子域名。当 Sub2API 使用 HTTPS 时，iframe 也必须使用 HTTPS，以免被浏览器作为混合内容拦截。

页面默认跟随系统主题，手动选择的主题和语言会保存在浏览器中。界面支持英语、俄语、简体中文和繁体中文（台湾）。如果浏览器首选语言不受支持，则使用英语。
