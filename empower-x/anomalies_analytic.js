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
// ===== END html-report =====

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

    files.forEach(file => {
        try {
            const records = processFile(path.join(INPUT_DIR, file));
            allRecords = allRecords.concat(records);
        } catch (err) {
            console.error(`  -> Failed to read ${file}: ${err.message}`);
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

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
