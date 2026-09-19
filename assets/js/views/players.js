/* 成績表：全隊逐項數據，可排序、可搜尋、可匯出。 */
window.SBViews = window.SBViews || {};
window.SBViews.players = function (season) {
  const U = window.SBUi, S = window.SBStats, el = U.el;
  const frag = document.createDocumentFragment();

  const state = { q: '', scope: 'active', minPA: 0 };

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: '全隊打擊成績' }),
    el('p', { text: '點欄位標題排序。合計列是全隊加總後再算的率值，不是各人平均值。' })
  ]));

  const controls = el('div', { class: 'controls' });
  controls.appendChild(el('input', {
    type: 'text', placeholder: '搜尋背號或姓名', 'aria-label': '搜尋球員',
    oninput: e => { state.q = e.target.value.trim().toLowerCase(); render(); }
  }));
  controls.appendChild(U.seg(
    [{ label: '在隊球員', value: 'active' }, { label: '全部', value: 'all' }],
    state.scope, v => { state.scope = v; render(); }
  ));
  controls.appendChild(U.seg(
    [{ label: '不限打席', value: 0 }, { label: '規定打席 ' + season.minPA + '+', value: season.minPA }],
    state.minPA, v => { state.minPA = v; render(); }
  ));
  const exportBtn = el('button', { class: 'btn btn--sm', type: 'button' }, '匯出 CSV');
  controls.appendChild(exportBtn);
  frag.appendChild(controls);

  const host = el('div');
  frag.appendChild(host);

  const COLUMNS = [
    { key: 'number', label: '背號', text: true, value: r => r.player.number || r.player.id },
    { key: 'name', label: '姓名', text: true, value: r => r.player.name, render: r => U.playerLink(r.player) },
    { key: 'position', label: '守位', text: true, value: r => r.player.position, sortable: false },
    { key: 'games', label: '出賽', value: r => r.stats.games },
    { key: 'PA', label: '打席', value: r => r.stats.PA, title: '打席 PA' },
    { key: 'AB', label: '打數', value: r => r.stats.AB, title: '打數 AB（不含四壞、觸身、犧牲打）' },
    { key: 'H', label: '安打', value: r => r.stats.H },
    { key: '1B', label: '一安', value: r => r.stats['1B'] },
    { key: '2B', label: '二安', value: r => r.stats['2B'] },
    { key: '3B', label: '三安', value: r => r.stats['3B'] },
    { key: 'HR', label: '全打', value: r => r.stats.HR },
    { key: 'TB', label: '壘打數', value: r => r.stats.TB },
    { key: 'RBI', label: '打點', value: r => r.stats.RBI },
    { key: 'R', label: '得分', value: r => r.stats.R },
    { key: 'BB', label: '四壞', value: r => r.stats.BB + r.stats.IBB },
    { key: 'HBP', label: '觸身', value: r => r.stats.HBP },
    { key: 'K', label: '三振', value: r => r.stats.K },
    { key: 'SB', label: '盜壘', value: r => r.stats.SB },
    { key: 'AVG', label: '打擊率', value: r => r.stats.AVG, format: 'rate3', title: '打擊率 = 安打 / 打數' },
    { key: 'OBP', label: '上壘率', value: r => r.stats.OBP, format: 'rate3', title: '上壘率 = (安打+四壞+觸身) / (打數+四壞+觸身+犧飛)' },
    { key: 'SLG', label: '長打率', value: r => r.stats.SLG, format: 'rate3', title: '長打率 = 壘打數 / 打數' },
    { key: 'OPS', label: 'OPS', value: r => r.stats.OPS, format: 'rate3', title: 'OPS = 上壘率 + 長打率' },
    { key: 'ISO', label: '純長打', value: r => r.stats.ISO, format: 'rate3', title: '純長打率 = 長打率 - 打擊率' },
    { key: 'Kpct', label: '三振率', value: r => r.stats.Kpct, format: 'pct1' },
    { key: 'BBpct', label: '四壞率', value: r => r.stats.BBpct, format: 'pct1' },
    { key: 'RISP_AVG', label: '得點圈', value: r => r.stats.RISP_AVG, format: 'rate3', title: '得點圈打擊率（需在 Sheet 標記得點圈欄）' }
  ];

  function filtered() {
    return season.rows.filter(r => {
      if (state.scope === 'active' && !r.player.active) return false;
      if (r.stats.PA < state.minPA) return false;
      if (state.q) {
        const hay = (r.player.name + ' ' + (r.player.number || '') + ' ' + r.player.position).toLowerCase();
        if (hay.indexOf(state.q) < 0) return false;
      }
      return true;
    });
  }

  function render() {
    const rows = filtered();
    // 合計列：把這些球員的打席合起來重算，率值才正確
    const union = rows.reduce((acc, r) => acc.concat(r.atbats), []);
    const totals = S.summarize(union);

    U.clear(host);
    host.appendChild(U.card(null, rows.length + ' 位球員 · ' + totals.PA + ' 個打席', U.table({
      sticky: 2,
      sort: { key: 'OPS', dir: 'desc' },
      columns: COLUMNS,
      rows: rows,
      emptyText: '沒有符合條件的球員',
      footer: (col, i) => {
        if (i === 0) return '合計';
        if (col.key === 'name' || col.key === 'position') return '';
        if (col.key === 'games') return S.fmtInt(season.record.played);
        if (col.key === 'BB') return S.fmtInt(totals.BB + totals.IBB);
        const v = totals[col.key];
        return v === undefined ? '' : S.format(v, col.format || 'int');
      },
      onRowClick: r => { location.hash = '#/player/' + encodeURIComponent(r.player.id); }
    })));
  }

  exportBtn.addEventListener('click', () => {
    const rows = filtered();
    const cols = COLUMNS.filter(c => c.key !== 'position').concat([{ key: 'position', label: '守位', value: r => r.player.position }]);
    const out = rows.map(r => {
      const o = {};
      cols.forEach(c => {
        const v = c.value(r);
        o[c.label] = typeof v === 'number' ? (c.format === 'rate3' ? (v === null ? '' : v.toFixed(3)) : v)
                   : (v === null || v === undefined ? '' : v);
      });
      return o;
    });
    U.download(season.cfg.teamName + '-打擊成績.csv', window.SBCsv.stringify(out, cols.map(c => c.label)));
  });

  render();
  return frag;
};
