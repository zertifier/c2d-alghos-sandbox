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

const INPUT_DIR = process.env.INPUTS || "/data/inputs";
const OUTPUT_DIR = process.env.OUTPUTS || "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "community_analysis.json");

/* =========================
   STATISTICS UTILS
   ========================= */

const getPercentileValue = (sortedValues, p) => {
    if (sortedValues.length === 0) return 0;
    const pos = (sortedValues.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sortedValues[base + 1] !== undefined) {
        return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
    }
    return sortedValues[base];
};

const parseNum = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Schema mapping based on provided table structure:
const COL_IDX = {
    CUPS_ID: 3,
    INFO_DT: 5,
    KWH_IN: 6,
    KWH_OUT: 7
};

function loadData(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    try {
        return JSON.parse(content);
    } catch (e) {
        // Fallback to CSV parsing
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");
        const cupsMap = {};
        for (const line of lines) {
            const cols = line.split(",");
            if (cols.length < 7) continue;
            if (cols[COL_IDX.CUPS_ID] === "cups_id" || cols[COL_IDX.CUPS_ID] === "cupsId") continue;

            const cupsId = cols[COL_IDX.CUPS_ID];
            if (!cupsMap[cupsId]) cupsMap[cupsId] = { id: cupsId, energy_hourly: [] };
            
            cupsMap[cupsId].energy_hourly.push({
                info_dt: cols[COL_IDX.INFO_DT],
                kwh_in: parseNum(cols[COL_IDX.KWH_IN]),
                kwh_out: parseNum(cols[COL_IDX.KWH_OUT])
            });
        }
        
        const cupsArray = Object.values(cupsMap);
        if (cupsArray.length === 0) throw new Error("No valid data found in CSV/TXT");

        console.log(`  -> Successfully parsed as CSV (${cupsArray.length} CUPS found).`);
        return {
            id: path.basename(filePath),
            name: path.basename(filePath, path.extname(filePath)),
            cups: cupsArray
        };
    }
}

/* =========================
   CORE LOGIC
   ========================= */

const analyzeCommunities = (data) => {
    let communities = [];
    if (data && data.data && Array.isArray(data.data)) {
        communities = data.data;
    } else if (Array.isArray(data)) {
        communities = data;
    } else if (data && data.communities && Array.isArray(data.communities)) {
        communities = data.communities;
    } else if (data && (data.id || data.name)) {
        communities = [data];
    }

    const results = [];

    communities.forEach(comm => {
        if (!comm || (!comm.id && !comm.name)) return;

        const cupsData = (comm.cups || []).map(cup => {
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            const totalIn = energyArray.reduce((sum, h) => {
                const val = h.kwhIn || h.kwh_in || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
            const totalOut = energyArray.reduce((sum, h) => {
                const val = h.kwhOut || h.kwh_out || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
            return {
                id: cup.id,
                total_kwh_in: totalIn,
                total_kwh_out: totalOut
            };
        });
        // ... rest of loop ...

        if (cupsData.length === 0) return;

        const totalCommIn = cupsData.reduce((sum, c) => sum + c.total_kwh_in, 0);
        const totalCommOut = cupsData.reduce((sum, c) => sum + c.total_kwh_out, 0);
        
        const sortedByIn = [...cupsData].sort((a, b) => a.total_kwh_in - b.total_kwh_in);
        const sortedByOut = [...cupsData].sort((a, b) => a.total_kwh_out - b.total_kwh_out);

        const p05In = getPercentileValue(sortedByIn.map(c => c.total_kwh_in), 0.05);
        const p95In = getPercentileValue(sortedByIn.map(c => c.total_kwh_in), 0.95);

        results.push({
            community_id: comm.id,
            community_name: comm.name,
            metrics: {
                total_cups: cupsData.length,
                avg_consumption_per_cup: Number((totalCommIn / cupsData.length).toFixed(4)),
                avg_surplus_per_cup: Number((totalCommOut / cupsData.length).toFixed(4)),
                total_community_consumption: Number(totalCommIn.toFixed(4)),
                total_community_surplus: Number(totalCommOut.toFixed(4))
            },
            highlights: {
                max_consumer: {
                    cups_id: sortedByIn[sortedByIn.length - 1].id,
                    value: Number(sortedByIn[sortedByIn.length - 1].total_kwh_in.toFixed(4))
                },
                max_surplus: {
                    cups_id: sortedByOut[sortedByOut.length - 1].id,
                    value: Number(sortedByOut[sortedByOut.length - 1].total_kwh_out.toFixed(4))
                }
            },
            outliers: {
                bottom_5_percent_consumers: cupsData.filter(c => c.total_kwh_in <= p05In).map(c => ({
                    cups_id: c.id,
                    value: Number(c.total_kwh_in.toFixed(4))
                })),
                top_5_percent_consumers: cupsData.filter(c => c.total_kwh_in >= p95In).map(c => ({
                    cups_id: c.id,
                    value: Number(c.total_kwh_in.toFixed(4))
                }))
            }
        });
    });

    return results;
};

/* =========================
   HTML REPORT (presentation only — the JSON is the result)
   ========================= */

const REPORT_TITLE = "Energy Community Analytics";
const REPORT_IN_COLOR = "#2563eb";
const REPORT_OUT_COLOR = "#16a34a";

// Re-reads a loaded input the same way analyzeCommunities does (same community
// discovery, same skips, same kWh parsing) and keeps what the charts need:
// per-supply-point totals and community totals per timestamp. Read-only.
function reportCollect(data) {
    let communities = [];
    if (data && data.data && Array.isArray(data.data)) communities = data.data;
    else if (Array.isArray(data)) communities = data;
    else if (data && data.communities && Array.isArray(data.communities)) communities = data.communities;
    else if (data && (data.id || data.name)) communities = [data];

    const out = [];
    communities.forEach(comm => {
        if (!comm || (!comm.id && !comm.name)) return;
        const cupsIn = comm.cups || [];
        if (cupsIn.length === 0) return;
        const byTs = new Map();
        const cups = cupsIn.map(cup => {
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            let totalIn = 0, totalOut = 0;
            energyArray.forEach(h => {
                const vIn = parseFloat(h.kwhIn || h.kwh_in || 0) || 0;
                const vOut = parseFloat(h.kwhOut || h.kwh_out || 0) || 0;
                totalIn += vIn;
                totalOut += vOut;
                const ts = String(h.info_dt || h.infoDt || "");
                if (!ts) return;
                const slot = byTs.get(ts) || { in: 0, out: 0 };
                slot.in += vIn;
                slot.out += vOut;
                byTs.set(ts, slot);
            });
            return { id: cup.id, type: cup.place_type || cup.placeType || "", in: totalIn, out: totalOut };
        });
        out.push({ id: comm.id, cups, byTs });
    });
    return out;
}

// Never throws; always returns `count` entries (null = no chart extras for that community).
function reportCollectSafe(data, count) {
    try {
        const details = reportCollect(data);
        if (details.length === count) return details;
    } catch (e) { /* the report just shows fewer charts */ }
    return new Array(count).fill(null);
}

function reportPct(part, whole) {
    return whole > 0 ? (part / whole) * 100 : null;
}

function reportShort(text, max) {
    const s = String(text === null || text === undefined ? "" : text);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Daily totals and the average 24-hour profile from community totals per timestamp.
function reportTimeAggregates(byTs) {
    const daily = new Map();
    const hourSum = new Array(24).fill(null).map(() => ({ in: 0, out: 0, n: 0 }));
    let matched = 0;
    for (const [ts, v] of byTs) {
        const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}))?/.exec(ts);
        matched += Math.min(v.in, v.out);
        if (!m) continue;
        const day = daily.get(m[1]) || { in: 0, out: 0 };
        day.in += v.in;
        day.out += v.out;
        daily.set(m[1], day);
        if (m[2] !== undefined) {
            const h = hourSum[Number(m[2])];
            if (h) { h.in += v.in; h.out += v.out; h.n += 1; }
        }
    }
    const days = [...daily.keys()].sort();
    return {
        days,
        dailyIn: days.map(d => daily.get(d).in),
        dailyOut: days.map(d => daily.get(d).out),
        hourIn: hourSum.map(h => (h.n ? h.in / h.n : null)),
        hourOut: hourSum.map(h => (h.n ? h.out / h.n : null)),
        hasHours: hourSum.some(h => h.n > 0),
        matched
    };
}

function renderReport(results, details) {
    const kwh = (v) => reportNum(v, 1);
    const pctText = (p) => (p === null ? "–" : reportNum(p, 1));
    const aggs = results.map((_, i) => (details[i] && details[i].byTs.size ? reportTimeAggregates(details[i].byTs) : null));

    const totalIn = results.reduce((a, r) => a + (Number(r.metrics.total_community_consumption) || 0), 0);
    const totalOut = results.reduce((a, r) => a + (Number(r.metrics.total_community_surplus) || 0), 0);
    const totalCups = results.reduce((a, r) => a + (Number(r.metrics.total_cups) || 0), 0);
    const allDays = aggs.filter(Boolean).flatMap(a => a.days).sort();
    const period = allDays.length ? `${allDays[0]} to ${allDays[allDays.length - 1]}` : "";
    const nameOf = (r, i) => String(r.community_name || r.community_id || `Community ${i + 1}`);

    const sections = [];

    // ---- overview -----------------------------------------------------------
    if (!results.length) {
        sections.push(reportSection("Overview",
            reportKpis([{ label: "Communities analysed", value: "0" }]) +
            '<p class="empty">No energy-community data was found in the input files, so there is nothing to chart.</p>',
            "Summary of all energy communities found in the input data."));
    } else {
        let html = reportKpis([
            { label: "Communities", value: reportNum(results.length, 0) },
            { label: "Supply points", value: reportNum(totalCups, 0) },
            { label: "Total grid consumption", value: kwh(totalIn), unit: "kWh" },
            { label: "Total surplus exported", value: kwh(totalOut), unit: "kWh" },
            { label: "Surplus vs consumption", value: pctText(reportPct(totalOut, totalIn)), unit: "%", hint: "surplus ÷ consumption" }
        ]);
        html += reportBarChart({
            title: "Grid consumption and surplus per community",
            categories: results.map((r, i) => reportShort(nameOf(r, i), 22)),
            series: [
                { name: "Grid consumption", values: results.map(r => r.metrics.total_community_consumption), color: REPORT_IN_COLOR },
                { name: "Surplus exported", values: results.map(r => r.metrics.total_community_surplus), color: REPORT_OUT_COLOR }
            ],
            unit: "kWh",
            note: "Totals over the whole period of the input data."
        });
        html += reportTable({
            title: "Communities at a glance",
            columns: [
                { key: "name", label: "Community" },
                { key: "cups", label: "Supply points", num: true },
                { key: "in", label: "Consumption (kWh)", num: true },
                { key: "out", label: "Surplus (kWh)", num: true },
                { key: "avg", label: "Avg. per point (kWh)", num: true },
                { key: "cov", label: "Surplus vs consumption (%)", num: true }
            ],
            rows: results.map((r, i) => ({
                name: nameOf(r, i),
                cups: r.metrics.total_cups,
                in: r.metrics.total_community_consumption,
                out: r.metrics.total_community_surplus,
                avg: r.metrics.avg_consumption_per_cup,
                cov: (() => { const p = reportPct(r.metrics.total_community_surplus, r.metrics.total_community_consumption); return p === null ? null : Number(p.toFixed(1)); })()
            }))
        });
        const withDays = results.map((r, i) => ({ r, i, a: aggs[i] })).filter(x => x.a && x.a.days.length > 1);
        if (withDays.length) {
            const labels = [...new Set(withDays.flatMap(x => x.a.days))].sort();
            html += reportLineChart({
                title: "Daily grid consumption per community",
                labels,
                series: withDays.map((x, k) => ({
                    name: reportShort(nameOf(x.r, x.i), 40),
                    values: labels.map(d => { const j = x.a.days.indexOf(d); return j === -1 ? null : x.a.dailyIn[j]; }),
                    color: REPORT_COLORS[k % REPORT_COLORS.length]
                })),
                unit: "kWh/day"
            });
        }
        sections.push(reportSection("Overview", html,
            "How much electricity each energy community takes from the grid and how much surplus (e.g. solar) it feeds back."));
    }

    // ---- one section per community -------------------------------------------
    results.forEach((r, i) => {
        const m = r.metrics;
        const det = details[i];
        const agg = aggs[i];
        const inTotal = Number(m.total_community_consumption) || 0;
        const outTotal = Number(m.total_community_surplus) || 0;

        // Masked ids are not unique (CUPS share prefixes/suffixes), so number the points too.
        const pointNo = new Map();
        if (det) det.cups.forEach((c, k) => { if (!pointNo.has(c.id)) pointNo.set(c.id, `P${k + 1}`); });
        const pointLabel = (id) => (pointNo.has(id) ? `${pointNo.get(id)} ` : "") + reportMaskId(id);

        let html = reportKpis([
            { label: "Supply points", value: reportNum(m.total_cups, 0) },
            { label: "Grid consumption", value: kwh(m.total_community_consumption), unit: "kWh" },
            { label: "Surplus exported", value: kwh(m.total_community_surplus), unit: "kWh" },
            { label: "Avg. consumption per point", value: kwh(m.avg_consumption_per_cup), unit: "kWh" },
            { label: "Avg. surplus per point", value: kwh(m.avg_surplus_per_cup), unit: "kWh" }
        ]);

        const mc = (r.highlights && r.highlights.max_consumer) || {};
        const ms = (r.highlights && r.highlights.max_surplus) || {};
        const coverage = reportPct(Math.min(outTotal, inTotal), inTotal);
        html += reportKpis([
            {
                label: "Largest consumer",
                value: kwh(mc.value), unit: "kWh",
                hint: `${pointLabel(mc.cups_id)} · ${pctText(reportPct(Number(mc.value) || 0, inTotal))}% of community consumption`
            },
            Number(ms.value) > 0
                ? { label: "Largest surplus producer", value: kwh(ms.value), unit: "kWh", hint: `${pointLabel(ms.cups_id)} · ${pctText(reportPct(Number(ms.value) || 0, outTotal))}% of the surplus` }
                : { label: "Largest surplus producer", value: "–", hint: "No supply point exported surplus" },
            {
                label: "Self-sufficiency potential",
                value: pctText(coverage), unit: "%",
                hint: "consumption the surplus could cover"
            }
        ]);

        // Self-sufficiency donut
        const covered = Math.min(outTotal, inTotal);
        let ssNote = `If all surplus exported by the community's supply points were shared inside the community, it could cover ${pctText(coverage)}% of its grid consumption over the period.`;
        // Hour-by-hour check: matched = sum over hours of min(consumption, surplus).
        const allUsable = !!agg && outTotal <= inTotal && outTotal - agg.matched <= Math.max(0.01, outTotal * 1e-6);
        if (agg && inTotal > 0 && covered > 0) {
            ssNote += allUsable
                ? " In no hour does the community feed back more than it consumes, so all of the surplus could be used the moment it is produced."
                : ` Matching hour by hour (surplus used in the same hour it is produced), ${pctText(reportPct(agg.matched, inTotal))}% could be covered.`;
        }
        html += reportDonut({
            title: "Self-sufficiency potential",
            slices: [
                { label: "Coverable by shared surplus", value: covered, color: REPORT_OUT_COLOR },
                { label: "Still needed from the grid", value: Math.max(0, inTotal - covered), color: "#94a3b8" }
            ],
            unit: "kWh",
            note: ssNote
        });

        // All supply points
        if (det && det.cups.length) {
            html += reportBarChart({
                title: "Consumption and surplus per supply point",
                categories: det.cups.map(c => pointLabel(c.id)),
                series: [
                    { name: "Grid consumption", values: det.cups.map(c => Number(c.in.toFixed(4))), color: REPORT_IN_COLOR },
                    { name: "Surplus exported", values: det.cups.map(c => Number(c.out.toFixed(4))), color: REPORT_OUT_COLOR }
                ],
                unit: "kWh",
                note: "Supply-point ids are shortened for privacy; P1, P2 … follow the order of the input data."
            });
        }

        // Outliers
        const outliers = (r.outliers || {});
        const top = (outliers.top_5_percent_consumers || []).slice().sort((a, b) => b.value - a.value);
        const bottom = (outliers.bottom_5_percent_consumers || []).slice().sort((a, b) => b.value - a.value);
        html += reportHBarChart({
            title: "Highest and lowest consumers: top and bottom 5% (kWh)",
            items: [
                ...top.map(o => ({ label: `${pointLabel(o.cups_id)} · top 5%`, value: o.value, color: "#dc2626" })),
                ...bottom.map(o => ({ label: `${pointLabel(o.cups_id)} · low 5%`, value: o.value, color: "#f59e0b" }))
            ],
            unit: "",
            note: `Supply points at or above the 95th, or at or below the 5th percentile of consumption within this community (community average: ${kwh(m.avg_consumption_per_cup)} kWh per point). In a small community these are simply the largest and smallest consumers.`
        });

        // 24-hour profile
        if (agg && agg.hasHours) {
            html += reportLineChart({
                title: "Average day: consumption and surplus by hour",
                labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
                series: [
                    { name: "Grid consumption", values: agg.hourIn, color: REPORT_IN_COLOR, area: true },
                    { name: "Surplus exported", values: agg.hourOut, color: REPORT_OUT_COLOR, area: true }
                ],
                unit: "kWh per hour",
                note: `Whole community, averaged over ${agg.days.length} day${agg.days.length === 1 ? "" : "s"}. The green area shows when surplus is fed back` +
                    (covered > 0 && allUsable
                        ? "; in those hours other members are still consuming more, so they could use it directly."
                        : "; where it rises above the blue line, the community feeds back more than it consumes in that hour.")
            });
        }

        const hasId = r.community_id !== undefined && r.community_id !== null && r.community_id !== "";
        const intro = `${hasId ? `Community ${String(r.community_id)} · ` : ""}${reportNum(m.total_cups, 0)} supply point${Number(m.total_cups) === 1 ? "" : "s"}. Key figures, the largest consumers and producers, and how far the community's own surplus could cover its needs.`;
        sections.push(reportSection(nameOf(r, i), html, intro));
    });

    return reportPage({
        title: REPORT_TITLE,
        subtitle: [
            `${reportNum(results.length, 0)} energy communit${results.length === 1 ? "y" : "ies"}`,
            `${reportNum(totalCups, 0)} supply points`,
            period ? `data from ${period}` : ""
        ].filter(Boolean).join(" · "),
        sections,
        jsonFile: "community_analysis.json"
    });
}

/* =========================
   AI CONTEXT (AI_CONTEXT.md: plain-language description of this run's outputs; read-only)
   ========================= */

// Night hours (clock time of the input timestamps) used to flag surplus exported in the dark.
const CONTEXT_NIGHT = (hour) => hour >= 22 || hour < 6;

// Per-file input statistics for AI_CONTEXT.md. Re-reads a loaded input the way
// analyzeCommunities does (same community discovery and skips). Never throws.
function contextInputInfo(file, data, analysis) {
    const info = { file, communities: analysis ? analysis.length : 0, format: "", stats: [] };
    try {
        info.format = data && Array.isArray(data.cups) && data.id === file && typeof data.name === "string" ? "CSV/TXT (parsed by column position)" : "JSON";
        let communities = [];
        if (data && data.data && Array.isArray(data.data)) communities = data.data;
        else if (Array.isArray(data)) communities = data;
        else if (data && data.communities && Array.isArray(data.communities)) communities = data.communities;
        else if (data && (data.id || data.name)) communities = [data];
        communities.forEach(comm => {
            if (!comm || (!comm.id && !comm.name)) return;
            const cups = comm.cups || [];
            if (cups.length === 0) return;
            const s = {
                cups: cups.length, records: 0, noTimestamp: 0, minTs: null, maxTs: null,
                placeTypes: {}, emptyPoints: 0, recMin: Infinity, recMax: 0, badValues: 0, negative: 0, both: 0,
                nightExport: 0, nightExportKwh: 0, productionRecords: 0, productionKwh: 0, batteryRecords: 0, dupTs: 0,
                pointIds: cups.map(c => c && c.id)
            };
            cups.forEach(cup => {
                const arr = (cup && (cup.energy_hourly || cup.energyHourly)) || [];
                const t = String((cup && (cup.place_type || cup.placeType)) || "unspecified");
                s.placeTypes[t] = (s.placeTypes[t] || 0) + 1;
                if (!arr.length) s.emptyPoints++;
                s.recMin = Math.min(s.recMin, arr.length);
                s.recMax = Math.max(s.recMax, arr.length);
                const seen = new Set();
                arr.forEach(h => {
                    s.records++;
                    if (!h) return;
                    const rawIn = h.kwhIn || h.kwh_in || 0;
                    const rawOut = h.kwhOut || h.kwh_out || 0;
                    const vIn = parseFloat(rawIn) || 0;
                    const vOut = parseFloat(rawOut) || 0;
                    if (Number.isNaN(parseFloat(rawIn)) || Number.isNaN(parseFloat(rawOut))) s.badValues++;
                    if (vIn < 0 || vOut < 0) s.negative++;
                    if (vIn > 0 && vOut > 0) s.both++;
                    const prod = parseFloat(h.production);
                    if (prod > 0) { s.productionRecords++; s.productionKwh += prod; }
                    if (parseFloat(h.battery) > 0) s.batteryRecords++;
                    const ts = String(h.info_dt || h.infoDt || "");
                    if (!ts) { s.noTimestamp++; return; }
                    if (seen.has(ts)) s.dupTs++;
                    seen.add(ts);
                    if (s.minTs === null || ts < s.minTs) s.minTs = ts;
                    if (s.maxTs === null || ts > s.maxTs) s.maxTs = ts;
                    const m = /^\d{4}-\d{2}-\d{2}[ T](\d{2})/.exec(ts);
                    if (m && vOut > 0 && CONTEXT_NIGHT(Number(m[1]))) { s.nightExport++; s.nightExportKwh += vOut; }
                });
            });
            if (s.recMin === Infinity) s.recMin = 0;
            info.stats.push(s);
        });
    } catch (e) {
        info.stats = [];
        info.statsError = String(e && e.message ? e.message : e).slice(0, 200);
    }
    return info;
}

function buildContext(results, details, inputs) {
    const r4 = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(Number(v).toFixed(4)) : null);
    const r1 = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(Number(v).toFixed(1)) : null);
    const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
    const nameOf = (r, i) => String(r.community_name || r.community_id || `Community ${i + 1}`);
    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const generatedAt = new Date().toISOString(); // one value for section 2 and the facts block
    const POINT_ROWS = 30; // per-community cap for the per-point list in section 6

    // Files in the input folder that the file filter did not consider.
    let ignored = [];
    try {
        ignored = fs.readdirSync(INPUT_DIR).filter(f => !inputs.some(x => x.file === f));
    } catch (e) { /* keep empty */ }

    const stats = inputs.flatMap(x => x.stats || []);
    const statsAligned = stats.length === results.length;
    const aggs = results.map((_, i) => (details[i] && details[i].byTs && details[i].byTs.size ? reportTimeAggregates(details[i].byTs) : null));

    const totalIn = sum(results, r => Number(r.metrics.total_community_consumption) || 0);
    const totalOut = sum(results, r => Number(r.metrics.total_community_surplus) || 0);
    const totalCups = sum(results, r => Number(r.metrics.total_cups) || 0);
    const totalRecords = sum(stats, s => s.records);
    const minTs = stats.map(s => s.minTs).filter(Boolean).sort()[0] || null;
    const maxTs = stats.map(s => s.maxTs).filter(Boolean).sort().slice(-1)[0] || null;
    const allDays = [...new Set(aggs.filter(Boolean).flatMap(a => a.days))].sort();

    // CUPS listed in more than one community.
    const idCount = new Map();
    stats.forEach(s => new Set(s.pointIds).forEach(id => idCount.set(id, (idCount.get(id) || 0) + 1)));
    const sharedIds = [...idCount.values()].filter(n => n > 1).length;

    // Per-community derived figures (same formulas and P-numbering as the HTML report).
    const comm = results.map((r, i) => {
        const inT = Number(r.metrics.total_community_consumption) || 0;
        const outT = Number(r.metrics.total_community_surplus) || 0;
        const agg = aggs[i];
        const det = details[i];
        const pointNo = new Map();
        if (det) det.cups.forEach((c, k) => { if (!pointNo.has(c.id)) pointNo.set(c.id, `P${k + 1}`); });
        const label = (id) => (pointNo.has(id) ? `${pointNo.get(id)} ` : "") + reportMaskId(id);
        const maskCount = new Map();
        if (det) det.cups.forEach(c => { const k = reportMaskId(c.id); maskCount.set(k, (maskCount.get(k) || 0) + 1); });
        const dupMasks = [...maskCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} (${n} points: ${det.cups.map((c, j) => (reportMaskId(c.id) === k ? `P${j + 1}` : null)).filter(Boolean).join(", ")})`);
        let exportHours = 0;
        if (det && det.byTs) for (const v of det.byTs.values()) if (v.out > v.in) exportHours++;
        return {
            r, i, inT, outT, agg, det, label, exportHours, dupMasks,
            ratio: pct(outT, inT),
            potential: pct(Math.min(outT, inT), inT),
            hourly: agg ? pct(agg.matched, inT) : null,
            st: statsAligned ? stats[i] : null
        };
    });

    // ---------- 2. this run ----------
    const run = [];
    run.push({ label: "Generated at (UTC)", value: `${generatedAt} (this file; the HTML footer shows its own generation time to the minute)` });
    run.push({ label: "Algorithm", value: "community_analytic.js (Empower-X C2D algorithm); no version number is recorded in the algorithm." });
    run.push({ label: "Input files considered", value: inputs.length ? inputs.map(x => x.file).join(", ") : "none" });
    inputs.forEach(x => {
        let v;
        if (x.error) v = `FAILED, skipped: ${x.error}`;
        else if (!x.communities) v = `read as ${x.format || "JSON"}; contained no energy community with an id/name and at least one supply point, so it contributed nothing` +
            (x.file === "algoCustomData.json" ? " (this is the job's parameter file; the algorithm reads every .json file as possible data)" : "");
        else v = `read as ${x.format || "JSON"}; ${x.communities} communit${x.communities === 1 ? "y" : "ies"}, ` +
            `${sum(x.stats || [], s => s.cups)} supply points, ${sum(x.stats || [], s => s.records)} hourly records`;
        run.push({ label: `Input file ${x.file}`, value: v });
    });
    run.push({ label: "Files in the input folder not considered", value: ignored.length ? `${ignored.length}: ${ignored.slice(0, 20).join(", ")} (only .json, .csv, .txt and extension-less files not starting with '.' are read)` : "none" });
    run.push({ label: "Communities analysed", value: results.length });
    run.push({ label: "Supply points (CUPS) analysed", value: totalCups });
    run.push({ label: "Hourly records read", value: totalRecords });
    run.push({ label: "Time period covered", value: minTs ? `${minTs} to ${maxTs} (timestamps as written in the input, no time zone given)` : "unknown (no timestamps)" });
    run.push({ label: "Days with data", value: allDays.length });
    run.push({ label: "Parameters (algoCustomData)", value: "None: this algorithm has no configurable parameters, any values in algoCustomData.json are ignored. Fixed settings: outlier percentiles 5% and 95%; JSON numbers rounded to 4 decimals." });

    // ---------- 3. output files ----------
    const files = [{ file: "community_analysis.json", format: "JSON (array)", contents: `The result: one object per energy community (${results.length} in this run) with totals, averages, largest consumer and surplus producer, and top/bottom 5% consumers. Holds the FULL supply-point (CUPS) ids.` }];
    let htmlExists = false;
    try { htmlExists = fs.existsSync(path.join(OUTPUT_DIR, "community_analysis.html")); } catch (e) { /* ignore */ }
    if (htmlExists) files.push({ file: "community_analysis.html", format: "HTML (self-contained, open in a browser)", contents: "Visual report: overview KPIs and charts for all communities, then one section per community (KPIs, self-sufficiency donut, per-supply-point bar chart, top/bottom 5% chart, average 24-hour profile). Supply-point ids are MASKED (first 4 and last 4 characters) and numbered P1, P2 ... in input order. Rounding: the KPI tiles show kWh and % with at most 1 decimal; the 'Communities at a glance' table, chart tooltips (hover) and bar labels show up to 2 decimals; percentages always 1 decimal. Thousands separators are commas (28,987.97). No timestamps of individual records, no place types and no full ids are shown." });

    // ---------- 4. fields ----------
    const J = "community_analysis.json";
    const H = "community_analysis.html";
    const fields = [
        { file: J, field: "(root)", type: "array of objects", unit: "", meaning: "One element per energy community, in input order (files in directory listing order, communities in the order they appear in each file). Empty array [] if no community was found." },
        { file: J, field: "[].community_id", type: "string (as in input)", unit: "", meaning: "Community id from the input (key absent if the input community had only a name)." },
        { file: J, field: "[].community_name", type: "string (as in input)", unit: "", meaning: "Community name from the input (key absent if the input had none)." },
        { file: J, field: "[].metrics.total_cups", type: "integer", unit: "count", meaning: "Number of supply points (CUPS) listed in the community, including any without hourly data (they count as 0 kWh)." },
        { file: J, field: "[].metrics.avg_consumption_per_cup", type: "number (4 decimals)", unit: "kWh", meaning: "Total grid consumption of the community / total_cups, over the whole period (not per day)." },
        { file: J, field: "[].metrics.avg_surplus_per_cup", type: "number (4 decimals)", unit: "kWh", meaning: "Total surplus exported by the community / total_cups, over the whole period." },
        { file: J, field: "[].metrics.total_community_consumption", type: "number (4 decimals)", unit: "kWh", meaning: "Sum of kwh_in (energy taken from the grid) over all supply points and all hours." },
        { file: J, field: "[].metrics.total_community_surplus", type: "number (4 decimals)", unit: "kWh", meaning: "Sum of kwh_out (energy fed back to the grid, e.g. excess solar) over all supply points and all hours." },
        { file: J, field: "[].highlights.max_consumer.cups_id", type: "string", unit: "", meaning: "Full CUPS id of the supply point with the highest total consumption (ties: the last one in input order)." },
        { file: J, field: "[].highlights.max_consumer.value", type: "number (4 decimals)", unit: "kWh", meaning: "That supply point's total grid consumption over the period." },
        { file: J, field: "[].highlights.max_surplus.cups_id", type: "string", unit: "", meaning: "Full CUPS id of the supply point with the highest total surplus exported. If no point exported anything this is simply the last point in input order, with value 0." },
        { file: J, field: "[].highlights.max_surplus.value", type: "number (4 decimals)", unit: "kWh", meaning: "That supply point's total surplus exported over the period." },
        { file: J, field: "[].outliers.bottom_5_percent_consumers", type: "array of {cups_id, value}", unit: "", meaning: "Supply points whose total consumption is at or below the 5th percentile within the community; in input order (not sorted)." },
        { file: J, field: "[].outliers.top_5_percent_consumers", type: "array of {cups_id, value}", unit: "", meaning: "Supply points whose total consumption is at or above the 95th percentile within the community; in input order (not sorted)." },
        { file: J, field: "[].outliers.*[].cups_id", type: "string", unit: "", meaning: "Full CUPS id." },
        { file: J, field: "[].outliers.*[].value", type: "number (4 decimals)", unit: "kWh", meaning: "That supply point's total grid consumption over the period." }
    ];
    if (htmlExists) fields.push(
        { file: H, field: "Overview KPI tiles", type: "text (1 decimal)", unit: "count, kWh, %", meaning: "Communities, Supply points, Total grid consumption, Total surplus exported, 'Surplus vs consumption' % (= total surplus / total consumption x 100, all communities together)." },
        { file: H, field: "Overview table 'Communities at a glance'", type: "table (up to 2 decimals)", unit: "count, kWh, %", meaning: "One row per community: Community, Supply points, Consumption (kWh) = metrics.total_community_consumption, Surplus (kWh) = metrics.total_community_surplus, Avg. per point (kWh) = metrics.avg_consumption_per_cup, Surplus vs consumption (%) = surplus / consumption x 100 (1 decimal)." },
        { file: H, field: "Per-community KPI tiles", type: "text (1 decimal)", unit: "kWh, %", meaning: "Same metrics as the JSON (rounded), the largest consumer and largest surplus producer with P-number + masked id and their share of the community total, and 'Self-sufficiency potential' % (not in the JSON)." },
        { file: H, field: "Self-sufficiency donut + note", type: "inline SVG + sentence", unit: "kWh, %", meaning: "Slices 'Coverable by shared surplus' = min(surplus, consumption) and 'Still needed from the grid'. The note under it gives the potential %; the hour-matched coverage appears there as a NUMBER only when it differs from the potential, otherwise the note just says 'In no hour does the community feed back more than it consumes...'." },
        { file: H, field: "Charts", type: "inline SVG", unit: "kWh, kWh/day, kWh per hour", meaning: "Grid consumption and surplus per community (bars); daily consumption per community (line, kWh/day); per-supply-point bars (every point, labelled P-number + masked id, values in tooltips with up to 2 decimals); top/bottom 5% bars (sorted by value); average 24-hour profile (community total per clock hour, averaged over the days, kWh per hour)." },
        { file: H, field: "Footer", type: "text", unit: "", meaning: "Generation time (UTC, to the minute) and a pointer to community_analysis.json." }
    );

    // ---------- 5. method ----------
    const method = [
        "Input: energy communities, each with a list of supply points (cups), each with hourly records (energy_hourly or energyHourly) carrying kwh_in (or kwhIn) and kwh_out (or kwhOut). Communities are taken from data[], communities[], a top-level array, or a single community object. Communities without id and name, or with no supply points, are skipped.",
        "CSV/TXT inputs (only when a file is not valid JSON): comma-separated; CUPS id in column 4, timestamp in column 6, kwh_in in column 7, kwh_out in column 8 (1-based); lines with fewer than 7 columns and header lines are skipped; the whole file becomes one community named after the file.",
        "Field precedence: for each hourly record the algorithm takes kwhIn if it is present and truthy, otherwise kwh_in (same for kwhOut / kwh_out); energyHourly is used only if energy_hourly is missing, infoDt only if info_dt is missing. Because the test is 'truthy', an explicit 0 or empty kwhIn falls through to kwh_in.",
        "Values are read with parseFloat; missing, empty or non-numeric values count as 0. Other input fields (production, battery, place_type, record ids) are NOT used for the JSON result.",
        "Per supply point: total consumption = sum of kwh_in over all its hourly records; total surplus = sum of kwh_out.",
        "Per community: total_community_consumption = sum of the point totals; total_community_surplus likewise; avg_consumption_per_cup = total consumption / total_cups; avg_surplus_per_cup = total surplus / total_cups.",
        "Largest consumer / surplus producer = point with the maximum total (stable ascending sort, last element taken).",
        "Outliers: percentiles of the points' consumption totals with linear interpolation at position (n - 1) x p, p = 0.05 and 0.95. bottom_5 = points with total <= P5; top_5 = points with total >= P95. With fewer than about 20 points this is just the single smallest and the single largest consumer (plus ties).",
        "Rounding: every number in the JSON is rounded to 4 decimals at the end (averages come from unrounded totals; trailing zeros are dropped, so 16084.63 means 16084.6300). The HTML KPI tiles show 1 decimal; the HTML table, tooltips and bar labels show up to 2 decimals; all percentages in the HTML and in this file are rounded to 1 decimal. Per-point values in section 6 of this file are rounded to 4 decimals.",
        "Time: timestamps (info_dt) are used as written, without time-zone conversion. They matter only for the HTML charts (daily totals use the YYYY-MM-DD part, the hourly profile the HH part). The JSON totals ignore time and sum whatever records are present.",
        "Surplus vs consumption (%) (HTML overview tile and table) = total surplus / total consumption x 100. It can exceed 100.",
        "Self-sufficiency potential (%) (HTML per-community KPI and donut) = min(total surplus, total consumption) / total consumption x 100: the share of grid consumption the community's own exported surplus could cover if shared. It equals 'Surplus vs consumption' whenever surplus <= consumption and is capped at 100 when surplus exceeds consumption.",
        "Hour-matched coverage (%) = sum over timestamps of min(community consumption, community surplus in that hour) / total consumption x 100, i.e. surplus that could be used in the same hour it was exported. It is computed for this file; the HTML shows it as a number only when it differs from the potential (otherwise the HTML only says that in no hour the community fed back more than it consumed). It is never higher than the potential.",
        "Shares: largest consumer share = its value / community consumption x 100; largest producer share = its value / community surplus x 100.",
        "Several input files are processed independently and their communities appended; a community present in two files is reported twice."
    ];

    // ---------- 6. results ----------
    const results6 = [
        { label: "Communities analysed", value: results.length, unit: "count" },
        { label: "Supply points", value: totalCups, unit: "count" },
        { label: "Total grid consumption (all communities)", value: r4(totalIn), unit: "kWh" },
        { label: "Total surplus exported (all communities)", value: r4(totalOut), unit: "kWh" },
        { label: "Surplus vs consumption (all communities)", value: r1(pct(totalOut, totalIn)), unit: "%" }
    ];
    comm.forEach(c => {
        const m = c.r.metrics;
        const n = nameOf(c.r, c.i);
        const mc = (c.r.highlights && c.r.highlights.max_consumer) || {};
        const ms = (c.r.highlights && c.r.highlights.max_surplus) || {};
        results6.push(
            { label: `${n}: supply points`, value: m.total_cups, unit: "count" },
            { label: `${n}: grid consumption`, value: m.total_community_consumption, unit: "kWh" },
            { label: `${n}: surplus exported`, value: m.total_community_surplus, unit: "kWh" },
            { label: `${n}: average consumption per point`, value: m.avg_consumption_per_cup, unit: "kWh" },
            { label: `${n}: average surplus per point`, value: m.avg_surplus_per_cup, unit: "kWh" },
            { label: `${n}: largest consumer`, value: `${c.label(mc.cups_id)} = ${mc.value} (${r1(pct(Number(mc.value) || 0, c.inT))}% of community consumption)`, unit: "kWh" },
            { label: `${n}: largest surplus producer`, value: Number(ms.value) > 0 ? `${c.label(ms.cups_id)} = ${ms.value} (${r1(pct(Number(ms.value) || 0, c.outT))}% of community surplus)` : "none (no point exported surplus)", unit: "kWh" },
            { label: `${n}: top 5% consumers`, value: ((c.r.outliers || {}).top_5_percent_consumers || []).map(o => `${c.label(o.cups_id)} = ${o.value}`).join("; ") || "none", unit: "kWh" },
            { label: `${n}: bottom 5% consumers`, value: ((c.r.outliers || {}).bottom_5_percent_consumers || []).map(o => `${c.label(o.cups_id)} = ${o.value}`).join("; ") || "none", unit: "kWh" },
            { label: `${n}: surplus vs consumption (HTML table)`, value: r1(c.ratio), unit: "%" },
            { label: `${n}: self-sufficiency potential (HTML KPI and donut)`, value: r1(c.potential), unit: "%" },
            { label: `${n}: hour-matched coverage (computed for this file; ${c.hourly !== null && c.potential !== null && Math.abs(c.hourly - c.potential) > 0.05 ? "also shown as a number in the HTML donut note, because it differs from the potential" : "NOT shown as a number in the HTML, because it equals the potential"})`, value: r1(c.hourly), unit: "%" }
        );
    });
    // Per supply point (masked), largest consumers first; not in the JSON. 4 decimals (more precise than the HTML).
    // place type is an input label, not in any output file.
    comm.forEach(c => {
        if (!c.det) return;
        c.det.cups.slice().sort((a, b) => b.in - a.in).slice(0, POINT_ROWS).forEach((p, rank) => results6.push({
            label: `${nameOf(c.r, c.i)}: point ${c.label(p.id)}${p.type ? ` [input place_type: ${p.type}]` : ""}`,
            value: `rank ${rank + 1} by consumption; consumption ${r4(p.in)}, surplus ${r4(p.out)} (${r1(pct(p.in, c.inT))}% of community consumption${c.outT > 0 ? `, ${r1(pct(p.out, c.outT))}% of community surplus` : ""})`,
            unit: "kWh"
        }));
        if (c.det.cups.length > POINT_ROWS) results6.push({ label: `${nameOf(c.r, c.i)}: other points`, value: `${c.det.cups.length - POINT_ROWS} more, see the HTML bar chart (2 decimals)`, unit: "" });
        if (c.dupMasks.length) results6.push({ label: `${nameOf(c.r, c.i)}: masked ids shared by several points`, value: `${c.dupMasks.join("; ")}. Always use the P-number to tell them apart.`, unit: "" });
    });

    // ---------- 7. limitations ----------
    const lim = [
        "Consumption here means energy IMPORTED FROM THE GRID (kwh_in) and surplus means energy EXPORTED TO THE GRID (kwh_out). Solar energy used on site (self-consumption) is in neither figure, so real total consumption and real production are higher than shown.",
        "The JSON has no complete per-supply-point list: only the largest consumer, the largest surplus producer and the top/bottom 5% points appear there, with full CUPS ids. Which source to trust for a per-point value: the JSON where the point appears there (4 decimals, authoritative); otherwise the per-point list in section 6 of this file (4 decimals, same calculation); the HTML bar chart shows the same values rounded to 2 decimals.",
        "Supply-point ids are masked in the HTML and in this file (first 4 + last 4 characters, prefixed by the P-number = position in the community's input list). Masked ids are NOT unique, even inside one community (see 'masked ids shared by several points' in section 6), so always quote the P-number together with the masked id (e.g. 'P5 ES00…AB0F'). P-numbers restart in each community. The full ids are in community_analysis.json, only for the points listed there; to find the full id of a highlighted point, match its kWh value.",
        "Figures taken from the INPUT data rather than from the outputs, and therefore not visible in or checkable against the HTML or JSON: the place_type labels (section 6 per-point list and section 7), hourly record counts, the period timestamps, the 'production' totals, night-export and battery counts below. The hour-matched coverage and the per-point shares of surplus are computed here from the same data the HTML used.",
        "No time-zone information: timestamps are used as written (presumably local time). Gaps or missing hours are neither detected nor filled; totals cover the records present.",
        "Missing or non-numeric kWh values silently count as 0.",
        "The 5%/95% 'outliers' are relative positions, not anomalies; with few points they are just the smallest and largest consumers.",
        "Self-sufficiency potential assumes all exported surplus could be shared with members at any time; hour-matched coverage is the stricter estimate without storage. Neither accounts for network losses or legal sharing rules.",
        "No costs, prices, tariffs or CO2 figures are computed."
    ];
    if (inputs.some(x => x.error)) lim.push(`Input files that failed and were skipped: ${inputs.filter(x => x.error).map(x => x.file).join(", ")}.`);
    if (!results.length) lim.push("No energy community was found in this run, so the JSON is an empty array and there are no results.");
    if (sharedIds) lim.push(`${sharedIds} supply-point id(s) appear in more than one community; they are counted in each.`);
    if (!statsAligned && results.length) lim.push("Per-community input statistics could not be matched to the results; the input-quality notes below may be incomplete.");
    comm.forEach(c => {
        const s = c.st;
        if (!s) return;
        const bits = [];
        bits.push(`${s.records} hourly records over ${s.cups} points (${s.recMin === s.recMax ? `${s.recMin} per point` : `${s.recMin} to ${s.recMax} per point: uneven coverage, so point totals cover different periods`})`);
        bits.push(`period ${s.minTs || "?"} to ${s.maxTs || "?"}`);
        bits.push(`place types: ${Object.entries(s.placeTypes).map(([k, v]) => `${k} ${v}`).join(", ")}`);
        if (s.emptyPoints) bits.push(`${s.emptyPoints} point(s) without any hourly data (count as 0 but still lower the averages)`);
        if (s.noTimestamp) bits.push(`${s.noTimestamp} record(s) without timestamp (in the totals, not in the time charts)`);
        if (s.dupTs) bits.push(`${s.dupTs} duplicate timestamp(s) within a point (all summed)`);
        if (s.badValues) bits.push(`${s.badValues} record(s) with non-numeric kWh values (counted as 0)`);
        if (s.negative) bits.push(`${s.negative} record(s) with negative kWh values (summed as they are)`);
        if (s.both) bits.push(`${s.both} record(s) where a point both imported and exported in the same hour`);
        if (s.nightExport) bits.push(`${s.nightExport} record(s) with surplus exported at night (22:00-05:59), ${r4(s.nightExportKwh)} kWh: unusual for solar, check the data or the time zone`);
        if (s.productionRecords) bits.push(`the input also has a 'production' field (above 0 in ${s.productionRecords} records, ${r4(s.productionKwh)} kWh in total) which this algorithm ignores; it is not the same as surplus`);
        if (s.batteryRecords) bits.push(`'battery' field above 0 in ${s.batteryRecords} records (ignored)`);
        if (c.exportHours) bits.push(`in ${c.exportHours} hour(s) the community as a whole exported more than it imported`);
        else if (c.outT > 0) bits.push("in no hour did the community as a whole export more than it imported, so all surplus could in principle be used by other members in the same hour");
        lim.push(`${nameOf(c.r, c.i)}: ${bits.join("; ")}.`);
    });

    // ---------- 8. questions ----------
    const questions = [
        { question: "How much electricity did a community use / feed back?", answer: "community_analysis.json, element with that community_name: metrics.total_community_consumption (grid import, kWh) and metrics.total_community_surplus (export, kWh). Section 6 lists them for this run." },
        { question: "Which supply point consumed the most?", answer: "highlights.max_consumer of that community (full CUPS id + kWh). For a ranking of all points use the HTML chart 'Consumption and surplus per supply point' or the masked list in section 6; the JSON has no full per-point list." },
        { question: "Which supply point exports the most surplus?", answer: "highlights.max_surplus (kWh exported). If its value is 0, no point exported anything." },
        { question: "Which community consumes the most?", answer: "Sort the JSON array by metrics.total_community_consumption, descending. Use avg_consumption_per_cup to compare communities of different size." },
        { question: "How self-sufficient could the community be?", answer: "Self-sufficiency potential = min(total_community_surplus, total_community_consumption) / total_community_consumption x 100 (HTML donut, section 6). For a same-hour estimate use the hour-matched coverage in section 6." },
        { question: "Which points are unusually high or low consumers?", answer: "outliers.top_5_percent_consumers and outliers.bottom_5_percent_consumers (input order; sort by value). In small communities these are simply the largest and smallest consumer." },
        { question: "What share of the community's consumption is the largest consumer?", answer: "highlights.max_consumer.value / metrics.total_community_consumption x 100 (also in section 6 and the HTML KPI hint)." },
        { question: "What period does the data cover? When in the day is consumption highest?", answer: "Period: section 2. Daily totals and the average 24-hour profile exist only as HTML charts; the JSON has no time series." },
        { question: "Why does the HTML show a slightly different number than the JSON?", answer: "Rounding only: the HTML KPI tiles show 1 decimal, the HTML table and chart tooltips up to 2 decimals, with comma thousands separators; the JSON keeps 4 decimals. The JSON is authoritative." },
        { question: "How much did all communities together use / feed back?", answer: "Add metrics.total_community_consumption (and metrics.total_community_surplus) over all JSON elements; section 6 has the totals and the HTML overview KPIs show them rounded to 1 decimal." },
        { question: "Which supply point consumes the most in a community and what share is that?", answer: "highlights.max_consumer of that community (full id in the JSON); share = value / metrics.total_community_consumption x 100. Section 6 gives the P-number, masked id and share; rank all points with the section 6 per-point list (sorted by consumption)." },
        { question: "Is the community's self-sufficiency good?", answer: "Use the self-sufficiency potential and hour-matched coverage in section 6. Values of a few percent mean the shared surplus covers only a small part of grid consumption. It ignores solar used on site (invisible here), so the buildings' real self-sufficiency is higher; there is no benchmark in the outputs." },
        { question: "Why is the surplus so much smaller than the solar 'production' mentioned in section 7?", answer: "Surplus is only what is exported to the grid (kwh_out). Most production is used on site (self-consumption) and appears in neither consumption nor surplus. The production totals come from the input and are not in any output file." },
        { question: "How were the top 5% and bottom 5% consumers chosen?", answer: "P5 and P95 of the points' total consumption, linear interpolation at position (n - 1) x p; points at or below P5 / at or above P95 are listed. With fewer than about 20 points this is just the smallest and the largest consumer (plus ties)." },
        { question: "How much money or CO2 was saved?", answer: "The data does not tell: no prices, tariffs, costs or emission factors are used, and self-consumed solar is not visible." },
        { question: "Two points have the same masked id: which is which?", answer: "Use the P-number (position in the community's input list), shown in the HTML and in this file. P-numbers restart in each community." },
        { question: "How much solar did a building produce?", answer: "Not available: the algorithm uses only grid import/export. Surplus (kwh_out) is just the part of production not used on site." },
        { question: "What is the full id of point P3?", answer: "The HTML and this file show masked ids only. Full CUPS ids are in the JSON only for the max consumer, the max surplus producer and the 5% lists: find the point's kWh value (section 6) and look for the same value in the JSON. Points not listed there have no full id in the outputs." },
        { question: "What does 'average consumption per point' mean? Is that per day?", answer: `No. metrics.avg_consumption_per_cup = total grid consumption of the community over the whole period / number of supply points. For a daily figure divide by the number of days with data (${allDays.length} in this run).` }
    ];

    // ---------- 9. glossary ----------
    const glossary = [
        { term: "CUPS", meaning: "Codigo Universal del Punto de Suministro: the unique Spanish id of an electricity supply point (meter), e.g. ES0031...0F. Treated as personal data and masked here." },
        { term: "Supply point (cup, point)", meaning: "One metered grid connection (a building, a street-lighting circuit, ...)." },
        { term: "Energy community", meaning: "Group of supply points that can share locally produced energy (here e.g. municipal buildings)." },
        { term: "kWh", meaning: "Kilowatt-hour, the unit of electrical energy used throughout." },
        { term: "kwh_in / grid consumption", meaning: "Energy imported from the grid by a supply point in one hour." },
        { term: "kwh_out / surplus", meaning: "Energy exported (fed back) to the grid in one hour, usually excess solar not used on site." },
        { term: "Self-consumption", meaning: "Locally produced energy used on site; NOT visible in this data (it lowers kwh_in and never appears in kwh_out)." },
        { term: "Self-sufficiency potential", meaning: "Share of the community's grid consumption its own exported surplus could cover if shared (HTML)." },
        { term: "Hour-matched coverage", meaning: "Same idea, counting only surplus used in the same hour it is exported." },
        { term: "Percentile (P5 / P95)", meaning: "Value below which 5% / 95% of the points' consumption totals lie (linear interpolation)." },
        { term: "place_type", meaning: "Input label of the kind of site (education, office, sports, ...); shown in this file for context only, not in the HTML or JSON." },
        { term: "Surplus vs consumption", meaning: "Total surplus / total consumption x 100 (can exceed 100)." },
        { term: "P1, P2 ...", meaning: "Position of a supply point in its community's input list; used with masked ids to tell points apart." },
        { term: "C2D (Compute-to-Data)", meaning: "The algorithm ran next to the data; only these output files leave the data provider." }
    ];

    // ---------- 10. facts ----------
    const facts = {
        algorithm: "community_analytic.js",
        title: REPORT_TITLE,
        generated_at: generatedAt,
        parameters: { configurable: false, percentile_low: 0.05, percentile_high: 0.95, json_decimals: 4 },
        inputs: inputs.map(x => ({ file: x.file, ok: !x.error, communities: x.communities || 0, hourly_records: sum(x.stats || [], s => s.records) })),
        ignored_input_files: ignored.length,
        period: { from: minTs, to: maxTs, days: allDays.length },
        communities: results.length,
        supply_points: totalCups,
        hourly_records: totalRecords,
        total_consumption_kwh: r4(totalIn),
        total_surplus_kwh: r4(totalOut),
        surplus_vs_consumption_pct: r1(pct(totalOut, totalIn)),
        per_community: comm.map(c => {
            const h = c.r.highlights || {};
            const o = c.r.outliers || {};
            return {
                community_id: c.r.community_id === undefined ? null : c.r.community_id,
                community_name: c.r.community_name === undefined ? null : c.r.community_name,
                supply_points: c.r.metrics.total_cups,
                consumption_kwh: c.r.metrics.total_community_consumption,
                surplus_kwh: c.r.metrics.total_community_surplus,
                avg_consumption_per_point_kwh: c.r.metrics.avg_consumption_per_cup,
                avg_surplus_per_point_kwh: c.r.metrics.avg_surplus_per_cup,
                max_consumer: { point_masked: c.label((h.max_consumer || {}).cups_id), kwh: (h.max_consumer || {}).value },
                max_surplus: { point_masked: c.label((h.max_surplus || {}).cups_id), kwh: (h.max_surplus || {}).value },
                top_5_percent_count: (o.top_5_percent_consumers || []).length,
                bottom_5_percent_count: (o.bottom_5_percent_consumers || []).length,
                surplus_vs_consumption_pct: r1(c.ratio),
                self_sufficiency_potential_pct: r1(c.potential),
                hour_matched_coverage_pct: r1(c.hourly),
                hours_net_export: c.exportHours,
                duplicated_masked_ids: c.dupMasks.length
            };
        })
    };

    return contextDoc({
        title: REPORT_TITLE,
        summary: "Energy Community Analytics (Empower-X data space) summarises hourly smart-meter data of one or more energy communities. " +
            "For each community it totals how much electricity its supply points took from the grid and how much surplus (typically solar) they fed back, " +
            "computes averages per supply point, and names the largest consumer, the largest surplus producer and the top/bottom 5% consumers. " +
            "An HTML report adds charts and an estimate of how much of the community's needs its own surplus could cover.",
        run,
        files,
        fields,
        method,
        results: results6,
        limitations: lim,
        questions,
        glossary,
        facts
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

    let allCommunityResults = [];
    let reportDetails = []; // chart-only extras, aligned with allCommunityResults (never written to JSON)
    const contextInputs = []; // per-input-file notes for AI_CONTEXT.md only

    files.forEach(file => {
        console.log(`Processing file: ${file}`);
        try {
            const data = loadData(path.join(INPUT_DIR, file));
            const analysis = analyzeCommunities(data);
            allCommunityResults = allCommunityResults.concat(analysis);
            reportDetails = reportDetails.concat(reportCollectSafe(data, analysis.length));
            contextInputs.push(contextInputInfo(file, data, analysis));
        } catch (err) {
            console.error(`  -> Failed to process ${file}: ${err.message}`);
            contextInputs.push({ file, error: String(err && err.message ? err.message : err).slice(0, 200), communities: 0, stats: [] });
        }
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allCommunityResults, null, 2));
    console.log(`\n✅ Community analysis written to ${OUTPUT_FILE}`);
    console.log(`   Processed ${allCommunityResults.length} communities in total.`);

    reportWrite(fs, path.join(OUTPUT_DIR, "community_analysis.html"), () => renderReport(allCommunityResults, reportDetails));
    contextWrite(fs, path.join(OUTPUT_DIR, CONTEXT_FILE), () => buildContext(allCommunityResults, reportDetails, contextInputs));

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
