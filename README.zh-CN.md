# Sub2API 扩展页面

[English](README.md) | 简体中文 | [繁體中文（台灣）](README.zh-TW.md) | [Русский](README.ru-RU.md)

此仓库用于存放多个可独立部署并嵌入 Sub2API 的页面应用。

## 应用

| 应用 | 目录 | 说明 |
| --- | --- | --- |
| 模型广场 | [`apps/model-square`](apps/model-square/) | 展示模型、服务商、上下文窗口和价格信息 |
| 文档阅读器 | [`apps/document-viewer`](apps/document-viewer/) | 按配置顺序展示多篇 Markdown 文档 |

每个应用都是独立项目，拥有自己的源码、依赖、环境变量、Dockerfile、Compose 文件和说明文档。应用之间不共享容器、端口、数据卷或 API。

## 容器镜像

GitHub Actions 会将镜像发布到 GitHub Container Registry。Compose 文件默认使用以下 `latest` 镜像：

- `ghcr.io/yuzukumo/sub2api-extra-pages-model-square:latest`
- `ghcr.io/yuzukumo/sub2api-extra-pages-document-viewer:latest`

每个应用也都提供 `docker-compose.local.yml`，用于本地构建。

## 默认端口

所有容器内部统一监听 `3000`，宿主机端口按顺序分配，并默认只绑定到 `127.0.0.1`。

| 应用 | 宿主机端口 | 容器端口 |
| --- | --- | --- |
| 模型广场 | `6001` | `3000` |
| 文档阅读器 | `6002` | `3000` |

## 许可证

[MIT](LICENSE)
