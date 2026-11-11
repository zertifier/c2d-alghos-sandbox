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

/* ---------------------------------------------------------------------------
 * AI context file (AI_CONTEXT.md)
 *
 * A plain Markdown description of the job's outputs, written for an AI
 * assistant (or a person) that is handed the extracted outputs folder and asked
 * questions about it. Every algorithm uses the same section order:
 *   1 What this algorithm does · 2 This run · 3 Output files · 4 Fields and units
 *   5 Method and definitions · 6 Key results · 7 Data quality and limitations
 *   8 How to answer common questions · 9 Glossary
 * plus a machine-readable "facts" JSON block at the end.
 * ------------------------------------------------------------------------- */

const CONTEXT_FILE = 'AI_CONTEXT.md';

function mdText(value) {
    // Single-line, Markdown-safe text (no HTML interpretation, no table breaks).
    return String(value === null || value === undefined ? '' : value)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
        .replace(/\|/g, '\|')
        .trim();
}

function mdTable(columns, rows) {
    // columns: [{ key, label }] ; rows: objects. Values pass through mdText.
    if (!rows || !rows.length) return '_None._\n';
    const head = '| ' + columns.map((c) => mdText(c.label)).join(' | ') + ' |';
    const sep = '| ' + columns.map(() => '---').join(' | ') + ' |';
    const body = rows.map((r) => '| ' + columns.map((c) => mdText(r[c.key])).join(' | ') + ' |');
    return [head, sep, ...body].join('\n') + '\n';
}

function mdList(items) {
    if (!items || !items.length) return '_None._\n';
    return items.map((it) => '- ' + mdText(it)).join('\n') + '\n';
}

/**
 * Builds AI_CONTEXT.md.
 *   title       algorithm name (as on the marketplace)
 *   summary     2-4 sentences: what it does and for whom
 *   run         [{ label, value }]  inputs found, record counts, period, parameters used, generated at
 *   files       [{ file, format, contents }]
 *   fields      [{ file, field, type, unit, meaning }]  every field/column of every output file
 *   method      [string]  how each figure is computed (formulas in words)
 *   results     [{ label, value, unit }]  this run's headline numbers
 *   limitations [string]  assumptions, data-quality notes, warnings seen in this run
 *   questions   [{ question, answer }]  where to look / how to compute common answers
 *   glossary    [{ term, meaning }]
 *   facts       plain object; serialised as a JSON block for machine reading
 */
function contextDoc({ title, summary = '', run = [], files = [], fields = [], method = [], results = [], limitations = [], questions = [], glossary = [], facts = {} }) {
    const out = [];
    out.push(`# AI context: ${mdText(title)}`);
    out.push('');
    out.push('> This file explains the outputs of one Compute-to-Data job of the Empower-X data space, ' +
        'so that an AI assistant (or a person) can answer questions about them. ' +
        'All numbers below come from this run. Where the data contains identifiers of supply points (CUPS), cars or people, they are shortened here for privacy.');
    out.push('');
    out.push('## 1. What this algorithm does'); out.push(''); out.push(mdText(summary)); out.push('');
    out.push('## 2. This run'); out.push(''); out.push(mdTable([{ key: 'label', label: 'Item' }, { key: 'value', label: 'Value' }], run));
    out.push('## 3. Output files'); out.push(''); out.push(mdTable([{ key: 'file', label: 'File' }, { key: 'format', label: 'Format' }, { key: 'contents', label: 'Contents' }],
        files.concat([{ file: CONTEXT_FILE, format: 'Markdown', contents: 'This description.' }])));
    out.push('## 4. Fields and units'); out.push('');
    out.push(mdTable([{ key: 'file', label: 'File' }, { key: 'field', label: 'Field / column' }, { key: 'type', label: 'Type' }, { key: 'unit', label: 'Unit' }, { key: 'meaning', label: 'Meaning' }], fields));
    out.push('## 5. Method and definitions'); out.push(''); out.push(mdList(method));
    out.push('## 6. Key results'); out.push('');
    out.push(mdTable([{ key: 'label', label: 'Result' }, { key: 'value', label: 'Value' }, { key: 'unit', label: 'Unit' }], results));
    out.push('## 7. Data quality and limitations'); out.push(''); out.push(mdList(limitations));
    out.push('## 8. How to answer common questions'); out.push('');
    out.push(questions.length ? questions.map((q) => `**${mdText(q.question)}**  \n${mdText(q.answer)}\n`).join('\n') : '_None._\n');
    out.push('## 9. Glossary'); out.push(''); out.push(mdTable([{ key: 'term', label: 'Term' }, { key: 'meaning', label: 'Meaning' }], glossary));
    out.push('## 10. Facts (machine-readable)'); out.push('');
    out.push('```json'); out.push(JSON.stringify(facts, null, 2)); out.push('```'); out.push('');
    return out.join('\n');
}

/** Write AI_CONTEXT.md without ever failing the job. */
function contextWrite(fsModule, filePath, buildMd) {
    try {
        fsModule.writeFileSync(filePath, buildMd());
        console.log(`AI context written: ${filePath}`);
    } catch (err) {
        console.error(`AI context skipped (${err && err.message ? err.message : err})`);
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

// ---- AI_CONTEXT.md (explains this run's outputs to an AI assistant; never changes the other outputs) ----
function buildContext(hours, { inputLog = [], inputDir: inDir = '', som = [], etecnic = [], solar = [] } = {}) {
    const rows = Array.isArray(hours) ? hours : [];
    const r2 = (n) => pvRound(n, 2);
    const hh = (h) => String(h).padStart(2, '0') + ':00';
    const isNight = (hr) => hr < 6 || hr >= 21;
    const arr = (x) => (Array.isArray(x) ? x : []);

    // Totals exactly as in the HTML report: sums of the per-hour (rounded) summary values.
    let evKwh = 0, solarKwh = 0, usedKwh = 0, gridKwh = 0;
    let chargingHours = 0, solarHours = 0, solarNoChargeHours = 0, fullCoverHours = 0, solarNoChargeKwh = 0;
    const days = new Map();
    const hourEv = Array(24).fill(0), hourPv = Array(24).fill(0), hourCnt = Array(24).fill(0);
    const chargers = new Map();
    const origins = new Map();
    const carIds = new Set();
    const chargerFieldSet = new Set(), carFieldSet = new Set();
    let readings = 0, rawReadingKwh = 0, maxHour = null, maxPvHour = null, carMismatch = 0;
    rows.forEach((h) => {
        const s = h.summary || {};
        const ev = Number(s.totalConsumption) || 0, pv = Number(s.totalSolarProduction) || 0;
        const used = Number(s.usedSolarKwh) || 0, grid = Number(s.gridConsumptionKwh) || 0;
        evKwh += ev; solarKwh += pv; usedKwh += used; gridKwh += grid;
        if (ev > 0) chargingHours++;
        if (pv > 0) solarHours++;
        if (pv > 0 && ev === 0) { solarNoChargeHours++; solarNoChargeKwh += pv; }
        if (ev > 0 && pv >= ev) fullCoverHours++;
        if (!maxHour || ev > maxHour.ev) maxHour = { dt: h.datetime, ev };
        if (!maxPvHour || pv > maxPvHour.pv) maxPvHour = { dt: h.datetime, pv };
        const dt = String(h.datetime || '');
        const day = dt.slice(0, 10) || 'unknown';
        const hr = Number(dt.slice(11, 13));
        if (!days.has(day)) days.set(day, { ev: 0, pv: 0, used: 0, grid: 0 });
        const d = days.get(day);
        d.ev += ev; d.pv += pv; d.used += used; d.grid += grid;
        if (dt.length >= 13 && Number.isInteger(hr) && hr >= 0 && hr < 24) { hourEv[hr] += ev; hourPv[hr] += pv; hourCnt[hr]++; }
        const list = arr(h.chargers);
        const raw = list.reduce((a, c) => a + (Number(c && c.consumptionKWh) || 0), 0);
        list.forEach((c) => {
            if (!c || typeof c !== 'object') return;
            readings++;
            Object.keys(c).forEach((k) => chargerFieldSet.add(k));
            const kwh = Number(c.consumptionKWh) || 0;
            rawReadingKwh += kwh;
            const origin = String(c.origin || 'unknown');
            const key = `${c.id}|${origin}`;
            if (!chargers.has(key)) chargers.set(key, { id: String(c.id), origin, kwh: 0, solar: 0, hours: 0, cars: new Set() });
            const ch = chargers.get(key);
            ch.kwh += kwh;
            ch.solar += raw > 0 ? used * (kwh / raw) : 0;
            if (kwh > 0) ch.hours++;
            const cars = arr(c.cars);
            cars.forEach((car) => {
                if (car && typeof car === 'object') Object.keys(car).forEach((k) => carFieldSet.add(k));
                ch.cars.add(String(car && car.id)); carIds.add(String(car && car.id));
            });
            if (cars.length) {
                const sum = cars.reduce((a, k) => a + (Number(k && k.consumption) || 0), 0);
                if (Math.abs(sum - kwh) > 0.001) carMismatch++;
            }
            if (!origins.has(origin)) origins.set(origin, { kwh: 0, chargers: new Set() });
            origins.get(origin).kwh += kwh; origins.get(origin).chargers.add(String(c.id));
        });
    });
    const unused = Math.max(0, solarKwh - usedKwh);
    const sharePct = evKwh > 0 ? pvRound((usedKwh / evKwh) * 100, 1) : null;
    const solarUsePct = solarKwh > 0 ? pvRound((usedKwh / solarKwh) * 100, 1) : null;
    const first = rows.length ? String(rows[0].datetime) : null;
    const last = rows.length ? String(rows[rows.length - 1].datetime) : null;
    const dayKeys = [...days.keys()].sort();
    const daily = dayKeys.map((k) => {
        const d = days.get(k);
        return { date: k, evKwh: r2(d.ev), solarKwh: r2(d.pv), usedSolarKwh: r2(d.used), gridKwh: r2(d.grid), solarSharePct: d.ev > 0 ? pvRound((d.used / d.ev) * 100, 1) : null };
    });
    const withEv = daily.filter((d) => d.evKwh > 0);
    const pick = (list, better) => (list.length ? list.reduce((a, b) => (better(b, a) ? b : a)) : null);
    const bestDay = pick(withEv, (b, a) => b.solarSharePct > a.solarSharePct);
    const worstDay = pick(withEv, (b, a) => b.solarSharePct < a.solarSharePct);
    const busiestDay = pick(withEv, (b, a) => b.evKwh > a.evKwh);
    const hourly = hourEv.map((v, i) => ({ hour: i, avgEvKwh: r2(hourCnt[i] ? v / hourCnt[i] : 0), avgSolarKwh: r2(hourCnt[i] ? hourPv[i] / hourCnt[i] : 0), hoursInData: hourCnt[i] }));
    const peakEvHour = pick(hourly, (b, a) => b.avgEvKwh > a.avgEvKwh);
    const peakPvHour = pick(hourly, (b, a) => b.avgSolarKwh > a.avgSolarKwh);
    const ranked = [...chargers.values()].sort((a, b) => b.kwh - a.kwh);
    const originList = [...origins.entries()].sort((a, b) => b[1].kwh - a[1].kwh)
        .map(([o, v]) => ({ origin: o, kwh: r2(v.kwh), chargers: v.chargers.size }));
    const carsByOrigin = new Map();
    ranked.forEach((c) => c.cars.forEach((id) => { if (!carsByOrigin.has(c.origin)) carsByOrigin.set(c.origin, new Set()); carsByOrigin.get(c.origin).add(id); }));

    // Input-side checks (the raw records the algorithm read).
    const solarRecs = arr(solar).filter((s) => s && typeof s === 'object');
    const solarTimes = new Map();
    solarRecs.forEach((s) => solarTimes.set(s.datetime, (solarTimes.get(s.datetime) || 0) + 1));
    const solarDup = [...solarTimes.values()].filter((n) => n > 1).length;
    const timeCounts = (list) => {
        const m = new Map();
        arr(list).forEach((x) => { if (x && x.datetime) m.set(x.datetime, (m.get(x.datetime) || 0) + 1); });
        return m;
    };
    const somTimes = timeCounts(som), etTimes = timeCounts(etecnic);
    const consDup = [...somTimes.values(), ...etTimes.values()].filter((n) => n > 1).length; // within one source
    const bothSources = [...somTimes.keys()].filter((t) => etTimes.has(t)).length;           // normal: merged
    const consTimes = new Map([...somTimes, ...etTimes]);
    const hoursNoSolarRec = rows.filter((h) => !solarTimes.has(h.datetime)).map((h) => String(h.datetime));
    const hoursNoChargeRec = rows.filter((h) => !consTimes.has(h.datetime)).map((h) => String(h.datetime));
    const nightSolar = solarRecs.filter((s) => { const hr = Number(String(s.datetime || '').slice(11, 13)); return Number(s.productionKwh) > 0 && Number.isInteger(hr) && isNight(hr); });
    const nightSolarKwh = nightSolar.reduce((a, s) => a + Number(s.productionKwh), 0);
    // Same night window, measured on the output (sum of the rounded hourly totalSolarProduction, the basis of all period totals).
    const nightOut = rows.filter((h) => { const hr = Number(String(h.datetime || '').slice(11, 13)); return Number(h.summary && h.summary.totalSolarProduction) > 0 && Number.isInteger(hr) && isNight(hr); });
    const nightOutKwh = nightOut.reduce((a, h) => a + Number(h.summary.totalSolarProduction), 0);
    // How coarse the surplus values are: share of positive values that are whole kWh.
    const posSolar = solarRecs.filter((s) => Number(s.productionKwh) > 0);
    const wholeSolar = posSolar.filter((s) => Number.isInteger(Number(s.productionKwh))).length;
    const wholeSolarPct = posSolar.length ? pvRound((wholeSolar / posSolar.length) * 100, 1) : null;
    // EU clock-change days (last Sunday of March / October): link missing hours to daylight saving time.
    const lastSunday = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
    const dstDay = (t) => { const y = Number(String(t).slice(0, 4)); const day = String(t).slice(0, 10); if (!Number.isInteger(y)) return null; if (day === lastSunday(y, 2)) return 'spring-forward'; if (day === lastSunday(y, 9)) return 'fall-back'; return null; };
    const dstDaysInPeriod = [...new Set(rows.map((h) => String(h.datetime).slice(0, 10)).filter((d) => dstDay(d)))];
    const dstMissing = (list) => list.filter((t) => dstDay(t));
    const nonNumericSolar =solarRecs.filter((s) => s.productionKwh !== undefined && s.productionKwh !== null && typeof s.productionKwh !== 'number').length;
    const negSolar = solarRecs.filter((s) => Number(s.productionKwh) < 0).length;
    // Hourly steps between the first and last timestamp (read as-is, no time zone) that are absent from all inputs.
    let expectedHours = null;
    const gapHours = [];
    const toMs = (t) => Date.parse(String(t).replace(' ', 'T') + 'Z');
    if (first && last && Number.isFinite(toMs(first)) && Number.isFinite(toMs(last))) {
        expectedHours = Math.round((toMs(last) - toMs(first)) / 3600000) + 1;
        const have = new Set(rows.map((h) => toMs(h.datetime)));
        for (let t = toMs(first); t <= toMs(last) && gapHours.length < 1000; t += 3600000) {
            if (!have.has(t)) gapHours.push(new Date(t).toISOString().replace('T', ' ').slice(0, 19));
        }
    }
    const listSample = (a, n = 5) => (a.length ? a.slice(0, n).join(', ') + (a.length > n ? ` … (${a.length} in total)` : '') : 'none');

    // algoCustomData.json is only read here to report it; the algorithm itself ignores it.
    let customNote = 'not provided (this algorithm has no parameters)';
    try {
        const p = path.join(inDir, 'algoCustomData.json');
        if (inDir && fs.existsSync(p)) {
            let keys = [];
            try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); keys = j && typeof j === 'object' ? Object.keys(j) : []; } catch (e) { keys = ['(not valid JSON)']; }
            customNote = keys.length ? `provided with keys ${keys.join(', ')}; ignored (this algorithm has no parameters)` : 'provided but empty; ignored (this algorithm has no parameters)';
        }
    } catch (e) { customNote = 'could not be read; ignored (this algorithm has no parameters)'; }

    const generatedAt = new Date().toISOString();
    const somRecs = arr(som).length, etRecs = arr(etecnic).length;
    const run = [
        ...(inputLog.length
            ? inputLog.map((l) => ({ label: `Input file ${l.file}`, value: l.use + (l.records !== undefined ? `; ${l.records} hourly records` : '') }))
            : [{ label: 'Input files', value: 'none found' }]),
        { label: 'EV charging records read', value: `${somRecs + etRecs} hourly records (${somRecs} from "cars" files, ${etRecs} from "chargers" files) with ${readings} individual charger readings. Records are counted per file: the files cover ${consTimes.size} distinct timestamps, ${bothSources} of which appear in both sources and are merged into one output hour. ${chargingHours} output hours have charging above 0 kWh.` },
        { label: 'Solar surplus records read', value: `${solarRecs.length} hourly records` },
        { label: 'Period covered', value: first ? `${first} to ${last} (timestamps as given in the input; no time zone stated)` : 'no data' },
        { label: 'Hours in output', value: `${rows.length} (union of all timestamps in the inputs)` + (expectedHours !== null ? `; ${expectedHours} hourly steps from first to last timestamp, ${gapHours.length} of them absent` : '') },
        { label: 'Days', value: String(dayKeys.length) },
        { label: 'Chargers', value: `${chargers.size}` + (originList.length ? ` (${originList.map((o) => `${o.origin}: ${o.chargers}`).join(', ')})` : '') },
        { label: 'Distinct cars', value: `${carIds.size}` + (carsByOrigin.size ? ` (${[...carsByOrigin.entries()].map(([o, s]) => `${o}: ${s.size}`).join(', ')}; only car-sharing records list cars)` : '') },
        { label: 'Parameters (algoCustomData.json)', value: customNote },
        { label: 'Fixed settings (built in)', value: 'matching interval = 1 hour (per identical timestamp); hourly kWh values rounded to 2 decimals; solarPercentage rounded to a whole number' },
        { label: 'Algorithm version', value: 'not versioned (single-file algorithm pv_to_ev_matcher.js)' },
        { label: 'Generated at (UTC)', value: generatedAt }
    ];

    const J = 'solar-vs-chargers.json', H = 'solar-vs-chargers.html';
    const files = [
        { file: J, format: 'JSON (array, pretty-printed)', contents: `One object per hour (${rows.length} hours), sorted by datetime: the hourly energy balance (summary) plus every raw charger reading of that hour (chargers). Holds the full charger ids and full pseudonymous car ids.` },
        { file: H, format: 'HTML (self-contained; open in a browser)', contents: 'Visual report: summary KPIs; donuts (charging by source, use of the surplus, charging by operator); daily stacked bars and lines; average day by hour; day-by-hour heatmap of the solar share; top 15 chargers; charger table (max 25 rows). Charger ids are shown, car ids are not.' }
    ];

    const extraChargerFields = [...chargerFieldSet].filter((k) => !['id', 'origin', 'consumptionKWh', 'cars'].includes(k));
    const extraCarFields = [...carFieldSet].filter((k) => !['id', 'consumption'].includes(k));
    const fields = [
        { file: J, field: '[] (top level)', type: 'array of objects', unit: '', meaning: 'One element per timestamp found in any input file, sorted ascending by the datetime text.' },
        { file: J, field: '[].datetime', type: 'string "YYYY-MM-DD HH:MM:SS"', unit: 'as in input', meaning: 'Start of the hour, copied unchanged from the inputs (no time-zone conversion).' },
        { file: J, field: '[].summary', type: 'object', unit: '', meaning: 'Energy balance of this hour.' },
        { file: J, field: '[].summary.totalConsumption', type: 'number (2 decimals)', unit: 'kWh', meaning: 'Total EV charging in the hour = sum of chargers[].consumptionKWh.' },
        { file: J, field: '[].summary.totalSolarProduction', type: 'number (2 decimals)', unit: 'kWh', meaning: 'Solar surplus available in the hour (productionKwh of the surplus input; 0 if the hour is missing there).' },
        { file: J, field: '[].summary.usedSolarKwh', type: 'number (2 decimals)', unit: 'kWh', meaning: 'Solar used by EVs = min(totalConsumption, totalSolarProduction).' },
        { file: J, field: '[].summary.gridConsumptionKwh', type: 'number (2 decimals)', unit: 'kWh', meaning: 'Charging not covered by solar = max(0, totalConsumption - totalSolarProduction).' },
        { file: J, field: '[].summary.solarPercentage', type: 'integer 0-100', unit: '%', meaning: 'Share of the hour\'s charging covered by solar = round(used / charging x 100); 0 when there was no charging.' },
        { file: J, field: '[].chargers', type: 'array of objects (may be empty)', unit: '', meaning: 'All charger readings of this hour, copied unchanged from the input files.' },
        { file: J, field: '[].chargers[].id', type: 'string', unit: '', meaning: 'Charger id ("OCM-" plus a number for SOMMOBILITAT, a numeric string for ETECNIC). One charger appears in many hours.' },
        { file: J, field: '[].chargers[].origin', type: 'string', unit: '', meaning: `Operator / data source. In this run: ${originList.map((o) => o.origin).join(', ') || 'none'}.` },
        { file: J, field: '[].chargers[].consumptionKWh', type: 'number (unrounded, as in input)', unit: 'kWh', meaning: 'Energy charged at this charger in this hour. Note the capital "KWh" in the key.' },
        { file: J, field: '[].chargers[].cars', type: 'array of objects (SOMMOBILITAT readings only; absent otherwise)', unit: '', meaning: 'Cars charging at this charger in this hour.' },
        { file: J, field: '[].chargers[].cars[].id', type: 'string', unit: '', meaning: 'Pseudonymous car id (full id; treat as personal data).' },
        { file: J, field: '[].chargers[].cars[].consumption', type: 'number (unrounded)', unit: 'kWh', meaning: 'Energy charged by this car in this hour at this charger; the cars of one reading add up to its consumptionKWh.' },
        ...extraChargerFields.map((k) => ({ file: J, field: `[].chargers[].${k}`, type: 'as in input', unit: 'unknown', meaning: 'Extra input field passed through unchanged; not used in any calculation.' })),
        ...extraCarFields.map((k) => ({ file: J, field: `[].chargers[].cars[].${k}`, type: 'as in input', unit: 'unknown', meaning: 'Extra input field passed through unchanged; not used in any calculation.' })),
        { file: H, field: 'KPIs EV charging, Taken from the grid, Solar surplus available, Solar used by EVs', type: 'number (whole kWh)', unit: 'kWh', meaning: 'Sums over all hours of summary.totalConsumption, gridConsumptionKwh, totalSolarProduction, usedSolarKwh.' },
        { file: H, field: 'KPI Charging covered by solar', type: 'number (1 decimal)', unit: '%', meaning: 'Total used / total charging x 100 (energy-weighted; not the average of solarPercentage).' },
        { file: H, field: 'KPI Solar surplus used', type: 'number (1 decimal)', unit: '%', meaning: 'Total used / total surplus x 100; its hint shows the unused kWh.' },
        { file: H, field: 'Charger details table (Charger, Operator, Charged kWh, From solar est. kWh, Solar share %, Hours charging, Cars)', type: 'table, max 25 rows, by Charged descending', unit: 'kWh, %, count', meaning: 'Per-charger totals; "From solar" is an estimate (see section 5); "Cars" = distinct car ids, empty for ETECNIC.' },
        { file: H, field: 'Charger details column "Hours charging" (also facts.topChargers[].hoursCharging and "hours charging" in section 6)', type: 'integer', unit: 'hours', meaning: 'Number of output hours in which this charger had a reading with consumptionKWh > 0 (hours with a 0 kWh reading are not counted).' },
        { file: H, field: 'Charger details column "Cars" (also facts.topChargers[].cars)', type: 'integer', unit: 'count', meaning: 'Number of distinct car ids seen at this charger over the period (0 / empty for ETECNIC, which lists no cars).' },
        { file: H, field: 'Heatmap cells', type: 'integer', unit: '%', meaning: 'summary.solarPercentage per day and hour; empty when there was no charging that hour.' },
        { file: H, field: 'Average day bars', type: 'number', unit: 'kWh per hour', meaning: 'For each hour 00-23: sum of the hourly values / number of output hours at that hour of day.' }
    ];

    const method = [
        'Input files are classified by file name: a name containing "cars" is EV charging (SOMMOBILITAT car-sharing, with car ids); otherwise containing "chargers" is EV charging (ETECNIC public chargers); otherwise containing "surplus" or "solar" is the solar surplus. algoCustomData.json is skipped; files that are not valid JSON are skipped; other JSON files are ignored.',
        'Both charging sources are handled identically: per timestamp, all charger readings from all charging files are collected and their consumptionKWh summed (totalConsumption). Records with the same timestamp are merged.',
        'Solar surplus: per timestamp, totalSolarProduction = productionKwh of the surplus record (if a timestamp occurs twice the last record read wins; a missing hour counts as 0).',
        'Hourly matching, no storage and no carry-over between hours: usedSolarKwh = min(charging, surplus); gridConsumptionKwh = max(0, charging - surplus); solarPercentage = round(used / charging x 100), 0 when charging = 0; unused surplus = surplus - used.',
        'Rounding: the four kWh values are rounded to 2 decimals per hour from unrounded inputs, so used + grid can differ from totalConsumption by 0.01 kWh in single hours, and sums of hourly values can differ by a few hundredths from the sum of the raw charger readings.',
        'Period totals (HTML KPIs and section 6 here) = sums of the rounded hourly summary values. Coverage = total used / total charging x 100; surplus use = total used / total surplus x 100 (both rounded to 1 decimal). These are energy-weighted ratios; averaging solarPercentage over hours gives a different, misleading number.',
        'Daily figures = sums of the hourly values with the same date (first 10 characters of datetime). Average-day profile = mean per hour of day over all output hours.',
        'Per-charger solar (HTML table, section 6) is an estimate: the solar used in an hour is split among the chargers active that hour in proportion to their consumptionKWh. Per-operator and per-charger kWh are sums of the raw, unrounded readings. "Hours charging" of a charger = number of hours with a reading of consumptionKWh > 0 at that charger; "cars" = distinct car ids seen there. Chargers are identified by id + origin.',
        'Time: timestamps are used exactly as written ("YYYY-MM-DD HH:MM:SS"); no time zone or daylight-saving handling; charging and surplus are matched only when the text is identical.'
    ];

    const results = [
        { label: 'Hours in output', value: rows.length, unit: 'hours' },
        { label: 'Hours with EV charging (output hours with totalConsumption > 0; not the same as the per-file record counts in section 2)', value: chargingHours, unit: 'hours' },
        { label: 'Hours with solar surplus above 0', value: solarHours, unit: 'hours' },
        { label: 'Total EV charging', value: r2(evKwh), unit: 'kWh' },
        { label: 'Total solar surplus available', value: r2(solarKwh), unit: 'kWh' },
        { label: 'Solar used by EVs', value: r2(usedKwh), unit: 'kWh' },
        { label: 'Charging taken from the grid', value: r2(gridKwh), unit: 'kWh' },
        { label: 'Solar surplus not used', value: r2(unused), unit: 'kWh' },
        { label: 'Charging covered by solar', value: sharePct === null ? 'n/a (no charging)' : sharePct.toFixed(1), unit: '%' },
        { label: 'Solar surplus used by EVs', value: solarUsePct === null ? 'n/a (no surplus)' : solarUsePct.toFixed(1), unit: '%' },
        { label: 'Hours where the surplus fully covered charging', value: fullCoverHours, unit: 'hours' },
        { label: 'Hours with surplus but no charging', value: `${solarNoChargeHours} (${r2(solarNoChargeKwh)} kWh unused in them)`, unit: 'hours' },
        ...originList.map((o) => ({ label: `Charging by operator ${o.origin}`, value: `${o.kwh} (${o.chargers} chargers)`, unit: 'kWh' })),
        { label: 'Busiest hour (EV charging)', value: maxHour && maxHour.ev > 0 ? `${maxHour.dt}: ${r2(maxHour.ev)}` : 'n/a', unit: 'kWh' },
        { label: 'Hour with highest surplus', value: maxPvHour && maxPvHour.pv > 0 ? `${maxPvHour.dt}: ${r2(maxPvHour.pv)}` : 'n/a', unit: 'kWh' },
        { label: 'Busiest day (EV charging)', value: busiestDay ? `${busiestDay.date}: ${busiestDay.evKwh}` : 'n/a', unit: 'kWh' },
        { label: 'Day with highest solar share', value: bestDay ? `${bestDay.date}: ${bestDay.solarSharePct}` : 'n/a', unit: '%' },
        { label: 'Day with lowest solar share', value: worstDay ? `${worstDay.date}: ${worstDay.solarSharePct}` : 'n/a', unit: '%' },
        { label: 'Hour of day with most charging (average)', value: rows.length ? `${hh(peakEvHour.hour)}: ${peakEvHour.avgEvKwh}` : 'n/a', unit: 'kWh per hour' },
        { label: 'Hour of day with most surplus (average)', value: rows.length ? `${hh(peakPvHour.hour)}: ${peakPvHour.avgSolarKwh}` : 'n/a', unit: 'kWh per hour' },
        ...ranked.slice(0, 10).map((c, i) => ({
            label: `Charger #${i + 1} by energy: ${c.id} (${c.origin})`,
            value: `${r2(c.kwh)} charged, ${r2(c.solar)} from solar (est., ${c.kwh > 0 ? pvRound((c.solar / c.kwh) * 100, 1) : 0} %), ${c.hours} hours charging` + (c.cars.size ? `, ${c.cars.size} cars` : ''),
            unit: 'kWh'
        }))
    ];

    const limitations = [
        'The "solar" input is a surplus series (energy offered for EV charging), not necessarily total PV production. ' + (nightSolar.length
            ? `In this run ${nightOut.length} output hours at night (21:00-05:59) have a surplus above 0, ${r2(nightOutKwh)} kWh in total (sum of the rounded hourly totalSolarProduction, the same basis as every other period total; the raw input records give ${nightSolar.length} records / ${r2(nightSolarKwh)} kWh). The average profile peaks at ${hh(peakPvHour.hour)}. So the series is either not pure solar or its timestamps are shifted / in another time zone. The algorithm uses the values as given.`
            : 'No surplus above 0 was found at night (21:00-05:59) in this run.'),
        ...(wholeSolarPct !== null && wholeSolarPct >= 50
            ? [`The surplus values are coarse: ${wholeSolar} of the ${posSolar.length} positive surplus records (${wholeSolarPct.toFixed(1)} %) are whole kWh (e.g. the maximum hour is ${maxPvHour ? r2(maxPvHour.pv) : 'n/a'} kWh). This suggests rounded, estimated or modelled data rather than metered readings, so hourly figures on the solar side are approximate.`]
            : []),
        `Matching is strictly per hour with no battery: surplus in an hour without charging is lost (${solarNoChargeHours} such hours here) and charging cannot use surplus from another hour.`,
        `Missing hours: ${hoursNoSolarRec.length} output hours have no surplus record (surplus counted as 0): ${listSample(hoursNoSolarRec)}. ${hoursNoChargeRec.length} output hours have no charging record (charging 0): ${listSample(hoursNoChargeRec)}.` +
            (expectedHours !== null ? ` ${gapHours.length} hourly steps between the first and last timestamp are absent from all inputs: ${listSample(gapHours)}.` : ''),
        `Duplicate timestamps: ${consDup} repeated within one charging source (merged by adding), ${solarDup} in the surplus records (last one wins). ${bothSources} hours have readings from both charging sources; these are combined, as intended.`,
        'Time zone and daylight saving are not stated in the data and not converted; a missing or doubled hour around a clock change shows up in the counts above.' + (() => {
            if (!dstDaysInPeriod.length) return ' The period contains no EU clock-change day.';
            const ms = dstMissing(hoursNoSolarRec), mc = dstMissing(hoursNoChargeRec), mg = dstMissing(gapHours);
            const parts = [];
            if (ms.length) parts.push(`the surplus series lacks ${listSample(ms)}`);
            if (mc.length) parts.push(`the charging data lacks ${listSample(mc)}`);
            if (mg.length) parts.push(`all inputs lack ${listSample(mg)}`);
            return ` The period contains the EU clock-change day(s) ${dstDaysInPeriod.join(', ')} (last Sunday of March: clocks jump 02:00 -> 03:00; last Sunday of October: 03:00 -> 02:00). ` +
                (parts.length
                    ? `On that day ${parts.join('; ')}. This is very likely the clock change: that source uses local time with daylight saving, so one hour does not exist (March) or two readings share one timestamp (October), while ${ms.length && !mc.length ? 'the charging data, which has every hour of that day, is probably in UTC or a fixed clock' : 'the other source probably uses a fixed clock'}. If the two sources use different clocks, from that day on their hours may be offset by 1 hour, which also affects the night-surplus explanation above.`
                    : 'No hour is missing on that day in either source.');
        })(),
        'Files are classified by name only; a file with another name is ignored without error (see section 2 for this run). The operator comes from the "origin" field, not from the file.',
        `Data checks in this run: ${negSolar} negative surplus values; ${nonNumericSolar} non-numeric surplus values (a text productionKwh would stop the job); ${carMismatch} car-sharing readings whose cars do not add up to consumptionKWh.`,
        'The algorithm does not use any location: it cannot tell where the solar plant or chargers are (input file names, listed in section 2, may contain a place name, but the algorithm does not read it and does not check that surplus and chargers are in the same place). It also cannot tell costs, CO2, whether charging could be shifted, or anything outside the period covered. All chargers are compared with one shared surplus series.',
        `Totals: summing the hourly (rounded) totalConsumption gives ${r2(evKwh)} kWh; summing the raw charger readings gives ${r2(rawReadingKwh)} kWh. Differences of a few hundredths are rounding.`,
        'Privacy: the JSON holds full charger ids and full pseudonymous car ids. This file and the HTML never list car ids; charger ids (public charging points) are shown in full.'
    ];

    const questions = [
        { question: 'How much of the EV charging came from solar?', answer: `Section 6 "Charging covered by solar" (${sharePct === null ? 'n/a' : sharePct.toFixed(1) + ' %'}). To recompute: sum summary.usedSolarKwh over all elements of ${J}, divide by the sum of summary.totalConsumption, x 100. Do not average solarPercentage.` },
        { question: 'How much solar surplus was wasted?', answer: 'Sum of (summary.totalSolarProduction - summary.usedSolarKwh) over all hours; see "Solar surplus not used" in section 6.' },
        { question: 'Which charger charged the most?', answer: `Section 6 lists the top 10 and facts.topChargers below. Full list: group ${J} [].chargers[] by id and origin, sum consumptionKWh, sort descending (the HTML "Charger details" table shows the top 25).` },
        { question: 'How much solar did a single charger get?', answer: 'Not measured; estimate as in the HTML: per hour, usedSolarKwh x (that charger\'s consumptionKWh / sum of consumptionKWh of all chargers that hour), summed over the hours.' },
        { question: 'What happened on a given day or hour?', answer: `Daily totals are in facts.daily below. For an hour, find the element of ${J} whose datetime equals "YYYY-MM-DD HH:00:00" and read summary and chargers.` },
        { question: 'When do EVs charge versus when is surplus available?', answer: 'facts.hourlyProfile below (average kWh per hour of day), also the HTML "Average day" chart and the heatmap.' },
        { question: 'How many cars charged, and which charged most?', answer: `Collect [].chargers[].cars[] in ${J} (SOMMOBILITAT only), group by id and sum consumption. Car ids are pseudonymous personal data: show them masked (first 4 and last 4 characters) unless the user is the data owner.` },
        { question: 'How do the operators compare?', answer: 'Section 6 "Charging by operator" and facts.operators; recompute by grouping chargers[] by origin and summing consumptionKWh.' },
        { question: 'Why does the HTML total differ slightly from my own sum?', answer: 'The HTML rounds KPIs to whole kWh and sums hourly values each rounded to 2 decimals; raw charger readings are unrounded. Differences of a few hundredths of a kWh are rounding.' },
        { question: 'Would a battery or shifting charging help?', answer: 'Not computed. Indicators: hours with surplus but no charging and the unused kWh (section 6), and the timing mismatch in facts.hourlyProfile.' },
        { question: 'What time zone are the hours in?', answer: 'Unknown; timestamps are copied as given. See section 7 for night-time surplus and for any hour missing on a clock-change day, which suggest the two sources may use different clocks.' },
        { question: 'Is the solar share good, or was a lot of solar wasted?', answer: 'Look at two numbers together in section 6. "Solar surplus used by EVs" says how much of the available surplus was used (high = little waste). "Charging covered by solar" says how much of the charging it covered. If surplus use is high but coverage is low, the surplus is simply small compared with the charging demand; the timing of charging is not the main problem. Compare "Total solar surplus available" with "Total EV charging" to see the size gap.' },
        { question: 'Which day had the best / worst solar share, and which day was busiest?', answer: 'Section 6 ("Day with highest/lowest solar share", "Busiest day"). For all days use facts.daily: sort by solarSharePct or evKwh. solarSharePct is usedSolarKwh / evKwh x 100 of that day (energy-weighted), null if there was no charging.' },
        { question: 'How many hours had charging? Why do the record counts differ?', answer: `Section 6 "Hours with EV charging" counts output hours with totalConsumption > 0. Section 2 counts records per input file; a timestamp present in both charging files is one output hour (${bothSources} such hours in this run).` },
        { question: 'How much money or CO2 was saved?', answer: 'Not available: the outputs contain energy (kWh) only, with no prices or emission factors. Only the matched energy ("Solar used by EVs") can be stated; any money or CO2 figure would need an outside price or emission factor and must be labelled as an assumption.' },
        { question: 'Where are the chargers and the solar plant?', answer: 'The outputs contain no location. Input file names in section 2 may contain a place name, which can be mentioned as a hint only. Charger ids starting with "OCM-" can be looked up on Open Charge Map.' },
        { question: 'How is "solar used" calculated?', answer: 'Per hour: min(charging, surplus); grid = max(0, charging - surplus); rounded to 2 decimals per hour; period totals are sums of these hourly values. No battery and no carry-over between hours (section 5).' }
    ];

    const glossary = [
        { term: 'EV', meaning: 'Electric vehicle.' },
        { term: 'PV', meaning: 'Photovoltaic, i.e. solar panels.' },
        { term: 'Solar surplus', meaning: 'Local solar energy left over and available for EV charging in a given hour (the productionKwh input).' },
        { term: 'kWh', meaning: 'Kilowatt-hour, unit of energy. All energy values are kWh in the hour, or summed kWh.' },
        { term: 'Used solar (matched energy)', meaning: 'Part of the charging in an hour covered by the surplus of the same hour: min(charging, surplus).' },
        { term: 'Grid consumption', meaning: 'Charging not covered by surplus in the same hour; assumed to come from the electricity grid.' },
        { term: 'Solar share / coverage', meaning: 'Used solar divided by EV charging, in %.' },
        { term: 'Surplus use', meaning: 'Used solar divided by available surplus, in %.' },
        { term: 'SOMMOBILITAT', meaning: 'Electric car-sharing operator; its records list the (pseudonymous) cars charging. Its charger ids start with "OCM-".' },
        { term: 'ETECNIC', meaning: 'Operator of public EV charging points; its records give energy per charger only, no cars.' },
        { term: 'OCM', meaning: 'Open Charge Map, a public registry of charging points; ids of the form "OCM-" plus a number refer to it.' },
        { term: 'Compute-to-Data (C2D)', meaning: 'The algorithm ran next to the data in the Empower-X data space; only these outputs left the data provider.' }
    ];

    const facts = {
        algorithm: 'PV-to-EV Energy Matcher',
        file: 'pv_to_ev_matcher.js',
        generatedAt,
        parameters: { algoCustomData: customNote, matchingInterval: '1 hour', hourlyRoundingDecimals: 2 },
        inputs: inputLog.map((l) => ({ file: l.file, use: l.use, records: l.records === undefined ? null : l.records })),
        period: { first, last, hours: rows.length, days: dayKeys.length, hourlyStepsFirstToLast: expectedHours, absentHourlySteps: gapHours.length },
        counts: {
            chargers: chargers.size, cars: carIds.size, chargerReadings: readings, chargingHours, solarHours, fullCoverHours, solarNoChargeHours,
            hoursWithoutSurplusRecord: hoursNoSolarRec.length, hoursWithoutChargingRecord: hoursNoChargeRec.length, nightSurplusHours: nightOut.length, nightSurplusRecordsRawInput: nightSolar.length,
            chargingRecordsPerFileSum: somRecs + etRecs, distinctChargingTimestamps: consTimes.size, timestampsInBothChargingSources: bothSources,
            positiveSurplusRecords: posSolar.length, wholeKwhSurplusRecords: wholeSolar
        },
        totalsKwh: { evCharging: r2(evKwh), solarSurplus: r2(solarKwh), usedSolar: r2(usedKwh), grid: r2(gridKwh), unusedSolar: r2(unused), rawChargerReadingsSum: r2(rawReadingKwh), nightSurplus: r2(nightOutKwh), nightSurplusRawInput: r2(nightSolarKwh) },
        percent: { chargingCoveredBySolar: sharePct, surplusUsed: solarUsePct, wholeKwhSurplusShare: wholeSolarPct, note: 'percentages are rounded to 1 decimal; a whole number such as 5 means 5.0' },
        clockChange: { euClockChangeDaysInPeriod: dstDaysInPeriod, missingSurplusHoursOnThoseDays: dstMissing(hoursNoSolarRec), missingChargingHoursOnThoseDays: dstMissing(hoursNoChargeRec) },
        operators: originList,
        topChargers: ranked.slice(0, 10).map((c) => ({ id: c.id, origin: c.origin, kwh: r2(c.kwh), solarKwhEst: r2(c.solar), hoursCharging: c.hours, cars: c.cars.size })),
        daily,
        hourlyProfile: hourly
    };

    return contextDoc({
        title: 'PV-to-EV Energy Matcher',
        summary: 'This Empower-X marketplace algorithm checks, hour by hour, how much electric-vehicle charging could be covered by locally available solar surplus. ' +
            'It combines charging data from car-sharing chargers (SOMMOBILITAT) and public chargers (ETECNIC) with an hourly solar-surplus series and, for every hour, reports total charging, available surplus, the solar used, the part taken from the grid and the solar share. ' +
            'It helps energy communities and charging operators see how well charging matches local solar.',
        run, files, fields, method, results, limitations, questions, glossary, facts
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
const pvInputLog = []; // for AI_CONTEXT.md only: which input files were used and how

for (const file of files) {
    // Пропускаем только сервисный файл
    if (file === "algoCustomData.json") { pvInputLog.push({ file, use: 'parameters (not used by this algorithm)' }); continue; }

    const fullPath = path.join(inputDir, file);
    
    // Пытаемся прочитать файл, даже если у него нет расширения .json
    let content;
    try {
        content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
        console.log(`Skipping file (not valid JSON): ${file}`);
        pvInputLog.push({ file, use: 'skipped: not valid JSON (or a folder)' });
        continue;
    }

    // Логика распределения по именам твоих файлов:
    if (file.includes('cars')) {
        somData = somData.concat(content);
        pvInputLog.push({ file, use: 'EV charging (file name contains "cars")', records: Array.isArray(content) ? content.length : 1 });
    } else if (file.includes('chargers')) {
        etecnicData = etecnicData.concat(content);
        pvInputLog.push({ file, use: 'EV charging (file name contains "chargers")', records: Array.isArray(content) ? content.length : 1 });
    } else if (file.includes('surplus') || file.includes('solar')) {
        solarData = solarData.concat(content);
        pvInputLog.push({ file, use: 'solar surplus (file name contains "surplus" or "solar")', records: Array.isArray(content) ? content.length : 1 });
    } else {
        pvInputLog.push({ file, use: 'ignored: file name contains none of cars / chargers / surplus / solar', records: Array.isArray(content) ? content.length : 1 });
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
contextWrite(fs, path.join(outputDir, CONTEXT_FILE), () => buildContext(finalResult, { inputLog: pvInputLog, inputDir, som: somData, etecnic: etecnicData, solar: solarData }));
console.log(`=== DONE ===\nProcessed ${finalResult.length} hours. Results: ${outputFile}`);
