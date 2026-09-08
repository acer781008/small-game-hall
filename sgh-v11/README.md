# 小遊戲館 V1.0｜永久資料保存＋賓果圖片修正版

目前整合：賓果、數獨、翻牌、貨架整理。

## V1.0 這次修改

### 1. 永久資料保存
正式部署時，只要在 Render 服務設定 `DATABASE_URL`（PostgreSQL 連線字串），以下資料會寫入 PostgreSQL，不會因為 Web Service 重啟、休眠或重新部署就消失：

- 目前活動碼
- 開賽日期＋時間、結束日期＋時間
- 共用備註
- 各遊戲開放／關閉
- 四款遊戲設定
- 獎品項目、剩餘數量、啟用狀態
- 每位玩家最多得獎次數
- 得獎紀錄

如果沒有設定 `DATABASE_URL`，系統仍可本機測試，但會使用 JSON 檔；主控頁會顯示警告「本機 JSON」。

資料庫表格會由程式第一次啟動時自動建立，不需手動建表。

### 2. 賓果圖片修正
整合到 `/games/bingo` 後，原本玩家盤面的圖片網址仍指向 `/farm/...`、`/mahjong/...`，所以 Render 上會出現破圖，只剩「圖案 110」這類替代文字。

V1.0 已改成：

- `/games/bingo/farm/...`
- `/games/bingo/mahjong/...`

農作物與麻將圖都會從賓果自己的資料夾正常載入。

### 3. 主控頁資料保存狀態
主控後台會顯示：

- `💾 永久資料庫：已連線`：正式永久保存已啟用
- `⚠️ 本機 JSON：正式上線前請設定 DATABASE_URL`：目前仍不是永久保存

## Render 環境變數

必要：

```text
ADMIN_PASSWORD=你的主控密碼
DATABASE_URL=你的 PostgreSQL 連線字串
```

如果你的 PostgreSQL 明確要求 SSL，可另外設定：

```text
DATABASE_SSL=require
```

若使用不需要 SSL 的本機 PostgreSQL：

```text
DATABASE_SSL=disable
```

## 本機測試

沒有設定 `DATABASE_URL` 也可以先測：

```bash
npm install
npm start
```

開啟：`http://localhost:3000`

主控：`http://localhost:3000/admin-login.html`

## 更新既有 GitHub 倉庫

如果你已經有 `small-game-hall` 倉庫，不用重新建倉，也不用重新上傳所有圖片。

把「V1.0 更新檔」覆蓋到原本的遊戲館資料夾後，在 Git Bash 輸入：

```bash
git add .
git commit -m "V1.0 永久資料庫與賓果圖片修正"
git push
```

Render 若已連著這個 GitHub 倉庫，push 後會自動重新部署。


## V1.1 修正
- 貨架整理手機版遊戲區可上下滑動，底部貨架不再被瀏覽器工具列切住；拖曳商品時仍會鎖定拖曳。
- 修正貨架頁「活動活動碼」重複文字。
- 主控獎品設定新增「複製剩餘獎品」，只列目前啟用且數量大於 0 的獎品與總剩餘數。
- 得獎紀錄複製改為按日期分組、編號、時間只顯示到分鐘，方便貼到 LINE/聊天。
