/* 球員個人頁：累計成績、近況、走勢、逐場、逐打席、各項名次。 */
window.SBViews = window.SBViews || {};
window.SBViews.player = function (season, params) {
  const U = window.SBUi, C = window.SBCharts, S = window.SBStats, el = U.el;
  const frag = document.createDocumentFragment();

  const row = season.rowByPlayer.get(String(params.id));
  if (!row) {
    frag.appendChild(el('div', { class: 'page-head' }, el('h1', { text: '找不到這位球員' })));
    frag.appendChild(U.banner(el('span', {}, [
      '網址裡的球員代號是「' + params.id + '」。',
      el('a', { href: '#/players' }, '回到全隊成績表')
    ])));
    return frag;
  }

  const p = row.player;
  const t = row.stats;

  const totalsMode = season.granularity === 'totals';

  const photo = p.photo
    ? el('img', {
        class: 'player-photo', src: p.photo, alt: p.name + ' 的照片', loading: 'lazy',
        onerror: e => { e.target.remove(); }     // 照片連結失效就不要留破圖
      })
    : null;

  frag.appendChild(el('div', { class: 'page-head player-head' }, [
    photo,
    el('div', {}, [
      el('h1', {}, [
        p.name,
        el('span', { class: 'muted', style: 'font-weight:450;font-size:16px;margin-left:10px' },
          (p.number ? '#' + p.number : '') + (p.position ? '　' + p.position : '') + (p.hand ? '　' + p.hand + '打' : ''))
      ]),
      el('p', {}, [
        totalsMode ? (t.AB + ' 個打數 · ' + t.H + ' 支安打') : (t.games + ' 場出賽 · ' + t.PA + ' 個打席'),
        !p.active ? el('span', { class: 'badge', style: 'margin-left:8px' }, p.status) : null,
        p.ghost ? el('span', { class: 'badge', style: 'margin-left:8px' }, '球員名單未登記') : null
      ])
    ])
  ]));

  if (totalsMode ? t.AB === 0 : t.PA === 0) {
    frag.appendChild(U.banner('這位球員目前沒有任何打擊紀錄。'));
    return frag;
  }

  /* --------------------------------------------------------- 累計成績 */

  frag.appendChild(U.tiles(totalsMode ? [
    { label: '打擊率', value: S.fmtRate3(t.AVG), hero: true, note: t.H + ' 安打 / ' + t.AB + ' 打數' },
    { label: '上壘率', value: S.fmtRate3(t.OBP), note: '取自試算表' },
    { label: '長打率', value: S.fmtRate3(t.SLG), note: t.TB + ' 壘打數' },
    { label: 'OPS', value: S.fmtRate3(t.OPS), note: '純長打率 ' + S.fmtRate3(t.ISO) },
    { label: '安打', value: S.fmtInt(t.H), note: '二安 ' + t['2B'] + ' · 三安 ' + t['3B'] + ' · 全打 ' + t.HR },
    { label: '長打', value: S.fmtInt(t.XBH) },
    { label: '打點', value: S.fmtInt(t.RBI) },
    { label: '三振 / 四壞', value: t.K + ' / ' + t.BB }
  ] : [
    { label: '打擊率', value: S.fmtRate3(t.AVG), hero: true, note: t.H + ' 安打 / ' + t.AB + ' 打數' },
    { label: '上壘率', value: S.fmtRate3(t.OBP), note: '上壘 ' + t.TOB + ' 次' },
    { label: '長打率', value: S.fmtRate3(t.SLG), note: t.TB + ' 壘打數' },
    { label: 'OPS', value: S.fmtRate3(t.OPS), note: '純長打率 ' + S.fmtRate3(t.ISO) },
    { label: '安打', value: S.fmtInt(t.H), note: '二安 ' + t['2B'] + ' · 三安 ' + t['3B'] + ' · 全打 ' + t.HR },
    { label: '打點', value: S.fmtInt(t.RBI), note: '每場 ' + S.fmtNum2(t.RBIperG) },
    { label: '得分', value: S.fmtInt(t.R), note: '盜壘 ' + t.SB + ' 次' + (t.CS ? '（失敗 ' + t.CS + '）' : '') },
    { label: '三振率', value: S.fmtPct1(t.Kpct), note: t.K + ' 次三振' },
    { label: '四壞率', value: S.fmtPct1(t.BBpct), note: (t.BB + t.IBB) + ' 四壞 · ' + t.HBP + ' 觸身' },
    { label: '得點圈打擊率', value: S.fmtRate3(t.RISP_AVG), note: t.RISP_AB ? t.RISP_H + '/' + t.RISP_AB : '無標記資料' },
    { label: 'BABIP', value: S.fmtRate3(t.BABIP), note: '場內球安打率' }
  ]));

  /* -------------------------------------------------------------- 近況 */

  const form = row.recent;
  if (!totalsMode && form && form.games) {
    const f = form.stats;
    frag.appendChild(U.card(
      '近況（最近 ' + form.games + ' 場）',
      form.gameIds.map(gid => {
        const g = season.gameById.get(gid);
        return g ? (g.date ? g.date.slice(5) : g.id) : gid;
      }).join('、'),
      el('dl', { class: 'kv' }, [
        el('dt', { text: '打擊率 / 上壘率 / 長打率' }),
        el('dd', { text: S.fmtRate3(f.AVG) + ' / ' + S.fmtRate3(f.OBP) + ' / ' + S.fmtRate3(f.SLG) }),
        el('dt', { text: '打席 · 打數 · 安打' }),
        el('dd', { text: f.PA + ' · ' + f.AB + ' · ' + f.H }),
        el('dt', { text: '打點 · 得分 · 全壘打' }),
        el('dd', { text: f.RBI + ' · ' + f.R + ' · ' + f.HR }),
        el('dt', { text: '與球季累計相比' }),
        el('dd', {}, deltaText(f.AVG, t.AVG))
      ])
    ));
  }

  function deltaText(recentV, seasonV) {
    if (recentV === null || seasonV === null) return el('span', { class: 'muted', text: '—' });
    const d = recentV - seasonV;
    const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
    const color = d > 0 ? 'var(--delta-up)' : d < 0 ? 'var(--critical)' : 'var(--text-muted)';
    const label = d > 0 ? '（上升）' : d < 0 ? '（下降）' : '（持平）';
    return el('span', { style: 'color:' + color },
      '打擊率 ' + sign + S.fmtRate3(Math.abs(d)) + ' ' + label);
  }

  /* ---------------------------------------------- 走勢 + 打席結果分佈 */

  const prog = row.progression;
  const trend = totalsMode ? null : U.card('累計打擊率走勢', '滑過看單場成績', C.lineChart({
    points: prog.map(e => {
      const g = season.gameById.get(e.gameId);
      return {
        label: g && g.date ? g.date.slice(5) : e.gameId,
        value: e.cumulative.AVG,
        sub: (g ? 'vs ' + g.opponent + '　' : '') + '單場 ' + e.game.H + '安 / ' + e.game.AB + '打數'
      };
    }),
    format: S.fmtRate3,
    valueLabel: '累計打擊率',
    label: p.name + '的累計打擊率走勢',
    height: 220
  }));

  const groupName = code => {
    const g = S.OUTCOMES[code].group;
    return g === 'safe' ? '安打' : g === 'on' ? '上壘' : '出局・犧牲';
  };
  const counts = {};
  if (totalsMode) {
    ['1B', '2B', '3B', 'HR', 'BB', 'K'].forEach(code => { if (t[code]) counts[code] = t[code]; });
  } else {
    row.atbats.forEach(pa => { if (pa.code) counts[pa.code] = (counts[pa.code] || 0) + 1; });
  }
  const denom = totalsMode ? t.AB : t.PA;
  const distItems = Object.keys(counts).map(code => ({
    label: S.OUTCOMES[code].label,
    value: counts[code],
    group: groupName(code),
    sub: denom > 0 ? S.fmtPct1(counts[code] / denom) + (totalsMode ? ' 的打數' : ' 的打席') : ''
  })).sort((a, b) => b.value - a.value);

  const dist = U.card(
    totalsMode ? '安打組成與三振四壞' : '打席結果分佈',
    totalsMode ? t.AB + ' 個打數' : t.PA + ' 個打席',
    C.barChart({
    items: distItems,
    groups: ['安打', '上壘', '出局・犧牲'],
    format: S.fmtInt,
    valueLabel: '次數',
    label: p.name + (totalsMode ? '的安打組成' : '的打席結果分佈')
  }));

  frag.appendChild(totalsMode
    ? el('div', {}, dist)
    : el('div', { class: 'grid grid--2' }, [trend, dist]));

  /* ---------------------------------------------------------- 逐場成績 */

  if (!totalsMode) frag.appendChild(U.card('逐場成績', null, U.table({
    sticky: 1,
    columns: [
      { key: 'date', label: '日期', text: true, value: e => (season.gameById.get(e.gameId) || {}).date || e.gameId,
        render: e => el('a', { href: '#/game/' + encodeURIComponent(e.gameId) },
          (season.gameById.get(e.gameId) || {}).date || e.gameId) },
      { key: 'opp', label: '對手', text: true, value: e => (season.gameById.get(e.gameId) || {}).opponent || '' },
      { key: 'PA', label: '打席', value: e => e.game.PA },
      { key: 'AB', label: '打數', value: e => e.game.AB },
      { key: 'H', label: '安打', value: e => e.game.H },
      { key: 'HR', label: '全打', value: e => e.game.HR },
      { key: 'RBI', label: '打點', value: e => e.game.RBI },
      { key: 'R', label: '得分', value: e => e.game.R },
      { key: 'BB', label: '四壞', value: e => e.game.BB + e.game.IBB },
      { key: 'K', label: '三振', value: e => e.game.K },
      { key: 'AVG', label: '單場打擊率', value: e => e.game.AVG, format: 'rate3' },
      { key: 'cum', label: '累計打擊率', value: e => e.cumulative.AVG, format: 'rate3' },
      { key: 'pa', label: '逐打席', text: true, sortable: false, value: () => '',
        render: e => el('span', { class: 'pa-list' },
          row.atbats.filter(pa => pa.gameId === e.gameId)
            .sort((a, b) => a.inning - b.inning)
            .map(pa => U.paChip(pa.code, pa.rbi ? pa.rbi + '打點' : ''))) }
    ],
    rows: prog
  })));

  /* ------------------------------------------------------------ 名次 */

  const ranks = S.CATEGORIES.filter(c => !(totalsMode && c.needsAtbats)).map(cat => {
    const list = S.rank(season.rows, cat.key, { minPA: cat.qualified ? season.minPA : 0, qualifyKey: season.qualifyKey });
    const me = list.find(r => String(r.player.id) === String(p.id));
    if (!me) return null;
    return {
      label: cat.label, rank: me.rank, total: list.length,
      value: S.format(me.stats[cat.key], cat.format)
    };
  }).filter(Boolean);

  if (ranks.length) {
    frag.appendChild(U.card('隊內名次', '率值類項目以' + (totalsMode ? '規定打數 ' : '規定打席 ') + season.minPA + ' 為門檻', U.table({
      columns: [
        { key: 'label', label: '項目', text: true },
        { key: 'value', label: '成績', text: true, cls: 'col-text' },
        { key: 'rank', label: '名次', render: r => el('span', { class: r.rank <= 3 ? 'rank-cell--top' : '' }, '第 ' + r.rank + ' 名') },
        { key: 'total', label: '上榜人數' }
      ],
      rows: ranks,
      sort: { key: 'rank', dir: 'asc' }
    })));
  }

  return frag;
};
