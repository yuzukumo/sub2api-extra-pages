# Sub2API 模型廣場

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文（台灣） | [Русский](README.ru-RU.md)

這是一個可嵌入 Sub2API 的唯讀模型展示頁面。頁面使用 React、TypeScript 與 Ant Design，模型圖示來自 `@lobehub/icons`，模型中繼資料來自 [models.dev](https://models.dev/)。

服務不提供設定頁面、管理員介面或寫入介面。它會自動顯示至少包含一個已啟用且可排程帳號的啟用、非專屬 Sub2API 分組中的可用模型與倍率。

## 設定

| 變數                      | 必填 | 預設值                        | 說明                                             |
| ------------------------- | ---- | ----------------------------- | ------------------------------------------------ |
| `NOTICE_MESSAGE`          | 否   | Compose 中提供範例            | 顯示於頁面頂端的一則通知，留空則不顯示           |
| `TZ`                      | 否   | `Asia/Singapore`              | 每天 00:00 同步與倍率歷史記錄所使用的本機時區    |
| `CACHE_FILE`              | 否   | `./data/catalog-cache.json`  | 中繼資料快取檔案                                 |
| `HISTORY_FILE`            | 否   | `./data/rate-history.json`   | 分組倍率歷史檔案                                 |
| `SUB2API_URL`             | 是   | Compose 中提供範例            | Sub2API 內網位址                                 |
| `SUB2API_ADMIN_API_KEY`   | 是   | 空白                          | 僅由伺服器讀取分組與可用模型時使用的管理員 API Key |

範例：

```env
NOTICE_MESSAGE="Model availability and pricing are subject to change."
TZ=Asia/Singapore
SUB2API_URL="http://sub2api:8080"
SUB2API_ADMIN_API_KEY=""
```

服務啟動時會先讀取啟用且非專屬的 Sub2API 分組及其可用模型，再從 models.dev 取得中繼資料。每個分組的模型集合取該分組內所有已啟用且可排程帳號的可用模型 ID 聯集，並自動去除重複，因此會遵循帳號的模型白名單和對應。之後每 10 分鐘檢查一次 Sub2API；模型集合變更時會立即重新整理 models.dev，未變更時只更新分組與價格。models.dev 仍會在本機時間每天 00:00 強制重新整理。每日倍率資料會彙整為開、高、低、收並顯示為 K 線。管理員 Key 不會傳送到瀏覽器，瀏覽器造訪也不會觸發同步。

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

先在 [`docker-compose.yml`](docker-compose.yml) 中設定 Sub2API 位址、管理員 API Key 與選填通知內容。若要使用 GitHub Actions 發布的映像，請執行：

```bash
docker compose pull
docker compose up -d
```

若要從原始碼自行建置，請執行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

範例 Compose 將 `127.0.0.1:6001` 對應至容器連接埠 `3000`。如需使用其他監聽位址或連接埠，請修改 `docker-compose.yml` 中的連接埠對應。

Compose 會建立名為 `sub2apiextra-modelsquare-data` 的命名磁碟區，用來保存目錄快取與倍率歷史。更新容器或映像時請保留該磁碟區；只有需要重設歷史記錄時才刪除它。

修改 Compose 環境變數後，請使用 `docker compose up -d` 套用設定。不要只執行 `docker compose restart`，因為它會沿用現有容器中的舊環境變數。

## 嵌入 Sub2API

iframe 網址由使用者的瀏覽器開啟，因此必須是瀏覽器能夠連線的網址。`http://sub2apiextra-modelsquare:3000` 這類 Docker 服務位址通常只有同一 Docker 網路中的容器能夠解析。

若只在內部網路使用，可以填入使用者能夠連線的內部 IP 位址或網域名稱。若 Sub2API 對外公開，建議透過同一個反向代理將頁面發布為 HTTPS 路徑或子網域。Sub2API 使用 HTTPS 時，iframe 也必須使用 HTTPS，以免遭瀏覽器以混合內容為由封鎖。

頁面預設跟隨系統主題，手動選擇的主題與語言會儲存在瀏覽器中。介面支援英文、俄文、簡體中文和繁體中文（台灣）。若瀏覽器偏好的語言不受支援，則使用英文。
