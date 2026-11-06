const fs = require('fs');
const path = require('path');
// ===== BEGIN html-report (copied from empower-x/report/html-report.js — edit it there, then run: node tools/inline-report.mjs) =====
/*
 * Dependency-free HTML report helper for the Empower-X C2D algorithms.
 *
 * Builds one self-contained HTML page (inline CSS + inline SVG, no scripts, no
 * network, no npm) that a user can open after extracting outputs.tar.
 *
 * The algorithms are published as single files, so this helper is copied into
 * each of them between the "BEGIN html-report" / "END html-report" markers.
 * Edit it HERE, then run:  node tools/inline-report.mjs
 *
 * Plain function declarations only (no import/export), so the same text works
 * in both the ES-module and the CommonJS algorithms.
 */

const REPORT_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const REPORT_MAX_POINTS = 240; // longest series drawn as-is; longer ones are averaged into buckets

function reportEsc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function reportNum(value, decimals = 2) {
    const n = Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '–';
    return n.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

// Supply-point (CUPS) and similar ids are personal-ish data: show only both ends.
function reportMaskId(id) {
    const s = String(id === null || id === undefined ? '' : id);
    if (s.length <= 8) return s.length <= 2 ? s : s.slice(0, 2) + '…';
    return s.slice(0, 4) + '…' + s.slice(-4);
}

function reportNiceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) { max = min === 0 ? 1 : min + Math.abs(min) * 0.1; }
    const raw = (max - min) / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const start = Math.floor(min / step) * step;
    const ticks = [];
    // Always end on a tick at or above max, so nothing is drawn past the axis.
    for (let t = start; ; t += step) {
        ticks.push(Number(t.toPrecision(12)));
        if (t >= max - step * 1e-9 || ticks.length > 50) break;
    }
    return ticks;
}

// Average long series into at most `max` buckets so reports stay small and readable.
function reportDownsample(labels, seriesValues, max = REPORT_MAX_POINTS) {
    const n = labels.length;
    if (n <= max) return { labels, seriesValues };
    const size = Math.ceil(n / max);
    const outLabels = [];
    const outSeries = seriesValues.map(() => []);
    for (let i = 0; i < n; i += size) {
        outLabels.push(labels[i]);
        seriesValues.forEach((vals, s) => {
            const chunk = vals.slice(i, i + size).map(Number).filter(Number.isFinite);
            outSeries[s].push(chunk.length ? chunk.reduce((a, b) => a + b, 0) / chunk.length : null);
        });
    }
    return { labels: outLabels, seriesValues: outSeries, bucketSize: size };
}

function reportLegend(items) {
    return '<div class="legend">' + items.map((it, i) =>
        `<span><i style="background:${it.color || REPORT_COLORS[i % REPORT_COLORS.length]}"></i>${reportEsc(it.name)}</span>`
    ).join('') + '</div>';
}

function reportFigure(title, svg, { legend = '', note = '' } = {}) {
    return `<figure><figcaption>${reportEsc(title)}</figcaption>${svg}${legend}` +
        (note ? `<p class="note">${reportEsc(note)}</p>` : '') + '</figure>';
}

// ---- building blocks -------------------------------------------------------

function reportKpis(items) {
    return '<div class="kpis">' + items.map((k) =>
        `<div class="kpi"><div class="kpi-label">${reportEsc(k.label)}</div>` +
        `<div class="kpi-value">${reportEsc(k.value)}${k.unit ? `<span class="kpi-unit"> ${reportEsc(k.unit)}</span>` : ''}</div>` +
        (k.hint ? `<div class="kpi-hint">${reportEsc(k.hint)}</div>` : '') + '</div>'
    ).join('') + '</div>';
}

/**
 * Vertical bar chart. series: [{ name, values[], color? }], one value per category.
 * stacked: stack the series instead of grouping them side by side.
 */
function reportBarChart({ title, categories, series, unit = '', stacked = false, note = '' }) {
    const n = categories.length;
    const W = 760, L = 60, R = 16, T = 28, B = n > 8 ? 64 : 30, H = 246 + B;
    if (!n || !series.length) return reportFigure(title, '<p class="empty">No data</p>');
    const totals = categories.map((_, i) => stacked
        ? series.reduce((a, s) => a + Math.max(0, Number(s.values[i]) || 0), 0)
        : Math.max(...series.map((s) => Number(s.values[i]) || 0)));
    const mins = categories.map((_, i) => Math.min(0, ...series.map((s) => Number(s.values[i]) || 0)));
    const ticks = reportNiceTicks(Math.min(0, ...mins), Math.max(0, ...totals));
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const y = (v) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin || 1));
    const band = (W - L - R) / n;
    const groupW = band * 0.8;
    const barW = stacked ? groupW : groupW / series.length;
    const labelEvery = Math.max(1, Math.ceil(n / 24));
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${reportEsc(title)}">`;
    ticks.forEach((t) => {
        out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>` +
            `<text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${reportNum(t, 2)}</text>`;
    });
    categories.forEach((cat, i) => {
        const x0 = L + band * i + (band - groupW) / 2;
        let stackBase = 0;
        series.forEach((s, si) => {
            const v = Number(s.values[i]) || 0;
            const color = s.color || REPORT_COLORS[si % REPORT_COLORS.length];
            let top, bottom, x;
            if (stacked) { bottom = stackBase; top = stackBase + Math.max(0, v); stackBase = top; x = x0; }
            else { bottom = Math.min(0, v); top = Math.max(0, v); x = x0 + barW * si; }
            const h = Math.max(0, y(bottom) - y(top));
            out += `<rect x="${x.toFixed(1)}" y="${y(top).toFixed(1)}" width="${Math.max(1, barW - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}">` +
                `<title>${reportEsc(cat)} · ${reportEsc(s.name)}: ${reportNum(v)} ${reportEsc(unit)}</title></rect>`;
        });
        if (i % labelEvery === 0) {
            const lx = L + band * i + band / 2;
            out += `<text class="axis" transform="translate(${lx.toFixed(1)},${H - B + 14}) rotate(${n > 8 ? -35 : 0})" text-anchor="${n > 8 ? 'end' : 'middle'}">${reportEsc(String(cat).slice(0, 22))}</text>`;
        }
    });
    out += `<line class="baseline" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    if (unit) out += `<text class="axis" x="4" y="12" text-anchor="start">${reportEsc(unit)}</text>`;
    out += '</svg>';
    return reportFigure(title, out, { legend: series.length > 1 ? reportLegend(series) : '', note });
}

/** Horizontal bar ranking, e.g. per supply point. items: [{ label, value }] (already sorted). */
function reportHBarChart({ title, items, unit = '', color = REPORT_COLORS[0], note = '' }) {
    if (!items.length) return reportFigure(title, '<p class="empty">No data</p>');
    const rowH = 22, L = 150, R = 70, T = 6;
    const W = 760, H = T * 2 + rowH * items.length;
    const max = Math.max(0, ...items.map((it) => Number(it.value) || 0)) || 1;
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${reportEsc(title)}">`;
    items.forEach((it, i) => {
        const v = Math.max(0, Number(it.value) || 0);
        const w = (W - L - R) * (v / max);
        const yy = T + i * rowH;
        out += `<text class="axis" x="${L - 8}" y="${yy + 15}" text-anchor="end">${reportEsc(String(it.label).slice(0, 24))}</text>` +
            `<rect x="${L}" y="${yy + 4}" width="${w.toFixed(1)}" height="${rowH - 8}" fill="${it.color || color}"><title>${reportEsc(it.label)}: ${reportNum(v)} ${reportEsc(unit)}</title></rect>` +
            `<text class="axis" x="${(L + w + 6).toFixed(1)}" y="${yy + 15}">${reportNum(v)} ${reportEsc(unit)}</text>`;
    });
    out += '</svg>';
    return reportFigure(title, out, { note });
}

/** Line chart over ordered labels (timestamps). series: [{ name, values[], color?, area? }]. */
function reportLineChart({ title, labels, series, unit = '', note = '', yMinZero = true }) {
    const W = 760, H = 310, L = 60, R = 16, T = 28, B = 56;
    if (!labels.length || !series.length) return reportFigure(title, '<p class="empty">No data</p>');
    const ds = reportDownsample(labels, series.map((s) => s.values));
    const lbl = ds.labels, vals = ds.seriesValues;
    const all = vals.flat().filter((v) => v !== null && Number.isFinite(Number(v))).map(Number);
    const ticks = reportNiceTicks(yMinZero ? Math.min(0, ...all) : Math.min(...all), Math.max(...all, 0));
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const n = lbl.length;
    const x = (i) => L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1));
    const y = (v) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin || 1));
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${reportEsc(title)}">`;
    ticks.forEach((t) => {
        out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>` +
            `<text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${reportNum(t, 2)}</text>`;
    });
    vals.forEach((v, si) => {
        const color = series[si].color || REPORT_COLORS[si % REPORT_COLORS.length];
        const pts = v.map((val, i) => (val === null ? null : [x(i), y(Number(val))]));
        const d = pts.map((p, i) => (p ? `${i && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : '')).join('');
        if (series[si].area) {
            const first = pts.findIndex(Boolean), last = pts.length - 1 - [...pts].reverse().findIndex(Boolean);
            if (first >= 0) out += `<path d="${d}L${x(last).toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)}L${x(first).toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)}Z" fill="${color}" opacity="0.18"/>`;
        }
        out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`;
        if (n <= 60) pts.forEach((p, i) => {
            if (p) out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${color}"><title>${reportEsc(lbl[i])} · ${reportEsc(series[si].name)}: ${reportNum(v[i])} ${reportEsc(unit)}</title></circle>`;
        });
    });
    const maxLabels = Math.max(2, Math.floor((W - L - R) / 110));
    const every = Math.max(1, Math.ceil(n / maxLabels));
    const short = (l) => String(l).replace(/^\d{4}-/, '').replace('T', ' ').slice(0, 11);
    lbl.forEach((l, i) => {
        if (i % every === 0) out += `<text class="axis" x="${x(i).toFixed(1)}" y="${H - B + 18}" text-anchor="middle">${reportEsc(short(l))}</text>`;
    });
    if (unit) out += `<text class="axis" x="4" y="12" text-anchor="start">${reportEsc(unit)}</text>`;
    out += '</svg>';
    const extra = ds.bucketSize ? `Each point is the average of ${ds.bucketSize} values.` : '';
    return reportFigure(title, out, { legend: series.length > 1 ? reportLegend(series) : '', note: [note, extra].filter(Boolean).join(' ') });
}

/** Donut chart. slices: [{ label, value, color? }]. */
function reportDonut({ title, slices, unit = '', note = '' }) {
    const parts = slices.filter((s) => Number(s.value) > 0);
    const total = parts.reduce((a, s) => a + Number(s.value), 0);
    if (!total) return reportFigure(title, '<p class="empty">No data</p>');
    const W = 760, H = 240, cx = 130, cy = 120, r = 95, ir = 58;
    let a0 = -Math.PI / 2;
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${reportEsc(title)}">`;
    parts.forEach((s, i) => {
        const color = s.color || REPORT_COLORS[i % REPORT_COLORS.length];
        const frac = Number(s.value) / total;
        const a1 = a0 + frac * Math.PI * 2;
        const big = frac > 0.5 ? 1 : 0;
        const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
        const path = frac >= 0.9999
            ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0M${cx - ir},${cy}a${ir},${ir} 0 1,1 ${2 * ir},0a${ir},${ir} 0 1,1 ${-2 * ir},0Z`
            : `M${p(r, a0)}A${r},${r} 0 ${big} 1 ${p(r, a1)}L${p(ir, a1)}A${ir},${ir} 0 ${big} 0 ${p(ir, a0)}Z`;
        out += `<path d="${path}" fill="${color}" fill-rule="evenodd"><title>${reportEsc(s.label)}: ${reportNum(s.value)} ${reportEsc(unit)} (${reportNum(frac * 100, 1)}%)</title></path>`;
        const ly = 40 + i * 26;
        out += `<rect x="270" y="${ly - 11}" width="14" height="14" rx="3" fill="${color}"/>` +
            `<text class="label" x="292" y="${ly}">${reportEsc(s.label)} — ${reportNum(s.value)} ${reportEsc(unit)} (${reportNum(frac * 100, 1)}%)</text>`;
        a0 = a1;
    });
    out += `<text class="donut-total" x="${cx}" y="${cy + 5}" text-anchor="middle">${reportNum(total, total >= 100 ? 0 : 2)}</text>`;
    out += `<text class="axis" x="${cx}" y="${cy + 22}" text-anchor="middle">${reportEsc(unit)}</text></svg>`;
    return reportFigure(title, out, { note });
}

/** Heatmap. rows/cols: label arrays; values[r][c] (null = no data). */
function reportHeatmap({ title, rows, cols, values, unit = '', note = '' }) {
    if (!rows.length || !cols.length) return reportFigure(title, '<p class="empty">No data</p>');
    const L = 92, T = 22, cw = Math.max(8, Math.min(28, (760 - L - 10) / cols.length)), ch = 18;
    const W = L + cw * cols.length + 10, H = T + ch * rows.length + 8;
    const flat = values.flat().filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
    if (!flat.length) return reportFigure(title, '<p class="empty">No data</p>', { note });
    const min = Math.min(...flat, 0), max = Math.max(...flat, 0) || 1;
    const shade = (v) => {
        const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
        const a = [239, 246, 255], b = [29, 78, 216];
        return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
    };
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${reportEsc(title)}">`;
    const colEvery = Math.max(1, Math.ceil(cols.length / 24));
    cols.forEach((c, j) => {
        if (j % colEvery === 0) out += `<text class="axis" x="${(L + cw * j + cw / 2).toFixed(1)}" y="${T - 6}" text-anchor="middle">${reportEsc(c)}</text>`;
    });
    rows.forEach((rlabel, i) => {
        out += `<text class="axis" x="${L - 6}" y="${T + ch * i + 13}" text-anchor="end">${reportEsc(String(rlabel).slice(0, 14))}</text>`;
        cols.forEach((c, j) => {
            const v = values[i] ? values[i][j] : null;
            const ok = v !== null && v !== undefined && Number.isFinite(Number(v));
            out += `<rect x="${(L + cw * j).toFixed(1)}" y="${T + ch * i}" width="${(cw - 1).toFixed(1)}" height="${ch - 1}" fill="${ok ? shade(Number(v)) : 'none'}" class="${ok ? '' : 'nodata'}">` +
                `<title>${reportEsc(rlabel)} · ${reportEsc(c)}: ${ok ? reportNum(v) + ' ' + reportEsc(unit) : 'no data'}</title></rect>`;
        });
    });
    out += '</svg>';
    const scale = `<div class="legend"><span>${reportNum(min)} ${reportEsc(unit)}</span><span class="scale"></span><span>${reportNum(max)} ${reportEsc(unit)}</span></div>`;
    return reportFigure(title, out, { legend: scale, note });
}

/**
 * Horizontal range chart (one track per item): min–max whisker, optional low–high
 * box (e.g. p05–p95) and a marker (avg or median).
 * items: [{ label, min, max, low?, high?, mid?, midLabel? }]
 */
function reportRangeChart({ title, items, unit = '', note = '' }) {
    if (!items.length) return reportFigure(title, '<p class="empty">No data</p>');
    const L = 150, R = 20, rowH = 34, T = 26;
    const W = 760, H = T + rowH * items.length + 8;
    const all = items.flatMap((it) => [it.min, it.max, it.low, it.high, it.mid]).map(Number).filter(Number.isFinite);
    const ticks = reportNiceTicks(Math.min(0, ...all), Math.max(...all, 0));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const x = (v) => L + (W - L - R) * ((v - lo) / (hi - lo || 1));
    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${reportEsc(title)}">`;
    ticks.forEach((t) => {
        out += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${T - 6}" y2="${H - 6}"/>` +
            `<text class="axis" x="${x(t)}" y="${T - 10}" text-anchor="middle">${reportNum(t)}</text>`;
    });
    items.forEach((it, i) => {
        const cy = T + rowH * i + rowH / 2;
        const color = it.color || REPORT_COLORS[i % REPORT_COLORS.length];
        out += `<text class="axis" x="${L - 8}" y="${cy + 4}" text-anchor="end">${reportEsc(String(it.label).slice(0, 24))}</text>`;
        if (Number.isFinite(Number(it.min)) && Number.isFinite(Number(it.max))) {
            out += `<line x1="${x(it.min)}" x2="${x(it.max)}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="2"/>` +
                `<line x1="${x(it.min)}" x2="${x(it.min)}" y1="${cy - 7}" y2="${cy + 7}" stroke="${color}" stroke-width="2"/>` +
                `<line x1="${x(it.max)}" x2="${x(it.max)}" y1="${cy - 7}" y2="${cy + 7}" stroke="${color}" stroke-width="2"/>`;
        }
        if (Number.isFinite(Number(it.low)) && Number.isFinite(Number(it.high))) {
            out += `<rect x="${x(it.low)}" y="${cy - 8}" width="${Math.max(2, x(it.high) - x(it.low))}" height="16" rx="3" fill="${color}" opacity="0.3"/>`;
        }
        if (Number.isFinite(Number(it.mid))) {
            out += `<circle cx="${x(it.mid)}" cy="${cy}" r="5" fill="${color}"/>`;
        }
        const tip = ['min', 'low', 'mid', 'high', 'max'].filter((k) => Number.isFinite(Number(it[k])))
            .map((k) => `${k === 'mid' ? (it.midLabel || 'avg') : k === 'low' ? (it.lowLabel || 'low') : k === 'high' ? (it.highLabel || 'high') : k}: ${reportNum(it[k])}`).join(' · ');
        out += `<rect x="${L}" y="${cy - rowH / 2}" width="${W - L - R}" height="${rowH}" fill="transparent"><title>${reportEsc(it.label)} — ${reportEsc(tip)} ${reportEsc(unit)}</title></rect>`;
    });
    out += '</svg>';
    return reportFigure(title, out, { note });
}

/** Simple table. columns: [{ key, label, num? }]; rows: objects. Shows at most `limit` rows. */
function reportTable({ title, columns, rows, limit = 50, note = '' }) {
    if (!rows || !rows.length) return reportFigure(title, '<p class="empty">No data</p>', { note });
    const shown = rows.slice(0, limit);
    const head = '<tr>' + columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${reportEsc(c.label)}</th>`).join('') + '</tr>';
    const body = shown.map((r) => '<tr>' + columns.map((c) => {
        const v = r[c.key];
        return `<td${c.num ? ' class="num"' : ''}>${c.num ? reportNum(v) : reportEsc(v)}</td>`;
    }).join('') + '</tr>').join('');
    const more = rows.length > limit ? `Showing ${limit} of ${rows.length} rows; the full data is in the JSON file.` : '';
    return reportFigure(title, `<div class="table-wrap"><table>${head}${body}</table></div>`, { note: [note, more].filter(Boolean).join(' ') });
}

function reportSection(title, html, intro = '') {
    return `<section><h2>${reportEsc(title)}</h2>${intro ? `<p class="intro">${reportEsc(intro)}</p>` : ''}${html}</section>`;
}

/** Whole page. sections: HTML strings from reportSection(). */
function reportPage({ title, subtitle = '', sections = [], jsonFile = '', generatedAt = new Date() }) {
    const css = `
:root{--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0;--grid:#eef2f7}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#111a2e;--text:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--grid:#1a2438}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 16px 48px}header h1{margin:0 0 4px;font-size:24px}header p{margin:0;color:var(--muted)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 8px;margin-top:18px}
h2{margin:0 0 6px;font-size:18px}.intro{margin:0 0 12px;color:var(--muted)}
figure{margin:12px 0 16px}figcaption{font-weight:600;margin-bottom:6px}svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.baseline{stroke:var(--muted);stroke-width:1}
.axis{fill:var(--muted);font-size:11px}.label{fill:var(--text);font-size:13px}.donut-total{fill:var(--text);font-size:22px;font-weight:700}
.nodata{stroke:var(--line);stroke-dasharray:2 2}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:6px;font-size:13px;color:var(--muted);align-items:center}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.legend .scale{display:inline-block;width:140px;height:10px;border-radius:5px;background:linear-gradient(90deg,rgb(239,246,255),rgb(29,78,216))}
.note{font-size:12px;color:var(--muted);margin:6px 0 0}.empty{color:var(--muted);font-style:italic;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 14px}
.kpi{border:1px solid var(--line);border-radius:10px;padding:10px 12px}.kpi-label{font-size:12px;color:var(--muted)}
.kpi-value{font-size:22px;font-weight:700}.kpi-unit{font-size:13px;font-weight:400;color:var(--muted)}.kpi-hint{font-size:12px;color:var(--muted)}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
th{color:var(--muted);font-weight:600}.num{text-align:right;font-variant-numeric:tabular-nums}
footer{margin-top:24px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff}section{break-inside:avoid}}`;
    const when = generatedAt instanceof Date && !isNaN(generatedAt) ? generatedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${reportEsc(title)}</title><style>${css}</style></head><body><main>` +
        `<header><h1>${reportEsc(title)}</h1>${subtitle ? `<p>${reportEsc(subtitle)}</p>` : ''}</header>` +
        sections.join('') +
        `<footer>Generated ${reportEsc(when)} by an Empower-X Compute-to-Data algorithm.` +
        (jsonFile ? ` The full results are in <code>${reportEsc(jsonFile)}</code> next to this file.` : '') +
        ' Hover over a chart element to see its exact value.</footer></main></body></html>';
}

/** Write the report without ever failing the job: a rendering error is logged, the JSON stays. */
function reportWrite(fsModule, filePath, buildHtml) {
    try {
        fsModule.writeFileSync(filePath, buildHtml());
        console.log(`HTML report written: ${filePath}`);
    } catch (err) {
        console.error(`HTML report skipped (${err && err.message ? err.message : err})`);
    }
}
// ===== END html-report =====
// ---- HTML report (in-memory aggregation only; the JSON output is not touched) ----
const PV_COLORS = { ev: '#2563eb', solar: '#f59e0b', used: '#16a34a', grid: '#64748b', unused: '#fcd34d' };
const PV_ORIGIN_COLORS = { SOMMOBILITAT: '#2563eb', ETECNIC: '#7c3aed' };
const PV_EXTRA_COLORS = [['#0891b2', 'teal'], ['#db2777', 'pink'], ['#65a30d', 'green'], ['#dc2626', 'red'], ['#f59e0b', 'amber']];
const PV_COLOR_NAMES = { '#2563eb': 'blue', '#7c3aed': 'purple' };

function pvRound(n, d = 2) {
    return Number((Number(n) || 0).toFixed(d));
}

function renderReport(hours, jsonName) {
    const rows = Array.isArray(hours) ? hours : [];
    let evKwh = 0, solarKwh = 0, usedKwh = 0, gridKwh = 0, chargingHours = 0;
    const days = new Map();       // 'YYYY-MM-DD' -> totals + per-hour solar share
    const hourEv = Array(24).fill(0), hourSolar = Array(24).fill(0), hourCount = Array(24).fill(0);
    const chargers = new Map();   // id|origin -> totals
    const origins = new Map();

    rows.forEach((h) => {
        const s = h.summary || {};
        const ev = Number(s.totalConsumption) || 0, pv = Number(s.totalSolarProduction) || 0;
        const used = Number(s.usedSolarKwh) || 0, grid = Number(s.gridConsumptionKwh) || 0;
        evKwh += ev; solarKwh += pv; usedKwh += used; gridKwh += grid;
        if (ev > 0) chargingHours++;
        const dt = String(h.datetime || '');
        const day = dt.slice(0, 10) || 'unknown';
        const hr = Number(dt.slice(11, 13));
        if (!days.has(day)) days.set(day, { ev: 0, pv: 0, used: 0, grid: 0, share: Array(24).fill(null) });
        const d = days.get(day);
        d.ev += ev; d.pv += pv; d.used += used; d.grid += grid;
        if (dt.length >= 13 && Number.isInteger(hr) && hr >= 0 && hr < 24) {
            hourEv[hr] += ev; hourSolar[hr] += pv; hourCount[hr]++;
            if (ev > 0) d.share[hr] = Number(s.solarPercentage) || 0;
        }
        // Solar used in this hour is shared among the chargers in proportion to their energy (estimate).
        const list = Array.isArray(h.chargers) ? h.chargers : [];
        const raw = list.reduce((a, c) => a + (Number(c && c.consumptionKWh) || 0), 0);
        list.forEach((c) => {
            if (!c) return;
            const kwh = Number(c.consumptionKWh) || 0;
            const origin = String(c.origin || 'unknown');
            const key = `${c.id}|${origin}`;
            if (!chargers.has(key)) chargers.set(key, { id: String(c.id), origin, kwh: 0, solar: 0, hours: 0, cars: new Set() });
            const ch = chargers.get(key);
            ch.kwh += kwh;
            ch.solar += raw > 0 ? used * (kwh / raw) : 0;
            if (kwh > 0) ch.hours++;
            (Array.isArray(c.cars) ? c.cars : []).forEach((car) => ch.cars.add(String(car && car.id)));
            origins.set(origin, (origins.get(origin) || 0) + kwh);
        });
    });

    const sharePct = evKwh > 0 ? (usedKwh / evKwh) * 100 : 0;
    const solarUsePct = solarKwh > 0 ? (usedKwh / solarKwh) * 100 : 0;
    const unused = Math.max(0, solarKwh - usedKwh);
    const dayKeys = [...days.keys()].sort();
    const period = rows.length
        ? `${String(rows[0].datetime).slice(0, 10)} to ${String(rows[rows.length - 1].datetime).slice(0, 10)}`
        : 'no data';
    const shortDay = (k) => (/^\d{4}-\d{2}-\d{2}$/.test(k) ? k.slice(5) : k);
    const hourLabels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');

    const sections = [];
    sections.push(reportSection('Summary',
        // Two rows of three: the charging side, then the solar side.
        reportKpis([
            { label: 'EV charging', value: reportNum(evKwh, 0), unit: 'kWh', hint: `${reportNum(chargers.size, 0)} chargers, ${reportNum(chargingHours, 0)} hours with charging` },
            { label: 'Taken from the grid', value: reportNum(gridKwh, 0), unit: 'kWh', hint: 'Charging not covered by solar' },
            { label: 'Charging covered by solar', value: evKwh > 0 ? sharePct.toFixed(1) : '–', unit: '%', hint: 'Solar used ÷ EV charging' }
        ]) +
        reportKpis([
            { label: 'Solar surplus available', value: reportNum(solarKwh, 0), unit: 'kWh', hint: 'Local solar production offered to EVs' },
            { label: 'Solar used by EVs', value: reportNum(usedKwh, 0), unit: 'kWh', hint: 'Matched hour by hour' },
            { label: 'Solar surplus used', value: solarKwh > 0 ? solarUsePct.toFixed(1) : '–', unit: '%', hint: `${reportNum(unused, 0)} kWh left unused` }
        ]),
        `${rows.length ? `Period ${period} (${reportNum(rows.length, 0)} hours).` : 'No hourly data was found in the input.'} Each hour, EV charging is matched with the solar surplus produced in the same hour.`));

    sections.push(reportSection('Where the charging energy came from',
        reportDonut({
            title: 'EV charging by energy source',
            unit: 'kWh',
            slices: [
                { label: 'Local solar', value: pvRound(usedKwh), color: PV_COLORS.used },
                { label: 'Grid', value: pvRound(gridKwh), color: PV_COLORS.grid }
            ]
        }) +
        reportDonut({
            title: 'What happened to the solar surplus',
            unit: 'kWh',
            slices: [
                { label: 'Used to charge EVs', value: pvRound(usedKwh), color: PV_COLORS.used },
                { label: 'Not used (no charging need at that hour)', value: pvRound(unused), color: PV_COLORS.unused }
            ],
            note: 'Solar can only cover charging that happens in the same hour; surplus in hours with little charging stays unused.'
        }),
        'Share of all EV charging covered by local solar, and how much of the available solar surplus was actually used.'));

    sections.push(reportSection('Day by day',
        reportBarChart({
            title: 'Daily EV charging: solar vs grid',
            categories: evKwh > 0 ? dayKeys.map(shortDay) : [], // no charging at all: show "No data", not an empty axis
            series: [
                { name: 'Covered by solar', values: dayKeys.map((k) => pvRound(days.get(k).used)), color: PV_COLORS.used },
                { name: 'From the grid', values: dayKeys.map((k) => pvRound(days.get(k).grid)), color: PV_COLORS.grid }
            ],
            unit: 'kWh',
            stacked: true
        }) +
        reportLineChart({
            title: 'Daily solar surplus vs EV charging',
            labels: dayKeys,
            series: [
                { name: 'EV charging', values: dayKeys.map((k) => pvRound(days.get(k).ev)), color: PV_COLORS.ev },
                { name: 'Solar surplus', values: dayKeys.map((k) => pvRound(days.get(k).pv)), color: PV_COLORS.solar, area: true }
            ],
            unit: 'kWh per day'
        }),
        'Total energy per day. In the second chart, the gap between the two lines shows how far the solar surplus is from covering EV charging.'));

    sections.push(reportSection('Average day',
        reportBarChart({
            title: 'Average energy per hour of the day',
            categories: hourCount.some((c) => c > 0) ? hourLabels : [],
            series: [
                { name: 'EV charging', values: hourEv.map((v, i) => pvRound(hourCount[i] ? v / hourCount[i] : 0)), color: PV_COLORS.ev },
                { name: 'Solar surplus', values: hourSolar.map((v, i) => pvRound(hourCount[i] ? v / hourCount[i] : 0)), color: PV_COLORS.solar }
            ],
            unit: 'kWh per hour',
            note: 'Average over all days of the period, by the hour stated in the input data.'
        }),
        'When EVs charge and when solar surplus is available. Shifting charging into the solar hours raises the solar share.'));

    sections.push(reportSection('Solar share hour by hour',
        reportHeatmap({
            title: 'Share of charging covered by solar (%)',
            rows: chargingHours > 0 ? dayKeys : [], // every cell would be empty without charging
            cols: hourLabels.map((l) => l.slice(0, 2)),
            values: dayKeys.map((k) => days.get(k).share),
            unit: '%',
            note: 'Rows are days, columns are hours (00-23). Darker = more of the charging in that hour came from solar. Empty cells: no EV charging in that hour.'
        }),
        'Each cell is one hour: how much of the EV charging in that hour was covered by local solar.'));

    const ranked = [...chargers.values()].sort((a, b) => b.kwh - a.kwh);
    const originList = [...origins.entries()].sort((a, b) => b[1] - a[1]);
    // One colour per operator, shared by the donut and the bars (unknown operators get distinct colours).
    const originColor = new Map();
    let extra = 0;
    originList.forEach(([o]) => {
        if (PV_ORIGIN_COLORS[o]) originColor.set(o, [PV_ORIGIN_COLORS[o], PV_COLOR_NAMES[PV_ORIGIN_COLORS[o]]]);
        else { originColor.set(o, PV_EXTRA_COLORS[extra % PV_EXTRA_COLORS.length]); extra++; }
    });
    const topChargers = ranked.slice(0, 15);
    const barOrigins = [...new Set(topChargers.map((c) => c.origin))];
    sections.push(reportSection('Chargers',
        reportDonut({
            title: 'EV charging by operator',
            unit: 'kWh',
            slices: originList.map(([o, v]) => ({ label: o, value: pvRound(v), color: originColor.get(o)[0] })),
            note: 'Summed from the individual charger readings; may differ by a few hundredths of a kWh from the hourly totals, which are rounded per hour.'
        }) +
        reportHBarChart({
            title: ranked.length ? `Top ${Math.min(15, ranked.length)} chargers by energy charged` : 'Top chargers by energy charged',
            items: topChargers.map((c) => ({
                label: c.id,
                value: pvRound(c.kwh),
                color: originColor.get(c.origin)[0]
            })),
            unit: 'kWh',
            note: barOrigins.length ? 'Bar colour shows the operator: ' + barOrigins.map((o) => `${originColor.get(o)[1]} = ${o}`).join(', ') + '.' : ''
        }) +
        (!ranked.length ? '' : reportTable({
            title: 'Charger details',
            columns: [
                { key: 'id', label: 'Charger' },
                { key: 'origin', label: 'Operator' },
                { key: 'kwh', label: 'Charged (kWh)', num: true },
                { key: 'solar', label: 'From solar, est. (kWh)', num: true },
                { key: 'share', label: 'Solar share (%)', num: true },
                { key: 'hours', label: 'Hours charging', num: true },
                { key: 'cars', label: 'Cars', num: true }
            ],
            rows: ranked.map((c) => ({
                id: c.id,
                origin: c.origin,
                kwh: pvRound(c.kwh),
                solar: pvRound(c.solar),
                share: c.kwh > 0 ? pvRound((c.solar / c.kwh) * 100, 1) : 0,
                hours: c.hours,
                cars: c.cars.size || null
            })),
            limit: 25,
            note: 'Solar per charger is an estimate: the solar used in each hour is shared among the chargers active in that hour in proportion to their energy. "Cars" is the number of different cars seen at the charger (reported for SOMMOBILITAT only; car ids are not shown).'
        })),
        'Which public chargers delivered the most energy, and how much of it was matched with solar.'));

    return reportPage({
        title: 'PV-to-EV Energy Matcher',
        subtitle: `Hourly matching of electric-vehicle charging with local solar surplus · ${period}`,
        sections,
        jsonFile: jsonName
    });
}

const inputDir = process.env.INPUTS || "/data/inputs";
const outputDir = process.env.OUTPUTS || "/data/outputs";
const outputFile = path.join(outputDir, "solar-vs-chargers.json");

console.log("=== SCANNING INPUT DIRECTORY ===");

if (!fs.existsSync(inputDir)) {
    throw new Error("Input directory not found: " + inputDir);
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const files = fs.readdirSync(inputDir);
console.log("Files found:", files);

let somData = [];
let etecnicData = [];
let solarData = [];

for (const file of files) {
    // Пропускаем только сервисный файл
    if (file === "algoCustomData.json") continue;

    const fullPath = path.join(inputDir, file);
    
    // Пытаемся прочитать файл, даже если у него нет расширения .json
    let content;
    try {
        content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
        console.log(`Skipping file (not valid JSON): ${file}`);
        continue;
    }

    // Логика распределения по именам твоих файлов:
    if (file.includes('cars')) {
        somData = somData.concat(content);
    } else if (file.includes('chargers')) {
        etecnicData = etecnicData.concat(content);
    } else if (file.includes('surplus') || file.includes('solar')) {
        solarData = solarData.concat(content);
    }
}

const processReport = (som, etecnic, solar) => {
    const balanceMap = {};

    const processConsumption = (data) => {
        if (!Array.isArray(data)) return;
        data.forEach(item => {
            const dt = item.datetime;
            if (!balanceMap[dt]) {
                balanceMap[dt] = {
                    datetime: dt,
                    totalNetworkConsumptionKwh: 0,
                    solarProductionKwh: 0,
                    chargers: []
                };
            }
            if (item.chargers) {
                item.chargers.forEach(ch => {
                    balanceMap[dt].totalNetworkConsumptionKwh += Number(ch.consumptionKWh || 0);
                    balanceMap[dt].chargers.push(ch);
                });
            }
        });
    };

    processConsumption(som);
    processConsumption(etecnic);

    solar.forEach(s => {
        const dt = s.datetime;
        if (!balanceMap[dt]) {
            balanceMap[dt] = { datetime: dt, totalNetworkConsumptionKwh: 0, solarProductionKwh: 0, chargers: [] };
        }
        balanceMap[dt].solarProductionKwh = s.productionKwh || 0;
    });

    return Object.values(balanceMap).map(hour => {
        const consumption = hour.totalNetworkConsumptionKwh;
        const production = hour.solarProductionKwh;
        const usedSolar = Math.min(consumption, production);
        
        return {
            datetime: hour.datetime,
            summary: {
                totalConsumption: Number(consumption.toFixed(2)),
                totalSolarProduction: Number(production.toFixed(2)),
                usedSolarKwh: Number(usedSolar.toFixed(2)),
                gridConsumptionKwh: Number(Math.max(0, consumption - production).toFixed(2)),
                solarPercentage: consumption > 0 ? Math.round((usedSolar / consumption) * 100) : 0
            },
            chargers: hour.chargers
        };
    }).sort((a, b) => a.datetime.localeCompare(b.datetime));
};

const finalResult = processReport(somData, etecnicData, solarData);

fs.writeFileSync(outputFile, JSON.stringify(finalResult, null, 2));
reportWrite(fs, path.join(outputDir, "solar-vs-chargers.html"), () => renderReport(finalResult, "solar-vs-chargers.json"));
console.log(`=== DONE ===\nProcessed ${finalResult.length} hours. Results: ${outputFile}`);
