# 建置與部署

## 直接看看

網站是純靜態的，沒有任何建置步驟。在專案目錄起一個本機伺服器就能看：

```bash
python3 -m http.server 8000
# 開 http://localhost:8000/
```

> 不要用 `file://` 直接開 `index.html`。瀏覽器會擋住讀取本機 CSV，
> 畫面會停在載入失敗。

第一次打開看到的是 `data/` 裡的示範資料（9 場比賽、300 個打席），
用來確認每個頁面長什麼樣子。接上自己的 Google Sheet 後就會換掉。

## 接上 Google Sheet

### 1. 建立試算表

開一份新的 Google Sheet，建三個分頁，分別命名為 **球員**、**比賽**、**打席**，
各自照 [DATA-FORMAT.md](DATA-FORMAT.md) 的欄位填第一列表頭。

最快的做法是把 `data/players.csv`、`data/games.csv`、`data/atbats.csv`
分別匯入三個分頁，再把示範資料換成自己的。

### 2. 開放讀取權限

右上角「共用」→ 一般存取權改成 **知道連結的任何人 → 檢視者**。
網站是用瀏覽器直接抓 CSV，沒有這個權限會讀不到。

> 這代表任何拿到連結的人都能看到這份試算表。球隊打擊紀錄通常沒問題，
> 但別把個資（電話、地址、身分證號）放進同一份試算表。

### 3. 填入 Sheet ID

從網址抓 ID：

```
https://docs.google.com/spreadsheets/d/【這一段就是 Sheet ID】/edit
```

打開網站 →「設定」→ 模式選 **Google Sheet** → 貼上 Sheet ID → 儲存並重新載入。

設定存在瀏覽器裡，只對這台裝置有效。**要讓全隊都直接看到**，
請改 `assets/js/config.js` 裡的預設值並提交：

```js
mode: 'sheet',
sheetId: '你的 Sheet ID',
teamName: '你們的隊名',
```

### 替代做法：發佈到網路

如果組織政策擋住「知道連結的任何人」，改用
「檔案 → 共用 → 發佈到網路」，逐一發佈三個分頁為 CSV，
把三個網址填進「設定」頁下半部的三個欄位（或 `config.js` 的 `csvUrls`）。

發佈的內容 Google 會快取幾分鐘，所以剛改完資料不會立刻反映。

## 部署到 GitHub Pages

專案沒有建置步驟，把整個 repo 丟上去就能跑：

1. GitHub repo → **Settings → Pages**
2. Source 選 **Deploy from a branch**
3. Branch 選 `main`、資料夾選 `/ (root)` → Save

網址會是 `https://<帳號>.github.io/<repo>/`。
路由用的是 hash（`#/players`），所以不需要任何 rewrite 設定，
重新整理也不會 404。

## 比賽當天怎麼用

1. 手機打開網站 → **記錄**
2. 選比賽（沒有就用最下面的「新增比賽」建一場）
3. 選打者 → 填局數／打點 → 點一下結果按鈕即送出
   - 送出後會自動跳到打序的下一棒
   - 打錯可以按「復原最後一筆」，或在待匯出清單裡刪掉那一列
4. 中途可以看「本場即時統計」對帳
5. 比賽結束 → **匯出並貼回 Google Sheet** → 按「複製」→
   到 Sheet 的「打席」分頁，游標放在最後一列的**下一列**，貼上
6. 確認 Sheet 更新後，回網站按「清空全部」

輸入中的資料存在該台手機的瀏覽器裡，中途重新整理或斷線都不會不見，
但**不會自動同步到別人的手機**，所以一場比賽固定由一個人記錄。

## 測試

數據定義（打數怎麼扣、上壘率分母含哪些）有測試把關：

```bash
node --test tests/stats.test.js
```

改任何跟計算有關的東西之後都跑一次。

## 重新產生示範資料

```bash
python3 tools/generate-demo-data.py
```

固定亂數種子，每次產出的結果都一樣。
