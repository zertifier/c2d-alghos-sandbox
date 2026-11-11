import fs from "fs";
import path from "path";

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

/* =========================
   AI CONTEXT (AI_CONTEXT.md; documentation only, never changes the JSON or HTML)
   ========================= */

// Re-reads the JSON inputs (read-only) to describe communities and supply-point types.
function ctxScanCommunities(inputDir, inputLog) {
    const communities = [];
    const placeTypes = new Map(); // cups id -> place_type
    const commOf = new Map(); // cups id -> community name (first one seen)
    inputLog.forEach((f) => {
        if (!f.records) return;
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(inputDir, f.file), 'utf8'));
            let list = [];
            if (raw && Array.isArray(raw.data)) list = raw.data;
            else if (Array.isArray(raw)) list = raw;
            else if (raw && Array.isArray(raw.communities)) list = raw.communities;
            else if (raw && (raw.id || raw.name)) list = [raw];
            f.format = 'JSON';
            list.forEach((c) => {
                if (!c || !c.cups) return;
                communities.push({ file: f.file, id: c.id, name: c.name, cups: c.cups.length });
                c.cups.forEach((u) => {
                    if (!u || u.id === undefined) return;
                    placeTypes.set(String(u.id), u.place_type || u.placeType || '');
                    if (!commOf.has(String(u.id))) commOf.set(String(u.id), String(c.name || c.id || ''));
                });
            });
        } catch (e) { f.format = 'CSV'; }
    });
    return { communities, placeTypes, commOf };
}

function buildContext(result, records, inputLog, skippedEntries, generatedAt) {
    const st = result.statistics.kwh_in;
    const an = result.anomalies;
    const spikeThr = an.spikes.threshold;
    const p99 = an.high_consumption.threshold_p99;
    const n = records.length;
    const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : v);
    const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
    const { communities, placeTypes, commOf } = ctxScanCommunities(INPUT_DIR, inputLog);
    const isSpike = (r) => r.kwh_in > spikeThr;
    const isZero = (r) => r.kwh_in === 0 && r.kwh_out === 0 && r.production === 0;

    // Per supply point, same numbering as the HTML ("SP n" = order of first appearance).
    const spIndex = new Map();
    const per = new Map();
    const dayTotals = new Map();
    const seen = new Set();
    let noDate = 0, dupes = 0, negIn = 0, negOut = 0, nightProd = 0, zeroInNotInactive = 0, zeroInAndExport = 0;
    let sumIn = 0, sumOut = 0, sumProd = 0;
    records.forEach((r) => {
        const id = String(r.cups_id);
        if (!spIndex.has(id)) spIndex.set(id, spIndex.size + 1);
        if (!per.has(id)) per.set(id, { id, n: 0, sum: 0, max: -Infinity, maxAt: '', spike: 0, zero: 0, high: 0, exp: 0, out: 0, prod: 0, first: null, last: null, dated: 0, values: [], in0: 0, in0exp: 0, days: new Map() });
        const s = per.get(id);
        s.n++; s.sum += r.kwh_in; s.out += r.kwh_out; s.prod += r.production; s.values.push(r.kwh_in);
        if (r.kwh_in === 0) s.in0++;
        if (r.kwh_in === 0 && !isZero(r)) s.in0exp++;
        if (r.kwh_in > s.max) { s.max = r.kwh_in; s.maxAt = r.date; }
        const zero = isZero(r);
        if (isSpike(r)) s.spike++;
        if (zero) s.zero++;
        if (r.kwh_in >= p99) s.high++;
        if (r.net_usage < 0) s.exp++;
        if (r.kwh_in === 0 && !zero) { zeroInNotInactive++; if (r.net_usage < 0) zeroInAndExport++; }
        sumIn += r.kwh_in; sumOut += r.kwh_out; sumProd += r.production;
        if (r.kwh_in < 0) negIn++;
        if (r.kwh_out < 0) negOut++;
        const ds = r.date ? String(r.date) : '';
        if (!/^\d{4}-\d{2}-\d{2}/.test(ds)) { noDate++; return; }
        s.dated++;
        if (!s.first || ds < s.first) s.first = ds;
        if (!s.last || ds > s.last) s.last = ds;
        const day = ds.slice(0, 10);
        dayTotals.set(day, (dayTotals.get(day) || 0) + r.kwh_in);
        s.days.set(day, (s.days.get(day) || 0) + r.kwh_in);
        const key = id + '|' + ds;
        if (seen.has(key)) dupes++; else seen.add(key);
        const hh = /[ T](\d{2}):/.exec(ds);
        if (hh && r.production > 0 && (Number(hh[1]) >= 22 || Number(hh[1]) < 5)) nightProd++;
    });
    const sps = [...per.values()];
    const days = [...dayTotals.keys()].sort();
    const dated = records.map((r) => (r.date ? String(r.date) : '')).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
    const firstTs = dated[0] || '', lastTs = dated[dated.length - 1] || '';
    const hourMs = (d) => Date.parse(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    const spanHours = firstTs && lastTs ? Math.round((hourMs(lastTs) - hourMs(firstTs)) / 3600000) + 1 : 0;
    let missingHours = 0;
    sps.forEach((s) => {
        if (!s.first) return;
        const exp = Math.round((hourMs(s.last) - hourMs(s.first)) / 3600000) + 1;
        if (Number.isFinite(exp) && exp > s.dated) missingHours += exp - s.dated;
    });
    const spLabel = (id) => `SP ${spIndex.get(String(id))} (${reportMaskId(id)})`;
    const spsWithSpike = sps.filter((s) => s.spike).length;
    const spsWithZero = sps.filter((s) => s.zero).length;
    const ts16 = (d) => (d ? String(d).replace('T', ' ').slice(0, 16) : '-');
    const placeOf = (id) => placeTypes.get(String(id)) || '';
    const commName = (id) => commOf.get(String(id)) || '';
    const spWhere = (id) => [placeOf(id), commName(id) ? 'community "' + commName(id) + '"' : ''].filter(Boolean).join(', ');
    const spFull = (id) => spLabel(id) + (spWhere(id) ? ' [' + spWhere(id) + ']' : '');
    sps.forEach((s) => { s.p05 = getPercentile(s.values, 0.05); s.p95 = getPercentile(s.values, 0.95); s.values = null; });
    // Day share as in the HTML heatmap: that day's import / the supply point's average daily import x 100.
    const dayPct = (id, ds) => {
        const s = per.get(String(id));
        const day = ds ? String(ds).slice(0, 10) : '';
        if (!s || !s.days.size || !s.days.has(day)) return null;
        const avg = [...s.days.values()].reduce((a, b) => a + b, 0) / s.days.size;
        return avg > 0 ? Math.round(s.days.get(day) / avg * 100) : null;
    };
    const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
    // Masked ids shared by several supply points.
    const maskGroups = new Map();
    sps.forEach((s) => { const m = reportMaskId(s.id); if (!maskGroups.has(m)) maskGroups.set(m, []); maskGroups.get(m).push('SP ' + spIndex.get(s.id)); });
    const sharedMasks = [...maskGroups].filter(([, l]) => l.length > 1);
    // Supply points per community (SP numbers).
    const commSps = new Map();
    sps.forEach((s) => { const c = commName(s.id) || '(community unknown)'; if (!commSps.has(c)) commSps.set(c, []); commSps.get(c).push(spIndex.get(s.id)); });

    // Individual flagged readings (as in the HTML "Flagged hours" table).
    const spikeRecs = records.filter(isSpike).sort((a, b) => b.kwh_in - a.kwh_in);
    const zeroRecs = records.filter((r) => isZero(r) && !isSpike(r))
        .sort((a, b) => String(a.cups_id).localeCompare(String(b.cups_id)) || String(a.date).localeCompare(String(b.date)));
    const zeroRuns = [];
    zeroRecs.forEach((r) => {
        const cur = zeroRuns[zeroRuns.length - 1];
        const prev = cur && cur[cur.length - 1];
        if (prev && String(prev.cups_id) === String(r.cups_id) && hourMs(r.date) - hourMs(prev.date) === 3600000) cur.push(r);
        else zeroRuns.push([r]);
    });
    const highOnly = records.filter((r) => r.kwh_in >= p99 && !isSpike(r)).sort((a, b) => b.kwh_in - a.kwh_in);
    const topDays = days.slice().sort((a, b) => dayTotals.get(b) - dayTotals.get(a));
    const dayGap = topDays.length > 1 ? dayTotals.get(topDays[0]) - dayTotals.get(topDays[1]) : null;
    const busiestText = topDays.length ? `${topDays[0]}: ${fmt(dayTotals.get(topDays[0]), 2)} kWh` + (topDays.length > 1 ? `; runner-up ${topDays[1]}: ${fmt(dayTotals.get(topDays[1]), 2)} kWh (${fmt(dayGap, 2)} kWh less${dayTotals.get(topDays[0]) && dayGap / dayTotals.get(topDays[0]) < 0.01 ? ', practically a tie' : ''})` : '') : '-';
    const quietGap = topDays.length > 1 ? dayTotals.get(topDays[topDays.length - 2]) - dayTotals.get(topDays[topDays.length - 1]) : null;
    const quietestText = topDays.length ? `${topDays[topDays.length - 1]}: ${fmt(dayTotals.get(topDays[topDays.length - 1]), 2)} kWh` + (topDays.length > 1 ? `; next-quietest ${topDays[topDays.length - 2]}: ${fmt(dayTotals.get(topDays[topDays.length - 2]), 2)} kWh (${fmt(quietGap, 2)} kWh more)` : '') : '-';
    const top5Days = topDays.slice(0, 5).map((d) => `${d} ${fmt(dayTotals.get(d), 2)}`).join('; ');
    const spsImport0 = sps.filter((s) => s.in0).map((s) => `SP ${spIndex.get(s.id)}${placeOf(s.id) ? ' (' + placeOf(s.id) + ')' : ''}: ${s.in0} h (${s.zero} zero-reading, ${s.in0exp} with export/production)`);
    const spByMean = sps.slice().sort((a, b) => b.sum / b.n - a.sum / a.n);
    const spByMax = sps.slice().sort((a, b) => b.max - a.max);
    const nextMax = records.reduce((m, r) => (!isSpike(r) && r.kwh_in > m ? r.kwh_in : m), 0);

    const J = 'anomalies_analysis.json', H = 'anomalies_analysis.html';
    const files = [
        { file: J, format: 'JSON', contents: 'Summary statistics of hourly grid import (kWh) over all supply points together, the two thresholds, and the count of each anomaly type. It does NOT contain individual readings, supply-point ids or per-supply-point figures.' },
        { file: H, format: 'HTML (self-contained, open in a browser)', contents: 'Visual report: headline counts, anomaly types and rules, flagged hours per supply point, normal range per supply point, daily totals, a daily/weekly heatmap per supply point and a table of the individual flagged readings. Supply-point ids are masked (first 4 + last 4 characters) and numbered "SP n".' }
    ];
    const fields = [
        { file: J, field: 'statistics.kwh_in.mean', type: 'number (full precision)', unit: 'kWh per hour', meaning: 'Average energy imported from the grid in one hourly reading, over all readings of all supply points.' },
        { file: J, field: 'statistics.kwh_in.std_dev', type: 'number', unit: 'kWh per hour', meaning: 'Population standard deviation (divide by N) of hourly import over all readings; 0 if fewer than 2 readings.' },
        { file: J, field: 'statistics.kwh_in.percentiles.p01', type: 'number', unit: 'kWh per hour', meaning: '1st percentile of hourly import (linear interpolation between sorted values).' },
        { file: J, field: 'statistics.kwh_in.percentiles.p05', type: 'number', unit: 'kWh per hour', meaning: '5th percentile; lower edge of the "normal band" in the HTML.' },
        { file: J, field: 'statistics.kwh_in.percentiles.p95', type: 'number', unit: 'kWh per hour', meaning: '95th percentile; upper edge of the "normal band" in the HTML.' },
        { file: J, field: 'statistics.kwh_in.percentiles.p99', type: 'number', unit: 'kWh per hour', meaning: '99th percentile; same value as anomalies.high_consumption.threshold_p99.' },
        { file: J, field: 'anomalies.spikes.threshold', type: 'number', unit: 'kWh per hour', meaning: 'Spike threshold = mean + 3 x std_dev of hourly import.' },
        { file: J, field: 'anomalies.spikes.count', type: 'integer', unit: 'hourly readings', meaning: 'Number of readings with import strictly greater than the spike threshold.' },
        { file: J, field: 'anomalies.spikes.sample_ids', type: 'array of record ids (numbers for JSON input, strings for CSV input), at most 5', unit: '-', meaning: 'The "id" field of the first (up to 5) spike readings in the order the data was read, not sorted by size. These are ids of hourly readings, not supply-point ids.' },
        { file: J, field: 'anomalies.inactivity.count', type: 'integer', unit: 'hourly readings', meaning: 'Readings where import, export and production are all exactly 0 ("zero-reading hours").' },
        { file: J, field: 'anomalies.inactivity.percentage', type: 'STRING, e.g. "0.73%"', unit: '% of all readings', meaning: 'inactivity.count / total readings x 100, rounded to 2 decimals and stored as text with a % sign (parse it before calculating).' },
        { file: J, field: 'anomalies.high_consumption.threshold_p99', type: 'number', unit: 'kWh per hour', meaning: '99th percentile of hourly import; readings at or above it are "top 1%" hours.' },
        { file: J, field: 'anomalies.high_consumption.count', type: 'integer', unit: 'hourly readings', meaning: 'Readings with import >= threshold_p99. Can exceed 1% of readings when values tie; includes the spikes.' },
        { file: J, field: 'anomalies.net_export_events.count', type: 'integer', unit: 'hourly readings', meaning: 'Readings where export (kwh_out) is greater than import (kwh_in), i.e. net usage < 0. Usually normal solar surplus.' },
        { file: H, field: 'Summary (KPI tiles)', type: 'text', unit: 'readings / h', meaning: 'Hourly readings analysed (with supply-point and day counts), spike, zero-reading, top 1% and net export counts (same numbers as the JSON).' },
        { file: H, field: 'Anomaly types: bar chart + "What each type means" table', type: 'chart / table', unit: 'h (hours)', meaning: 'Count per anomaly type and the rule used for each.' },
        { file: H, field: 'Flagged hours per supply point (chart)', type: 'horizontal bars', unit: 'h (hours)', meaning: 'Per supply point: spikes (red), zero readings (purple), top 1% hours that are not spikes (orange). Top 20 supply points, max 30 bars; net export not shown.' },
        { file: H, field: 'Normal range charts', type: 'range bars', unit: 'kWh per hour', meaning: 'p05-p95 band and average for all readings and for each supply point (first 20), plus each supply point\'s highest single-hour reading.' },
        { file: H, field: 'Total daily consumption (chart)', type: 'stacked bars', unit: 'kWh per day', meaning: 'Sum of hourly import of all supply points per calendar day (day = first 10 characters of the timestamp); red = day with a spike, purple = day with zero readings.' },
        { file: H, field: 'Heatmap', type: 'cells', unit: '% of own daily average', meaning: 'Each supply point\'s daily import / its own average daily import x 100, rounded (weekly averages if the period is over 62 days). Up to 25 supply points.' },
        { file: H, field: 'Flagged hours table: Supply point, Time, Imported (kWh), Exported (kWh), Type, Record id', type: 'table', unit: 'kWh', meaning: 'Spikes (largest first), then zero-reading periods (consecutive hours of one supply point merged into one row), then up to 10 highest top 1% hours; max 30 rows. Time = timestamp to the minute.' }
    ];

    const run = [
        { label: 'Input files found', value: inputLog.length ? inputLog.map((f) => `${f.file}: ${f.error ? 'failed (' + f.error + ')' : f.records + ' hourly readings' + (f.format ? ' (' + f.format + ')' : '')}`).join('; ') : 'none' },
        { label: 'Input files used (gave readings)', value: inputLog.filter((f) => f.records > 0).map((f) => f.file).join(', ') || 'none' },
        { label: 'Input files read but with no readings', value: inputLog.filter((f) => !f.error && !f.records).map((f) => f.file + (f.file === 'algoCustomData.json' ? ' (the job parameter file; not energy data, and this algorithm takes no parameters)' : ' (no communities/cups/energy_hourly or CSV rows recognised)')).join('; ') || 'none' },
        { label: 'Input entries ignored', value: skippedEntries.length ? skippedEntries.join(', ') + ' (hidden, or extension not .json/.csv/.txt/none)' : 'none' },
        { label: 'Hourly readings analysed', value: String(n) },
        { label: 'Communities', value: communities.length ? `${communities.length}: ` + communities.map((c) => `${c.name || c.id} (${c.cups} supply points)`).join('; ') : 'not available (CSV input or no community records)' },
        { label: 'Supply points (CUPS)', value: String(sps.length) },
        { label: 'Supply points per community (SP numbers)', value: [...commSps].map(([c, l]) => `${c}: SP ${l.join(', ')} (${l.length})`).join('; ') + '. Community names and place types are taken from the input files; they do not appear in the JSON or HTML outputs.' },
        { label: 'Masked ids shared by several supply points', value: sharedMasks.length ? sharedMasks.map(([m, l]) => `${m} = ${l.join(', ')}`).join('; ') : 'none (all masked ids are unique)' },
        { label: 'Supply-point types (place_type)', value: (() => { const m = new Map(); sps.forEach((s) => { const t = placeOf(s.id) || 'unknown'; m.set(t, (m.get(t) || 0) + 1); }); return [...m].map(([t, c]) => `${t} ${c}`).join(', '); })() },
        { label: 'Period covered', value: firstTs ? `${firstTs} to ${lastTs} (${days.length} calendar days, ${spanHours} hours; timestamps as in the source, no time zone stated)` : 'unknown (no valid timestamps)' },
        { label: 'Parameters', value: 'None. This algorithm reads no algoCustomData; the rules are fixed: spike = import > mean + 3 x standard deviation; top 1% = import >= 99th percentile; zero reading = import, export and production all 0; net export = export > import.' },
        { label: 'Algorithm version', value: 'not versioned (Empower-X anomalies_analytic.js)' },
        { label: 'Generated at', value: generatedAt.toISOString() + ' (UTC)' }
    ];

    const method = [
        'Input: every hourly reading of every supply point (CUPS) in every input file (JSON communities -> cups -> energy_hourly, or CSV with id in column 1, cups_id in column 4, timestamp in column 6, kwh_in in column 7, kwh_out in column 8, production in column 15). All files are combined into one list; duplicates are not removed.',
        'Per reading: kwh_in = energy imported from the grid in that hour (kWh); kwh_out = energy exported to the grid (kWh); production = local generation (kWh); net_usage = kwh_in - kwh_out. Missing or non-numeric values count as 0.',
        'All statistics use kwh_in only and are computed over ALL readings of ALL supply points together (one pooled distribution), not per supply point.',
        'mean = sum(kwh_in) / N. std_dev = sqrt(sum((kwh_in - mean)^2) / N) (population formula).',
        'Percentile p: sort the values, pos = (N - 1) x p, value = sorted[floor(pos)] + (pos - floor(pos)) x (sorted[floor(pos)+1] - sorted[floor(pos)]) (linear interpolation).',
        `Consumption spike: kwh_in > mean + 3 x std_dev (this run: > ${r4(spikeThr)} kWh).`,
        `Top 1% (high consumption) hour: kwh_in >= p99 (this run: >= ${r4(p99)} kWh). A spike is normally also a top 1% hour; the JSON counts it in both.`,
        'Zero-reading (inactivity) hour: kwh_in = 0 AND kwh_out = 0 AND production = 0. A reading with kwh_in = 0 but some export or production is NOT counted.',
        'Net export hour: net_usage < 0, i.e. kwh_out > kwh_in. Listed for information; usually solar surplus, not an error.',
        'Rounding: inactivity.percentage is rounded to 2 decimals and written as text with "%". All other JSON numbers are unrounded. The HTML shows kWh values rounded to 2 decimals. This file rounds statistics (mean, std_dev, percentiles, thresholds, per-supply-point mean) to 4 decimals and kWh readings, totals and per-supply-point p05/p95 to 2 decimals; trailing zeros are sometimes dropped (1827.8 and 1827.80 are the same value); the Facts block repeats the unrounded JSON values.',
        'Timestamps are used as given (no time-zone conversion). A day is the first 10 characters of the timestamp (YYYY-MM-DD); consecutive zero-reading hours are merged into one period when exactly 1 hour apart.',
        'The HTML "Flagged hours per supply point" chart counts a spike once (as spike) and shows only top 1% hours that are not spikes, so its numbers add up differently from the JSON counts. Supply points are numbered "SP n" in order of first appearance in the input, identically in the HTML and in this file.'
    ];

    const results = [
        { label: 'Hourly readings analysed', value: n, unit: 'readings' },
        { label: 'Supply points', value: sps.length, unit: 'CUPS' },
        { label: 'Calendar days covered', value: days.length, unit: 'days' },
        { label: 'Total grid import (all readings)', value: r2(sumIn), unit: 'kWh' },
        { label: 'Total grid export (all readings)', value: r2(sumOut), unit: 'kWh' },
        { label: 'Total production (all readings)', value: r2(sumProd), unit: 'kWh' },
        { label: 'Mean hourly import', value: r4(st.mean), unit: 'kWh per hour' },
        { label: 'Standard deviation of hourly import', value: r4(st.std_dev), unit: 'kWh per hour' },
        { label: 'p01 / p05 / p95 / p99', value: `${r4(st.percentiles.p01)} / ${r4(st.percentiles.p05)} / ${r4(st.percentiles.p95)} / ${r4(st.percentiles.p99)}`, unit: 'kWh per hour' },
        { label: 'Spike threshold (mean + 3 sd)', value: r4(spikeThr), unit: 'kWh per hour' },
        { label: 'Consumption spikes', value: an.spikes.count, unit: `readings (in ${spsWithSpike} supply point${spsWithSpike === 1 ? '' : 's'})` },
        { label: 'Spike sample record ids (JSON)', value: an.spikes.sample_ids.join(', ') || 'none', unit: 'record id' },
        { label: 'Zero-reading hours', value: `${an.inactivity.count} (${an.inactivity.percentage})`, unit: `readings (in ${spsWithZero} supply point${spsWithZero === 1 ? '' : 's'}, ${zeroRuns.length} period${zeroRuns.length === 1 ? '' : 's'})` },
        { label: 'Top 1% consumption hours', value: an.high_consumption.count, unit: 'readings' },
        { label: 'Net export hours', value: an.net_export_events.count, unit: 'readings' },
        { label: 'Highest single reading', value: spByMax.length ? `${r2(spByMax[0].max)} at ${spFull(spByMax[0].id)}, ${ts16(spByMax[0].maxAt)}` : '-', unit: 'kWh' },
        { label: 'Busiest day (all supply points)', value: busiestText, unit: 'kWh' },
        { label: 'Quietest day (all supply points)', value: quietestText, unit: 'kWh' },
        { label: 'Top 5 days by total import', value: top5Days || '-', unit: 'kWh' },
        { label: 'Supply points with hours of 0 import', value: spsImport0.join('; ') || 'none', unit: 'hours' },
        { label: 'Net export hours per supply point', value: sps.filter((s) => s.exp).map((s) => `SP ${spIndex.get(s.id)}${placeOf(s.id) ? ' (' + placeOf(s.id) + ')' : ''}: ${s.exp}`).join('; ') || 'none', unit: 'hours' }
    ];
    spikeRecs.slice(0, 10).forEach((r, i) => results.push({ label: `Spike ${i + 1}`, value: `${spFull(r.cups_id)}, ${ts16(r.date)}, import ${r2(r.kwh_in)} kWh (${spikeThr > 0 ? r2(r.kwh_in / spikeThr) + ' x the spike threshold' : 'above the threshold'}${nextMax > 0 && i === 0 ? '; ' + r2(r.kwh_in / nextMax) + ' x the highest reading that is not a spike, ' + r2(nextMax) + ' kWh' : ''}), export ${r2(r.kwh_out)} kWh, record id ${r.id}; that day SP ${spIndex.get(String(r.cups_id))} imported ${dayPct(r.cups_id, r.date) === null ? '-' : dayPct(r.cups_id, r.date) + '%'} of its own average day (HTML heatmap)`, unit: 'kWh' }));
    if (spikeRecs.length > 10) results.push({ label: 'More spikes', value: spikeRecs.length - 10, unit: 'not listed' });
    zeroRuns.slice(0, 15).forEach((g, i) => results.push({ label: `Zero-reading period ${i + 1}`, value: `${spFull(g[0].cups_id)}, ${ts16(g[0].date)}${g.length > 1 ? ' to ' + ts16(g[g.length - 1].date) : ''}, record id${g.length > 1 ? 's ' + g[0].id + ' to ' + g[g.length - 1].id : ' ' + g[0].id}`, unit: `${g.length} h` }));
    if (zeroRuns.length > 15) results.push({ label: 'More zero-reading periods', value: zeroRuns.length - 15, unit: 'not listed' });
    highOnly.slice(0, 5).forEach((r, i) => results.push({ label: `Highest top 1% hour that is not a spike, #${i + 1}`, value: `${spLabel(r.cups_id)}, ${ts16(r.date)}, ${r2(r.kwh_in)}, record id ${r.id}`, unit: 'kWh' }));
    sps.slice(0, 40).forEach((s) => results.push({
        label: `Per supply point: ${spFull(s.id)}`,
        value: `${s.n} readings; import total ${r2(s.sum)} kWh, mean ${r4(s.sum / s.n)} kWh/h, normal band p05-p95 ${r2(s.p05)}-${r2(s.p95)} kWh/h, max ${r2(s.max)} kWh (${ts16(s.maxAt)}); export total ${r2(s.out)} kWh; production total ${r2(s.prod)} kWh; spikes ${s.spike}, zero readings ${s.zero}, top 1% ${s.high} (incl. ${s.spike} spike${s.spike === 1 ? '' : 's'}; ${s.high - s.spike} not a spike = the HTML orange bar), net export ${s.exp}`,
        unit: 'kWh / hours'
    }));
    if (sps.length > 40) results.push({ label: 'Per supply point', value: `${sps.length - 40} more supply points not listed`, unit: '' });

    const limitations = [
        'The JSON output holds only overall statistics and counts (pooled over all supply points). Which supply point, hour or reading was flagged is only in the HTML report and in section 6 of this file, both with masked supply-point ids. No output file contains full CUPS ids.',
        'Thresholds are pooled over all supply points and all hours, so a reading is "unusual" relative to the whole group, not to that site\'s own normal level. Large sites (e.g. swimming pools) dominate the top 1% and spike lists; a big jump at a small site can go undetected.',
        'A spike or top 1% hour is a statistical flag, not proof of an error. A zero-reading hour may be a meter/communication outage or a site that is genuinely off.',
        'The mean + 3 x sd rule assumes a roughly bell-shaped distribution; hourly consumption is skewed, so the spike count is sensitive to a few very large readings.',
        `p01 = ${r4(st.percentiles.p01)} kWh${st.percentiles.p01 === 0 ? ' (at least 1% of readings import nothing)' : ''}. Readings with import exactly 0, by supply point: ${spsImport0.join('; ') || 'none'}.`,
        `Readings with import = 0 but some export or production (so NOT counted as zero readings): ${zeroInNotInactive}; of these, ${zeroInAndExport} are also net export hours. This is a different count from anomalies.net_export_events.count (${an.net_export_events.count} = hours with export > import, whatever the import)${zeroInNotInactive === an.net_export_events.count ? '; the two numbers happen to be equal in this run' + (zeroInAndExport === an.net_export_events.count ? ' because every net export hour had 0 import and every 0-import hour with activity exported energy' : '') : ''}.`,
        `Readings without a valid timestamp: ${noDate}. Duplicate readings (same supply point and timestamp): ${dupes}${dupes ? ' (all counted)' : ''}. Missing hours inside each supply point's own first-to-last period: ${missingHours}.`,
        `Negative values: import ${negIn}, export ${negOut} readings. Production above 0 between 22:00 and 05:00: ${nightProd} readings${nightProd ? ' (implausible for solar; may be a time-zone or data issue)' : ''}.`,
        'Timestamps carry no time zone and are used as-is (most likely local Spanish time). Daylight-saving changes are not handled.',
        'Non-numeric or missing kWh values are silently treated as 0, which can create zero-reading hours that are really missing data.',
        'Record ids (anomalies.spikes.sample_ids, HTML "Record id") are ids of hourly readings in the source data; they are neither personal data nor supply-point ids.',
        (() => { const m = new Map(); sps.forEach((x) => m.set(reportMaskId(x.id), (m.get(reportMaskId(x.id)) || 0) + 1)); const dup = [...m].filter(([, c]) => c > 1).length; return dup ? `Masked ids are not unique in this run (${dup} masked id(s) are shared by several supply points; see "Masked ids shared by several supply points" in section 2): always identify a supply point by its "SP n" number, which is the same in the HTML and in this file.` : 'Masked ids are unique in this run, but always prefer the "SP n" number, which is the same in the HTML and in this file.'; })(),
        'The algorithm cannot explain the cause of an anomaly; it uses no weather, tariff or calendar data and does not judge solar performance.'
    ];

    const questions = [
        { question: 'How many anomalies were found?', answer: `anomalies_analysis.json -> anomalies.*.count: spikes ${an.spikes.count}, zero-reading hours ${an.inactivity.count}, top 1% hours ${an.high_consumption.count}, net export hours ${an.net_export_events.count}. Do not simply add them: spikes are also in the top 1% count, and net export is usually normal. Per supply point: section 6.` },
        { question: 'Which supply points export energy?', answer: `Section 6 "Net export hours per supply point" and the export/production totals in the per-supply-point rows. Net export hours in total: ${an.net_export_events.count}.` },
        { question: 'What counts as a spike / what was the threshold?', answer: `An hourly import above anomalies.spikes.threshold = mean + 3 x std_dev = ${r4(spikeThr)} kWh (statistics.kwh_in.mean ${r4(st.mean)}, std_dev ${r4(st.std_dev)}).` },
        { question: 'Which supply point had the spike, and when?', answer: `Not in the JSON (it only has sample record ids). See section 6 of this file ("Spike n") or the HTML "Flagged hours" table; supply points appear as "SP n (ESxx…xxxx)" with masked ids (use the SP number, masked ids repeat). This run: ${spikeRecs.slice(0, 3).map((r) => 'SP ' + spIndex.get(String(r.cups_id)) + ' at ' + ts16(r.date) + ', ' + r2(r.kwh_in) + ' kWh, record id ' + r.id).join('; ') || 'no spikes'}.` },
        { question: 'Which supply point consumes the most?', answer: `Section 6 "Per supply point" rows: sort by mean hourly import (or by import total when all supply points have the same number of readings). Top 3 by mean hourly import: ${spByMean.slice(0, 3).map((s) => spFull(s.id) + ' ' + r4(s.sum / s.n) + ' kWh/h, total ' + r2(s.sum) + ' kWh').join('; ') || '-'}. The HTML "Highest single-hour reading per supply point" chart shows peaks.` },
        { question: 'Were there meter outages?', answer: `Zero-reading hours (import, export and production all 0): ${an.inactivity.count} (${an.inactivity.percentage} of readings) in ${zeroRuns.length} period(s); see section 6 "Zero-reading period n", or the purple bars and white heatmap cells in the HTML. Likely outages, but a site could also have been switched off.` },
        { question: 'What is the normal consumption range?', answer: `90% of hourly readings lie between p05 ${r4(st.percentiles.p05)} and p95 ${r4(st.percentiles.p95)} kWh (statistics.kwh_in.percentiles); the average is ${r4(st.mean)} kWh per hour.` },
        { question: 'What period and how much data was analysed?', answer: `Section 2 of this file: ${n} hourly readings from ${sps.length} supply points${firstTs ? `, ${firstTs} to ${lastTs}` : ''}.` },
        { question: 'Why is inactivity.percentage not a number?', answer: 'It is stored as text like "0.73%" (2 decimals). Strip the "%" before calculating, or compute inactivity.count / total readings x 100.' },
        { question: 'Why is the top 1% count not exactly 1% of the readings?', answer: `1% of ${n} readings is ${r2(n / 100)}. The count (${an.high_consumption.count}) includes every reading equal to or above the p99 value (>=), so ties and the interpolated percentile can add one or more, and the ${an.spikes.count} spike(s) are included too. By supply point: ${sps.filter((s) => s.high).map((s) => 'SP ' + spIndex.get(s.id) + ' ' + s.high).join(', ') || 'none'}.` },
        { question: 'Which days had the most consumption?', answer: `Section 6 "Busiest day"/"Quietest day", or the HTML daily bar chart (sum of import of all supply points per calendar day). Busiest: ${busiestText}. Quietest: ${quietestText}.` },
        { question: 'Is net export a problem?', answer: 'Normally not: the site exported more than it imported in that hour, typically solar surplus. It is reported for information only.' },
        { question: 'Which community / building type had the spike or the outage?', answer: `Section 6 rows "Spike n" and "Zero-reading period n" give the SP number with its place type and community in brackets; section 2 "Supply points per community" lists which SP numbers belong to which community. Spike(s): ${spikeRecs.slice(0, 3).map((r) => spFull(r.cups_id)).join('; ') || 'none'}. Zero readings: ${zeroRuns.slice(0, 3).map((g) => spFull(g[0].cups_id)).join('; ') || 'none'}.` },
        { question: 'What is normal for a particular supply point?', answer: 'Section 6 "Per supply point" rows give its own p05-p95 band and mean (same values as the HTML "Normal range" chart, which shows the first 20 supply points). The JSON percentiles are for all supply points pooled together, not for one site.' },
        { question: 'Is the busiest day far ahead of the others?', answer: `Section 6 "Busiest day" gives the runner-up and the difference: ${busiestText}. Top 5 days: ${top5Days || '-'}.` },
        { question: 'Why does a supply point show "top 1%" in this file but no orange bar in the HTML?', answer: 'The per-supply-point "top 1%" count here includes spikes (as the JSON does). The HTML chart shows a spike only as a red bar and its orange bar counts only top 1% hours that are not spikes; section 6 gives both numbers.' },
        { question: 'What caused a spike (faulty meter or a real event)?', answer: 'The outputs cannot tell: the algorithm only compares readings with statistical thresholds and uses no weather, tariff, calendar or event data. Section 6 gives how far the reading was above the threshold and how unusual that day was for the site; the data provider can check the reading by its record id.' },
        { question: 'Can I get the full CUPS id of a flagged supply point?', answer: 'No output file contains full ids; they are masked to the first 4 and last 4 characters. The data provider can identify the reading from the record id shown.' }
    ];

    const glossary = [
        { term: 'CUPS', meaning: 'Codigo Universal del Punto de Suministro: the unique id of an electricity supply point (meter) in Spain, e.g. ES0031...; masked in these outputs.' },
        { term: 'Supply point (SP n)', meaning: 'One metered connection (one CUPS). "SP n" numbers them in order of first appearance in the input, the same in this file and in the HTML.' },
        { term: 'Energy community', meaning: 'A group of supply points (e.g. municipal buildings) whose data is analysed together.' },
        { term: 'place_type', meaning: 'Kind of building/use of a supply point in the input (education, office, sports, street_lighting, swimming_pool, healthcare, ...).' },
        { term: 'kWh', meaning: 'Kilowatt-hour, unit of energy. An hourly reading in kWh equals the average power in kW during that hour.' },
        { term: 'kwh_in (import)', meaning: 'Energy taken from the grid in the hour.' },
        { term: 'kwh_out (export)', meaning: 'Energy fed into the grid in the hour (e.g. solar surplus).' },
        { term: 'production', meaning: 'Energy generated locally (e.g. by solar panels) in the hour.' },
        { term: 'Net usage', meaning: 'kwh_in - kwh_out; negative means net export.' },
        { term: 'Mean / standard deviation', meaning: 'Average and typical spread of the hourly import values.' },
        { term: 'Percentile (p01, p05, p95, p99)', meaning: 'The value below which that share of readings falls; p99 = 99% of readings are at or below it.' },
        { term: 'Spike', meaning: 'Hourly import more than 3 standard deviations above the average.' },
        { term: 'Top 1% hour', meaning: 'Hourly import at or above the 99th percentile.' },
        { term: 'Zero-reading hour (inactivity)', meaning: 'Hour with import, export and production all exactly 0 (possible outage).' },
        { term: 'Compute-to-Data (C2D)', meaning: 'The data stays with the provider; the algorithm runs next to it and only these output files are returned.' }
    ];

    const facts = {
        algorithm: 'Energy Anomaly Detector (anomalies_analytic.js)',
        generated_at: generatedAt.toISOString(),
        parameters: { algoCustomData_used: false, spike_rule: 'kwh_in > mean + 3*std_dev', high_rule: 'kwh_in >= p99', zero_rule: 'kwh_in == 0 && kwh_out == 0 && production == 0', net_export_rule: 'kwh_out > kwh_in' },
        inputs: inputLog.map((f) => ({ file: f.file, records: f.records || 0, error: f.error || null })),
        readings: n,
        supply_points: sps.length,
        communities: communities.length,
        supply_points_per_community: Object.fromEntries([...commSps].map(([c, l]) => [c, l.map((x) => 'SP ' + x)])),
        period: { first: firstTs || null, last: lastTs || null, days: days.length },
        busiest_day: topDays.length ? { day: topDays[0], import_kwh: r2(dayTotals.get(topDays[0])), runner_up: topDays[1] || null, runner_up_kwh: topDays.length > 1 ? r2(dayTotals.get(topDays[1])) : null } : null,
        quietest_day: topDays.length ? { day: topDays[topDays.length - 1], import_kwh: r2(dayTotals.get(topDays[topDays.length - 1])) } : null,
        top_supply_point_by_mean: spByMean.length ? { sp: 'SP ' + spIndex.get(spByMean[0].id), place_type: placeOf(spByMean[0].id) || null, mean_kwh_per_hour: r4(spByMean[0].sum / spByMean[0].n), total_kwh: r2(spByMean[0].sum) } : null,
        spike_readings: spikeRecs.slice(0, 10).map((r) => ({ sp: 'SP ' + spIndex.get(String(r.cups_id)), time: ts16(r.date), kwh_in: r2(r.kwh_in), record_id: r.id })),
        zero_reading_periods: zeroRuns.slice(0, 15).map((g) => ({ sp: 'SP ' + spIndex.get(String(g[0].cups_id)), from: ts16(g[0].date), to: ts16(g[g.length - 1].date), hours: g.length })),
        totals_kwh: { import: r2(sumIn), export: r2(sumOut), production: r2(sumProd) },
        kwh_in: { mean: st.mean, std_dev: st.std_dev, p01: st.percentiles.p01, p05: st.percentiles.p05, p95: st.percentiles.p95, p99: st.percentiles.p99 },
        spikes: { threshold_kwh: spikeThr, count: an.spikes.count, supply_points: spsWithSpike, sample_ids: an.spikes.sample_ids },
        zero_readings: { count: an.inactivity.count, percentage: an.inactivity.percentage, periods: zeroRuns.length, supply_points: spsWithZero },
        top1pct: { threshold_kwh: p99, count: an.high_consumption.count },
        net_export_hours: an.net_export_events.count,
        data_quality: { readings_without_timestamp: noDate, duplicate_readings: dupes, missing_hours: missingHours, negative_import: negIn, negative_export: negOut, night_production_readings: nightProd }
    };

    return contextDoc({
        title: 'Energy Anomaly Detector',
        summary: 'Energy Anomaly Detector is a Compute-to-Data algorithm of the Empower-X marketplace. It reads the hourly electricity meter readings of the supply points of one or more energy communities and flags unusual hours: consumption spikes (far above average), the top 1% highest-consumption hours, hours where the meter recorded nothing at all, and hours of net export to the grid. It returns overall statistics and counts (JSON) and a visual report (HTML) showing where and when the flagged hours occurred.',
        run, files, fields, method, results, limitations, questions, glossary, facts
    });
}

/* =========================
   HTML REPORT (presentation only; never changes the JSON)
   ========================= */

const RPT_COLOR = { normal: '#2563eb', spike: '#dc2626', zero: '#7c3aed', high: '#f59e0b', export: '#16a34a' };
const RPT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-03-05" -> "5 Mar 2026" (falls back to the raw text)
const rptDayLabel = (day, withYear = false) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day));
    if (!m) return String(day);
    return `${Number(m[3])} ${RPT_MONTHS[Number(m[2]) - 1] || m[2]}${withYear ? ' ' + m[1] : ''}`;
};

const rptStats = (values) => {
    if (!values.length) return null;
    let min = Infinity, max = -Infinity, sum = 0;
    values.forEach((v) => { if (v < min) min = v; if (v > max) max = v; sum += v; });
    return { min, max, mean: sum / values.length, p05: getPercentile(values, 0.05), p95: getPercentile(values, 0.95) };
};

function renderReport(result, records, jsonFile) {
    const st = result.statistics.kwh_in;
    const an = result.anomalies;
    const spikeThr = an.spikes.threshold;
    const p99 = an.high_consumption.threshold_p99;

    // Same rules as detectAnomalies(), re-applied per record for the charts.
    const flagsOf = (r) => ({
        spike: r.kwh_in > spikeThr,
        zero: r.kwh_in === 0 && r.kwh_out === 0 && r.production === 0,
        high: r.kwh_in >= p99,
        exp: r.net_usage < 0
    });

    // Supply points in order of appearance; masked ids can collide, so number them too.
    const spIndex = new Map();
    records.forEach((r) => { const k = String(r.cups_id); if (!spIndex.has(k)) spIndex.set(k, spIndex.size + 1); });
    const spName = (id) => `SP ${spIndex.get(String(id))} (${reportMaskId(id)})`;

    const perSp = new Map();   // id -> { values[], spike, zero, high, exp, days: Map(day -> kWh) }
    const perDay = new Map();  // day -> { kwh, spike, zero }
    const flagged = [];
    records.forEach((r) => {
        const f = flagsOf(r);
        const id = String(r.cups_id);
        if (!perSp.has(id)) perSp.set(id, { id: r.cups_id, values: [], spike: 0, zero: 0, high: 0, exp: 0, days: new Map() });
        const sp = perSp.get(id);
        sp.values.push(r.kwh_in);
        if (f.spike) sp.spike++;
        if (f.zero) sp.zero++;
        if (f.high) sp.high++;
        if (f.exp) sp.exp++;
        const day = r.date ? String(r.date).slice(0, 10) : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            if (!perDay.has(day)) perDay.set(day, { kwh: 0, spike: 0, zero: 0 });
            const d = perDay.get(day);
            d.kwh += r.kwh_in;
            if (f.spike) d.spike++;
            if (f.zero) d.zero++;
            sp.days.set(day, (sp.days.get(day) || 0) + r.kwh_in);
        }
        if (f.spike || f.zero || f.high) flagged.push({ r, f });
    });
    const sps = [...perSp.values()];
    const days = [...perDay.keys()].sort();
    const n = records.length;
    const firstDay = days[0], lastDay = days[days.length - 1];
    const period = days.length ? `${rptDayLabel(firstDay, true)} – ${rptDayLabel(lastDay, true)}` : 'unknown period';

    const sections = [];

    // ---- 1. Summary -----------------------------------------------------------
    sections.push(reportSection('Summary',
        reportKpis([
            { label: 'Hourly readings analysed', value: reportNum(n, 0), hint: `${sps.length} supply point${sps.length === 1 ? '' : 's'} · ${days.length} day${days.length === 1 ? '' : 's'}` },
            { label: 'Consumption spikes', value: reportNum(an.spikes.count, 0), unit: 'h', hint: `hours above ${reportNum(spikeThr)} kWh` },
            { label: 'Zero-reading hours', value: reportNum(an.inactivity.count, 0), unit: 'h', hint: `${an.inactivity.percentage} of all readings` },
            { label: 'Top 1% consumption hours', value: reportNum(an.high_consumption.count, 0), unit: 'h', hint: `at or above ${reportNum(p99)} kWh` },
            { label: 'Net export hours', value: reportNum(an.net_export_events.count, 0), unit: 'h', hint: 'more energy exported than imported' }
        ]),
        `Each hourly meter reading (energy imported from the grid, in kWh) is checked against simple statistical rules. Period: ${period}.`));

    // ---- 2. Anomaly types -----------------------------------------------------
    const typeItems = [
        { label: 'Consumption spikes', value: an.spikes.count, color: RPT_COLOR.spike },
        { label: 'Zero-reading hours', value: an.inactivity.count, color: RPT_COLOR.zero },
        { label: 'Top 1% consumption hours', value: an.high_consumption.count, color: RPT_COLOR.high },
        { label: 'Net export hours', value: an.net_export_events.count, color: RPT_COLOR.export }
    ];
    const typeTable = reportTable({
        title: 'What each type means',
        columns: [{ key: 'type', label: 'Type' }, { key: 'rule', label: 'Rule used' }, { key: 'meaning', label: 'What it may indicate' }],
        rows: [
            { type: 'Consumption spike', rule: `Hour with more than ${reportNum(spikeThr)} kWh imported (average + 3 × standard deviation)`, meaning: 'Faulty reading or an unusual load; worth checking' },
            { type: 'Zero-reading hour', rule: 'Hour with 0 kWh imported, 0 kWh exported and 0 kWh produced', meaning: 'Meter or data-communication outage, or a site switched off' },
            { type: 'Top 1% consumption hour', rule: `Hour with ${reportNum(p99)} kWh or more imported (99th percentile)`, meaning: 'Peak demand; high but not necessarily wrong' },
            { type: 'Net export hour', rule: 'Hour where exported energy exceeds imported energy', meaning: 'Usually local solar surplus; normal, listed for information' }
        ],
        limit: 10
    });
    // Net export is usually normal solar surplus and would drown the real anomalies, so it is left out here.
    // A spike is always also a top 1% hour; count it once (as a spike) so the stack is not double-counted.
    const spFlagged = (s) => s.spike + s.zero + (s.high - s.spike);
    const spWithFlags = sps.filter((s) => spFlagged(s) > 0);
    const spTop = spWithFlags.slice().sort((a, b) => spFlagged(b) - spFlagged(a)
        || spIndex.get(String(a.id)) - spIndex.get(String(b.id))).slice(0, 20);
    // One bar per supply point and type, with the count written next to it, so a single spike stays visible.
    const spBars = [];
    spTop.forEach((s) => {
        const sp = `SP ${spIndex.get(String(s.id))}`;
        if (s.spike) spBars.push({ label: `${sp} · spikes`, value: s.spike, color: RPT_COLOR.spike });
        if (s.zero) spBars.push({ label: `${sp} · zero readings`, value: s.zero, color: RPT_COLOR.zero });
        if (s.high - s.spike) spBars.push({ label: `${sp} · top 1%`, value: s.high - s.spike, color: RPT_COLOR.high });
    });
    const spChart = spBars.length ? reportHBarChart({
        title: 'Flagged hours per supply point',
        items: spBars.slice(0, 30), unit: 'h',
        note: `Only supply points with at least one spike, zero-reading or top 1% hour are shown (${spWithFlags.length} of ${sps.length}), most flagged first.` +
            (spWithFlags.length > spTop.length || spBars.length > 30 ? ' The list is cut off after the supply points with the most flagged hours.' : '') +
            ' Red = spikes, purple = zero readings, orange = top 1% hours that are not spikes. "SP n" numbers the supply points in the order they appear in the data (masked ids in the charts below). Net export hours are not included because they are usually normal solar surplus.'
    }) : reportFigure('Flagged hours per supply point', '<p class="empty">No supply point has a spike, zero-reading or top 1% hour.</p>');
    sections.push(reportSection('Anomaly types',
        reportHBarChart({ title: 'Number of flagged hours by type', items: typeItems, unit: 'h' }) + typeTable + spChart,
        'How many hourly readings fall into each category, what the categories mean, and where they occur.'));

    // ---- 3. Normal range and thresholds ----------------------------------------
    const all = rptStats(records.map((r) => r.kwh_in));
    const commItems = [
        { label: 'All hourly readings', low: st.percentiles.p05, high: st.percentiles.p95, mid: st.mean, midLabel: 'average', lowLabel: 'p05', highLabel: 'p95', color: RPT_COLOR.normal },
        { label: 'Top 1% starts at', mid: p99, midLabel: 'p99', color: RPT_COLOR.high },
        { label: 'Spike threshold', mid: spikeThr, midLabel: 'threshold', color: RPT_COLOR.spike }
    ];
    const spRange = sps.slice(0, 20).map((s) => {
        const x = rptStats(s.values);
        return { label: spName(s.id), low: x.p05, high: x.p95, mid: x.mean, midLabel: 'average', lowLabel: 'p05', highLabel: 'p95', color: s.spike ? RPT_COLOR.spike : RPT_COLOR.normal, peak: x.max, id: s.id };
    });
    const peakItems = spRange.map((it) => ({
        label: it.label, value: it.peak,
        color: it.peak > spikeThr ? RPT_COLOR.spike : it.peak >= p99 ? RPT_COLOR.high : RPT_COLOR.normal
    }));
    sections.push(reportSection('Normal range and thresholds',
        reportRangeChart({
            title: 'Hourly consumption across all supply points (kWh per hour)',
            items: commItems, unit: 'kWh',
            note: `Shaded box = normal band, where 90% of readings fall (p05 ${reportNum(st.percentiles.p05)} – p95 ${reportNum(st.percentiles.p95)} kWh); blue dot = average. Hours at or above the orange dot (${reportNum(p99)} kWh) are top 1% hours; hours above the red dot (${reportNum(spikeThr)} kWh) are spikes. All readings range from ${reportNum(all.min)} to ${reportNum(all.max)} kWh; the highest reading of each supply point is shown in the last chart of this section.`
        }) +
        reportRangeChart({
            title: 'Hourly consumption per supply point (kWh per hour)',
            items: spRange, unit: 'kWh',
            note: 'Shaded box = the normal band of that supply point (p05–p95), dot = its average. Red rows contain at least one consumption spike. The thresholds are computed over all supply points together, so large consumers reach them more easily than small ones.' +
                (sps.length > spRange.length ? ` Showing the first ${spRange.length} of ${sps.length} supply points.` : '')
        }) +
        reportHBarChart({
            title: 'Highest single-hour reading per supply point (kWh)',
            items: peakItems, unit: 'kWh',
            note: `Red = above the spike threshold (${reportNum(spikeThr)} kWh); orange = in the top 1% (${reportNum(p99)} kWh or more); blue = below both.`
        }),
        `The typical range of hourly consumption and the levels above which an hour is flagged. On average a supply point imports ${reportNum(st.mean)} kWh per hour (standard deviation ${reportNum(st.std_dev)} kWh).`));

    // ---- 4. Over time -----------------------------------------------------------
    if (days.length) {
        const both = days.some((d) => perDay.get(d).spike && perDay.get(d).zero);
        const dayCats = days.map((d) => rptDayLabel(d));
        const daily = reportBarChart({
            title: 'Total daily consumption of all supply points (kWh)',
            categories: dayCats,
            series: [
                { name: 'Day without spikes or zero readings', values: days.map((d) => (perDay.get(d).spike || perDay.get(d).zero ? 0 : perDay.get(d).kwh)), color: RPT_COLOR.normal },
                { name: 'Day with a consumption spike', values: days.map((d) => (perDay.get(d).spike ? perDay.get(d).kwh : 0)), color: RPT_COLOR.spike },
                { name: 'Day with zero-reading hours', values: days.map((d) => (!perDay.get(d).spike && perDay.get(d).zero ? perDay.get(d).kwh : 0)), color: RPT_COLOR.zero }
            ],
            unit: 'kWh', stacked: true,
            note: both ? 'Days with both a spike and zero readings are shown in red.' : ''
        });
        // Heatmap: each supply point's daily consumption relative to its own daily average.
        const singleMonth = String(firstDay).slice(0, 7) === String(lastDay).slice(0, 7);
        // Long periods: one column per week (average day of that week) keeps the heatmap readable and small.
        const weekly = days.length > 62;
        const dayMs = (d) => Date.parse(d + 'T00:00:00Z');
        const colOf = (d) => (weekly ? Math.floor((dayMs(d) - dayMs(firstDay)) / (7 * 86400000)) : days.indexOf(d));
        const colStarts = [];
        days.forEach((d) => { const c = colOf(d); if (colStarts[c] === undefined) colStarts[c] = d; });
        const nCols = weekly ? colStarts.length : days.length;
        const cols = Array.from({ length: nCols }, (_, c) => {
            const d = weekly ? colStarts[c] : days[c];
            if (!d) return '';
            return weekly ? `W${c + 1}` : singleMonth ? String(Number(d.slice(8, 10))) : d.slice(5);
        });
        const hmSps = sps.slice().sort((a, b) => (b.spike + b.zero) - (a.spike + a.zero) || spIndex.get(String(a.id)) - spIndex.get(String(b.id))).slice(0, 25)
            .sort((a, b) => spIndex.get(String(a.id)) - spIndex.get(String(b.id)));
        const hmValues = hmSps.map((s) => {
            const avg = s.days.size ? [...s.days.values()].reduce((a, b) => a + b, 0) / s.days.size : 0;
            const sum = new Array(nCols).fill(0), cnt = new Array(nCols).fill(0);
            s.days.forEach((kwh, d) => { const c = colOf(d); sum[c] += kwh; cnt[c]++; });
            return sum.map((v, c) => (cnt[c] && avg > 0 ? Math.round(v / cnt[c] / avg * 100) : null));
        });
        const heat = reportHeatmap({
            title: weekly
                ? 'Weekly consumption per supply point, as % of its own daily average (average day of each week)'
                : `Daily consumption per supply point, as % of its own daily average${singleMonth ? ` (${RPT_MONTHS[Number(firstDay.slice(5, 7)) - 1]} ${firstDay.slice(0, 4)}, day of month)` : ''}`,
            rows: hmSps.map((s) => `SP ${spIndex.get(String(s.id))}`), cols, values: hmValues, unit: '%',
            note: (weekly
                ? `Each column is a week: W1 starts on ${rptDayLabel(firstDay, true)}, W2 seven days later, and so on. Very light cells mean the supply point recorded little or nothing that week, e.g. a meter outage; dark cells are weeks well above its usual level.`
                : 'White cells (0%) mean the supply point recorded nothing that day, e.g. a meter outage; dark cells are days well above its usual level.') +
                ' Empty dashed cells have no data.' +
                (sps.length > hmSps.length ? ` Showing ${hmSps.length} of ${sps.length} supply points (those with the most spikes and zero readings).` : '')
        });
        sections.push(reportSection('Consumption over time', daily + heat,
            'Daily totals, with the days that contain spikes or zero readings highlighted, and which supply point was affected.'));
    }

    // ---- 5. Flagged records -----------------------------------------------------
    const typeText = (f) => [f.spike && 'Spike', f.zero && 'Zero reading', f.high && 'Top 1%'].filter(Boolean).join(', ');
    const timeText = (d) => (d ? String(d).replace('T', ' ').slice(0, 16) : '–');
    // Non-breaking space and word joiners keep a masked id on one line.
    const rowOf = ({ r, f }, extra = {}) => ({
        sp: spName(r.cups_id).replace(/ /g, '\u00a0').replace(/…/g, '\u2060…\u2060'), time: timeText(r.date), kwh_in: r.kwh_in, kwh_out: r.kwh_out, type: typeText(f), id: r.id, ...extra
    });
    const rows = [];
    flagged.filter((x) => x.f.spike).sort((a, b) => b.r.kwh_in - a.r.kwh_in).forEach((x) => rows.push(rowOf(x)));
    // Consecutive zero readings of one supply point are shown as one period.
    const zeros = flagged.filter((x) => x.f.zero && !x.f.spike)
        .sort((a, b) => String(a.r.cups_id).localeCompare(String(b.r.cups_id)) || String(a.r.date).localeCompare(String(b.r.date)));
    const hourMs = (d) => Date.parse(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    let run = null;
    const flush = () => {
        if (!run) return;
        const first = run[0].r, last = run[run.length - 1].r;
        rows.push(rowOf(run[0], {
            time: run.length > 1 ? `${timeText(first.date)} → ${timeText(last.date)}` : timeText(first.date),
            type: run.length > 1 ? `Zero reading (${run.length} h in a row)` : 'Zero reading',
            id: run.length > 1 ? `${first.id} – ${last.id}` : first.id
        }));
        run = null;
    };
    zeros.forEach((x) => {
        const prev = run && run[run.length - 1].r;
        if (prev && String(prev.cups_id) === String(x.r.cups_id) && hourMs(x.r.date) - hourMs(prev.date) === 3600000) run.push(x);
        else { flush(); run = [x]; }
    });
    flush();
    // Top 1% hours are high but usually legitimate: list only the highest few, so they do not crowd out the rest.
    const highOnly = flagged.filter((x) => x.f.high && !x.f.spike).sort((a, b) => b.r.kwh_in - a.r.kwh_in);
    const TABLE_MAX = 30, HIGH_MAX = 10;
    const fixedRows = rows.length;
    const highShown = Math.max(0, Math.min(highOnly.length, HIGH_MAX, TABLE_MAX - Math.min(fixedRows, TABLE_MAX)));
    highOnly.slice(0, highShown).forEach((x) => rows.push(rowOf(x)));
    const shownRows = rows.slice(0, TABLE_MAX);
    sections.push(reportSection('Flagged hours',
        reportTable({
            title: 'Spikes, zero-reading periods and highest-consumption hours',
            columns: [
                { key: 'sp', label: 'Supply point' }, { key: 'time', label: 'Time' },
                { key: 'kwh_in', label: 'Imported (kWh)', num: true }, { key: 'kwh_out', label: 'Exported (kWh)', num: true },
                { key: 'type', label: 'Type' }, { key: 'id', label: 'Record id' }
            ],
            rows: shownRows, limit: TABLE_MAX,
            note: 'Order: spikes, then zero-reading periods (consecutive hours merged into one row), then the top 1% hours from highest to lowest. Net export hours are not listed because they are usually normal solar surplus.' +
                (fixedRows > TABLE_MAX ? ` Showing the first ${TABLE_MAX} of ${fixedRows} spike and zero-reading rows.` : '') +
                (highOnly.length > highShown ? ` ${highShown ? `Only the ${highShown} highest` : 'None'} of the ${highOnly.length} top 1% hours that are not spikes ${highShown === 1 ? 'is' : 'are'} listed (see the per-supply-point chart above for all of them).` : '') +
                ' The JSON file contains the counts and thresholds, not the individual readings.'
        }),
        'The individual readings behind the counts above, so they can be checked on site or with the meter operator.'));

    return reportPage({
        title: 'Energy Anomaly Detector',
        subtitle: `Unusual hourly electricity readings · ${reportNum(n, 0)} readings from ${sps.length} supply point${sps.length === 1 ? '' : 's'} · ${period}`,
        sections,
        jsonFile
    });
}


const INPUT_DIR = process.env.INPUTS || "/data/inputs";
const OUTPUT_DIR = process.env.OUTPUTS || "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "anomalies_analysis.json");

/* =========================
   CORE LOGIC & UTILS
   ========================= */

const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Simple percentile calculation
const getPercentile = (values, p) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if ((sorted[base + 1] !== undefined)) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
};

const getMean = (values) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

const getStdDev = (values, mean) => {
    if (values.length < 2) return 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
};

/* =========================
   DATA PROCESSING
   ========================= */

// Schema mapping based on provided table structure:
const COL_IDX = {
    ID: 0,
    CUPS_ID: 3,
    INFO_DT: 5,
    KWH_IN: 6,
    KWH_OUT: 7,
    PRODUCTION: 14
};

const processFile = (filePath) => {
    console.log(`Processing file: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf8");
    
    try {
        const rawData = JSON.parse(content);
        let communities = [];
        if (rawData && rawData.data && Array.isArray(rawData.data)) {
            communities = rawData.data;
        } else if (Array.isArray(rawData)) {
            communities = rawData;
        } else if (rawData && rawData.communities && Array.isArray(rawData.communities)) {
            communities = rawData.communities;
        } else if (rawData && (rawData.id || rawData.name)) {
            communities = [rawData];
        }

        const records = [];
        communities.forEach(comm => {
            if (!comm || !comm.cups) return;
            comm.cups.forEach(cup => {
                const energyArray = cup.energy_hourly || cup.energyHourly || [];
                energyArray.forEach(h => {
                    const kwhIn = parseNum(h.kwhIn || h.kwh_in);
                    const kwhOut = parseNum(h.kwhOut || h.kwh_out);
                    records.push({
                        id: h.id, // Record ID
                        cups_id: h.cupsId || h.cups_id || cup.id,
                        date: h.infoDt || h.info_dt,
                        kwh_in: kwhIn,
                        kwh_out: kwhOut,
                        production: parseNum(h.production),
                        net_usage: kwhIn - kwhOut
                    });
                });
            });
        });
        return records;
    } catch (e) {
        // Fallback to CSV parsing
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
        const records = [];
        for (const line of lines) {
            const cols = line.split(",");
            if (cols.length < 7) continue; 

            // Skip header if present
            if (cols[COL_IDX.CUPS_ID] === "cups_id" || cols[COL_IDX.CUPS_ID] === "cupsId") continue;

            const kwhIn = parseNum(cols[COL_IDX.KWH_IN]);
            const kwhOut = parseNum(cols[COL_IDX.KWH_OUT]);
            records.push({
                id: cols[COL_IDX.ID],
                cups_id: cols[COL_IDX.CUPS_ID],
                date: cols[COL_IDX.INFO_DT],
                kwh_in: kwhIn,
                kwh_out: kwhOut,
                production: parseNum(cols[COL_IDX.PRODUCTION]),
                net_usage: kwhIn - kwhOut
            });
        }
        if (records.length > 0) {
            console.log(`  -> Successfully parsed as CSV (${records.length} records).`);
        }
        return records;
    }
};

const detectAnomalies = (records) => {
    if (records.length === 0) throw new Error("No records found to analyze.");

    // Extract series for statistical analysis
    const kwhInValues = records.map(r => r.kwh_in);
    const netUsageValues = records.map(r => r.net_usage);

    // 1. Distribution Analysis
    const meanIn = getMean(kwhInValues);
    const stdIn = getStdDev(kwhInValues, meanIn);
    
    const p01 = getPercentile(kwhInValues, 0.01);
    const p05 = getPercentile(kwhInValues, 0.05);
    const p95 = getPercentile(kwhInValues, 0.95);
    const p99 = getPercentile(kwhInValues, 0.99);

    console.log(`Stats (kWh In): Mean=${meanIn.toFixed(4)}, StdDev=${stdIn.toFixed(4)}`);
    console.log(`Percentiles: 1%=${p01}, 99%=${p99}`);

    // 2. Identification of Anomalies
    
    // Spikes: > Mean + 3*StdDev
    const spikeThreshold = meanIn + (3 * stdIn);
    const spikes = records.filter(r => r.kwh_in > spikeThreshold);

    // Zero Activity (Dead Sensors?) - e.g. imported and exported is 0
    const inactiveRecords = records.filter(r => r.kwh_in === 0 && r.kwh_out === 0 && r.production === 0);

    // Negative Net Usage (Exporting more than Importing - valid but interesting)
    const netExporters = records.filter(r => r.net_usage < 0);

    // Top 1% Consumers
    const top1PercentConsumers = records.filter(r => r.kwh_in >= p99);

    return {
        statistics: {
            kwh_in: {
                mean: meanIn,
                std_dev: stdIn,
                percentiles: { p01, p05, p95, p99 }
            }
        },
        anomalies: {
            spikes: {
                threshold: spikeThreshold,
                count: spikes.length,
                sample_ids: spikes.slice(0, 5).map(r => r.id)
            },
            inactivity: {
                count: inactiveRecords.length,
                percentage: (inactiveRecords.length / records.length * 100).toFixed(2) + "%"
            },
            high_consumption: {
                threshold_p99: p99,
                count: top1PercentConsumers.length
            },
            net_export_events: {
                count: netExporters.length
            }
        }
    };
};

/* =========================
   MAIN EXECUTION
   ========================= */

try {
    if (!fs.existsSync(INPUT_DIR)) {
        throw new Error(`Input directory ${INPUT_DIR} not found`);
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => !f.startsWith(".") && (f.endsWith(".json") || f.endsWith(".csv") || f.endsWith(".txt") || !f.includes(".")));
    
    console.log(`Found ${files.length} files in input directory.`);

    let allRecords = [];

    const inputLog = []; // for AI_CONTEXT.md only
    files.forEach(file => {
        try {
            const records = processFile(path.join(INPUT_DIR, file));
            allRecords = allRecords.concat(records);
            inputLog.push({ file, records: records.length });
        } catch (err) {
            console.error(`  -> Failed to read ${file}: ${err.message}`);
            inputLog.push({ file, records: 0, error: err.message });
        }
    });

    console.log(`Total records loaded: ${allRecords.length}. Finding anomalies...`);

    const result = detectAnomalies(allRecords);

    if (result && result.anomalies) {
        console.log("Anomaly Detection Summary:");
        console.log(`  Spikes Detected: ${result.anomalies.spikes.count}`);
        console.log(`  Inactive Intervals: ${result.anomalies.inactivity.count}`);
        console.log(`  High Consumers (Top 1%): ${result.anomalies.high_consumption.count}`);
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result || {}, null, 2));
    console.log(`\n✅ Anomalies analysis written to ${OUTPUT_FILE}`);
    reportWrite(fs, path.join(OUTPUT_DIR, "anomalies_analysis.html"), () => renderReport(result, allRecords, "anomalies_analysis.json"));
    contextWrite(fs, path.join(OUTPUT_DIR, CONTEXT_FILE), () => {
        let skipped = [];
        try { skipped = fs.readdirSync(INPUT_DIR).filter((f) => !files.includes(f)); } catch (e) {}
        return buildContext(result, allRecords, inputLog, skipped, new Date());
    });

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
