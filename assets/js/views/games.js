/* 比賽列表，以及單場的成績表（box score）。 */
window.SBViews = window.SBViews || {};

window.SBViews.games = function (season) {
  const U = window.SBUi, S = window.SBStats, el = U.el;
  const frag = document.createDocumentFragment();

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: '比賽紀錄' }),
    el('p', { text: season.games.length
      ? season.games.length + ' 場比賽 · 點任一場看單場成績表'
      : '還沒有任何比賽紀錄' })
  ]));

  if (!season.games.length) {
    frag.appendChild(U.card(null, null, el('div', { class: 'empty' }, [
      el('p', { text: '目前的資料來源沒有逐場紀錄。' }),
      el('p', { class: 'note' }, [
        '從下一場比賽開始用 ',
        el('a', { href: '#/record' }, '「記錄」頁'),
        ' 逐打席輸入，這裡就會出現比賽列表、單場成績表與逐局紀錄。'
      ])
    ])));
    return frag;
  }

  const rec = season.record;
  frag.appendChild(U.tiles([
    { label: '戰績（勝-敗-和）', value: rec.W + '-' + rec.L + '-' + rec.T, hero: true,
      note: rec.W + '勝 ' + rec.L + '敗 ' + rec.T + '和' },
    { label: '勝率', value: S.fmtRate3(rec.winPct) },
    { label: '平均得分', value: rec.played ? S.fmtNum2(rec.runsFor / rec.played) : '-' },
    { label: '平均失分', value: rec.played ? S.fmtNum2(rec.runsAgainst / rec.played) : '-' }
  ]));

  frag.appendChild(U.card(null, null, U.table({
    sticky: 1,
    sort: { key: 'date', dir: 'desc' },
    columns: [
      { key: 'date', label: '日期', text: true, value: e => e.game.date || e.game.id,
        render: e => el('a', { href: '#/game/' + encodeURIComponent(e.game.id) }, e.game.date || e.game.id) },
      { key: 'opponent', label: '對手', text: true, value: e => e.game.opponent },
      { key: 'venue', label: '場地', text: true, value: e => e.game.venue, sortable: false },
      { key: 'note', label: '賽事', text: true, value: e => e.game.note, sortable: false },
      { key: 'score', label: '比分', value: e => e.game.runsFor,
        render: e => e.game.result ? (e.game.runsFor + ' : ' + e.game.runsAgainst) : '-' },
      { key: 'result', label: '結果', value: e => e.game.result, render: e => U.resultBadge(e.game.result) },
      { key: 'PA', label: '打席', value: e => e.stats.PA },
      { key: 'H', label: '安打', value: e => e.stats.H },
      { key: 'HR', label: '全打', value: e => e.stats.HR },
      { key: 'RBI', label: '打點', value: e => e.stats.RBI },
      { key: 'K', label: '三振', value: e => e.stats.K },
      { key: 'AVG', label: '團隊打擊率', value: e => e.stats.AVG, format: 'rate3' },
      { key: 'OPS', label: '團隊 OPS', value: e => e.stats.OPS, format: 'rate3' }
    ],
    rows: season.byGame,
    footer: (col, i) => {
      if (i === 0) return '合計';
      const t = season.team;
      if (col.key === 'score') return rec.runsFor + ' : ' + rec.runsAgainst;
      if (col.key === 'result') return rec.W + '-' + rec.L + '-' + rec.T;
      const v = t[col.key];
      return v === undefined ? '' : S.format(v, col.format || 'int');
    },
    onRowClick: e => { location.hash = '#/game/' + encodeURIComponent(e.game.id); }
  })));

  return frag;
};

window.SBViews.game = function (season, params) {
  const U = window.SBUi, S = window.SBStats, el = U.el;
  const frag = document.createDocumentFragment();

  const entry = season.byGame.find(e => e.game.id === String(params.id));
  if (!entry) {
    frag.appendChild(el('div', { class: 'page-head' }, el('h1', { text: '找不到這場比賽' })));
    frag.appendChild(U.banner(el('span', {}, ['場次代號「' + params.id + '」不存在。', el('a', { href: '#/games' }, '回到比賽列表')])));
    return frag;
  }

  const g = entry.game;
  const t = entry.stats;

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('h1', {}, [
      (g.date || g.id) + '　vs ' + g.opponent,
      el('span', { style: 'margin-left:10px' }, U.resultBadge(g.result))
    ]),
    el('p', { text: [g.venue, g.note, g.result ? g.runsFor + ' : ' + g.runsAgainst : '未記錄比分'].filter(Boolean).join('　·　') })
  ]));

  frag.appendChild(U.tiles([
    { label: '比分', value: g.result ? g.runsFor + ' : ' + g.runsAgainst : '-', hero: true },
    { label: '團隊打擊率', value: S.fmtRate3(t.AVG), note: t.H + ' 安打 / ' + t.AB + ' 打數 / ' + t.PA + ' 打席' },
    { label: '團隊上壘率', value: S.fmtRate3(t.OBP) },
    { label: '團隊 OPS', value: S.fmtRate3(t.OPS) },
    { label: '安打 / 長打', value: t.H + ' / ' + t.XBH, note: '全壘打 ' + t.HR },
    { label: '打點', value: S.fmtInt(t.RBI), note: '得分 ' + t.R },
    { label: '四壞 / 三振', value: (t.BB + t.IBB) + ' / ' + t.K, note: '賽後累計打擊率 ' + S.fmtRate3(entry.cumulative.AVG) }
  ]));

  /* --------------------------------------------------- 單場成績表 */

  const byPlayer = S.groupBy(entry.atbats, pa => pa.playerId);
  const lines = [...byPlayer.values()].map(v => {
    const row = season.rowByPlayer.get(String(v.key));
    const paList = v.atbats.slice().sort((a, b) => a.inning - b.inning || a.rowIndex - b.rowIndex);
    return {
      player: row ? row.player : { id: v.key, name: (paList[0] && paList[0].playerName) || v.key, number: v.key },
      stats: v.stats,
      order: paList[0] ? paList[0].order : 99,
      atbats: paList
    };
  }).sort((a, b) => (a.order || 99) - (b.order || 99));

  frag.appendChild(U.card('單場成績表', lines.length + ' 位球員出賽', U.table({
    sticky: 2,
    columns: [
      { key: 'order', label: '棒次', value: r => r.order || null },
      { key: 'name', label: '球員', text: true, value: r => r.player.name, render: r => U.playerLink(r.player) },
      { key: 'PA', label: '打席', value: r => r.stats.PA },
      { key: 'AB', label: '打數', value: r => r.stats.AB },
      { key: 'H', label: '安打', value: r => r.stats.H },
      { key: '2B', label: '二安', value: r => r.stats['2B'] },
      { key: '3B', label: '三安', value: r => r.stats['3B'] },
      { key: 'HR', label: '全打', value: r => r.stats.HR },
      { key: 'RBI', label: '打點', value: r => r.stats.RBI },
      { key: 'R', label: '得分', value: r => r.stats.R },
      { key: 'BB', label: '四壞', value: r => r.stats.BB + r.stats.IBB },
      { key: 'K', label: '三振', value: r => r.stats.K },
      { key: 'SB', label: '盜壘', value: r => r.stats.SB },
      { key: 'AVG', label: '打擊率', value: r => r.stats.AVG, format: 'rate3' },
      { key: 'pa', label: '逐打席', text: true, sortable: false, value: () => '',
        render: r => el('span', { class: 'pa-list' },
          r.atbats.map(pa => U.paChip(pa.code, pa.inning ? pa.inning + '局' : ''))) }
    ],
    rows: lines,
    sort: { key: 'order', dir: 'asc' },
    footer: (col, i) => {
      if (i === 0) return '';
      if (col.key === 'name') return '合計';
      if (col.key === 'BB') return S.fmtInt(t.BB + t.IBB);
      const v = t[col.key];
      return v === undefined ? '' : S.format(v, col.format || 'int');
    }
  })));

  /* ------------------------------------------------------- 逐局紀錄 */

  const innings = [...new Set(entry.atbats.map(pa => pa.inning))].filter(n => n > 0).sort((a, b) => a - b);
  if (innings.length) {
    frag.appendChild(U.card('逐局紀錄', null, el('div', {}, innings.map(inn => {
      const list = entry.atbats.filter(pa => pa.inning === inn).sort((a, b) => a.rowIndex - b.rowIndex);
      const runs = list.reduce((s, pa) => s + pa.runs, 0);
      return el('div', { style: 'display:grid;grid-template-columns:76px 1fr;gap:8px;padding:7px 0;border-bottom:1px solid var(--grid)' }, [
        el('div', { class: 'note' }, [
          el('strong', { text: inn + ' 局' }),
          runs ? el('span', { class: 'muted', text: '　' + runs + ' 分' }) : null
        ]),
        el('div', { class: 'pa-list' }, list.map(pa =>
          U.paChip(pa.code, (pa.playerName || '') + (pa.rbi ? ' ' + pa.rbi + '打點' : ''))))
      ]);
    }))));
  }

  const idx = season.games.findIndex(x => x.id === g.id);
  frag.appendChild(el('div', { class: 'controls' }, [
    idx > 0 ? el('a', { class: 'btn btn--sm', href: '#/game/' + encodeURIComponent(season.games[idx - 1].id) }, '← 上一場') : null,
    el('a', { class: 'btn btn--sm', href: '#/games' }, '比賽列表'),
    idx < season.games.length - 1 ? el('a', { class: 'btn btn--sm', href: '#/game/' + encodeURIComponent(season.games[idx + 1].id) }, '下一場 →') : null
  ]));

  return frag;
};
