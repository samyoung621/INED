/*
 * 極簡 CSV 解析器 —— 支援引號、引號內換行、逸出引號（"")
 * 不依賴外部套件，file:// 直接開也能用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SBCsv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /** 把 CSV 文字切成二維陣列。 */
  function parseRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    // 去掉 BOM，統一換行
    const s = String(text).replace(/^﻿/, '');

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') { inQuotes = true; continue; }
      if (c === ',') { row.push(field); field = ''; continue; }
      if (c === '\r') { continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /** 第一列當表頭，回傳物件陣列；全空白的列會被丟掉。 */
  function parse(text) {
    const rows = parseRows(text);
    if (!rows.length) return { headers: [], data: [] };
    const headers = rows[0].map(h => h.trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells.some(c => String(c).trim() !== '')) continue;
      const obj = {};
      headers.forEach((h, j) => { obj[h] = (cells[j] === undefined ? '' : String(cells[j]).trim()); });
      data.push(obj);
    }
    return { headers, data };
  }

  /** 物件陣列轉回 CSV（用於「匯出貼回 Sheet」）。 */
  function stringify(rows, headers) {
    if (!rows.length && !headers) return '';
    const cols = headers || Object.keys(rows[0]);
    const esc = v => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(',')]
      .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
      .join('\n');
  }

  return { parse, parseRows, stringify };
});
