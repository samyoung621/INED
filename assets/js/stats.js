/*
 * 打擊數據計算引擎（純函式，無 DOM 依賴）
 *
 * 輸入：逐打席紀錄（每一列一個打席）
 * 輸出：所有累計數與率值。Google Sheet 裡不需要寫任何公式。
 *
 * 這個檔案同時支援瀏覽器（掛在 globalThis.SBStats）與 Node（module.exports），
 * 所以 tests/stats.test.js 可以直接 require 它。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SBStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ------------------------------------------------------------------ *
   * 打席結果代碼
   * ------------------------------------------------------------------ */

  // group：safe=安打、on=非安打上壘、out=出局、sac=犧牲
  const OUTCOMES = {
    '1B':  { label: '一壘安打', short: '一安', group: 'safe', ab: true,  hit: 1, bases: 1 },
    '2B':  { label: '二壘安打', short: '二安', group: 'safe', ab: true,  hit: 1, bases: 2 },
    '3B':  { label: '三壘安打', short: '三安', group: 'safe', ab: true,  hit: 1, bases: 3 },
    'HR':  { label: '全壘打',   short: '全打', group: 'safe', ab: true,  hit: 1, bases: 4 },
    'BB':  { label: '四壞球',   short: '四壞', group: 'on',   ab: false, hit: 0, bases: 0, walk: true },
    'IBB': { label: '故意四壞', short: '故四', group: 'on',   ab: false, hit: 0, bases: 0, walk: true },
    'HBP': { label: '觸身球',   short: '觸身', group: 'on',   ab: false, hit: 0, bases: 0, hbp: true },
    'E':   { label: '失誤上壘', short: '失上', group: 'on',   ab: true,  hit: 0, bases: 0 },
    'CI':  { label: '妨礙打擊', short: '妨擊', group: 'on',   ab: false, hit: 0, bases: 0, excludeFromObp: true },
    'K':   { label: '三振',     short: '三振', group: 'out',  ab: true,  hit: 0, bases: 0, k: true },
    'GO':  { label: '滾地出局', short: '滾出', group: 'out',  ab: true,  hit: 0, bases: 0, inPlay: true },
    'FO':  { label: '飛球出局', short: '飛出', group: 'out',  ab: true,  hit: 0, bases: 0, inPlay: true },
    'LO':  { label: '平飛出局', short: '平飛', group: 'out',  ab: true,  hit: 0, bases: 0, inPlay: true },
    'FC':  { label: '野手選擇', short: '野選', group: 'out',  ab: true,  hit: 0, bases: 0, inPlay: true },
    'DP':  { label: '雙殺打',   short: '雙殺', group: 'out',  ab: true,  hit: 0, bases: 0, inPlay: true, gidp: true },
    'SF':  { label: '高飛犧牲打', short: '犧飛', group: 'sac', ab: false, hit: 0, bases: 0, sf: true },
    'SH':  { label: '犧牲打',   short: '犧打', group: 'sac',  ab: false, hit: 0, bases: 0, sh: true }
  };

  // 中文 / 常見別名 → 標準代碼
  const ALIASES = {};
  Object.keys(OUTCOMES).forEach(code => {
    ALIASES[code] = code;
    ALIASES[OUTCOMES[code].label] = code;
    ALIASES[OUTCOMES[code].short] = code;
  });
  Object.assign(ALIASES, {
    '安打': '1B', '一安': '1B', '一壘打': '1B', 'H': '1B', '1': '1B',
    '二壘打': '2B', '2': '2B',
    '三壘打': '3B', '3': '3B',
    '紅不讓': 'HR', '本壘打': 'HR', '4': 'HR',
    '保送': 'BB', '壞球保送': 'BB', 'W': 'BB',
    '死球': 'HBP', '觸身': 'HBP',
    'SO': 'K', '被三振': 'K', '三振出局': 'K',
    '滾地球出局': 'GO', '內野滾地': 'GO', 'G': 'GO',
    '高飛出局': 'FO', '飛球': 'FO', 'F': 'FO',
    '平飛球出局': 'LO', 'L': 'LO',
    '野手選擇上壘': 'FC',
    'GIDP': 'DP', '雙殺': 'DP',
    '犧牲飛球': 'SF', '高飛犧牲': 'SF',
    'SAC': 'SH', '犧牲短打': 'SH', '短打': 'SH',
    'ROE': 'E', '失誤': 'E'
  });

  /** 把使用者寫的結果欄位正規化成標準代碼；認不出來回傳 null。 */
  function normalizeOutcome(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return ALIASES[s] || ALIASES[s.toUpperCase()] || null;
  }

  /* ------------------------------------------------------------------ *
   * 累計
   * ------------------------------------------------------------------ */

  function emptyTotals() {
    return {
      PA: 0, AB: 0, H: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0, TB: 0,
      BB: 0, IBB: 0, HBP: 0, K: 0, SF: 0, SH: 0, E: 0, DP: 0, CI: 0,
      RBI: 0, R: 0, SB: 0, CS: 0,
      RISP_AB: 0, RISP_H: 0,
      games: 0, unknown: 0
    };
  }

  /**
   * 把打席列表加總。
   * @param {Array} atbats 已正規化的打席（含 code / rbi / runs / sb / cs / risp / gameId）
   */
  function accumulate(atbats) {
    const t = emptyTotals();
    const gameSet = new Set();

    atbats.forEach(pa => {
      const o = OUTCOMES[pa.code];
      if (!o) { t.unknown++; return; }
      if (pa.gameId) gameSet.add(pa.gameId);

      t.PA++;
      if (o.ab) t.AB++;
      if (o.hit) { t.H++; t[pa.code]++; }
      t.TB += o.bases;
      if (pa.code === 'BB') t.BB++;
      if (pa.code === 'IBB') t.IBB++;
      if (o.hbp) t.HBP++;
      if (o.k) t.K++;
      if (o.sf) t.SF++;
      if (o.sh) t.SH++;
      if (pa.code === 'E') t.E++;
      if (o.gidp) t.DP++;
      if (pa.code === 'CI') t.CI++;

      t.RBI += num(pa.rbi);
      t.R += num(pa.runs);
      t.SB += num(pa.sb);
      t.CS += num(pa.cs);

      if (pa.risp) {
        if (o.ab) { t.RISP_AB++; if (o.hit) t.RISP_H++; }
      }
    });

    t.games = gameSet.size;
    return t;
  }

  /* ------------------------------------------------------------------ *
   * 率值
   * ------------------------------------------------------------------ */

  /** 安全除法：分母 0 時回傳 null（而不是 0 或 NaN），呈現時顯示為 "-"。 */
  function ratio(numer, denom) {
    return denom > 0 ? numer / denom : null;
  }

  /**
   * 由累計數算出全部率值。
   *
   * AVG   = H / AB
   * OBP   = (H + BB + IBB + HBP) / (AB + BB + IBB + HBP + SF)   ← 犧牲打(SH)、妨礙打擊不列入分母
   * SLG   = TB / AB
   * OPS   = OBP + SLG
   * ISO   = SLG - AVG
   * BABIP = (H - HR) / (AB - K - HR + SF)
   */
  function derive(t) {
    const walks = t.BB + t.IBB;
    const obpDenom = t.AB + walks + t.HBP + t.SF;
    const AVG = ratio(t.H, t.AB);
    const OBP = ratio(t.H + walks + t.HBP, obpDenom);
    const SLG = ratio(t.TB, t.AB);
    const babipDenom = t.AB - t.K - t.HR + t.SF;

    return Object.assign({}, t, {
      XBH: t['2B'] + t['3B'] + t.HR,
      TOB: t.H + walks + t.HBP,
      AVG: AVG,
      OBP: OBP,
      SLG: SLG,
      OPS: (OBP === null || SLG === null) ? null : OBP + SLG,
      ISO: (SLG === null || AVG === null) ? null : SLG - AVG,
      BBpct: ratio(walks, t.PA),
      Kpct: ratio(t.K, t.PA),
      BABIP: ratio(t.H - t.HR, babipDenom),
      RISP_AVG: ratio(t.RISP_H, t.RISP_AB),
      // 每場打點，用來比較出賽數不同的球員
      RBIperG: ratio(t.RBI, t.games)
    });
  }

  /** 一步到底：打席列表 → 完整成績。 */
  function summarize(atbats) {
    return derive(accumulate(atbats));
  }

  /* ------------------------------------------------------------------ *
   * 分組
   * ------------------------------------------------------------------ */

  /** 依鍵值分組，每組各自算出完整成績。回傳 Map<key, {key, atbats, stats}>。 */
  function groupBy(atbats, keyFn) {
    const map = new Map();
    atbats.forEach(pa => {
      const k = keyFn(pa);
      if (k === undefined || k === null || k === '') return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(pa);
    });
    const out = new Map();
    map.forEach((list, k) => out.set(k, { key: k, atbats: list, stats: summarize(list) }));
    return out;
  }

  /**
   * 逐場走勢：依比賽順序回傳每場成績與累計成績。
   * @param {Array} atbats 某球員的打席
   * @param {Array} gameOrder 依日期排好的 gameId 陣列
   */
  function progression(atbats, gameOrder) {
    const byGame = new Map();
    atbats.forEach(pa => {
      if (!byGame.has(pa.gameId)) byGame.set(pa.gameId, []);
      byGame.get(pa.gameId).push(pa);
    });
    const rows = [];
    let running = [];
    gameOrder.forEach(gid => {
      if (!byGame.has(gid)) return;
      const list = byGame.get(gid);
      running = running.concat(list);
      rows.push({
        gameId: gid,
        game: summarize(list),
        cumulative: summarize(running)
      });
    });
    return rows;
  }

  /** 近 n 場成績（依 gameOrder 由舊到新，取最後 n 場有出賽的）。 */
  function recentForm(atbats, gameOrder, n) {
    const played = gameOrder.filter(gid => atbats.some(pa => pa.gameId === gid));
    const window = played.slice(-Math.max(1, n || 5));
    const set = new Set(window);
    return {
      games: window.length,
      gameIds: window,
      stats: summarize(atbats.filter(pa => set.has(pa.gameId)))
    };
  }

  /* ------------------------------------------------------------------ *
   * 排行榜
   * ------------------------------------------------------------------ */

  // key：stats 的欄位；dir：desc 代表越大越好；min：需達規定打席才排名
  const CATEGORIES = [
    { key: 'AVG',   label: '打擊率',   format: 'rate3', dir: 'desc', qualified: true },
    { key: 'OPS',   label: 'OPS',     format: 'rate3', dir: 'desc', qualified: true },
    { key: 'OBP',   label: '上壘率',   format: 'rate3', dir: 'desc', qualified: true },
    { key: 'SLG',   label: '長打率',   format: 'rate3', dir: 'desc', qualified: true },
    { key: 'H',     label: '安打',     format: 'int',   dir: 'desc', qualified: false },
    { key: 'HR',    label: '全壘打',   format: 'int',   dir: 'desc', qualified: false },
    { key: 'RBI',   label: '打點',     format: 'int',   dir: 'desc', qualified: false },
    { key: 'R',     label: '得分',     format: 'int',   dir: 'desc', qualified: false },
    { key: 'XBH',   label: '長打',     format: 'int',   dir: 'desc', qualified: false },
    { key: 'TB',    label: '壘打數',   format: 'int',   dir: 'desc', qualified: false },
    { key: 'SB',    label: '盜壘',     format: 'int',   dir: 'desc', qualified: false },
    { key: 'BB',    label: '四壞',     format: 'int',   dir: 'desc', qualified: false },
    { key: 'ISO',   label: '純長打率', format: 'rate3', dir: 'desc', qualified: true },
    { key: 'BBpct', label: '四壞率',   format: 'pct1',  dir: 'desc', qualified: true },
    { key: 'Kpct',  label: '三振率',   format: 'pct1',  dir: 'asc',  qualified: true },
    { key: 'RISP_AVG', label: '得點圈打擊率', format: 'rate3', dir: 'desc', qualified: false }
  ];

  /**
   * 排行榜。
   * @param {Array} rows [{ player, stats }]
   * @param {string} key  CATEGORIES 的 key
   * @param {object} opts { minPA, limit, dir }
   */
  function rank(rows, key, opts) {
    const o = opts || {};
    const cat = CATEGORIES.find(c => c.key === key) || { dir: 'desc', qualified: false };
    const dir = o.dir || cat.dir;
    const minPA = cat.qualified ? (o.minPA || 0) : 0;

    const pool = rows.filter(r => {
      const v = r.stats[key];
      if (v === null || v === undefined || Number.isNaN(v)) return false;
      if (r.stats.PA < minPA) return false;
      // 累計類項目為 0 的不必占榜位
      if (!cat.qualified && v === 0) return false;
      return true;
    });

    pool.sort((a, b) => {
      const d = dir === 'asc' ? a.stats[key] - b.stats[key] : b.stats[key] - a.stats[key];
      if (d !== 0) return d;
      // 同分：打席多的在前，再比姓名，讓排序穩定
      if (b.stats.PA !== a.stats.PA) return b.stats.PA - a.stats.PA;
      return String(a.player && a.player.name).localeCompare(String(b.player && b.player.name), 'zh-Hant');
    });

    // 並列同名次
    let lastVal = null, lastRank = 0;
    pool.forEach((r, i) => {
      const v = r.stats[key];
      if (lastVal !== null && v === lastVal) r.rank = lastRank;
      else { r.rank = i + 1; lastRank = r.rank; lastVal = v; }
    });

    return o.limit ? pool.slice(0, o.limit) : pool;
  }

  /** 規定打席：預設 團隊場次 × 2（壘球一場約 3-4 打席，取 2 讓門檻不致太嚴）。 */
  function qualifyingPA(teamGames, perGame) {
    const rate = perGame === undefined ? 2 : perGame;
    return Math.max(1, Math.ceil(teamGames * rate));
  }

  /* ------------------------------------------------------------------ *
   * 格式化
   * ------------------------------------------------------------------ */

  /** .345 這種棒球式寫法（去掉前導 0）。 */
  function fmtRate3(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    const s = v.toFixed(3);
    return v < 1 && v >= 0 ? s.replace(/^0/, '') : s;
  }
  function fmtPct1(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    return (v * 100).toFixed(1) + '%';
  }
  function fmtInt(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    return String(Math.round(v));
  }
  function fmtNum2(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    return v.toFixed(2);
  }
  function format(v, kind) {
    switch (kind) {
      case 'text': return (v === null || v === undefined) ? '' : String(v);
      case 'rate3': return fmtRate3(v);
      case 'pct1': return fmtPct1(v);
      case 'num2': return fmtNum2(v);
      default: return fmtInt(v);
    }
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  return {
    OUTCOMES, ALIASES, CATEGORIES,
    normalizeOutcome, emptyTotals, accumulate, derive, summarize,
    groupBy, progression, recentForm,
    rank, qualifyingPA, ratio,
    format, fmtRate3, fmtPct1, fmtInt, fmtNum2
  };
});
