# Sub2API 文档阅读器

[English](README.md) | 简体中文

一个用于嵌入 Sub2API 的只读 Markdown 文档页面。界面使用 React、TypeScript、Ant Design 和 `@ant-design/x-markdown`，支持多文档导航、标题目录、锚点、代码高亮、代码复制、图片预览、本地视频、LaTeX、Mermaid、GFM，以及跟随系统的浅色和深色主题。

服务不提供编辑器、登录、协作功能或管理员接口。

## 文档配置

文档清单固定为 [`content/documents.json`](content/documents.json)。服务要求此文件存在，不支持通过环境变量更改路径。`documents` 数组的排列顺序就是页面左侧导航的显示顺序。`title` 中的语言键决定页面语言选单显示哪些文档语言，只需配置实际提供的语言。

```json
{
  "title": {
    "en-US": "Documentation",
    "zh-CN": "服务文档",
    "zh-TW": "服務說明文件",
    "ru-RU": "Документация"
  },
  "documents": [
    { "file": "introduction.md" },
    { "file": "guides/api-reference.md" }
  ]
}
```

每项只包含 `file`。它是相对于各语言目录的 Markdown 文件路径，也是文档的唯一标识和 `?doc=` 查询参数的值。左侧显示名称读取自对应 Markdown 文件中的第一个 `# 一级标题`，因此每个翻译文件都必须包含一级标题。

添加、删除文件或调整顺序后刷新浏览器即可生效。服务不提供管理页面或写入接口。

每篇文档必须在 `title` 中配置的每个语言目录里使用相同的相对路径：

```text
content/
├── documents.json
├── en-US/introduction.md
├── ru-RU/introduction.md
├── zh-CN/introduction.md
└── zh-TW/introduction.md
```

各语言目录可以包含子目录、图片和附件。Markdown 中使用相对于当前文件的路径即可：

```markdown
![架构图](./images/architecture.png)
```

### 本地视频

使用标记为 `video` 的代码块，并在其中填写一条相对于当前 Markdown 文件的视频路径：

````markdown
```video
./media/overview.mp4
```
````

视频源必须保留在 `content` 目录内。外部链接、绝对路径、data URL、带查询参数的 URL，以及会越出 `content` 目录的路径都不会渲染。请使用浏览器支持的视频格式，例如 MP4 或 WebM。

## 本地开发

```bash
npm install
npm run dev
```

页面地址为 `http://localhost:4174/`。开发环境中，Vite 会直接提供 `content` 中的文件，不会启动本地 API。

运行完整校验：

```bash
npm run check
```

## Docker 部署

如需使用 GitHub Actions 发布的镜像，请运行：

```bash
docker compose pull
docker compose up -d
```

如需从源码自行构建，请运行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Nginx 负责提供静态页面和 Markdown 文件。示例 Compose 将 `127.0.0.1:6002` 映射到容器端口 `3000`，并将 `./content` 以只读方式挂载到 `/usr/share/nginx/html/content`。如需使用其他监听地址或端口，请修改 `docker-compose.yml` 中的端口映射。

此处使用 bind mount，而不是 Docker 命名卷，因此不会出现在 `docker volume ls` 中。可以在 `docker inspect sub2apiextra-documentviewer` 输出的 `Mounts` 中查看挂载详情。

页面默认跟随系统主题，手动选择的主题和语言会保存在浏览器中。界面支持英语、俄语、简体中文和繁体中文（台湾），语言选单只显示 `title` 中配置的语言。浏览器语言偏好仅在对应语言已配置时采用，否则优先使用英语；未配置英语时使用第一个已配置语言。
