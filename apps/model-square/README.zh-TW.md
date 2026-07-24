# Sub2API 模型廣場

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文（台灣） | [Русский](README.ru-RU.md)

這是一個可嵌入 Sub2API 的唯讀模型展示頁面。頁面使用 React、TypeScript 與 Ant Design，模型圖示來自 `@lobehub/icons`，模型中繼資料來自 [models.dev](https://models.dev/)。

服務不提供設定頁面、管理員介面或寫入介面。處理程序只會在啟動時從 `MODEL_IDS` 讀取需要顯示的模型。

## 設定

| 變數 | 必填 | 預設值 | 說明 |
| --- | --- | --- | --- |
| `MODEL_IDS` | 是 | Compose 中提供範例 | 以逗號或換行分隔的模型 ID |
| `PRESERVE_MODEL_ID_ORDER` | 否 | `false` | 設為 `true` 時依 `MODEL_IDS` 中的順序顯示；否則依模型 ID 的字母順序顯示 |
| `NOTICE_MESSAGE` | 否 | Compose 中提供範例 | 顯示於頁面頂端的一則通知，留空則不顯示 |
| `CACHE_FILE` | 否 | `./data/catalog-cache.json` | 中繼資料快取檔案 |

範例：

```env
MODEL_IDS="gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna"
PRESERVE_MODEL_ID_ORDER="false"
NOTICE_MESSAGE="Model availability and pricing are subject to change."
```

服務啟動時會立即與 models.dev 同步，之後每天在本機時間 00:00 同步一次。範例 Compose 將 `TZ` 設為 `Asia/Singapore`；如需使用其他時區，請修改此環境變數。瀏覽器造訪不會觸發同步。未收錄的 ID 仍會顯示，並使用通用圖示與中繼資料缺漏提示。卡片會顯示基礎價格，以及 models.dev 回傳的上下文階梯價格。

## 本機開發

```bash
cp .env.example .env
npm install
npm run dev
```

頁面位於 `http://localhost:4173/`，Vite 會將目錄請求代理至本機 API 服務。

執行完整檢查：

```bash
npm run check
```

## Docker 部署

先在 [`docker-compose.yml`](docker-compose.yml) 中修改模型 ID 與通知內容。若要使用 GitHub Actions 發布的映像，請執行：

```bash
docker compose pull
docker compose up -d
```

若要從原始碼自行建置，請執行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

範例 Compose 將 `127.0.0.1:6001` 對應至容器連接埠 `3000`。如需使用其他監聽位址或連接埠，請修改 `docker-compose.yml` 中的連接埠對應。

修改 Compose 環境變數後，請使用 `docker compose up -d` 套用設定。不要只執行 `docker compose restart`，因為它會沿用現有容器中的舊環境變數。

## 嵌入 Sub2API

iframe 網址由使用者的瀏覽器開啟，因此必須是瀏覽器能夠連線的網址。`http://sub2apiextra-modelsquare:3000` 這類 Docker 服務位址通常只有同一 Docker 網路中的容器能夠解析。

若只在內部網路使用，可以填入使用者能夠連線的內部 IP 位址或網域名稱。若 Sub2API 對外公開，建議透過同一個反向代理將頁面發布為 HTTPS 路徑或子網域。Sub2API 使用 HTTPS 時，iframe 也必須使用 HTTPS，以免遭瀏覽器以混合內容為由封鎖。

頁面預設跟隨系統主題，手動選擇的主題與語言會儲存在瀏覽器中。介面支援英文、俄文、簡體中文和繁體中文（台灣）。若瀏覽器偏好的語言不受支援，則使用英文。
