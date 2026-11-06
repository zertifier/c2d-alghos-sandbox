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

const INPUT_DIR = process.env.INPUTS || "/data/inputs";
const OUTPUT_DIR = process.env.OUTPUTS || "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "profile_analysis.json");

/* =========================
   HTML REPORT (presentation only — never changes the JSON results)
   ========================= */

const REPORT_TITLE = "Consumption Profile Analytics by Place Type";
// Extra in-memory aggregates for the HTML report, keyed by the JSON community object.
const REPORT_EXTRA = new WeakMap();

// Hourly profile and period per place type, read from the same raw data the analysis used.
function reportCollect(commResult, comm) {
    try {
        const types = {};
        const dates = new Set();
        let first = null, last = null;
        (comm.cups || []).forEach(cup => {
            const type = cup.placeType || cup.place_type || "Unspecified";
            if (!types[type]) types[type] = { hourSum: new Array(24).fill(0), hourCnt: new Array(24).fill(0) };
            const t = types[type];
            (cup.energy_hourly || cup.energyHourly || []).forEach(h => {
                const m = /(\d{4}-\d{2}-\d{2})[ T](\d{2}):/.exec(String(h.info_dt || h.infoDt || ""));
                if (!m) return;
                const hour = Number(m[2]);
                if (!(hour >= 0 && hour < 24)) return;
                const kwh = parseFloat(h.kwhIn || h.kwh_in || 0) || 0;
                t.hourSum[hour] += kwh;
                t.hourCnt[hour] += 1;
                dates.add(m[1]);
                if (first === null || m[1] < first) first = m[1];
                if (last === null || m[1] > last) last = m[1];
            });
        });
        REPORT_EXTRA.set(commResult, { types, first, last, days: dates.size });
    } catch (e) { /* report extras are optional */ }
}

function reportTypeName(type) {
    const s = String(type || "Unspecified").replace(/[_-]+/g, " ").trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unspecified";
}

// Shorten a label to `max` characters, marking the cut with "…".
function reportFit(text, max) {
    const s = String(text);
    return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function reportPeriodText(first, last, days) {
    if (!first || !last) return "";
    return first === last ? `data of ${first}` : `data from ${first} to ${last} (${days} days)`;
}

function renderReport(results) {
    const typeOrder = [];
    results.forEach(c => (c.place_type_analysis || []).forEach(p => {
        if (!typeOrder.includes(p.place_type)) typeOrder.push(p.place_type);
    }));
    const colorOf = (type) => REPORT_COLORS[Math.max(0, typeOrder.indexOf(type)) % REPORT_COLORS.length];
    const kwh = (v) => reportNum(v, 0);

    let first = null, last = null, totalPoints = 0, totalKwh = 0, totalFlagged = 0;
    const allDays = [];
    results.forEach(c => {
        const ex = REPORT_EXTRA.get(c);
        if (ex && ex.first && (first === null || ex.first < first)) first = ex.first;
        if (ex && ex.last && (last === null || ex.last > last)) last = ex.last;
        if (ex) allDays.push(ex.days);
        (c.place_type_analysis || []).forEach(p => {
            totalPoints += (p.all_cups_deviations || []).length;
            totalFlagged += (p.outliers || []).length;
        });
        if (c.community_stats) totalKwh += Number(c.community_stats.sum) || 0;
    });
    const days = first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1 : 0;
    const period = reportPeriodText(first, last, Number.isFinite(days) ? days : Math.max(0, ...allDays));

    const sections = [];

    // ---- Overview
    if (!results.length) {
        sections.push(reportSection("Overview", '<p class="empty">No community data was found in the input files, so there is nothing to chart.</p>',
            "This report summarises electricity consumption of the supply points in each energy community, grouped by place type."));
    } else {
        let html = reportKpis([
            { label: "Communities", value: reportNum(results.length, 0) },
            { label: "Supply points", value: reportNum(totalPoints, 0) },
            { label: "Total consumption", value: kwh(totalKwh), unit: "kWh", hint: period ? period.replace(/^data /, "") : "" },
            { label: "Place types", value: reportNum(typeOrder.length, 0) }
        ]);
        if (results.length > 1) {
            // The chart cuts axis labels at 22 characters: shorten them ourselves (with "…") and list the full names below.
            const fullNames = results.map(c => String(c.community_name || c.community_id || "?"));
            const cut = fullNames.some(n => n.length > 22);
            html += reportBarChart({
                title: "Total consumption per community, by place type",
                categories: fullNames.map((n, i) => (cut ? `${i + 1}. ` : "") + reportFit(n, cut ? 22 - String(i + 1).length - 2 : 22)),
                series: typeOrder.map(t => ({
                    name: reportTypeName(t),
                    color: colorOf(t),
                    values: results.map(c => {
                        const p = (c.place_type_analysis || []).find(x => x.place_type === t);
                        return p && p.group_stats ? p.group_stats.sum : 0;
                    })
                })),
                unit: "kWh",
                stacked: true,
                note: "Each bar is the summed consumption of all supply points of the community over the analysed period." +
                    (cut ? " Communities: " + fullNames.map((n, i) => `${i + 1}. ${n}`).join("; ") + "." : "")
            });
        }
        sections.push(reportSection("Overview", html,
            "Electricity consumption of every supply point is totalled over the analysed period and compared with the other supply points of the same place type (school, office, street lighting, ...)."));
    }

    // ---- One section per community
    results.forEach(c => {
        const name = String(c.community_name || c.community_id || "Community");
        const groups = c.place_type_analysis || [];
        const ex = REPORT_EXTRA.get(c) || null;
        const points = groups.reduce((a, p) => a + (p.all_cups_deviations || []).length, 0);
        const intro = `${reportNum(points, 0)} supply point${points === 1 ? "" : "s"} in ${groups.length} place type${groups.length === 1 ? "" : "s"}` +
            (ex && ex.first ? ` · ${reportPeriodText(ex.first, ex.last, ex.days)}` : "") + ".";
        const st = c.community_stats;
        if (!st || !groups.length) {
            sections.push(reportSection(name, reportKpis([{ label: "Supply points", value: "0" }]) +
                '<p class="empty">This community has no supply points with consumption data, so no statistics could be calculated.</p>', intro));
            return;
        }

        // Masked ids can coincide (same first/last 4 characters): number the duplicates so labels stay distinct.
        const maskMap = new Map(), maskSeen = {};
        groups.forEach(p => (p.all_cups_deviations || []).forEach(d => {
            if (maskMap.has(d.cups_id)) return;
            const m = reportMaskId(d.cups_id);
            maskSeen[m] = (maskSeen[m] || 0) + 1;
            maskMap.set(d.cups_id, { m, k: maskSeen[m] });
        }));
        const maskOf = (id) => {
            const e = maskMap.get(id);
            if (!e) return reportMaskId(id);
            // "#k" (not "(k)", which elsewhere means a number of supply points); no-break space keeps it on one line.
            return maskSeen[e.m] > 1 ? `${e.m} #${e.k}` : e.m;
        };

        const total = Number(st.sum) || 0;
        const biggest = groups.reduce((a, p) => (!a || p.group_stats.sum > a.group_stats.sum ? p : a), null);
        const flagged = groups.reduce((a, p) => a + (p.outliers || []).length, 0);
        const realFlagged = groups.filter(p => (p.all_cups_deviations || []).length >= 3)
            .reduce((a, p) => a + (p.outliers || []).length, 0);
        let html = reportKpis([
            { label: "Total consumption", value: kwh(total), unit: "kWh" },
            { label: "Supply points", value: reportNum(points, 0) },
            { label: "Average per supply point", value: kwh(st.avg), unit: "kWh", hint: `range ${kwh(st.min)} – ${kwh(st.max)} kWh` },
            { label: "Largest place type", value: reportTypeName(biggest.place_type), hint: total ? `${reportNum(biggest.group_stats.sum / total * 100, 1)} % of consumption` : "" },
            { label: "Flagged supply points", value: reportNum(flagged, 0), hint: realFlagged === flagged ? "see table below" : realFlagged === 0 ? "all in types with only 1–2 points" : `${reportNum(realFlagged, 0)} in types with 3 or more points` }
        ]);

        html += reportDonut({
            title: "Share of consumption by place type",
            slices: groups.map(p => ({ label: `${reportTypeName(p.place_type)} (${(p.all_cups_deviations || []).length})`, value: p.group_stats.sum, color: colorOf(p.place_type) })),
            unit: "kWh",
            note: "Number of supply points of each type in brackets."
        });

        const single = groups.filter(p => (p.all_cups_deviations || []).length === 1).map(p => reportTypeName(p.place_type));
        html += reportRangeChart({
            title: "Total consumption per supply point, by place type (kWh over the period)",
            items: groups.map(p => {
                const g = p.group_stats;
                return {
                    label: `${reportTypeName(p.place_type)} (${(p.all_cups_deviations || []).length})`,
                    color: colorOf(p.place_type),
                    min: g.min, max: g.max, low: g.p05, high: g.p95, mid: g.median,
                    midLabel: "median", lowLabel: "p05", highLabel: "p95"
                };
            }),
            unit: "kWh",
            note: single.length === groups.length
                ? "Every place type in this community has only one supply point, so each row shows that supply point's total consumption as a single dot."
                : "Line = lowest to highest supply point, shaded box = 5th to 95th percentile, dot = median." +
                    (single.length ? ` ${single.join(", ")} ${single.length === 1 ? "has" : "have"} only one supply point, shown as a single dot.` : "")
        });

        if (ex && Object.keys(ex.types).length) {
            const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
            const series = groups.filter(p => ex.types[p.place_type]).map(p => {
                const t = ex.types[p.place_type];
                return {
                    name: reportTypeName(p.place_type),
                    color: colorOf(p.place_type),
                    values: t.hourSum.map((s, h) => (t.hourCnt[h] ? s / t.hourCnt[h] : null))
                };
            }).filter(s => s.values.some(v => v !== null));
            if (series.length) {
                html += reportLineChart({
                    title: "Average daily load profile per supply point",
                    labels: hours,
                    series,
                    unit: "kWh per hour",
                    note: "Average consumption of one supply point of each type in each hour of the day, over all days analysed."
                });
            }
        }

        // Deviation of each supply point from its own place-type average (only groups that can be compared).
        const multi = groups.filter(p => (p.all_cups_deviations || []).length >= 2);
        // Types whose points all use the same amount would only draw an empty chart.
        const comparable = multi.filter(p => p.group_stats.min !== p.group_stats.max);
        const flat = multi.length - comparable.length;
        const flatNote = flat ? ` ${flat} place type${flat === 1 ? "" : "s"} where all supply points use the same amount ${flat === 1 ? "is" : "are"} not shown.` : "";
        if (!comparable.length) {
            html += `<figure><figcaption>Supply points compared with their place-type average</figcaption><p class="empty">` +
                reportEsc(multi.length
                    ? "In every place type with more than one supply point, all supply points use the same amount, so there are no differences to show."
                    : "Every place type in this community has only one supply point, so there is nothing to compare it with.") + "</p></figure>";
        } else {
            const devsOf = (p) => (p.all_cups_deviations || []).map(d => ({
                type: p.place_type, id: d.cups_id, dev: (Number(d.deviation_pct) || 0) + 0 // + 0 turns -0 into 0
            }));
            const skipped = groups.length - multi.length;
            const skippedNote = (skipped ? ` ${skipped} place type${skipped === 1 ? " has" : "s have"} a single supply point and ${skipped === 1 ? "is" : "are"} not shown.` : "") + flatNote;
            const meaning = "Above 0 = uses more than the average supply point of the same type; below 0 = uses less.";
            const allDevs = comparable.flatMap(devsOf);
            // Bar labels are cut at 22 characters and rotate (and can run off the chart) beyond 8 bars, so a
            // single combined chart with "type + id" labels is only used for a handful of bars.
            const label = (d) => {
                const id = maskOf(d.id);
                return `${reportFit(reportTypeName(d.type).split(" ")[0], Math.max(4, 21 - id.length))} ${id}`;
            };
            if (allDevs.length <= 5) {
                allDevs.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || b.dev - a.dev);
                html += reportBarChart({
                    title: "Supply points compared with their place-type average (%)",
                    categories: allDevs.map(label),
                    series: [{ name: "Difference from place-type average", values: allDevs.map(d => d.dev), color: REPORT_COLORS[0] }],
                    unit: "%",
                    note: meaning + skippedNote
                });
            } else {
                const MAX_CHARTS = 6, MAX_BARS = 40;
                const shown = [...comparable].sort((a, b) => (b.all_cups_deviations || []).length - (a.all_cups_deviations || []).length)
                    .slice(0, MAX_CHARTS);
                const hidden = comparable.length - shown.length;
                comparable.filter(p => shown.includes(p)).forEach((p, i, arr) => {
                    let devs = devsOf(p).sort((a, b) => b.dev - a.dev);
                    const n = devs.length;
                    let limitNote = "";
                    if (n > MAX_BARS) {
                        devs = devs.slice(0, MAX_BARS / 2).concat(devs.slice(-MAX_BARS / 2));
                        limitNote = ` Showing the ${MAX_BARS / 2} highest and ${MAX_BARS / 2} lowest of ${n} supply points; all values are in the JSON file.`;
                    }
                    const last = i === arr.length - 1;
                    html += reportBarChart({
                        title: `${reportTypeName(p.place_type)} (${n} supply points): difference from the type average (%)`,
                        categories: devs.map(d => maskOf(d.id)),
                        series: [{ name: `Difference from ${reportTypeName(p.place_type).toLowerCase()} average`, values: devs.map(d => d.dev), color: colorOf(p.place_type) }],
                        unit: "%",
                        note: (i === 0 ? meaning : "") + limitNote +
                            (last ? skippedNote + (hidden ? ` ${hidden} more place type${hidden === 1 ? "" : "s"} with fewer supply points ${hidden === 1 ? "is" : "are"} not charted; see the JSON file.` : "") : "")
                    });
                });
            }
        }

        // Outliers table
        const rows = [];
        groups.forEach(p => {
            const n = (p.all_cups_deviations || []).length;
            (p.outliers || []).forEach(o => {
                let reading;
                if (n === 1) reading = "Only supply point of this type — nothing to compare with";
                else if (n === 2) reading = "Group of 2 — both points are flagged by definition";
                else if (p.group_stats.min === p.group_stats.max) reading = "All points of this type use the same amount — flagged by definition";
                else if (o.consumption >= p.group_stats.max) reading = `Highest of the ${n} points of its type`;
                else if (o.consumption <= p.group_stats.min) reading = `Lowest of the ${n} points of its type`;
                else if (o.consumption >= p.group_stats.p95) reading = "Among the highest of its type (top 5 %)";
                else reading = "Among the lowest of its type (bottom 5 %)";
                rows.push({
                    // word joiner after "…" so the narrow table column never wraps an id in two
                    type: reportTypeName(p.place_type), id: maskOf(o.cups_id).replace("…", "…⁠"), kwh: o.consumption,
                    dev: (Number(o.deviation_pct) || 0) + 0, n, reading // + 0 turns -0 into 0
                });
            });
        });
        rows.sort((a, b) => (b.n >= 3) - (a.n >= 3) || Math.abs(b.dev) - Math.abs(a.dev));
        const smallFlagged = rows.filter(r => r.n < 3).length;
        if (rows.length) {
            html += reportTable({
                title: "Flagged supply points",
                columns: [
                    { key: "type", label: "Place type" },
                    { key: "id", label: "Supply point" },
                    { key: "kwh", label: "Consumption (kWh)", num: true },
                    { key: "dev", label: "Vs. type average (%)", num: true },
                    { key: "n", label: "Points in type", num: true },
                    { key: "reading", label: "How to read it" }
                ],
                rows,
                note: "A supply point is flagged when its consumption is at or below the 5th percentile or at or above the 95th percentile of its place type, so the lowest and the highest point of every type are always flagged; the size of the difference from the type average shows how unusual it really is." +
                    (smallFlagged ? ` ${smallFlagged} of ${rows.length} flagged points belong to place types with only 1 or 2 supply points, where every point is flagged automatically; this is not a sign of abnormal consumption.` : "")
            });
        }

        sections.push(reportSection(name, html, intro));
    });

    return reportPage({
        title: REPORT_TITLE,
        subtitle: results.length
            ? `Consumption of ${reportNum(results.length, 0)} energy communit${results.length === 1 ? "y" : "ies"} compared by place type${period ? " · " + period : ""}. Supply-point ids are shortened for privacy.`
            : "No community data found.",
        sections,
        jsonFile: "profile_analysis.json"
    });
}

/* =========================
   STATISTICS UTILS
   ========================= */

const getStats = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    const avg = sum / values.length;
    
    const getP = (p) => {
        const pos = (sorted.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
    };

    return {
        sum: Number(sum.toFixed(4)),
        avg: Number(avg.toFixed(4)),
        min: Number(sorted[0].toFixed(4)),
        max: Number(sorted[sorted.length - 1].toFixed(4)),
        median: Number(getP(0.5).toFixed(4)),
        p05: Number(getP(0.05).toFixed(4)),
        p95: Number(getP(0.95).toFixed(4))
    };
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
    KWH_IN: 6
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
            if (!cupsMap[cupsId]) cupsMap[cupsId] = { id: cupsId, energy_hourly: [], placeType: "Unspecified" };
            
            cupsMap[cupsId].energy_hourly.push({
                info_dt: cols[COL_IDX.INFO_DT],
                kwh_in: parseNum(cols[COL_IDX.KWH_IN])
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

const analyzeProfiles = (data) => {
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

        // Calculate total stats for the community based on sum of each CUPS
        const cupsTotals = (comm.cups || []).map(cup => {
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            return energyArray.reduce((sum, h) => {
                const val = h.kwhIn || h.kwh_in || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
        });
        // ... rest of loop ...

        const commResult = {
            community_id: comm.id,
            community_name: comm.name,
            community_stats: getStats(cupsTotals),
            place_type_analysis: []
        };

        const byType = {};

        (comm.cups || []).forEach(cup => {
            const type = cup.placeType || cup.place_type || "Unspecified";
            if (!byType[type]) byType[type] = [];
            
            const energyArray = cup.energy_hourly || cup.energyHourly || [];
            const totalConsumption = energyArray.reduce((sum, h) => {
                const val = h.kwhIn || h.kwh_in || 0;
                return sum + (parseFloat(val) || 0);
            }, 0);
            
            byType[type].push({
                id: cup.id,
                consumption: totalConsumption
            });
        });

        for (const [type, cups] of Object.entries(byType)) {
            const consumptions = cups.map(c => c.consumption);
            const stats = getStats(consumptions);
            
            if (!stats) continue;

            const analyzedCups = cups.map(c => {
                const deviation = stats.avg !== 0 ? ((c.consumption - stats.avg) / stats.avg) * 100 : 0;
                return {
                    cups_id: c.id,
                    consumption: Number(c.consumption.toFixed(4)),
                    deviation_pct: Number(deviation.toFixed(2)),
                    is_outlier: c.consumption <= stats.p05 || c.consumption >= stats.p95
                };
            });

            commResult.place_type_analysis.push({
                place_type: type,
                group_stats: stats,
                outliers: analyzedCups.filter(c => c.is_outlier).map(c => ({
                    cups_id: c.cups_id,
                    consumption: c.consumption,
                    deviation_pct: c.deviation_pct
                })),
                all_cups_deviations: analyzedCups.map(c => ({
                    cups_id: c.cups_id,
                    deviation_pct: c.deviation_pct
                }))
            });
        }

        results.push(commResult);
        reportCollect(commResult, comm);
    });

    return results;
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

    let combinedResults = [];

    files.forEach(file => {
        console.log(`Processing file: ${file}`);
        try {
            const data = loadData(path.join(INPUT_DIR, file));
            const analysis = analyzeProfiles(data);
            combinedResults = combinedResults.concat(analysis);
        } catch (err) {
            console.error(`  -> Failed to process ${file}: ${err.message}`);
        }
    });

    if (!fs.existsSync(OUTPUT_DIR)) {
        try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (e) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(combinedResults, null, 2));
    console.log(`\n✅ Profile analysis written to ${OUTPUT_FILE}`);
    console.log(`   Processed ${combinedResults.length} communities.`);

    reportWrite(fs, path.join(OUTPUT_DIR, "profile_analysis.html"), () => renderReport(combinedResults));

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
