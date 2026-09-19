/*
 * 設定檔 —— 想改資料來源，改這裡就好（也可以直接在網站的「設定」頁改，
 * 那會存在瀏覽器 localStorage，優先於這裡的預設值）。
 */
window.SBConfig = (function () {

  const DEFAULTS = {
    teamName: 'INED 壘球隊',
    seasonName: '2026 春季',

    // 資料來源模式：
    //   'totals' = 球季累計成績（每位球員一列，就是現在這份 Sheet 的格式）
    //   'sheet'  = 逐打席三分頁（球員 / 比賽 / 打席），功能最完整
    //   'demo'   = data/ 底下的示範資料
    mode: 'totals',

    // Google Sheet 的 ID（網址 /spreadsheets/d/<這一段>/edit）。
    // 該 Sheet 的共用權限需設為「知道連結的任何人 → 檢視者」，瀏覽器才讀得到。
    sheetId: '13ZRWxv4aLHLzmSzYEgVttZJIyn3ztmO1g-hL3jfXeNg',

    // 工作表名稱。totals 留空代表讀第一個分頁
    tabs: { totals: '', players: '球員', games: '比賽', atbats: '打席' },

    // 若你用「檔案 → 共用 → 發佈到網路」拿到分頁的 CSV 網址，填在這裡會優先使用
    csvUrls: { totals: '', players: '', games: '', atbats: '' },

    // 排行榜規定打席 = 團隊場次 × 這個係數（向上取整），用於逐打席模式
    qualifyingPAPerGame: 2,

    // 累計成績模式沒有打席數，改用打數當排行門檻
    qualifyingAB: 20,

    // 「近況」看最後幾場
    recentGames: 5
  };

  const STORAGE_KEY = 'sb.config.v1';

  function load() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (e) { saved = {}; }
    const cfg = Object.assign({}, DEFAULTS, saved);
    cfg.tabs = Object.assign({}, DEFAULTS.tabs, saved.tabs);
    cfg.csvUrls = Object.assign({}, DEFAULTS.csvUrls, saved.csvUrls);
    return cfg;
  }

  function save(patch) {
    const cfg = Object.assign({}, load(), patch);
    // 只存跟預設不同的部分，這樣改了 config.js 的預設值仍會生效
    const diff = {};
    Object.keys(cfg).forEach(k => {
      if (JSON.stringify(cfg[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = cfg[k];
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(diff));
    } catch (e) {
      console.warn('無法儲存設定', e);
    }
    return cfg;
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  return { DEFAULTS, load, save, reset, STORAGE_KEY };
})();
