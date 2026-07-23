# Sub2API 文件閱讀器

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文（台灣） | [Русский](README.ru-RU.md)

這是一個可嵌入 Sub2API 的唯讀 Markdown 文件頁面。介面使用 React、TypeScript、Ant Design 與 `@ant-design/x-markdown`，支援多份文件導覽、標題目錄、錨點、程式碼醒目提示、程式碼複製、圖片預覽、LaTeX、Mermaid、GFM，以及跟隨系統的淺色與深色主題。

服務不提供編輯器、登入、協作功能或管理員介面。

## 文件設定

文件清單固定為 [`content/documents.json`](content/documents.json)。服務要求此檔案存在，不支援透過環境變數變更路徑。`documents` 陣列的排列順序就是頁面左側導覽的顯示順序。

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

每個項目只包含 `file`。它是相對於各語言目錄的 Markdown 檔案路徑，也是文件的唯一識別碼與 `?doc=` 查詢參數值。左側顯示名稱取自對應 Markdown 檔案中的第一個 `# 一級標題`，因此每個翻譯檔案都必須包含一級標題。

新增、刪除檔案或調整順序後，重新整理瀏覽器即可生效。服務不提供管理頁面或寫入介面。

每份文件必須在所有支援的語言目錄中使用相同的相對路徑：

```text
content/
├── documents.json
├── en-US/introduction.md
├── ru-RU/introduction.md
├── zh-CN/introduction.md
└── zh-TW/introduction.md
```

各語言目錄可以包含子目錄、圖片與附件。Markdown 中請使用相對於目前檔案的路徑：

```markdown
![架構圖](./images/architecture.png)
```

## 本機開發

```bash
npm install
npm run dev
```

頁面位於 `http://localhost:4174/`，本機 API 監聽連接埠 `3000`。

執行完整檢查：

```bash
npm run check
```

## Docker 部署

若要使用 GitHub Actions 發布的映像，請執行：

```bash
docker compose pull
docker compose up -d
```

若要從原始碼自行建置，請執行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

範例 Compose 將 `127.0.0.1:6002` 對應至容器連接埠 `3000`，並將 `./content` 以唯讀方式掛載至 `/app/content`。如需使用其他監聽位址或連接埠，請修改 `docker-compose.yml` 中的連接埠對應。

此處使用 bind mount，而不是 Docker 命名卷，因此不會出現在 `docker volume ls` 中。您可以在 `docker inspect sub2apiextra-documentviewer` 輸出的 `Mounts` 中查看掛載詳細資料。

範例 Compose 將 `TZ` 環境變數設為 `Asia/Singapore`。如需使用其他時區，請在 `docker-compose.yml` 中修改。

頁面預設跟隨系統主題，手動選擇的主題與語言會儲存在瀏覽器中。介面與文件支援英文、俄文、簡體中文和繁體中文（台灣）。只有當瀏覽器偏好的語言受到支援時才會採用，否則使用英文。
