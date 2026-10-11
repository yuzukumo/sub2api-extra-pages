# Sub2API 文档阅读器

[English](README.md) | 简体中文

用于嵌入 Sub2API 的只读 Markdown 页面。支持多文档、标题导航、代码高亮、图片、本地视频、LaTeX、Mermaid，以及浅色和深色主题。

## 部署

复制 [docker-compose.yml](docker-compose.yml) 和 [content](content/) 目录，启动发布镜像：

```sh
docker compose pull
docker compose up -d
```

打开 `http://localhost:6002`。端口默认只绑定本机，公网使用反向代理，或在 Compose 中修改端口映射。

修改 `content` 中的文件后刷新浏览器即可生效，该目录以只读方式挂载到容器。

## 添加文档

编辑 [content/documents.json](content/documents.json)：

```json
{
  "title": {
    "en-US": "Documentation",
    "zh-CN": "服务文档"
  },
  "documents": [
    { "file": "introduction.md" },
    { "file": "guides/api-reference.md" }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `title` | 各语言的页面标题，只填写实际提供的语言。支持 `en-US`、`zh-CN`、`zh-TW`、`ru-RU` |
| `documents[].file` | 相对于各语言目录的 Markdown 路径，数组顺序决定导航顺序 |
| 第一个 `#` 一级标题 | 页面导航中显示的文档名称 |

每种已配置的语言都需要相同路径的文档：

```text
content/
├── documents.json
├── en-US/introduction.md
├── en-US/guides/api-reference.md
├── zh-CN/introduction.md
└── zh-CN/guides/api-reference.md
```

语言选单只显示已配置的语言，主题和语言选择保存在浏览器中。

## 图片与视频

使用相对于当前 Markdown 文件的路径：

```markdown
![架构图](./images/architecture.png)
```

本地 MP4 或 WebM 视频：

````markdown
```video
./media/overview.mp4
```
````

视频路径必须位于 `content` 内，不支持外部链接和带查询参数的路径。

<details>
<summary>源码构建与本地开发</summary>

Docker 构建：

```sh
docker compose -f docker-compose.local.yml up -d --build
```

开发页面为 `http://localhost:4174/`：

```sh
npm install
npm run dev
```

使用 `npm run check` 运行测试和生产构建。

</details>
