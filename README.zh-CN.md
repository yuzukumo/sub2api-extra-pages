# Sub2API 扩展页面

[English](README.md) | 简体中文

此仓库存放可独立部署的 Sub2API 扩展应用

## 应用

| 应用 | 目录 | 说明 |
| --- | --- | --- |
| 文档阅读器 | [`apps/document-viewer`](apps/document-viewer/) | 按配置顺序展示多篇 Markdown 文档 |
| Cursor Gateway | [`apps/cursor-gateway`](apps/cursor-gateway/README.zh-CN.md) | 聚合用户勾选的 Sub2API key，供 Cursor 使用，保留原分组计费 |

每个应用拥有独立的源码、依赖、Dockerfile、Compose 文件和说明文档

## 容器镜像

GitHub Actions 会将镜像发布到 GitHub Container Registry。Compose 文件默认使用以下 `latest` 镜像：

- `ghcr.io/yuzukumo/sub2api-extra-pages-document-viewer:latest`
- `ghcr.io/yuzukumo/sub2api-extra-pages-cursor-gateway:latest`

每个应用也都提供 `docker-compose.local.yml`，用于本地构建。

## 默认端口

文档阅读器在容器内监听 `3000`，宿主机默认绑定 `127.0.0.1:6002`。

| 应用 | 宿主机端口 | 容器端口 |
| --- | --- | --- |
| 文档阅读器 | `6002` | `3000` |
| Cursor Gateway | `6001` | `3000` |

## 许可证

[MIT](LICENSE)
