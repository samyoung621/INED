/*
 * 共用 UI 元件：建立元素、可排序表格、數據磚、提示訊息。
 */
window.SBUi = (function () {
  const S = window.SBStats;

  /** el('div', {class:'x'}, [子元素或字串]) */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(k => {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return node;
    if (Array.isArray(children)) { children.forEach(c => append(node, c)); return node; }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ------------------------------------------------------------ 數據磚 */

  /** tiles([{label, value, note, hero}]) */
  function tiles(items) {
    return el('div', { class: 'tiles' }, items.filter(Boolean).map(t =>
      el('div', { class: 'tile' + (t.hero ? ' tile--hero' : '') }, [
        el('div', { class: 'tile__label', text: t.label }),
        el('div', { class: 'tile__value' }, t.value instanceof Node ? t.value : String(t.value)),
        t.note ? el('div', { class: 'tile__note', text: t.note }) : null
      ])
    ));
  }

  function card(title, note, body, headExtra) {
    const head = (title || note || headExtra)
      ? el('div', { class: 'card__head' }, [
          title ? el('h2', { class: 'card__title', text: title }) : null,
          headExtra || null,
          note ? el('p', { class: 'card__note', text: note }) : null
        ])
      : null;
    return el('section', { class: 'card' }, [head, body]);
  }

  /* --------------------------------------------------------- 可排序表格 */

  /**
   * table({ columns, rows, sort, footer, sticky, maxHeight })
   *   columns: [{ key, label, format, text, cls, sortable, render(row), value(row), title }]
   *   rows:    任意物件陣列；欄位取值預設用 col.value(row) 或 row[col.key]
   *   sort:    { key, dir:'asc'|'desc' } 初始排序
   *   sticky:  前幾欄橫向滾動時固定（0-2）
   */
  function table(opts) {
    const columns = opts.columns;
    const sticky = opts.sticky || 0;
    let sort = opts.sort ? Object.assign({}, opts.sort) : null;

    const wrap = el('div', { class: 'table-wrap' });
    if (opts.maxHeight) wrap.style.maxHeight = opts.maxHeight;
    const tbl = el('table', { class: 'stat' });
    const thead = el('thead');
    const tbody = el('tbody');
    const tfoot = opts.footer ? el('tfoot') : null;

    const valueOf = (row, col) => col.value ? col.value(row) : row[col.key];

    function stickyClass(i) {
      if (i === 0 && sticky >= 1) return ' sticky-1';
      if (i === 1 && sticky >= 2) return ' sticky-2';
      return '';
    }

    function renderHead() {
      clear(thead);
      const tr = el('tr');
      columns.forEach((col, i) => {
        const sortable = col.sortable !== false;
        const th = el('th', {
          class: (col.text ? 'col-text' : '') + stickyClass(i),
          title: col.title || col.label,
          scope: 'col',
          'data-nosort': sortable ? null : true,
          'aria-sort': sort && sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null
        }, col.label);
        if (sortable) {
          th.addEventListener('click', () => {
            const defaultDir = col.text ? 'asc' : 'desc';
            if (sort && sort.key === col.key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
            else sort = { key: col.key, dir: defaultDir };
            renderHead(); renderBody();
          });
          if (sort && sort.key === col.key) {
            th.appendChild(el('span', { class: 'sort-mark', text: sort.dir === 'asc' ? '▲' : '▼' }));
          }
        }
        tr.appendChild(th);
      });
      thead.appendChild(tr);
    }

    function sorted() {
      if (!sort) return opts.rows.slice();
      const col = columns.find(c => c.key === sort.key);
      if (!col) return opts.rows.slice();
      const dir = sort.dir === 'asc' ? 1 : -1;
      return opts.rows.slice().sort((a, b) => {
        const av = valueOf(a, col), bv = valueOf(b, col);
        const an = av === null || av === undefined || av === '' || Number.isNaN(av);
        const bn = bv === null || bv === undefined || bv === '' || Number.isNaN(bv);
        if (an && bn) return 0;
        if (an) return 1;        // 缺值一律排最後，不管升降
        if (bn) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv), 'zh-Hant') * dir;
      });
    }

    function renderBody() {
      clear(tbody);
      const rows = sorted();
      if (!rows.length) {
        tbody.appendChild(el('tr', null, el('td', { colspan: columns.length, class: 'empty' }, opts.emptyText || '沒有資料')));
        return;
      }
      rows.forEach(row => {
        const tr = el('tr');
        columns.forEach((col, i) => {
          const cls = (col.text ? 'col-text ' : '') + (col.cls || '') + stickyClass(i);
          const td = el('td', { class: cls.trim() || null });
          if (col.render) append(td, col.render(row));
          else td.textContent = S.format(valueOf(row, col), col.format || (col.text ? 'text' : 'int'));
          if (col.text) td.classList.add('col-text');
          tr.appendChild(td);
        });
        if (opts.onRowClick) {
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => opts.onRowClick(row));
        }
        tbody.appendChild(tr);
      });
    }

    function renderFoot() {
      if (!tfoot) return;
      clear(tfoot);
      const tr = el('tr');
      columns.forEach((col, i) => {
        const cls = (col.text ? 'col-text ' : '') + stickyClass(i);
        const td = el('td', { class: cls.trim() || null });
        append(td, opts.footer(col, i));
        tr.appendChild(td);
      });
      tfoot.appendChild(tr);
    }

    renderHead(); renderBody(); renderFoot();
    tbl.appendChild(thead); tbl.appendChild(tbody);
    if (tfoot) tbl.appendChild(tfoot);
    wrap.appendChild(tbl);
    return wrap;
  }

  /* -------------------------------------------------------------- 其他 */

  function banner(text, kind) {
    return el('div', { class: 'banner' + (kind ? ' banner--' + kind : '') },
      el('div', {}, text instanceof Node ? text : String(text)));
  }

  function empty(text) { return el('div', { class: 'empty', text: text }); }

  /** 分段切換按鈕 seg([{label,value}], current, onPick) */
  function seg(items, current, onPick) {
    const box = el('div', { class: 'seg' });
    items.forEach(it => {
      box.appendChild(el('button', {
        type: 'button',
        class: it.value === current ? 'is-on' : '',
        'aria-pressed': it.value === current ? 'true' : 'false',
        onclick: () => onPick(it.value)
      }, it.label));
    });
    return box;
  }

  /** 打席結果小徽章 */
  function paChip(code, extra) {
    const o = S.OUTCOMES[code];
    const group = o ? o.group : 'out';
    return el('span', {
      class: 'pa-chip pa-chip--' + group,
      title: o ? o.label : '無法辨識'
    }, (o ? o.short : '?') + (extra ? ' ' + extra : ''));
  }

  /** 勝敗徽章 */
  function resultBadge(result) {
    if (!result) return el('span', { class: 'badge', text: '未記錄' });
    const map = { W: ['勝', 'w'], L: ['敗', 'l'], T: ['和', ''] };
    const [label, kind] = map[result];
    return el('span', { class: 'badge' + (kind ? ' badge--' + kind : ''), text: label });
  }

  /** 把球員姓名做成連結；有照片就帶一個小頭像 */
  function playerLink(player, withPhoto) {
    const link = el('a', { href: '#/player/' + encodeURIComponent(player.id) });
    if (withPhoto && player.photo) {
      link.appendChild(el('img', {
        class: 'player-thumb', src: player.photo, alt: '', loading: 'lazy',
        onerror: e => { e.target.remove(); }
      }));
    }
    link.appendChild(document.createTextNode(player.name));
    return link;
  }

  function gameLabel(game) {
    return (game.date ? game.date.slice(5) + ' ' : '') + 'vs ' + game.opponent;
  }

  /** 下載文字檔 */
  function download(filename, text, mime) {
    const blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { el, append, clear, tiles, card, table, banner, empty, seg, paChip, resultBadge, playerLink, gameLabel, download };
})();
