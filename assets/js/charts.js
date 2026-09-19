/*
 * 圖表（原生 inline SVG，無外部函式庫）
 *
 * 規則：
 *  - 一張圖一個量尺，絕不雙 Y 軸。
 *  - 折線圖附十字準線 + tooltip；長條圖每根都可 hover。
 *  - 資料端 4px 圓角、線寬 2px、標記直徑 ≥8px、相鄰色塊留 2px 底色縫。
 *  - 顏色來自經 CVD 驗證的序列色票；淺色模式下對比不足的顏色一律配直接標籤。
 *  - 每張圖都有對應的表格檢視（由呼叫端提供），identity 不靠顏色單獨承載。
 */
window.SBCharts = (function () {
  const el = window.SBUi.el;
  const SVGNS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      const v = attrs[k];
      if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    });
    return node;
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /** 讓 Y 軸刻度落在好看的整數/小數上。 */
  function niceTicks(min, max, count) {
    if (!(max > min)) { max = min + 1; }
    const span = max - min;
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return ticks;
  }

  /** 只有資料端圓角的長條路徑。 */
  function barPath(x, y, w, h, r, dir) {
    const rr = Math.max(0, Math.min(r, dir === 'right' || dir === 'left' ? w : h, dir === 'up' || dir === 'down' ? h : w));
    if (rr <= 0.5) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    if (dir === 'right') {
      return `M${x} ${y}h${w - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - 2 * rr}a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(w - rr)}Z`;
    }
    // dir === 'up'：底部貼基線，頂端圓角
    return `M${x} ${y + h}v${-(h - rr)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - rr}Z`;
  }

  /* --------------------------------------------------- tooltip 圖層 */

  function makeTooltip(container) {
    const tip = el('div', { class: 'tooltip', role: 'status', 'aria-live': 'polite' });
    container.appendChild(tip);
    return {
      node: tip,
      show(html, x, y) {
        tip.innerHTML = html;
        tip.classList.add('is-on');
        const box = container.getBoundingClientRect();
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let left = x + 12, top = y - h - 10;
        if (left + w > box.width) left = x - w - 12;
        if (left < 0) left = 2;
        if (top < 0) top = y + 14;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
      },
      hide() { tip.classList.remove('is-on'); }
    };
  }

  /** 讓圖表在容器寬度改變 / 主題切換時重畫。 */
  function responsive(container, draw) {
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = container.clientWidth;
        if (w > 0) draw(w);
      });
    };
    run();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(run);
      ro.observe(container);
    } else {
      window.addEventListener('resize', run);
    }
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', run);
    }
    document.addEventListener('sb:themechange', run);
    return run;
  }

  /* ------------------------------------------------------------ 折線圖 */

  /**
   * lineChart({ points:[{label, value, sub}], format, height, yZero, label })
   * 單一序列：標題已經說明它是什麼，所以不放圖例。
   */
  function lineChart(opts) {
    const container = el('div', { class: 'chart' });
    const tip = makeTooltip(container);
    const points = (opts.points || []).filter(p => p.value !== null && p.value !== undefined && !Number.isNaN(p.value));
    const fmt = opts.format || (v => String(v));

    if (points.length === 0) {
      container.appendChild(el('div', { class: 'empty', text: '尚無資料' }));
      return container;
    }

    responsive(container, function draw(W) {
      const old = container.querySelector('svg');
      if (old) old.remove();

      const H = opts.height || 220;
      const m = { top: 14, right: Math.min(56, Math.max(28, W * 0.09)), bottom: 28, left: 40 };
      const iw = Math.max(20, W - m.left - m.right);
      const ih = H - m.top - m.bottom;

      const values = points.map(p => p.value);
      let lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
      if (opts.yZero) lo = Math.min(0, lo);
      if (lo === hi) { lo -= 0.05; hi += 0.05; }
      const ticks = niceTicks(lo, hi, 4);
      const yMin = ticks[0], yMax = ticks[ticks.length - 1];

      const n = points.length;
      const x = i => m.left + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
      const y = v => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

      const svg = svgEl('svg', {
        width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': opts.label || '折線圖'
      });
      const grid = cssVar('--grid', '#e1e0d9');
      const axis = cssVar('--axis', '#c3c2b7');
      const muted = cssVar('--text-muted', '#898781');
      const ink = cssVar('--text-primary', '#0b0b0b');
      const series = cssVar('--series-1', '#2a78d6');
      const surface = cssVar('--surface-1', '#fcfcfb');

      // 網格 + Y 軸刻度（淡化，不與資料爭視覺）
      ticks.forEach(t => {
        svg.appendChild(svgEl('line', {
          x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t),
          stroke: grid, 'stroke-width': 1, 'shape-rendering': 'crispEdges'
        }));
        const lbl = svgEl('text', {
          x: m.left - 7, y: y(t) + 4, 'text-anchor': 'end',
          fill: muted, 'font-size': 11
        });
        lbl.textContent = fmt(t);
        svg.appendChild(lbl);
      });

      // X 軸標籤（太擠時抽稀）
      const every = Math.max(1, Math.ceil(n / Math.floor(iw / 58)));
      points.forEach((p, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        const lbl = svgEl('text', {
          x: x(i), y: H - 9, 'text-anchor': 'middle', fill: muted, 'font-size': 11
        });
        lbl.textContent = p.label;
        svg.appendChild(lbl);
      });
      svg.appendChild(svgEl('line', {
        x1: m.left, x2: m.left + iw, y1: m.top + ih, y2: m.top + ih,
        stroke: axis, 'stroke-width': 1, 'shape-rendering': 'crispEdges'
      }));

      // 線
      svg.appendChild(svgEl('path', {
        d: points.map((p, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(p.value)).join(' '),
        fill: 'none', stroke: series, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));

      // 標記（直徑 8px，外圈 2px 底色與線分離）
      points.forEach((p, i) => {
        svg.appendChild(svgEl('circle', {
          cx: x(i), cy: y(p.value), r: 4,
          fill: series, stroke: surface, 'stroke-width': 2
        }));
      });

      // 只直接標註最後一點，不是每點都寫數字
      const last = points[n - 1];
      const endLabel = svgEl('text', {
        x: Math.min(W - 2, x(n - 1) + 9), y: y(last.value) + 4,
        fill: ink, 'font-size': 12, 'font-weight': 600
      });
      endLabel.textContent = fmt(last.value);
      svg.appendChild(endLabel);

      // 十字準線 + hover
      const cross = svgEl('line', {
        y1: m.top, y2: m.top + ih, stroke: axis, 'stroke-width': 1, opacity: 0
      });
      const focus = svgEl('circle', { r: 5.5, fill: series, stroke: surface, 'stroke-width': 2, opacity: 0 });
      svg.appendChild(cross); svg.appendChild(focus);

      const hit = svgEl('rect', { x: m.left, y: m.top, width: iw, height: ih, fill: 'transparent' });
      svg.appendChild(hit);

      function moveTo(clientX, clientY) {
        const box = svg.getBoundingClientRect();
        const px = clientX - box.left;
        let idx = n === 1 ? 0 : Math.round(((px - m.left) / iw) * (n - 1));
        idx = Math.max(0, Math.min(n - 1, idx));
        const p = points[idx];
        cross.setAttribute('x1', x(idx)); cross.setAttribute('x2', x(idx));
        cross.setAttribute('opacity', 1);
        focus.setAttribute('cx', x(idx)); focus.setAttribute('cy', y(p.value));
        focus.setAttribute('opacity', 1);
        tip.show(
          '<div>' + escapeHtml(p.label) + '</div>' +
          '<div><span class="tooltip__key">' + escapeHtml(opts.valueLabel || '數值') + '</span><b>' + fmt(p.value) + '</b></div>' +
          (p.sub ? '<div class="muted">' + escapeHtml(p.sub) + '</div>' : ''),
          x(idx), y(p.value)
        );
      }

      hit.addEventListener('mousemove', e => moveTo(e.clientX, e.clientY));
      hit.addEventListener('touchstart', e => { const t = e.touches[0]; moveTo(t.clientX, t.clientY); }, { passive: true });
      hit.addEventListener('touchmove', e => { const t = e.touches[0]; moveTo(t.clientX, t.clientY); }, { passive: true });
      const leave = () => { cross.setAttribute('opacity', 0); focus.setAttribute('opacity', 0); tip.hide(); };
      hit.addEventListener('mouseleave', leave);
      hit.addEventListener('touchend', leave);

      container.insertBefore(svg, tip.node);
    });

    return container;
  }

  /* ------------------------------------------------------------ 長條圖 */

  /**
   * barChart({ items:[{label, value, group, sub}], format, groups, valueLabel })
   * 橫向長條。單一量測 → 單色；若有 group 則用序列色並附圖例（identity 不只靠顏色，
   * 每根都有可見的直接標籤）。
   */
  function barChart(opts) {
    const container = el('div', { class: 'chart' });
    const tip = makeTooltip(container);
    const items = (opts.items || []).filter(it => it.value !== null && it.value !== undefined && !Number.isNaN(it.value));
    const fmt = opts.format || (v => String(v));
    const groups = opts.groups || null;

    if (!items.length) {
      container.appendChild(el('div', { class: 'empty', text: '尚無資料' }));
      return container;
    }

    responsive(container, function draw(W) {
      const old = container.querySelector('svg');
      if (old) old.remove();

      const rowH = opts.rowHeight || 24;
      const gap = 6;                              // > 2px 底色縫
      const m = { top: 4, right: 46, bottom: 4, left: Math.min(96, Math.max(48, W * 0.24)) };
      const H = m.top + m.bottom + items.length * rowH;
      const iw = Math.max(20, W - m.left - m.right);

      const maxV = Math.max.apply(null, items.map(it => Math.abs(it.value))) || 1;
      const scale = v => (Math.abs(v) / maxV) * iw;

      const svg = svgEl('svg', {
        width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': opts.label || '長條圖'
      });
      const muted = cssVar('--text-muted', '#898781');
      const ink = cssVar('--text-primary', '#0b0b0b');
      const axis = cssVar('--axis', '#c3c2b7');
      const single = cssVar('--seq-450', '#2a78d6');
      const palette = [cssVar('--series-1', '#2a78d6'), cssVar('--series-2', '#eb6834'), cssVar('--series-3', '#1baf7a')];
      const colorFor = it => {
        if (!groups) return single;
        const i = groups.indexOf(it.group);
        return palette[i < 0 ? 0 : i % palette.length];
      };

      items.forEach((it, i) => {
        const y = m.top + i * rowH;
        const bh = rowH - gap;
        const w = Math.max(2, scale(it.value));

        const name = svgEl('text', {
          x: m.left - 9, y: y + bh / 2 + 4, 'text-anchor': 'end',
          fill: muted, 'font-size': 11.5
        });
        name.textContent = it.label;
        svg.appendChild(name);

        const bar = svgEl('path', {
          d: barPath(m.left, y, w, bh, 4, 'right'),
          fill: colorFor(it)
        });
        bar.style.cursor = 'default';
        svg.appendChild(bar);

        // 直接標籤：淺色模式下部分序列色對比不足，數字一律看得見
        const val = svgEl('text', {
          x: m.left + w + 7, y: y + bh / 2 + 4,
          fill: ink, 'font-size': 11.5, 'font-weight': 600
        });
        val.textContent = fmt(it.value);
        svg.appendChild(val);

        // hover 命中區比長條本身大，好點
        const hit = svgEl('rect', { x: m.left, y: y, width: iw + m.right - 4, height: rowH, fill: 'transparent' });
        hit.addEventListener('mousemove', e => {
          const box = svg.getBoundingClientRect();
          tip.show(
            '<div>' + escapeHtml(it.label) + (it.group ? ' <span class="muted">' + escapeHtml(it.group) + '</span>' : '') + '</div>' +
            '<div><span class="tooltip__key">' + escapeHtml(opts.valueLabel || '數值') + '</span><b>' + fmt(it.value) + '</b></div>' +
            (it.sub ? '<div class="muted">' + escapeHtml(it.sub) + '</div>' : ''),
            e.clientX - box.left, y + bh / 2
          );
        });
        hit.addEventListener('mouseleave', () => tip.hide());
        svg.appendChild(hit);
      });

      svg.appendChild(svgEl('line', {
        x1: m.left, x2: m.left, y1: m.top, y2: H - m.bottom,
        stroke: axis, 'stroke-width': 1, 'shape-rendering': 'crispEdges'
      }));

      container.insertBefore(svg, tip.node);
    });

    if (groups && groups.length >= 2) {
      const legend = el('div', { class: 'chart__legend' });
      groups.forEach((g, i) => {
        const sw = el('span', { class: 'chart__swatch' });
        sw.style.background = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'][i % 3];
        legend.appendChild(el('span', {}, [sw, g]));
      });
      container.appendChild(legend);
    }

    return container;
  }

  /** 排行榜用的迷你橫條列（純 HTML，省得每張小圖都開一個 SVG）。 */
  function leaderBars(entries, format) {
    const max = Math.max.apply(null, entries.map(e => Math.abs(e.value))) || 1;
    return el('div', { class: 'leader-card' }, entries.map(e => {
      const bar = el('i');
      bar.style.width = Math.max(2, (Math.abs(e.value) / max) * 100) + '%';
      return el('div', { class: 'leader-row' }, [
        el('span', { class: 'leader-row__rank', text: e.rank }),
        el('span', { class: 'leader-row__name' }, e.link || e.name),
        el('span', { class: 'leader-row__val', text: format(e.value) }),
        el('span', { class: 'leader-row__bar' }, bar)
      ]);
    }));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { lineChart, barChart, leaderBars, niceTicks, barPath };
})();
