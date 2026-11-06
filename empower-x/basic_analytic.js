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
   HTML REPORT (presentation only; the JSON above is the result)
   ========================= */

const REPORT_TITLE = "Energy Consumption & Production Statistics";
const COLOR_IMPORT = "#2563eb";
const COLOR_PROD = "#16a34a";
const COLOR_EXPORT = "#f59e0b";

// Day ("YYYY-MM-DD") and hour of day (0-23) of a record timestamp, or null.
const reportTimeParts = (value) => {
    const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}))?/.exec(String(value === null || value === undefined ? "" : value).trim());
    if (!m) return null;
    const hour = m[2] === undefined ? null : Number(m[2]);
    return { day: m[1], hour: hour !== null && hour >= 0 && hour < 24 ? hour : null };
};

// In-memory aggregation for the charts (never written to the JSON).
const aggregateForReport = (records) => {
    let imported = 0, produced = 0, exported = 0;
    const days = new Map();
    const hourSums = Array.from({ length: 24 }, () => ({ imp: 0, prod: 0, exp: 0 }));
    const hourDays = Array.from({ length: 24 }, () => new Set());
    const points = new Map();
    records.forEach((r) => {
        imported += r.kwh_in;
        produced += r.production;
        exported += r.kwh_out;
        const key = String(r.cups_id);
        if (!points.has(key)) points.set(key, { id: key, imp: 0, prod: 0, exp: 0 });
        const p = points.get(key);
        p.imp += r.kwh_in; p.prod += r.production; p.exp += r.kwh_out;
        const t = reportTimeParts(r.date);
        if (!t) return;
        if (!days.has(t.day)) days.set(t.day, { imp: 0, prod: 0, exp: 0 });
        const d = days.get(t.day);
        d.imp += r.kwh_in; d.prod += r.production; d.exp += r.kwh_out;
        if (t.hour !== null) {
            const h = hourSums[t.hour];
            h.imp += r.kwh_in; h.prod += r.production; h.exp += r.kwh_out;
            hourDays[t.hour].add(t.day);
        }
    });
    const dayKeys = [...days.keys()].sort();
    const profile = hourSums.map((h, i) => {
        const n = hourDays[i].size;
        return n ? { imp: h.imp / n, prod: h.prod / n, exp: h.exp / n } : null;
    });
    // Locally produced energy that was used on site (production minus what was exported).
    const selfUsed = Math.max(0, produced - exported);
    const consumption = imported + selfUsed;
    return {
        imported, produced, exported, selfUsed, consumption,
        selfSufficiency: consumption > 0 ? (selfUsed / consumption) * 100 : null,
        dayKeys, days, profile,
        hasProfile: profile.some((p) => p !== null),
        points: [...points.values()].sort((a, b) => b.imp - a.imp)
    };
};

function renderReport(stats, records) {
    const agg = aggregateForReport(records);
    const imp = stats.energy.imported;
    const prod = stats.energy.production;
    const period = agg.dayKeys.length
        ? (agg.dayKeys.length === 1 ? agg.dayKeys[0] : `${agg.dayKeys[0]} to ${agg.dayKeys[agg.dayKeys.length - 1]}`)
        : "";
    const subtitle = [
        period ? `Period ${period}` : "",
        `${reportNum(stats.uniqueSensors, 0)} supply points`,
        `${reportNum(stats.totalRecords, 0)} hourly readings`
    ].filter(Boolean).join(" · ");
    const sections = [];
    // Whole kWh for the community totals (as in the KPI tiles), one decimal per supply point.
    const r0 = (v) => Math.round(v);
    const r1 = (v) => Math.round(v * 10) / 10;

    sections.push(reportSection("Key figures",
        reportKpis([
            { label: "Energy imported from the grid", value: reportNum(imp.total, 0), unit: "kWh", hint: "Sum of all readings" },
            { label: "Energy produced locally", value: reportNum(prod.total, 0), unit: "kWh", hint: "Solar / local generation" },
            { label: "Self-sufficiency", value: agg.selfSufficiency === null ? "–" : reportNum(agg.selfSufficiency, 1), unit: "%", hint: "Share of consumption covered by own production" },
            { label: "Supply points", value: reportNum(stats.uniqueSensors, 0), hint: "Distinct meters (CUPS)" },
            { label: "Readings analysed", value: reportNum(stats.totalRecords, 0), hint: `${reportNum(stats.uniqueTimestamps, 0)} distinct time steps` }
        ]),
        "The headline numbers of this analysis, taken from the result file."));

    sections.push(reportSection("Imported vs produced energy",
        reportHBarChart({
            title: "Total energy by flow",
            unit: "kWh",
            items: [
                { label: "Imported from grid", value: r0(agg.imported), color: COLOR_IMPORT },
                { label: "Produced locally", value: r0(agg.produced), color: COLOR_PROD },
                { label: "Exported to grid", value: r0(agg.exported), color: COLOR_EXPORT }
            ],
            note: "Exported energy is the part of local production that was not used on site."
        }) +
        reportDonut({
            title: "Where the consumed energy came from",
            unit: "kWh",
            slices: [
                { label: "Bought from the grid", value: r0(agg.imported), color: COLOR_IMPORT },
                { label: "Own production used on site", value: r0(agg.selfUsed), color: COLOR_PROD }
            ],
            note: "Consumption = imported + (produced − exported). Self-sufficiency is the green share."
        }),
        "How much energy came from the grid compared with what the supply points generated themselves."));

    sections.push(reportSection("Typical hourly readings",
        reportRangeChart({
            title: "Lowest, average and highest single hourly reading (kWh)",
            unit: "kWh",
            items: [
                { label: "Imported from grid", min: imp.min, max: imp.max, mid: imp.avg, midLabel: "avg", color: COLOR_IMPORT },
                { label: "Produced locally", min: prod.min, max: prod.max, mid: prod.avg, midLabel: "avg", color: COLOR_PROD }
            ],
            note: `Dot = average (imported ${reportNum(imp.avg, 2)} kWh, produced ${reportNum(prod.avg, 2)} kWh); whiskers = minimum and maximum. One reading = one supply point during one hour.`
        }),
        "How large one reading (one supply point during one hour) typically is, and its extremes."));

    if (agg.dayKeys.length) {
        sections.push(reportSection("Daily energy",
            reportLineChart({
                title: "Energy per day, all supply points together",
                unit: "kWh",
                labels: agg.dayKeys,
                series: [
                    { name: "Imported from grid", values: agg.dayKeys.map((d) => agg.days.get(d).imp), color: COLOR_IMPORT },
                    { name: "Produced locally", values: agg.dayKeys.map((d) => agg.days.get(d).prod), color: COLOR_PROD, area: true },
                    { name: "Exported to grid", values: agg.dayKeys.map((d) => agg.days.get(d).exp), color: COLOR_EXPORT }
                ]
            }),
            "Daily totals show trends, weekends and sunny or cloudy days."));
    }

    if (agg.hasProfile) {
        const hours = agg.profile.map((_, h) => `${String(h).padStart(2, "0")}:00`);
        const pick = (k) => agg.profile.map((p) => (p ? p[k] : null));
        sections.push(reportSection("Average day (24-hour profile)",
            reportLineChart({
                title: "Average energy per hour of the day, all supply points together",
                unit: "kWh",
                labels: hours,
                series: [
                    { name: "Imported from grid", values: pick("imp"), color: COLOR_IMPORT },
                    { name: "Produced locally", values: pick("prod"), color: COLOR_PROD, area: true },
                    { name: "Exported to grid", values: pick("exp"), color: COLOR_EXPORT }
                ],
                note: "Each point is the total of all supply points for that hour, averaged over the days in the data."
            }),
            "When during the day energy is bought from the grid and when it is produced."));
    }

    if (agg.points.length) {
        const top = agg.points.slice(0, 10);
        const name = (p, i) => `${i + 1}. ${reportMaskId(p.id)}`;
        const MASK_NOTE = "Supply-point ids are shortened for privacy; different supply points can share the same shortened id, the rank number tells them apart.";
        sections.push(reportSection("Largest consumers",
            reportHBarChart({
                title: `Top ${top.length} supply points by energy imported from the grid`,
                unit: "kWh",
                color: COLOR_IMPORT,
                items: top.map((p, i) => ({ label: name(p, i), value: r1(p.imp) }))
            }) +
            reportTable({
                title: "Details of these supply points",
                columns: [
                    { key: "point", label: "Supply point" },
                    { key: "imp", label: "Imported (kWh)", num: true },
                    { key: "prod", label: "Produced (kWh)", num: true },
                    { key: "exp", label: "Exported (kWh)", num: true },
                    { key: "self", label: "Self-sufficiency (%)", num: true }
                ],
                rows: top.map((p, i) => {
                    const used = Math.max(0, p.prod - p.exp);
                    const cons = p.imp + used;
                    return { point: name(p, i), imp: r1(p.imp), prod: r1(p.prod), exp: r1(p.exp), self: cons > 0 ? r1((used / cons) * 100) : null };
                }),
                note: agg.points.length > top.length
                    ? `${agg.points.length - top.length} smaller supply points are not shown. ${MASK_NOTE}`
                    : MASK_NOTE
            }),
            "Where the most grid energy is used, as a starting point for savings or new solar capacity."));
    }

    return reportPage({ title: REPORT_TITLE, subtitle, sections, jsonFile: path.basename(OUTPUT_FILE) });
}

const INPUT_DIR = process.env.INPUTS || "/data/inputs";
const OUTPUT_DIR = process.env.OUTPUTS || "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "basic_analysis.json");

/* =========================
   CORE LOGIC
   ========================= */

const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Schema mapping based on provided table structure:
// 0: id, 1: created_dt, 2: updated_dt, 3: cups_id, 4: origin, 5: info_dt, 
// 6: kwh_in, 7: kwh_out, 8: kwh_in_virtual, 9: kwh_out_virtual, 
// 10: kwh_in_price, 11: kwh_out_price, 12: kwh_in_price_community, 
// 13: kwh_out_price_community, 14: production, 15: battery, 16: shares, 17: hour_type_range
const COL_IDX = {
    CUPS_ID: 3,
    INFO_DT: 5,
    KWH_IN: 6,
    KWH_OUT: 7,
    PRODUCTION: 14,
    BATTERY: 15
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
                    records.push({
                        cups_id: h.cupsId || h.cups_id || cup.id,
                        date: h.infoDt || h.info_dt,
                        kwh_in: parseNum(h.kwhIn || h.kwh_in),
                        kwh_out: parseNum(h.kwhOut || h.kwh_out),
                        production: parseNum(h.production),
                        battery: parseNum(h.battery)
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

            records.push({
                cups_id: cols[COL_IDX.CUPS_ID],
                date: cols[COL_IDX.INFO_DT],
                kwh_in: parseNum(cols[COL_IDX.KWH_IN]),
                kwh_out: parseNum(cols[COL_IDX.KWH_OUT]),
                production: parseNum(cols[COL_IDX.PRODUCTION]),
                battery: parseNum(cols[COL_IDX.BATTERY])
            });
        }
        if (records.length > 0) {
            console.log(`  -> Successfully parsed as CSV (${records.length} records).`);
        }
        return records;
    }
};

const calculateStats = (records) => {
    if (records.length === 0) throw new Error("No records found to analyze.");

    let minKwhIn = Infinity;
    let maxKwhIn = -Infinity;
    let sumKwhIn = 0;
    let minProd = Infinity;
    let maxProd = -Infinity;
    let sumProd = 0;

    const cupsIds = new Set();
    const dates = new Set();

    records.forEach(r => {
        cupsIds.add(r.cups_id);
        dates.add(r.date);

        // Kwh In
        if (r.kwh_in < minKwhIn) minKwhIn = r.kwh_in;
        if (r.kwh_in > maxKwhIn) maxKwhIn = r.kwh_in;
        sumKwhIn += r.kwh_in;

        // Production
        if (r.production < minProd) minProd = r.production;
        if (r.production > maxProd) maxProd = r.production;
        sumProd += r.production;
    });

    return {
        totalRecords: records.length,
        uniqueSensors: cupsIds.size,
        uniqueTimestamps: dates.size,
        energy: {
            imported: {
                total: sumKwhIn,
                avg: sumKwhIn / records.length,
                min: minKwhIn,
                max: maxKwhIn
            },
            production: {
                total: sumProd,
                avg: sumProd / records.length,
                min: minProd,
                max: maxProd
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
        const p = path.join(INPUT_DIR, file);
        try {
            const records = processFile(p);
            allRecords = allRecords.concat(records);
            console.log(`  -> Loaded ${records.length} records from ${file}`);
        } catch (err) {
            console.error(`  -> Failed to read ${file}: ${err.message}`);
        }
    });

    console.log(`Total records loaded: ${allRecords.length}`);
    console.log("Running statistical analysis...");

    const stats = calculateStats(allRecords);

    if (stats) {
        console.log("Analysis Result Summary:");
        console.log(`  Sensors: ${stats.uniqueSensors}`);
        console.log(`  Total Energy In: ${stats.energy.imported.total.toFixed(2)} kWh`);
        console.log(`  Avg Energy In: ${stats.energy.imported.avg.toFixed(4)} kWh`);
    } else {
        console.log("No valid data found to analyze.");
    }

    // Write ONLY the result object to output file (no debug logs)
    if (!fs.existsSync(OUTPUT_DIR)) {
        // Create it if it doesn't exist? usually VM provides it. 
        // We'll try to create it just in case, or fail if permissions deny.
        try {
            fs.mkdirSync(OUTPUT_DIR, {recursive: true});
        } catch (e) {
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats || {}, null, 2));
    console.log(`\n✅ Result successfully written to ${OUTPUT_FILE}`);
    reportWrite(fs, path.join(OUTPUT_DIR, "basic_analysis.html"), () => renderReport(stats, allRecords));

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
