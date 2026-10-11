# Sub2API Document Viewer

English | [简体中文](README.zh-CN.md)

A read-only Markdown viewer for embedding in Sub2API. Supports multiple documents, heading navigation, code highlighting, images, local video, LaTeX, Mermaid, and light or dark themes.

## Deploy

Copy [docker-compose.yml](docker-compose.yml) and the [content](content/) directory, then start the published image:

```sh
docker compose pull
docker compose up -d
```

Open `http://localhost:6002`. The port binds to localhost. Use a reverse proxy for public access or change the port mapping in Compose.

Edit files in `content` and refresh the browser to see changes. The directory is mounted read-only into the container.

## Add documents

Edit [content/documents.json](content/documents.json):

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

| Field | Meaning |
| --- | --- |
| `title` | Page title for each language you provide. Supports `en-US`, `zh-CN`, `zh-TW`, and `ru-RU` |
| `documents[].file` | Markdown path relative to each language directory. Array order sets navigation order |
| First `#` heading | Document name shown in the navigation |

Every configured language needs the same document paths:

```text
content/
├── documents.json
├── en-US/introduction.md
├── en-US/guides/api-reference.md
├── zh-CN/introduction.md
└── zh-CN/guides/api-reference.md
```

The language selector shows only configured languages. Language and theme choices are saved in the browser.

## Images and video

Use paths relative to the current Markdown file:

```markdown
![Architecture](./images/architecture.png)
```

For local MP4 or WebM video:

````markdown
```video
./media/overview.mp4
```
````

Video paths must stay inside `content`. External URLs and paths with query strings are unsupported.

<details>
<summary>Build from source and develop locally</summary>

Docker build:

```sh
docker compose -f docker-compose.local.yml up -d --build
```

Development server at `http://localhost:4174/`:

```sh
npm install
npm run dev
```

Run tests and the production build with `npm run check`.

</details>
