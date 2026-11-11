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

// How the last file was read (used only for AI_CONTEXT.md, never for the results).
let lastParseInfo = null;

const processFile = (filePath) => {
    console.log(`Processing file: ${filePath}`);
    lastParseInfo = null;
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
        lastParseInfo = { format: "JSON", communities: [], cupsEntries: 0 };
        communities.forEach(comm => {
            if (!comm || !comm.cups) return;
            if (lastParseInfo) {
                try {
                    const n = Array.isArray(comm.cups) ? comm.cups.length : 0;
                    // Context only: which reading ids belong to this community, and each supply point's place type.
                    const ids = new Set();
                    const placeTypes = {};
                    (Array.isArray(comm.cups) ? comm.cups : []).forEach((cup) => {
                        if (!cup) return;
                        const pt = cup.place_type || cup.placeType || null;
                        const arr = cup.energy_hourly || cup.energyHourly || [];
                        const own = new Set();
                        if (Array.isArray(arr)) arr.forEach((h) => { if (h) own.add(String(h.cupsId || h.cups_id || cup.id)); });
                        if (cup.id !== undefined) own.add(String(cup.id));
                        own.forEach((id) => {
                            ids.add(id);
                            if (pt && !(id in placeTypes)) placeTypes[id] = String(pt);
                        });
                    });
                    lastParseInfo.communities.push({ id: comm.id, name: comm.name, cups: n, ids, placeTypes });
                    lastParseInfo.cupsEntries += n;
                } catch (e) { /* context bookkeeping must never affect the results */ }
            }
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
        lastParseInfo = { format: "CSV", lines: lines.length, shortLines: 0, headerLines: 0 };
        for (const line of lines) {
            const cols = line.split(",");
            if (cols.length < 7) { lastParseInfo.shortLines++; continue; }

            // Skip header if present
            if (cols[COL_IDX.CUPS_ID] === "cups_id" || cols[COL_IDX.CUPS_ID] === "cupsId") { lastParseInfo.headerLines++; continue; }

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
   AI CONTEXT (AI_CONTEXT.md; description only, the JSON above is the result)
   ========================= */

// Plain number for the context text: at most `d` decimals, no thousands separators.
const ctxNum = (v, d = 3) => {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return "n/a";
    return String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d));
};

function buildContext(stats, records, fileLog) {
    const agg = aggregateForReport(records);
    const imp = stats.energy.imported;
    const prod = stats.energy.production;
    const generatedAt = new Date().toISOString();
    const jsonName = path.basename(OUTPUT_FILE);
    const htmlName = "basic_analysis.html";
    let htmlWritten = false;
    try { htmlWritten = fs.existsSync(path.join(OUTPUT_DIR, htmlName)); } catch (e) { htmlWritten = false; }

    // ---- input files ----
    const usedFiles = fileLog.filter((f) => f.records > 0);
    const emptyFiles = fileLog.filter((f) => !f.error && f.records === 0);
    const failedFiles = fileLog.filter((f) => f.error);
    const fileDesc = (f) => {
        if (f.error) return `${f.file}: could not be read (${f.error}); skipped`;
        const i = f.info || {};
        let how = i.format ? `read as ${i.format}` : "read";
        if (i.format === "JSON") how += `, ${i.communities.length} communities, ${i.cupsEntries} supply-point entries`;
        if (i.format === "CSV") how += `, ${i.lines} non-empty lines (${i.headerLines} header, ${i.shortLines} with fewer than 7 columns skipped)`;
        const why = f.records === 0
            ? (f.file === "algoCustomData.json" ? " (this is the job's parameter file, it holds no energy data)" : " (no usable energy readings found)")
            : "";
        return `${f.file}: ${f.records} readings, ${how}${why}`;
    };
    const communities = [];
    fileLog.forEach((f) => {
        if (f.info && f.info.format === "JSON") f.info.communities.forEach((c) => communities.push(c));
    });

    // ---- data checks (computed from the same records) ----
    let negatives = 0, nightProd = 0, noDate = 0, noHour = 0, bothInOut = 0, batteryNonZero = 0;
    const pairSeen = new Set();
    let duplicates = 0;
    const hoursSeen = new Set();
    records.forEach((r) => {
        if (r.kwh_in < 0 || r.kwh_out < 0 || r.production < 0) negatives++;
        if (r.battery !== 0) batteryNonZero++;
        if (r.kwh_in > 0 && r.kwh_out > 0) bothInOut++;
        const key = `${r.cups_id}|${r.date}`;
        if (pairSeen.has(key)) duplicates++; else pairSeen.add(key);
        const t = reportTimeParts(r.date);
        if (!t) { noDate++; return; }
        if (t.hour === null) { noHour++; return; }
        hoursSeen.add(t.hour);
        if (r.production > 0 && (t.hour < 6 || t.hour >= 22)) nightProd++;
    });
    const points = agg.points; // sorted by imported, descending
    const pointsWithProd = points.filter((p) => p.prod > 0).length;
    const pointsWithExport = points.filter((p) => p.exp > 0).length;
    const pointsNoImport = points.filter((p) => p.imp === 0).length;
    const firstDay = agg.dayKeys[0] || null;
    const lastDay = agg.dayKeys.length ? agg.dayKeys[agg.dayKeys.length - 1] : null;
    const period = firstDay ? (firstDay === lastDay ? firstDay : `${firstDay} to ${lastDay}`) : "unknown (no parsable timestamps)";
    const readingsPerPoint = stats.uniqueSensors ? stats.totalRecords / stats.uniqueSensors : 0;
    const selfSuff = agg.selfSufficiency;
    const top = points.slice(0, 5);
    const pointSelf = (p) => {
        const used = Math.max(0, p.prod - p.exp);
        const cons = p.imp + used;
        return cons > 0 ? (used / cons) * 100 : null;
    };
    const peakDay = agg.dayKeys.length ? agg.dayKeys.reduce((a, d) => (agg.days.get(d).imp > agg.days.get(a).imp ? d : a), agg.dayKeys[0]) : null;
    const peakHour = agg.hasProfile
        ? agg.profile.reduce((best, p, h) => (p && (best === null || p.imp > agg.profile[best].imp) ? h : best), null)
        : null;
    const peakProdHour = agg.hasProfile && prod.total > 0
        ? agg.profile.reduce((best, p, h) => (p && (best === null || p.prod > agg.profile[best].prod) ? h : best), null)
        : null;
    const hh = (h) => `${String(h).padStart(2, "0")}:00`;

    // ---- completeness: readings per supply point ----
    const perPointCount = new Map();
    records.forEach((r) => { const k = String(r.cups_id); perPointCount.set(k, (perPointCount.get(k) || 0) + 1); });
    const countVals = [...perPointCount.values()];
    const minPerPoint = countVals.length ? Math.min(...countVals) : 0;
    const maxPerPoint = countVals.length ? Math.max(...countVals) : 0;
    const completeSeries = countVals.length > 0 && minPerPoint === maxPerPoint && maxPerPoint === stats.uniqueTimestamps && duplicates === 0;

    // ---- communities: which supply point belongs where ----
    const multiComm = communities.length > 1;
    const scopeTxt = multiComm ? `${communities.length === 2 ? "both" : "all " + communities.length} communities pooled together` : (communities.length === 1 ? "the community" : "all supply points together");
    const pointComm = new Map();
    communities.forEach((c) => { (c.ids ? [...c.ids] : []).forEach((id) => { if (!pointComm.has(id)) pointComm.set(id, c.id || c.name || "?"); }); });

    // ---- ranked supply points with masked ids and collision notes ----
    const ranked = points.map((p, i) => ({ ...p, rank: i + 1, mask: reportMaskId(p.id), self: pointSelf(p), comm: pointComm.get(p.id) || null }));
    const maskRanks = new Map();
    ranked.forEach((p) => { if (!maskRanks.has(p.mask)) maskRanks.set(p.mask, []); maskRanks.get(p.mask).push(p.rank); });
    const sameMaskNote = (p) => {
        const others = maskRanks.get(p.mask).filter((r) => r !== p.rank);
        if (!others.length) return "";
        return ` [NOT the same meter as rank ${others.slice(0, 6).join(", ")}${others.length > 6 ? ` and ${others.length - 6} more` : ""}, which share this masked id]`;
    };
    const pctTxt = (v) => (v === null ? "n/a" : ctxNum(v, 1) + " %");
    const pointLine = (p) => `rank ${p.rank}, ${p.mask}${p.comm && multiComm ? `, community ${p.comm}` : ""}: imported ${ctxNum(p.imp, 1)} kWh, produced ${ctxNum(p.prod, 1)} kWh, exported ${ctxNum(p.exp, 1)} kWh, self-sufficiency ${pctTxt(p.self)}${sameMaskNote(p)}`;
    const top10 = ranked.slice(0, 10);
    const hidden = ranked.slice(10);
    const distinctMasksTop10 = new Set(top10.map((p) => p.mask)).size;
    const distinctMasksAll = maskRanks.size;
    const producers = ranked.filter((p) => p.prod > 0);
    const exporters = ranked.filter((p) => p.exp > 0);
    const withSelf = ranked.filter((p) => p.self !== null && p.self > 0);
    const bySelf = withSelf.slice().sort((a, b) => b.self - a.self);
    const mostSelf = bySelf[0] || null;
    const byProd = producers.slice().sort((a, b) => b.prod - a.prod);
    const sumOf = (arr, k) => arr.reduce((s, p) => s + p[k], 0);
    const rankList = (arr, max = 20) => arr.length ? arr.slice(0, max).map((p) => p.rank).join(", ") + (arr.length > max ? ` and ${arr.length - max} more` : "") : "none";

    // ---- per-community breakdown ----
    const commStats = communities.map((c) => {
        const mem = ranked.filter((p) => c.ids && c.ids.has(p.id));
        const imported = sumOf(mem, "imp"), produced = sumOf(mem, "prod"), exported = sumOf(mem, "exp");
        const used = Math.max(0, produced - exported);
        const placeTypes = {};
        mem.forEach((p) => { const t = c.placeTypes && c.placeTypes[p.id]; if (t) placeTypes[t] = (placeTypes[t] || 0) + 1; });
        return { id: c.id || "?", name: c.name || "", points: mem.length, imported, produced, exported, self: imported + used > 0 ? (used / (imported + used)) * 100 : null, placeTypes };
    });
    const unassigned = ranked.filter((p) => !p.comm);

    // ---- daily ranking and weekday pattern ----
    const weekdayName = (d) => { const t = Date.parse(d + "T00:00:00Z"); return Number.isFinite(t) ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(t).getUTCDay()] : "?"; };
    const daysByImp = agg.dayKeys.map((d) => ({ d, imp: agg.days.get(d).imp, prod: agg.days.get(d).prod, exp: agg.days.get(d).exp })).sort((a, b) => b.imp - a.imp);
    const lowDay = daysByImp.length ? daysByImp[daysByImp.length - 1] : null;
    const nearTie = daysByImp.length > 1 && daysByImp[0].imp > 0 && (daysByImp[0].imp - daysByImp[1].imp) / daysByImp[0].imp < 0.005;
    const dayTxt = (x) => `${x.d} (${weekdayName(x.d)}) ${ctxNum(x.imp, 1)} kWh`;
    let wkAvg = null, weAvg = null;
    if (agg.dayKeys.length >= 7) {
        const wk = daysByImp.filter((x) => !["Saturday", "Sunday"].includes(weekdayName(x.d)));
        const we = daysByImp.filter((x) => ["Saturday", "Sunday"].includes(weekdayName(x.d)));
        if (wk.length && we.length) { wkAvg = sumOf(wk, "imp") / wk.length; weAvg = sumOf(we, "imp") / we.length; }
    }
    const prodDays = daysByImp.filter((x) => x.prod > 0).sort((a, b) => b.prod - a.prod);

    // ---- profile oddities / synthetic-looking data ----
    const profileNotes = [];
    let symmetricProd = false;
    if (peakProdHour !== null) {
        let pairs = 0, equal = 0;
        for (let k = 1; k <= 11; k++) {
            const a = agg.profile[peakProdHour - k], b = agg.profile[peakProdHour + k];
            if (!a || !b || (a.prod <= 0 && b.prod <= 0)) continue;
            pairs++;
            if (Math.abs(a.prod - b.prod) <= 1e-6 * Math.max(a.prod, b.prod, 1)) equal++;
        }
        symmetricProd = pairs >= 3 && equal === pairs;
        if (symmetricProd) profileNotes.push(`The average production profile is exactly symmetric around ${hh(peakProdHour)} (e.g. ${hh(peakProdHour - 1)} and ${hh(peakProdHour + 1)} have identical values). Real solar data is never this regular; the production values look generated or idealised.`);
    }
    const importDips = [];
    if (agg.hasProfile) {
        for (let h = 1; h < 23; h++) {
            const a = agg.profile[h - 1], b = agg.profile[h], c = agg.profile[h + 1];
            if (!a || !b || !c) continue;
            const nb = (a.imp + c.imp) / 2;
            if (nb > 0 && b.imp < 0.7 * nb) importDips.push(`${hh(h)} (${ctxNum(b.imp, 1)} kWh vs about ${ctxNum(nb, 1)} kWh at the hours around it)`);
        }
        if (importDips.length) profileNotes.push(`Unexplained dip(s) in average grid import at ${importDips.join("; ")}. The data gives no reason (no occupancy, weather or tariff data); it may be an artefact of how the data was generated or recorded.`);
    }
    const sampleNames = fileLog.filter((f) => f.records > 0 && /sample|synthetic|demo|test|fake|mock|dummy/i.test(f.file)).map((f) => f.file);
    const possiblySynthetic = sampleNames.length > 0 || symmetricProd;

    // ---- section 2: this run ----
    const run = [
        { label: "Marketplace / data space", value: "Empower-X (Compute-to-Data job)" },
        { label: "Algorithm", value: `${REPORT_TITLE} (file basic_analytic.js); no version number is recorded in the code` },
        { label: "Generated at", value: `${generatedAt} (UTC)` },
        { label: "Input files found", value: `${fileLog.length} (${fileLog.map((f) => f.file).join(", ") || "none"})` },
        ...fileLog.slice(0, 20).map((f) => ({ label: "Input file", value: fileDesc(f) })),
        ...(fileLog.length > 20 ? [{ label: "Input file", value: `${fileLog.length - 20} more files not listed` }] : []),
        { label: "Files that contributed readings", value: `${usedFiles.length}` },
        { label: "Files skipped / with no readings", value: `${emptyFiles.length + failedFiles.length}` },
        { label: "Communities found (JSON inputs)", value: communities.length ? `${communities.length}: ` + communities.slice(0, 10).map((c) => `${c.id || "?"} "${c.name || ""}" (${c.cups} supply points)`).join("; ") + (communities.length > 10 ? `; ${communities.length - 10} more` : "") : "none (CSV input or no community wrapper)" },
        { label: "Readings analysed (totalRecords)", value: `${stats.totalRecords}` },
        { label: "Distinct supply points (uniqueSensors)", value: `${stats.uniqueSensors}` },
        { label: "Distinct timestamps (uniqueTimestamps)", value: `${stats.uniqueTimestamps}` },
        { label: "Average readings per supply point", value: `${ctxNum(readingsPerPoint, 1)} (min ${minPerPoint}, max ${maxPerPoint})` + (completeSeries ? `; every supply point has exactly one reading for each of the ${stats.uniqueTimestamps} timestamps, so the series are complete (no gaps, no duplicates)` : "; supply points do NOT all have one reading per timestamp (gaps or extras, see section 7)") },
        { label: "Scope of all figures", value: multiComm ? `${communities.length === 2 ? "Both" : "All " + communities.length} communities are POOLED: every total, average, chart and ranking covers all of them together, not one community. Per-community totals are in section 6 (this file only).` : (communities.length === 1 ? "One community." : "All supply points together (no community grouping in the input).") },
        { label: "Period covered", value: `${period} (${agg.dayKeys.length} calendar days with data; ${hoursSeen.size} distinct hours of day present)` },
        { label: "Parameters", value: "None. This algorithm takes no parameters; algoCustomData.json (if present) is not read as settings, it is only scanned like any other input file and normally yields 0 readings." }
    ];

    // ---- section 3: files ----
    const files = [
        { file: jsonName, format: "JSON", contents: "The result: record and supply-point counts plus total, average, minimum and maximum of imported and produced energy. Values are not rounded." }
    ];
    if (htmlWritten) files.push({ file: htmlName, format: "HTML (self-contained, open in a browser)", contents: "Charts and tables for people: key figures, imported vs produced vs exported energy, self-sufficiency donut, range of single readings, daily totals, average 24-hour profile, top 10 supply points by grid import. Rounded for display; supply-point ids masked." });

    // ---- section 4: fields ----
    const F = (file, field, type, unit, meaning) => ({ file, field, type, unit, meaning });
    const fields = [
        F(jsonName, "totalRecords", "integer", "readings", "Number of readings analysed (one reading = one supply point in one time step, normally one hour), summed over all input files."),
        F(jsonName, "uniqueSensors", "integer", "supply points", "Number of distinct supply-point ids (CUPS) among the readings."),
        F(jsonName, "uniqueTimestamps", "integer", "time steps", "Number of distinct timestamp texts (info_dt) among the readings, over all supply points together (for hourly data: number of hours covered)."),
        F(jsonName, "energy", "object", "", "Container with the two energy flows below."),
        F(jsonName, "energy.imported", "object", "", "Statistics of kwh_in: electricity taken from the grid."),
        F(jsonName, "energy.imported.total", "number", "kWh", "Sum of kwh_in over all readings = total energy imported from the grid by all supply points in the period."),
        F(jsonName, "energy.imported.avg", "number", "kWh per reading", "total / totalRecords = average grid import of one supply point in one hour (not per day, not per supply point)."),
        F(jsonName, "energy.imported.min", "number", "kWh", "Smallest single reading of kwh_in."),
        F(jsonName, "energy.imported.max", "number", "kWh", "Largest single reading of kwh_in (one supply point, one hour)."),
        F(jsonName, "energy.production", "object", "", "Statistics of production: electricity generated locally (solar)."),
        F(jsonName, "energy.production.total", "number", "kWh", "Sum of production over all readings."),
        F(jsonName, "energy.production.avg", "number", "kWh per reading", "total / totalRecords (night hours with 0 production are included in the average)."),
        F(jsonName, "energy.production.min", "number", "kWh", "Smallest single production reading."),
        F(jsonName, "energy.production.max", "number", "kWh", "Largest single production reading.")
    ];
    if (htmlWritten) {
        fields.push(
            F(htmlName, "Key figures tiles", "text", "kWh, %, count", "Imported (whole kWh), produced (whole kWh), self-sufficiency (1 decimal %), supply points, readings analysed and distinct time steps."),
            F(htmlName, "Total energy by flow (bar chart)", "number", "kWh", "Imported, produced and exported totals, rounded to whole kWh. Exported (sum of kwh_out) appears ONLY in the HTML, not in the JSON."),
            F(htmlName, "Where the consumed energy came from (donut)", "number", "kWh", "Bought from the grid = imported; own production used on site = max(0, produced - exported); whole kWh."),
            F(htmlName, "Typical hourly readings (range chart)", "number", "kWh", "Min, average, max of a single reading for imported and produced; same values as energy.*.min/avg/max in the JSON."),
            F(htmlName, "Energy per day (line chart)", "number", "kWh per day", "Daily totals of imported, produced and exported, all supply points together (only if timestamps have a date). With more than 240 days, points are averaged into buckets."),
            F(htmlName, "Average day / 24-hour profile (line chart)", "number", "kWh per hour", "For each hour of day 00:00-23:00: total of all supply points in that hour, divided by the number of days that have data for that hour."),
            F(htmlName, "Largest consumers (bar chart + table)", "table", "kWh, %", "Top 10 supply points by grid import. Columns: Supply point (rank + masked id), Imported (kWh), Produced (kWh), Exported (kWh), Self-sufficiency (%); 1 decimal. Ids are masked (first 4 + last 4 characters).")
        );
    }

    // ---- section 5: method ----
    const method = [
        "Input reading: every file in the input folder whose name ends in .json, .csv, .txt or has no extension (hidden files skipped) is read. JSON is tried first: the communities are taken from data[], a top-level array, communities[], or a single community object; each community's cups[] supply points and their energy_hourly (or energyHourly) readings become records. If the file is not valid JSON it is read as CSV with fixed column positions: 3 cups_id, 5 info_dt, 6 kwh_in, 7 kwh_out, 14 production, 15 battery (lines with fewer than 7 columns and header lines are skipped).",
        "Field names accepted per reading: cupsId/cups_id (falls back to the supply point's id), infoDt/info_dt, kwhIn/kwh_in, kwhOut/kwh_out, production, battery. Missing, empty or non-numeric values are counted as 0.",
        "No de-duplication: if the same reading appears twice (e.g. same file given twice), it is counted twice.",
        "Imported energy total = sum of kwh_in over all readings; average = total / number of readings; min / max = smallest / largest single reading.",
        "Produced energy total = sum of production over all readings; average, min, max as above.",
        "Exported energy (HTML only) = sum of kwh_out over all readings.",
        "Own production used on site (HTML only) = max(0, produced total - exported total), computed on the period totals (not hour by hour).",
        "Consumption (HTML only) = imported + own production used on site.",
        "Self-sufficiency (HTML only) = own production used on site / consumption x 100 %. Computed the same way per supply point in the top-10 table.",
        "uniqueSensors = number of distinct supply-point ids; uniqueTimestamps = number of distinct timestamp texts (not normalised).",
        "Time: timestamps are used exactly as written in the data (local time of the data source, normally Spain, no time-zone conversion). Day = first 10 characters (YYYY-MM-DD); hour of day = the hour digits after the date.",
        "Rounding: the JSON keeps full floating-point precision. The HTML rounds: community totals to whole kWh, self-sufficiency to 1 decimal, per-supply-point values to 1 decimal, averages in the range-chart note to 2 decimals. Small differences between the JSON and the HTML are therefore rounding only.",
        "Ranking of supply points (HTML table and this file) is by imported energy, largest first. The rank is the only reliable way to refer to a supply point, because masked ids repeat.",
        "Per-community figures (this file only): the readings of each community's supply points are summed; self-sufficiency per community uses the same formula on that community's totals.",
        "Daily figures: sum of all readings whose timestamp starts with that date. Weekday = calendar weekday of that date. Average per day = imported total / number of days with data.",
        "24-hour profile: for each hour of day, the sum of all readings in that hour divided by the number of distinct days that have readings in that hour (kWh per hour, all supply points together)."
    ];

    // ---- section 6: results ----
    const results = [
        { label: "Readings analysed", value: `${stats.totalRecords}`, unit: "readings" },
        { label: "Supply points", value: `${stats.uniqueSensors}`, unit: "supply points" },
        { label: "Distinct timestamps", value: `${stats.uniqueTimestamps}`, unit: "time steps" },
        { label: "Period", value: period, unit: "" },
        { label: "Energy imported from the grid (total)", value: ctxNum(imp.total, 3), unit: "kWh" },
        { label: "Imported per reading: average / min / max", value: `${ctxNum(imp.avg, 4)} / ${ctxNum(imp.min, 3)} / ${ctxNum(imp.max, 3)}`, unit: "kWh" },
        { label: "Energy produced locally (total)", value: ctxNum(prod.total, 3), unit: "kWh" },
        { label: "Produced per reading: average / min / max", value: `${ctxNum(prod.avg, 4)} / ${ctxNum(prod.min, 3)} / ${ctxNum(prod.max, 3)}`, unit: "kWh" },
        { label: "Energy exported to the grid (HTML only)", value: ctxNum(agg.exported, 3), unit: "kWh" },
        { label: "Own production used on site (HTML only)", value: ctxNum(agg.selfUsed, 3), unit: "kWh" },
        { label: "Consumption = imported + used on site (HTML only)", value: ctxNum(agg.consumption, 3), unit: "kWh" },
        { label: "Self-sufficiency (HTML only)", value: selfSuff === null ? "n/a" : ctxNum(selfSuff, 1), unit: "%" },
        { label: "Supply points with any production / any export / zero import", value: `${pointsWithProd} / ${pointsWithExport} / ${pointsNoImport}`, unit: "supply points" }
    ];
    if (daysByImp.length) {
        results.push({ label: "Day with highest grid import", value: dayTxt(daysByImp[0]) + (nearTie ? `; near tie with ${dayTxt(daysByImp[1])} (difference ${ctxNum(daysByImp[0].imp - daysByImp[1].imp, 2)} kWh)` : ""), unit: "" });
        if (daysByImp.length > 2) results.push({ label: "Top 3 days by grid import", value: daysByImp.slice(0, 3).map(dayTxt).join("; "), unit: "" });
        if (daysByImp.length > 1) results.push({ label: "Day with lowest grid import", value: dayTxt(lowDay), unit: "" });
        results.push({ label: "Average grid import per day", value: ctxNum(imp.total / daysByImp.length, 1), unit: "kWh per day" });
        if (wkAvg !== null) results.push({ label: "Average grid import: weekdays (Mon-Fri) / weekend days (Sat-Sun)", value: `${ctxNum(wkAvg, 1)} / ${ctxNum(weAvg, 1)}`, unit: "kWh per day" });
        if (prodDays.length > 1) results.push({ label: "Day with highest / lowest production", value: `${prodDays[0].d} ${ctxNum(prodDays[0].prod, 1)} kWh / ${prodDays[prodDays.length - 1].d} ${ctxNum(prodDays[prodDays.length - 1].prod, 1)} kWh`, unit: "" });
    }
    if (peakHour !== null) results.push({ label: "Hour of day with highest average grid import (all points together)", value: `${hh(peakHour)} (${ctxNum(agg.profile[peakHour].imp, 1)} kWh per hour)`, unit: "" });
    if (agg.hasProfile) {
        const lowH = agg.profile.reduce((best, p, h) => (p && (best === null || p.imp < agg.profile[best].imp) ? h : best), null);
        if (lowH !== null) results.push({ label: "Hour of day with lowest average grid import", value: `${hh(lowH)} (${ctxNum(agg.profile[lowH].imp, 1)} kWh per hour)`, unit: "" });
    }
    if (peakProdHour !== null) {
        const prodHours = agg.profile.map((p, h) => (p && p.prod > 0 ? h : null)).filter((h) => h !== null);
        results.push({ label: "Hour of day with highest average production", value: `${hh(peakProdHour)} (${ctxNum(agg.profile[peakProdHour].prod, 1)} kWh per hour); production above 0 only from ${hh(prodHours[0])} to ${hh(prodHours[prodHours.length - 1])}`, unit: "" });
    }
    commStats.forEach((c) => results.push({
        label: `Community ${c.id} "${c.name}" (${c.points} supply points${Object.keys(c.placeTypes).length ? "; place types " + Object.entries(c.placeTypes).map(([t, n]) => `${t} ${n}`).join(", ") : ""})`,
        value: `imported ${ctxNum(c.imported, 1)}, produced ${ctxNum(c.produced, 1)}, exported ${ctxNum(c.exported, 1)}; self-sufficiency ${pctTxt(c.self)}`,
        unit: "kWh"
    }));
    if (communities.length && unassigned.length) results.push({ label: "Supply points not linked to any community", value: `${unassigned.length}`, unit: "supply points" });
    results.push({ label: "Distinct masked ids", value: `${distinctMasksAll} among ${ranked.length} supply points (${distinctMasksTop10} among the top ${top10.length}). Masked ids are NOT unique: always identify a supply point by its rank.`, unit: "" });
    top10.forEach((p) => results.push({ label: `Rank ${p.rank} by grid import (as in the HTML table)`, value: pointLine(p), unit: "" }));
    if (hidden.length) {
        results.push({ label: `Supply points ranked ${top10.length + 1}-${ranked.length} (NOT shown in the HTML)`, value: `${hidden.length} points: imported ${ctxNum(sumOf(hidden, "imp"), 1)} kWh, produced ${ctxNum(sumOf(hidden, "prod"), 1)} kWh, exported ${ctxNum(sumOf(hidden, "exp"), 1)} kWh; ${hidden.filter((p) => p.prod > 0).length} of them produce(s), ${hidden.filter((p) => p.exp > 0).length} export`, unit: "" });
        if (hidden.length <= 20) hidden.forEach((p) => results.push({ label: `Rank ${p.rank} (this file only)`, value: pointLine(p), unit: "" }));
    }
    results.push({ label: "Supply points with production (ranks)", value: `${producers.length}: ${rankList(producers)}`, unit: "" });
    results.push({ label: "Supply points with export (ranks)", value: `${exporters.length}: ${rankList(exporters)}`, unit: "" });
    if (bySelf.length) {
        results.push({ label: "Most self-sufficient supply point (all points, not only top 10)", value: pointLine(mostSelf), unit: "" });
        bySelf.slice(1, 5).forEach((p, i) => results.push({ label: `Self-sufficiency rank ${i + 2}`, value: pointLine(p), unit: "" }));
    } else {
        results.push({ label: "Most self-sufficient supply point", value: "None: every supply point has 0 % (or n/a) self-sufficiency in this run" + (prod.total === 0 ? " because no production is recorded (see section 7)" : ""), unit: "" });
    }
    if (byProd.length && hidden.length > 20) byProd.slice(0, 5).forEach((p, i) => results.push({ label: `Production rank ${i + 1}`, value: pointLine(p), unit: "" }));

    // ---- section 7: limitations ----
    const limitations = [
        "The JSON result contains only community-wide counts and statistics. Per-supply-point, per-day, per-hour figures, exported energy and self-sufficiency exist only in the HTML report (and in this file); they cannot be recomputed from the JSON alone.",
        `Supply-point ids (CUPS) are masked in the HTML and in this file (first 4 + last 4 characters). No output file of this algorithm contains the full ids, so a specific meter (or building) cannot be identified from the outputs. Masked ids are NOT unique: in this run ${ranked.length} supply points have only ${distinctMasksAll} distinct masked ids (${distinctMasksTop10} among the top ${top10.length}). Two lines with the same masked id but different ranks are DIFFERENT meters; always refer to a supply point by its rank (rank = position when sorted by imported kWh, largest first).`,
        multiComm ? `${communities.length === 2 ? "Both" : "All " + communities.length} communities in the input (${communities.map((c) => c.id).join(", ")}) are pooled: the JSON, the HTML and the headline numbers here describe them together, not one community. Only section 6 of this file splits totals per community.` : "",
        completeSeries ? `Completeness: every supply point has exactly ${stats.uniqueTimestamps} readings, one per distinct timestamp, so there are no gaps or duplicate readings in this run.` : "",
        `The "data checks" in this file (duplicates, negatives, night production) are done only to write this description; the algorithm itself does not remove or correct anything. This run: ${duplicates} duplicate supply point + timestamp pairs, ${negatives} readings with negative values, ${nightProd} readings with production at night.`,
        "Readings are treated as hourly energy in kWh as delivered by the data source; the algorithm does not check the time step. Average per reading is per supply point per time step, not per day.",
        "Self-sufficiency assumes all exported energy came from local production and is computed on period totals, so it ignores hour-by-hour timing; it is an estimate.",
        "Battery values are read but not used in any figure. Price fields in the source data are ignored.",
        "The algorithm does not detect anomalies, fill gaps or remove duplicates; missing readings simply lower the totals.",
        "The outputs contain no weather, occupancy, building, tariff, price or CO2 data, so they show WHAT happened (when and how much) but not WHY (e.g. why a day or hour was high). Answers about causes can only be hypotheses."
    ].filter(Boolean);
    if (possiblySynthetic) limitations.push(`This looks like sample / synthetic data, not real metering${sampleNames.length ? ` (input file name: ${sampleNames.join(", ")})` : ""}${symmetricProd ? "; the production profile is perfectly symmetric" : ""}. Treat the numbers as a demonstration and say so when answering.`);
    profileNotes.forEach((n) => limitations.push(n));
    if (nearTie) limitations.push(`The highest-import day (${daysByImp[0].d}) is a near tie with ${daysByImp[1].d}: they differ by only ${ctxNum(daysByImp[0].imp - daysByImp[1].imp, 2)} kWh, which is not a meaningful difference.`);
    if (exporters.length && hidden.length) {
        const hp = hidden.filter((p) => p.prod > 0).length, he = hidden.filter((p) => p.exp > 0).length;
        if (hp || he) limitations.push(`The HTML table shows only the top ${top10.length} supply points by import. ${hp} producing and ${he} exporting supply point(s) are among the ${hidden.length} hidden ones (${ctxNum(sumOf(hidden, "prod"), 1)} kWh produced, ${ctxNum(sumOf(hidden, "exp"), 1)} kWh exported); section 6 of this file covers them.`);
    }
    if (failedFiles.length) limitations.push(`${failedFiles.length} input file(s) could not be read and were skipped: ${failedFiles.slice(0, 10).map((f) => f.file).join(", ")}.`);
    if (emptyFiles.length) limitations.push(`${emptyFiles.length} input file(s) gave no readings: ${emptyFiles.slice(0, 10).map((f) => f.file).join(", ")}${emptyFiles.some((f) => f.file === "algoCustomData.json") ? " (algoCustomData.json is the job's parameter file; that is expected)" : ""}.`);
    if (prod.total === 0 && agg.exported > 0) limitations.push(`Production is zero in all ${stats.totalRecords} readings although ${ctxNum(agg.exported, 1)} kWh were exported by ${pointsWithExport} supply point(s). The production data is evidently missing from this dataset (exports can only come from local generation). Real local production was at least the exported amount; self-sufficiency is therefore shown as ${selfSuff === null ? "n/a" : ctxNum(selfSuff, 1) + " %"} but is underestimated.`);
    else if (prod.total === 0) limitations.push("Production is zero in all readings: no local generation is recorded in this dataset (either the supply points have no solar installation or the production data is missing). Self-sufficiency is 0 % for that reason.");
    else if (agg.exported > prod.total) limitations.push(`Exported energy (${ctxNum(agg.exported, 1)} kWh) is larger than recorded production (${ctxNum(prod.total, 1)} kWh); production is probably incomplete, so own use on site is set to 0 and self-sufficiency is underestimated.`);
    if (prod.total !== 0 && pointsWithExport > pointsWithProd) limitations.push(`${pointsWithExport} supply points exported energy but only ${pointsWithProd} report any production; production data is incomplete for some supply points.`);
    if (nightProd) limitations.push(`${nightProd} readings show production above 0 at night (22:00-05:59); this may indicate a time-zone shift (e.g. UTC vs local time) or a non-solar source.`);
    if (negatives) limitations.push(`${negatives} readings contain negative energy values; they are included as they are (they lower totals and can be the minimum).`);
    if (duplicates) limitations.push(`${duplicates} readings repeat a supply point + timestamp combination already seen; they were counted twice (no de-duplication).`);
    if (noDate) limitations.push(`${noDate} readings have no parsable date; they count in the JSON statistics but not in the daily/hourly charts.`);
    if (noHour) limitations.push(`${noHour} readings have a date but no hour; they count in daily totals but not in the 24-hour profile.`);
    if (bothInOut) limitations.push(`${bothInOut} readings have both import and export above 0 in the same time step (possible with hourly net metering; not an error).`);
    if (batteryNonZero) limitations.push(`${batteryNonZero} readings have a non-zero battery value; battery data is not used in any result.`);
    if (agg.dayKeys.length === 1) limitations.push(`The data covers a single day (${firstDay}); daily trends cannot be shown and all figures describe that one day only. Do not extrapolate to a month or year without saying so.`);
    if (stats.uniqueSensors && Math.abs(readingsPerPoint - stats.uniqueTimestamps) > 0.5) limitations.push(`Supply points do not all have the same number of readings (on average ${ctxNum(readingsPerPoint, 1)} readings per supply point vs ${stats.uniqueTimestamps} distinct timestamps): some have gaps or extra readings, so totals per supply point are not fully comparable.`);

    // ---- section 8: questions ----
    const questions = [
        { question: "How much electricity did the community take from the grid?", answer: `energy.imported.total in ${jsonName}: ${ctxNum(imp.total, 1)} kWh over ${period}, all ${stats.uniqueSensors} supply points together (${scopeTxt}).${multiComm ? " Per-community totals: section 6." : ""}` },
        { question: "How much solar / local energy was produced?", answer: `energy.production.total in ${jsonName}: ${ctxNum(prod.total, 1)} kWh.${prod.total === 0 ? " It is zero in this run; see section 7 before concluding that nothing was produced." : ""}` },
        { question: "How much was exported (sold) to the grid?", answer: `Not in the JSON. The HTML bar chart 'Total energy by flow' shows it (whole kWh); the exact value is in section 6 here: ${ctxNum(agg.exported, 1)} kWh.` },
        { question: "How self-sufficient is the community?", answer: `Self-sufficiency = (produced - exported, at least 0) / (imported + that) x 100 = ${selfSuff === null ? "n/a" : ctxNum(selfSuff, 1) + " %"}. Shown as a KPI tile in the HTML; not in the JSON.` },
        { question: "Which supply point consumed most from the grid?", answer: `HTML section 'Largest consumers' (top 10, sorted by imported kWh) or section 6 here (same top 10 with ranks). Ids are masked; no output holds the full CUPS ids. Largest: ${top.length ? `rank 1, ${reportMaskId(top[0].id)}, with ${ctxNum(top[0].imp, 1)} kWh` : "n/a"}.` },
        { question: "Which supply point is the most self-sufficient?", answer: mostSelf ? `Section 6 'Most self-sufficient supply point' (it considers ALL supply points, including those not in the HTML table): rank ${mostSelf.rank}, ${mostSelf.mask}, ${pctTxt(mostSelf.self)}. ${mostSelf.rank <= top10.length ? "It is also in the HTML top-10 table." : "It is NOT in the HTML table, which shows only the top 10 by import."} Do not pick the best value from the HTML table alone.` : `No supply point has self-sufficiency above 0 % in this run${prod.total === 0 ? " (no production recorded)" : ""}.` },
        { question: "Which supply points have solar production / export energy?", answer: `Section 6: ${producers.length} produce (ranks ${rankList(producers)}), ${exporters.length} export (ranks ${rankList(exporters)}). The HTML shows only those within the top ${top10.length}.` },
        { question: "Are two lines with the same masked id (e.g. at ranks 3 and 5) the same meter?", answer: "No. Masking keeps only the first 4 and last 4 characters, and many meters share them. Each rank is a different supply point; use the rank, never the masked id, to tell them apart." },
        ...(multiComm ? [{ question: "How do the communities compare?", answer: `All outputs pool the ${communities.length} communities. Section 6 of this file gives imported, produced, exported and self-sufficiency per community (${commStats.map((c) => `${c.id}: ${c.points} points`).join("; ")}). Which community a ranked supply point belongs to is given in its section 6 line.` }] : []),
        { question: "Which day had the lowest consumption, and are weekends different?", answer: lowDay && daysByImp.length > 1 ? `Lowest grid import: ${dayTxt(lowDay)}.${wkAvg !== null ? ` Average weekday ${ctxNum(wkAvg, 1)} kWh vs weekend day ${ctxNum(weAvg, 1)} kWh.` : " Too few days to compare weekdays and weekends."} Read the daily values from the HTML chart 'Energy per day'.` : "Only one day (or none) in the data; no comparison is possible." },
        { question: "Why was a day or hour high?", answer: "The outputs cannot tell: there are no weather, occupancy or building data. Describe the pattern (e.g. weekday vs weekend, evening peak) and say that the cause is not in the data." },
        { question: "Is this real data?", answer: possiblySynthetic ? "It looks like sample / synthetic data (see section 7); say so when presenting the numbers." : "Nothing in the outputs marks it as sample data, but the outputs cannot prove where the data came from." },
        { question: "What is the average consumption per supply point?", answer: `Not stored directly. Compute energy.imported.total / uniqueSensors = ${stats.uniqueSensors ? ctxNum(imp.total / stats.uniqueSensors, 2) : "n/a"} kWh per supply point over the period. Note energy.imported.avg (${ctxNum(imp.avg, 4)} kWh) is per reading (one point, one hour), not per supply point.` },
        { question: "What was the highest hourly import?", answer: `energy.imported.max = ${ctxNum(imp.max, 3)} kWh for one supply point in one hour. Which point and when is not recorded in any output.` },
        { question: "When in the day is most energy bought / produced?", answer: agg.hasProfile ? `HTML chart 'Average day (24-hour profile)'. Peak average import is at ${hh(peakHour)} (${ctxNum(agg.profile[peakHour].imp, 1)} kWh per hour, all points together).${peakProdHour !== null ? ` Production peaks at ${hh(peakProdHour)} (${ctxNum(agg.profile[peakProdHour].prod, 1)} kWh per hour).` : " No production is recorded, so there is no production peak."}` : "No hour information in the timestamps; the 24-hour profile is not available in this run." },
        { question: "Which day had the most consumption?", answer: peakDay ? `HTML chart 'Energy per day'. Highest grid import: ${dayTxt(daysByImp[0])}${nearTie ? `, practically tied with ${dayTxt(daysByImp[1])}` : ""}.${agg.dayKeys.length === 1 ? " The data has only this one day." : ""}` : "No dates could be read; no daily figures are available." },
        { question: "How many hours / days of data are there?", answer: `uniqueTimestamps = ${stats.uniqueTimestamps} distinct time steps across ${agg.dayKeys.length} day(s) (${period}); totalRecords = ${stats.totalRecords} readings.` },
        { question: "Why do the HTML and the JSON numbers differ slightly?", answer: "Rounding only: the HTML shows whole kWh for totals and 1 decimal per supply point; the JSON is unrounded. Section 5 lists the rounding rules." },
        { question: "Can I get costs, prices or CO2 savings?", answer: "No. This algorithm ignores prices and does not compute money or CO2; only energy (kWh) statistics are produced." }
    ];

    const glossary = [
        { term: "CUPS", meaning: "Código Universal del Punto de Suministro: the unique id of an electricity supply point (meter) in Spain. Treated as personal data, hence masked." },
        { term: "Supply point / sensor", meaning: "One metered connection (CUPS). 'uniqueSensors' in the JSON counts them." },
        { term: "Reading / record", meaning: "One line of data: one supply point in one time step (normally one hour)." },
        { term: "kWh", meaning: "Kilowatt-hour, unit of energy. A reading of 1.5 kWh in an hour means an average power of 1.5 kW during that hour." },
        { term: "kwh_in / imported", meaning: "Energy taken from the public grid." },
        { term: "kwh_out / exported / surplus", meaning: "Locally produced energy not used on site and fed into the grid." },
        { term: "production", meaning: "Energy generated locally, usually by rooftop solar (PV)." },
        { term: "Self-consumption / own production used on site", meaning: "Produced energy used directly on site = max(0, production - export), on period totals." },
        { term: "Masked id", meaning: "Shortened supply-point id (first 4 + '…' + last 4 characters). Not unique; the rank identifies the supply point." },
        { term: "Rank", meaning: "Position of a supply point when all are sorted by imported kWh, largest first (rank 1 = largest grid consumer)." },
        { term: "Self-sufficiency", meaning: "Share of total consumption covered by own production (%)." },
        { term: "Energy community", meaning: "Group of supply points (homes, municipal buildings, businesses) that share local generation; the input groups supply points by community." },
        { term: "PV / kWp", meaning: "Photovoltaic solar; kWp (kilowatt-peak) is the rated size of a solar installation. Not used by this algorithm." },
        { term: "Compute-to-Data (C2D)", meaning: "The algorithm ran next to the data; only these output files leave the data provider." }
    ];

    const facts = {
        algorithm: "basic_analytic.js",
        title: REPORT_TITLE,
        generatedAt,
        parameters: {},
        inputFiles: fileLog.map((f) => ({ file: f.file, records: f.records, format: f.info ? f.info.format : null, error: f.error || null })),
        communities: communities.length,
        totalRecords: stats.totalRecords,
        uniqueSensors: stats.uniqueSensors,
        uniqueTimestamps: stats.uniqueTimestamps,
        periodStart: firstDay,
        periodEnd: lastDay,
        days: agg.dayKeys.length,
        unit: "kWh",
        importedTotal: imp.total,
        importedAvgPerReading: imp.avg,
        importedMin: imp.min,
        importedMax: imp.max,
        productionTotal: prod.total,
        productionAvgPerReading: prod.avg,
        productionMin: prod.min,
        productionMax: prod.max,
        exportedTotal: agg.exported,
        ownProductionUsedOnSite: agg.selfUsed,
        consumption: agg.consumption,
        selfSufficiencyPercent: selfSuff,
        supplyPointsWithProduction: pointsWithProd,
        supplyPointsWithExport: pointsWithExport,
        supplyPointsWithZeroImport: pointsNoImport,
        productionMissingButExports: prod.total === 0 && agg.exported > 0,
        nightProductionReadings: nightProd,
        negativeReadings: negatives,
        duplicateReadings: duplicates,
        readingsPerSupplyPointMin: minPerPoint,
        readingsPerSupplyPointMax: maxPerPoint,
        completeSeries,
        communitiesPooled: multiComm,
        communityBreakdown: commStats.map((c) => ({ id: c.id, supplyPoints: c.points, importedTotal: c.imported, productionTotal: c.produced, exportedTotal: c.exported, selfSufficiencyPercent: c.self })),
        distinctMaskedIds: distinctMasksAll,
        mostSelfSufficient: mostSelf ? { rank: mostSelf.rank, maskedId: mostSelf.mask, selfSufficiencyPercent: mostSelf.self } : null,
        producingSupplyPointRanks: producers.slice(0, 50).map((p) => p.rank),
        exportingSupplyPointRanks: exporters.slice(0, 50).map((p) => p.rank),
        peakImportDay: daysByImp.length ? { day: daysByImp[0].d, importedKwh: daysByImp[0].imp } : null,
        lowestImportDay: lowDay ? { day: lowDay.d, importedKwh: lowDay.imp } : null,
        peakImportHour: peakHour,
        peakProductionHour: peakProdHour,
        possiblySyntheticData: possiblySynthetic,
        outputFiles: files.map((f) => f.file).concat([CONTEXT_FILE]),
        keyNotes: {
            productionMissingButExports: "true when production is 0 everywhere but some energy was exported (production data missing)",
            nightProductionReadings: "readings with production above 0 between 22:00 and 05:59",
            negativeReadings: "readings with a negative kwh_in, kwh_out or production value",
            duplicateReadings: "readings repeating a supply point + timestamp pair (checked for this file only; the algorithm does not de-duplicate)",
            completeSeries: "true when every supply point has exactly one reading per distinct timestamp",
            ranks: "rank = position of a supply point sorted by imported kWh, largest first; same as the HTML table",
            hours: "peak*Hour values are hours of day 0-23 of the average 24-hour profile, local time of the data"
        }
    };

    return contextDoc({
        title: REPORT_TITLE,
        summary: `This Empower-X Compute-to-Data algorithm reads the hourly smart-meter readings of an energy community (or several) and summarises them: how many readings and supply points (CUPS meters) there are, and the total, average, minimum and maximum of the energy imported from the grid and produced locally (solar). ` +
            `It writes the statistics to ${jsonName} and, for people, an HTML report with charts that also shows exported energy, self-sufficiency, daily and hourly patterns and the largest consumers. It takes no parameters.`,
        run, files, fields, method, results, limitations, questions, glossary, facts
    });
}

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
    const fileLog = []; // per input file: records loaded / error (for AI_CONTEXT.md only)

    files.forEach(file => {
        const p = path.join(INPUT_DIR, file);
        try {
            const records = processFile(p);
            allRecords = allRecords.concat(records);
            console.log(`  -> Loaded ${records.length} records from ${file}`);
            fileLog.push({ file, records: records.length, info: lastParseInfo });
        } catch (err) {
            console.error(`  -> Failed to read ${file}: ${err.message}`);
            fileLog.push({ file, records: 0, error: err && err.message ? err.message : String(err) });
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
    contextWrite(fs, path.join(OUTPUT_DIR, CONTEXT_FILE), () => buildContext(stats, allRecords, fileLog));

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
