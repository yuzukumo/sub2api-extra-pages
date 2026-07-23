# Sub2API 擴充頁面

[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文（台灣） | [Русский](README.ru-RU.md)

此儲存庫包含多個可獨立部署並嵌入 Sub2API 的頁面應用程式。

## 應用程式

| 應用程式 | 目錄 | 說明 |
| --- | --- | --- |
| 模型廣場 | [`apps/model-square`](apps/model-square/) | 顯示模型、供應商、內容窗口與價格資訊 |
| 文件閱讀器 | [`apps/document-viewer`](apps/document-viewer/) | 依照設定順序顯示多份 Markdown 文件 |

每個應用程式都是獨立專案，擁有自己的原始碼、相依套件、環境變數、Dockerfile、Compose 檔案與說明文件。應用程式之間不共用容器、連接埠、資料卷或 API。

## 容器映像

GitHub Actions 會將映像發布至 GitHub Container Registry。Compose 檔案預設使用以下 `latest` 映像：

- `ghcr.io/yuzukumo/sub2api-extra-pages-model-square:latest`
- `ghcr.io/yuzukumo/sub2api-extra-pages-document-viewer:latest`

每個應用程式也都提供 `docker-compose.local.yml`，用於本機建置。

## 預設連接埠

所有容器內部統一監聽 `3000`，主機連接埠依序分配，預設只繫結至 `127.0.0.1`。

| 應用程式 | 主機連接埠 | 容器連接埠 |
| --- | --- | --- |
| 模型廣場 | `6001` | `3000` |
| 文件閱讀器 | `6002` | `3000` |

## 授權條款

[MIT](LICENSE)
