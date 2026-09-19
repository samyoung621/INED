/*
 * 資料層：抓 CSV → 對應欄位 → 正規化 → 組出整季的資料結構。
 *
 * 表頭名稱允許多種寫法（見 FIELDS），所以球隊自己的 Sheet 不必照抄欄位名。
 * 對不上的資料不會被默默吃掉，會收進 season.warnings 顯示在頁面上。
 */
window.SBData = (function () {
  const S = window.SBStats;
  const Csv = window.SBCsv;

  /* --------------------------------------------------- 欄位別名對應 */

  const FIELDS = {
    players: {
      id:       ['背號', '號碼', '球衣號碼', 'Number', 'No', '#'],
      name:     ['姓名', '球員', '名字', 'Name', 'Player'],
      position: ['守備位置', '守位', '位置', 'Position', 'POS'],
      hand:     ['慣用手', '打擊習慣', '左右', 'Bats'],
      status:   ['狀態', '是否在隊', 'Status']
    },
    games: {
      id:           ['場次', '場次ID', '比賽', '比賽編號', 'GameID', 'Game'],
      date:         ['日期', 'Date'],
      opponent:     ['對手', '對戰球隊', 'Opponent', 'VS'],
      venue:        ['場地', '球場', 'Venue'],
      runsFor:      ['我方得分', '得分', '本隊得分', 'RunsFor'],
      runsAgainst:  ['對方得分', '失分', '敵隊得分', 'RunsAgainst'],
      note:         ['備註', '賽事', '賽事名稱', 'Note']
    },
    atbats: {
      gameId:   ['場次', '場次ID', '比賽', '比賽編號', 'GameID', 'Game'],
      inning:   ['局數', '局', 'Inning'],
      playerId: ['背號', '號碼', 'Number', 'No', '#'],
      name:     ['姓名', '球員', 'Name'],
      order:    ['棒次', '打序', 'Order', 'Spot'],
      result:   ['結果', '打擊結果', '打席結果', 'Result', 'Outcome'],
      rbi:      ['打點', 'RBI'],
      runs:     ['得分', '得分數', 'R'],
      sb:       ['盜壘', '盜壘成功', 'SB'],
      cs:       ['盜壘失敗', '盜壘被刺', 'CS'],
      risp:     ['得點圈', '得點圈有人', 'RISP'],
      note:     ['備註', 'Note']
    }
  };

  /** 依別名清單從一列資料裡取值。 */
  function pick(row, names) {
    for (let i = 0; i < names.length; i++) {
      const v = row[names[i]];
      if (v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
    return '';
  }

  function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
  function isTruthy(v) {
    const s = String(v).trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1' || s === 'v' ||
           s === '是' || s === '有' || s === '✓';
  }

  /* --------------------------------------------------------- 取得來源 */

  function gvizUrl(sheetId, tab) {
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(sheetId) +
           '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab);
  }

  /** 回傳三個表各自的來源網址，以及這次用的是哪種模式。 */
  function resolveSources(cfg) {
    const keys = ['players', 'games', 'atbats'];
    const explicit = keys.filter(k => (cfg.csvUrls[k] || '').trim());

    if (explicit.length === keys.length) {
      const urls = {};
      keys.forEach(k => { urls[k] = cfg.csvUrls[k].trim(); });
      return { mode: 'sheet', urls, label: '已發佈的 CSV 網址' };
    }
    if (cfg.mode === 'sheet' && (cfg.sheetId || '').trim()) {
      const urls = {};
      keys.forEach(k => { urls[k] = cfg.csvUrls[k].trim() || gvizUrl(cfg.sheetId.trim(), cfg.tabs[k]); });
      return { mode: 'sheet', urls, label: 'Google Sheet ' + cfg.sheetId.trim() };
    }
    return {
      mode: 'demo',
      urls: { players: 'data/players.csv', games: 'data/games.csv', atbats: 'data/atbats.csv' },
      label: '示範資料'
    };
  }

  function fetchCsv(url) {
    return fetch(url, { cache: 'no-store' }).then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status + '：' + url);
      return res.text();
    }).then(text => {
      // Google 沒有權限時會回傳 HTML 登入頁，而不是 CSV
      if (/^\s*</.test(text)) {
        throw new Error('拿到的不是 CSV（可能是 Sheet 未開放檢視權限）');
      }
      return Csv.parse(text);
    });
  }

  /* ----------------------------------------------------------- 正規化 */

  function normalizePlayers(rows) {
    return rows.map((row, i) => {
      const F = FIELDS.players;
      const name = pick(row, F.name);
      if (!name) return null;
      const status = pick(row, F.status);
      return {
        id: pick(row, F.id) || name,
        number: pick(row, F.id),
        name: name,
        position: pick(row, F.position),
        hand: pick(row, F.hand),
        status: status || '在隊',
        active: !/離隊|退隊|inactive|no/i.test(status),
        order: i
      };
    }).filter(Boolean);
  }

  function normalizeGames(rows) {
    const games = rows.map((row, i) => {
      const F = FIELDS.games;
      const id = pick(row, F.id);
      if (!id) return null;
      const rf = pick(row, F.runsFor);
      const ra = pick(row, F.runsAgainst);
      const hasScore = rf !== '' && ra !== '';
      const g = {
        id: id,
        date: pick(row, F.date),
        opponent: pick(row, F.opponent) || '—',
        venue: pick(row, F.venue),
        runsFor: hasScore ? toInt(rf) : null,
        runsAgainst: hasScore ? toInt(ra) : null,
        note: pick(row, F.note),
        order: i
      };
      g.result = !hasScore ? null
        : g.runsFor > g.runsAgainst ? 'W'
        : g.runsFor < g.runsAgainst ? 'L' : 'T';
      return g;
    }).filter(Boolean);

    // 依日期排序（沒日期的維持原本順序排在後面）
    games.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
      return a.order - b.order;
    });
    games.forEach((g, i) => { g.seq = i + 1; });
    return games;
  }

  function normalizeAtbats(rows, players, games) {
    const byId = new Map(players.map(p => [String(p.id), p]));
    const byNumber = new Map(players.filter(p => p.number).map(p => [String(p.number), p]));
    const byName = new Map(players.map(p => [p.name, p]));
    const gameIds = new Set(games.map(g => g.id));

    const out = [];
    const warnings = { unknownResult: new Map(), unknownPlayer: new Map(), unknownGame: new Map() };
    const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

    rows.forEach((row, i) => {
      const F = FIELDS.atbats;
      const rawResult = pick(row, F.result);
      const rawPlayer = pick(row, F.playerId);
      const rawName = pick(row, F.name);
      const gameId = pick(row, F.gameId);
      if (!rawResult && !rawPlayer && !rawName) return;   // 空列

      const player = byId.get(rawPlayer) || byNumber.get(rawPlayer) || byName.get(rawName) || byName.get(rawPlayer);
      const code = S.normalizeOutcome(rawResult);

      if (!code) bump(warnings.unknownResult, rawResult || '(空白)');
      if (!player) bump(warnings.unknownPlayer, rawPlayer || rawName || '(空白)');
      if (gameId && !gameIds.has(gameId)) bump(warnings.unknownGame, gameId);

      out.push({
        rowIndex: i + 2,                 // 對應 Sheet 的列號（含表頭）
        gameId: gameId,
        inning: toInt(pick(row, F.inning)),
        playerId: player ? player.id : (rawPlayer || rawName),
        playerName: player ? player.name : (rawName || rawPlayer),
        knownPlayer: !!player,
        order: toInt(pick(row, F.order)),
        code: code,
        rawResult: rawResult,
        rbi: toInt(pick(row, F.rbi)),
        runs: toInt(pick(row, F.runs)),
        sb: toInt(pick(row, F.sb)),
        cs: toInt(pick(row, F.cs)),
        risp: isTruthy(pick(row, F.risp)),
        note: pick(row, F.note)
      });
    });

    return { atbats: out, warnings };
  }

  /* -------------------------------------------------- 組出整季資料 */

  function buildSeason(cfg, raw) {
    const players = normalizePlayers(raw.players.data);
    const games = normalizeGames(raw.games.data);
    const parsed = normalizeAtbats(raw.atbats.data, players, games);
    const atbats = parsed.atbats;

    const gameOrder = games.map(g => g.id);
    const gameById = new Map(games.map(g => [g.id, g]));

    // 每位球員的成績
    const grouped = S.groupBy(atbats, pa => pa.playerId);
    const rows = players.map(p => {
      const g = grouped.get(p.id);
      const list = g ? g.atbats : [];
      return {
        player: p,
        atbats: list,
        stats: g ? g.stats : S.summarize([]),
        recent: S.recentForm(list, gameOrder, cfg.recentGames),
        progression: S.progression(list, gameOrder)
      };
    });
    // Sheet 裡有打席但球員名單沒登記的人，也要看得到
    grouped.forEach((g, key) => {
      if (rows.some(r => r.player.id === key)) return;
      const first = g.atbats[0];
      const ghost = {
        id: key, number: key, name: (first && first.playerName) || String(key),
        position: '', hand: '', status: '未登記', active: true, order: 999, ghost: true
      };
      rows.push({
        player: ghost, atbats: g.atbats, stats: g.stats,
        recent: S.recentForm(g.atbats, gameOrder, cfg.recentGames),
        progression: S.progression(g.atbats, gameOrder)
      });
    });

    const rowByPlayer = new Map(rows.map(r => [String(r.player.id), r]));

    // 逐場團隊成績
    const byGame = games.map(g => {
      const list = atbats.filter(pa => pa.gameId === g.id);
      return { game: g, atbats: list, stats: S.summarize(list) };
    });
    let running = [];
    byGame.forEach(entry => {
      running = running.concat(entry.atbats);
      entry.cumulative = S.summarize(running);
    });

    const played = games.filter(g => g.result);
    const record = {
      games: games.length,
      played: played.length,
      W: played.filter(g => g.result === 'W').length,
      L: played.filter(g => g.result === 'L').length,
      T: played.filter(g => g.result === 'T').length,
      runsFor: played.reduce((s, g) => s + g.runsFor, 0),
      runsAgainst: played.reduce((s, g) => s + g.runsAgainst, 0)
    };
    record.winPct = (record.W + record.L) > 0 ? record.W / (record.W + record.L) : null;

    // 打席結果分佈（給總覽的圖表用）
    const distribution = {};
    Object.keys(S.OUTCOMES).forEach(code => { distribution[code] = 0; });
    atbats.forEach(pa => { if (pa.code) distribution[pa.code]++; });

    const warnings = [];
    const listify = (map, prefix) => {
      if (!map.size) return;
      const parts = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, n]) => k + '（' + n + ' 筆）');
      warnings.push(prefix + parts.join('、') + (map.size > 6 ? ' 等' : ''));
    };
    listify(parsed.warnings.unknownResult, '無法辨識的打席結果：');
    listify(parsed.warnings.unknownPlayer, '找不到對應球員的打席：');
    listify(parsed.warnings.unknownGame, '打席指到不存在的場次：');

    return {
      cfg: cfg,
      players: players,
      games: games,
      gameById: gameById,
      gameOrder: gameOrder,
      atbats: atbats,
      rows: rows,
      rowByPlayer: rowByPlayer,
      byGame: byGame,
      team: S.summarize(atbats),
      record: record,
      distribution: distribution,
      minPA: S.qualifyingPA(games.length, cfg.qualifyingPAPerGame),
      warnings: warnings
    };
  }

  /** 載入資料。Sheet 讀不到時自動退回示範資料，並回報原因。 */
  function load() {
    const cfg = window.SBConfig.load();
    const primary = resolveSources(cfg);

    const fetchAll = src => Promise.all([
      fetchCsv(src.urls.players), fetchCsv(src.urls.games), fetchCsv(src.urls.atbats)
    ]).then(([players, games, atbats]) => ({ players, games, atbats }));

    return fetchAll(primary)
      .then(raw => {
        const season = buildSeason(cfg, raw);
        season.source = primary;
        return season;
      })
      .catch(err => {
        if (primary.mode === 'demo') throw err;
        const fallback = resolveSources(Object.assign({}, cfg, { mode: 'demo', sheetId: '', csvUrls: { players: '', games: '', atbats: '' } }));
        return fetchAll(fallback).then(raw => {
          const season = buildSeason(cfg, raw);
          season.source = fallback;
          season.loadError = '讀取 Google Sheet 失敗（' + err.message + '），暫時顯示示範資料。';
          return season;
        });
      });
  }

  return { load, buildSeason, resolveSources, gvizUrl, FIELDS, normalizePlayers, normalizeGames, normalizeAtbats };
})();
