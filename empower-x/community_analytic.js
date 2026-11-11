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
        'All numbers below come from this run. Identifiers of supply points (CUPS) and people are shortened for privacy.');
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

    files.forEach(file => {
        console.log(`Processing file: ${file}`);
        try {
            const data = loadData(path.join(INPUT_DIR, file));
            const analysis = analyzeCommunities(data);
            allCommunityResults = allCommunityResults.concat(analysis);
            reportDetails = reportDetails.concat(reportCollectSafe(data, analysis.length));
        } catch (err) {
            console.error(`  -> Failed to process ${file}: ${err.message}`);
        }
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allCommunityResults, null, 2));
    console.log(`\n✅ Community analysis written to ${OUTPUT_FILE}`);
    console.log(`   Processed ${allCommunityResults.length} communities in total.`);

    reportWrite(fs, path.join(OUTPUT_DIR, "community_analysis.html"), () => renderReport(allCommunityResults, reportDetails));

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
