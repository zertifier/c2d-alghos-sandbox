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
   AI CONTEXT (AI_CONTEXT.md — description only, never changes the JSON/HTML results)
   ========================= */

// What the main loop saw, per input file (filled defensively; never throws).
const CTX_RUN = { files: [], ignored: [], inputDirFound: false, startedAt: new Date() };
// Raw-data facts per JSON community object (per-cup totals, record counts, anomalies).
const CTX_EXTRA = new WeakMap();

function ctxFileStart(file) {
    const entry = { file, status: "failed", format: "", communities: 0, skippedCommunities: 0, cups: 0, records: 0, error: "" };
    try { CTX_RUN.files.push(entry); } catch (e) {}
    return entry;
}

function ctxFileFailed(entry, err) {
    try { entry.status = "failed"; entry.error = String(err && err.message ? err.message : err); } catch (e) {}
}

// Mirrors analyzeProfiles' community extraction to describe the raw data that produced `analysis`.
function ctxFileDone(entry, data, analysis) {
    try {
        entry.status = "read";
        const isCsv = data && !Array.isArray(data) && Array.isArray(data.cups) && data.id === entry.file &&
            data.cups.every(c => c && c.placeType === "Unspecified" && Array.isArray(c.energy_hourly) &&
                c.energy_hourly.every(h => h && Object.keys(h).length === 2));
        entry.format = isCsv ? "CSV/text (columns: cups id = 4th, timestamp = 6th, kWh = 7th)" : "JSON";
        let communities = [];
        if (data && data.data && Array.isArray(data.data)) communities = data.data;
        else if (Array.isArray(data)) communities = data;
        else if (data && data.communities && Array.isArray(data.communities)) communities = data.communities;
        else if (data && (data.id || data.name)) communities = [data];
        const valid = communities.filter(comm => comm && (comm.id || comm.name));
        entry.skippedCommunities = communities.length - valid.length;
        entry.communities = valid.length;
        valid.forEach((comm, i) => {
            const res = analysis[i];
            const ex = { cups: [], records: 0, badKwh: 0, negKwh: 0, badTs: 0, emptyCups: 0, dupIds: 0, dupTs: 0, camel: 0, first: null, last: null };
            const seenIds = new Set();
            (comm.cups || []).forEach(cup => {
                const arr = cup.energy_hourly || cup.energyHourly || [];
                if (!arr.length) ex.emptyCups++;
                if (seenIds.has(cup.id)) ex.dupIds++;
                seenIds.add(cup.id);
                const seenTs = new Set();
                let total = 0;
                arr.forEach(h => {
                    ex.records++;
                    if (h && h.kwhIn !== undefined) ex.camel++;
                    const raw = h ? (h.kwhIn || h.kwh_in || 0) : 0;
                    const v = parseFloat(raw);
                    if (raw !== 0 && raw !== "0" && isNaN(v)) ex.badKwh++;
                    if (v < 0) ex.negKwh++;
                    total += (v || 0);
                    const ts = String(h && (h.info_dt || h.infoDt) || "");
                    const m = /(\d{4}-\d{2}-\d{2})[ T](\d{2}):/.exec(ts);
                    if (!m) ex.badTs++;
                    else {
                        if (ex.first === null || ts < ex.first) ex.first = ts;
                        if (ex.last === null || ts > ex.last) ex.last = ts;
                    }
                    if (ts) { if (seenTs.has(ts)) ex.dupTs++; seenTs.add(ts); }
                });
                ex.cups.push({ id: cup.id, type: cup.placeType || cup.place_type || "Unspecified", total, records: arr.length });
            });
            entry.cups += ex.cups.length;
            entry.records += ex.records;
            if (res) CTX_EXTRA.set(res, ex);
        });
    } catch (e) { /* context extras are optional */ }
}

function ctxFmt(value, decimals = 2) {
    const n = Number(value);
    if (value === null || value === undefined || !Number.isFinite(n)) return "n/a";
    return n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

// "07:00-18:00, 20:00" from a list of hours.
function ctxHourList(hours) {
    const hh = (h) => String(h).padStart(2, "0") + ":00";
    const sorted = [...hours].sort((a, b) => a - b), parts = [];
    for (let i = 0; i < sorted.length; i++) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
        parts.push(i === j ? hh(sorted[i]) : `${hh(sorted[i])}-${hh(sorted[j])}`);
        i = j;
    }
    return parts.join(", ");
}

function buildContext(results) {
    const generatedAt = new Date().toISOString();
    // Last 8 characters of an id: tells supply points apart far better than the HTML's first-4/last-4 form
    // (ids of one distributor share a long prefix). Short ids are masked instead so no id appears in full.
    const idTail = (id) => { const s = String(id === undefined || id === null ? "" : id); return s.length >= 16 ? "…" + s.slice(-8) : reportMaskId(s); };
    const allIds = [];
    results.forEach(c => (c.place_type_analysis || []).forEach(p => (p.all_cups_deviations || []).forEach(d => allIds.push(String(d.cups_id)))));
    const tailCounts = {};
    allIds.forEach(id => { const t = idTail(id); tailCounts[t] = (tailCounts[t] || 0) + 1; });
    const tailCollisions = Object.values(tailCounts).filter(n => n > 1).length;
    const idLengths = [...new Set(allIds.map(id => id.length))].sort((a, b) => a - b);
    const nonStdIds = allIds.filter(id => !/^ES\d{16}[A-Z]{2}(\d[A-Z])?$/.test(id)).length;
    const typeOrderAll = [];
    results.forEach(c => (c.place_type_analysis || []).forEach(p => { if (!typeOrderAll.includes(p.place_type)) typeOrderAll.push(p.place_type); }));
    const missingTypes = [], zeroHours = [], tieNotes = [];
    let bestPoint = null, bestDev = null, maxGroupSize = 0;
    const readFiles = CTX_RUN.files.filter(f => f.status === "read");
    const failedFiles = CTX_RUN.files.filter(f => f.status === "failed");
    const typeSet = new Set();
    let totalPoints = 0, totalFlagged = 0, totalKwh = 0, totalRecords = 0, first = null, last = null;
    let smallGroupFlagged = 0, badKwh = 0, negKwh = 0, badTs = 0, emptyCups = 0, dupIds = 0, dupTs = 0, camel = 0;

    // Masked ids, numbered like the HTML report when two ids share the same shortened form.
    const maskers = new Map();
    const maskerFor = (c) => {
        if (maskers.has(c)) return maskers.get(c);
        const map = new Map(), seen = {};
        (c.place_type_analysis || []).forEach(p => (p.all_cups_deviations || []).forEach(d => {
            if (map.has(d.cups_id)) return;
            const m = reportMaskId(d.cups_id);
            seen[m] = (seen[m] || 0) + 1;
            map.set(d.cups_id, { m, k: seen[m] });
        }));
        const fn = (id) => { const e = map.get(id); if (!e) return reportMaskId(id); return seen[e.m] > 1 ? `${e.m} #${e.k}` : e.m; };
        maskers.set(c, fn);
        return fn;
    };

    const commRows = [], typeRows = [], topRows = [], flaggedRows = [], profileRows = [];
    const factsComms = [];
    results.forEach((c, ci) => {
        const name = String(c.community_name || c.community_id || "?");
        const groups = c.place_type_analysis || [];
        const ex = CTX_EXTRA.get(c);
        const rx = REPORT_EXTRA.get(c);
        const mask = maskerFor(c);
        const points = groups.reduce((a, p) => a + (p.all_cups_deviations || []).length, 0);
        const flagged = groups.reduce((a, p) => a + (p.outliers || []).length, 0);
        const st = c.community_stats;
        totalPoints += points; totalFlagged += flagged;
        if (st) totalKwh += Number(st.sum) || 0;
        if (results.length > 1) {
            const absent = typeOrderAll.filter(t => !groups.some(p => p.place_type === t));
            if (absent.length) missingTypes.push({ n: ci + 1, name, absent });
        }
        groups.forEach(p => {
            typeSet.add(p.place_type);
            const n = (p.all_cups_deviations || []).length;
            if (n > maxGroupSize) maxGroupSize = n;
            (p.all_cups_deviations || []).forEach(d => {
                const dv = Math.abs(Number(d.deviation_pct) || 0);
                const label = `community ${ci + 1} ${p.place_type} ${mask(d.cups_id)} (ends ${idTail(d.cups_id)}): ${ctxFmt(d.deviation_pct, 2)} %`;
                if (!bestDev || dv > bestDev.abs) bestDev = { abs: dv, n, items: [label] };
                else if (dv === bestDev.abs && bestDev.items.length < 6) bestDev.items.push(label);
            });
            if (n < 3) smallGroupFlagged += (p.outliers || []).length;
            const share = st && st.sum ? p.group_stats.sum / st.sum * 100 : null;
            typeRows.push({
                comm: `${ci + 1}. ${name}`, type: p.place_type, n,
                sum: ctxFmt(p.group_stats.sum, 4), share: share === null ? "n/a" : ctxFmt(share, 1),
                avg: ctxFmt(p.group_stats.avg, 4), range: `${ctxFmt(p.group_stats.min, 4)} to ${ctxFmt(p.group_stats.max, 4)}`,
                flagged: (p.outliers || []).length
            });
            (p.outliers || []).forEach(o => flaggedRows.push({
                comm: `${ci + 1}`, type: p.place_type, id: mask(o.cups_id), tail: idTail(o.cups_id), kwh: ctxFmt(o.consumption, 4),
                dev: ctxFmt((Number(o.deviation_pct) || 0) + 0, 2), n,
                why: n === 1 ? "only point of its type" : n === 2 ? "group of 2 (both flagged by definition)" :
                    p.group_stats.min === p.group_stats.max ? "all points equal (flagged by definition)" :
                    o.consumption >= p.group_stats.p95 ? "at/above 95th percentile" : "at/below 5th percentile"
            }));
        });
        if (ex) {
            totalRecords += ex.records; badKwh += ex.badKwh; negKwh += ex.negKwh; badTs += ex.badTs;
            emptyCups += ex.emptyCups; dupIds += ex.dupIds; dupTs += ex.dupTs; camel += ex.camel;
            if (ex.first && (first === null || ex.first < first)) first = ex.first;
            if (ex.last && (last === null || ex.last > last)) last = ex.last;
            const sortedCups = [...ex.cups].sort((a, b) => b.total - a.total);
            if (sortedCups.length && (!bestPoint || sortedCups[0].total > bestPoint.total)) {
                bestPoint = { comm: ci + 1, name, type: sortedCups[0].type, total: sortedCups[0].total, id: mask(sortedCups[0].id),
                    tail: idTail(sortedCups[0].id), share: st && st.sum ? sortedCups[0].total / st.sum * 100 : null };
            }
            sortedCups.slice(0, 10).forEach((cu, i) => topRows.push({
                comm: `${ci + 1}`, rank: i + 1, id: mask(cu.id), tail: idTail(cu.id), type: cu.type, kwh: ctxFmt(cu.total, 4),
                share: st && st.sum ? ctxFmt(cu.total / st.sum * 100, 1) : "n/a", records: cu.records
            }));
        }
        if (rx && rx.types) {
            Object.keys(rx.types).forEach(t => {
                const tt = rx.types[t];
                const avgs = tt.hourSum.map((s, h) => (tt.hourCnt[h] ? s / tt.hourCnt[h] : null));
                const valid = avgs.map((v, h) => ({ v, h })).filter(x => x.v !== null);
                if (!valid.length) return;
                const peak = valid.reduce((a, b) => (b.v > a.v ? b : a));
                const low = valid.reduce((a, b) => (b.v < a.v ? b : a));
                const day = valid.filter(x => x.h >= 8 && x.h < 20).reduce((a, x) => a + x.v, 0);
                const all = valid.reduce((a, x) => a + x.v, 0);
                // Hours whose average is within max(0.01 kWh, 5 %) of the extreme are practically tied with it.
                const tol = (v) => Math.max(0.01, Math.abs(v) * 0.05);
                const hh = (h) => String(h).padStart(2, "0") + ":00";
                const lowTies = valid.filter(x => x.v - low.v <= tol(low.v)).map(x => x.h);
                const peakTies = valid.filter(x => peak.v - x.v <= tol(peak.v)).map(x => x.h);
                const zeros = valid.filter(x => x.v === 0).map(x => x.h);
                if (zeros.length) zeroHours.push(`community ${ci + 1} ${t}: average grid import is exactly 0 kWh at ${ctxHourList(zeros)}`);
                if (lowTies.length > 1) tieNotes.push(`community ${ci + 1} ${t}: ${lowTies.length} hours (${ctxHourList(lowTies)}) are within ${ctxFmt(tol(low.v), 3)} kWh of the minimum`);
                profileRows.push({
                    comm: `${ci + 1}`, type: t,
                    peak: `${hh(peak.h)} (${ctxFmt(peak.v, 3)} kWh)` + (peakTies.length > 1 ? `; near-tie with ${ctxHourList(peakTies.filter(h => h !== peak.h))}` : ""),
                    low: (lowTies.length > 1
                        ? `flat minimum ~${ctxFmt(low.v, 3)} kWh over ${ctxHourList(lowTies)} (${lowTies.length} near-equal hours; single lowest value at ${hh(low.h)}, not meaningful)`
                        : `${hh(low.h)} (${ctxFmt(low.v, 3)} kWh)`) + (low.v === 0 ? "; zero grid import, see section 7" : ""),
                    day: all ? ctxFmt(day / all * 100, 1) : "n/a"
                });
            });
        }
        const biggest = groups.reduce((a, p) => (!a || p.group_stats.sum > a.group_stats.sum ? p : a), null);
        const biggestAvg = groups.reduce((a, p) => (!a || p.group_stats.avg > a.group_stats.avg ? p : a), null);
        commRows.push({
            n: ci + 1, id: c.community_id, name, points, types: groups.length,
            sum: st ? ctxFmt(st.sum, 4) : "n/a", avg: st ? ctxFmt(st.avg, 4) : "n/a",
            biggest: biggest ? `${biggest.place_type} (${ctxFmt(biggest.group_stats.sum, 4)} kWh summed over ${(biggest.all_cups_deviations || []).length} point(s))` : "n/a",
            biggestAvg: biggestAvg ? `${biggestAvg.place_type} (${ctxFmt(biggestAvg.group_stats.avg, 4)} kWh per point, ${(biggestAvg.all_cups_deviations || []).length} point(s))` : "n/a",
            flagged,
            period: ex && ex.first ? `${ex.first} to ${ex.last}` : (rx && rx.first ? `${rx.first} to ${rx.last}` : "n/a")
        });
        factsComms.push({
            community_id: c.community_id, community_name: c.community_name, supply_points: points,
            place_types: groups.map(p => p.place_type), total_kwh: st ? st.sum : null,
            avg_kwh_per_supply_point: st ? st.avg : null,
            largest_place_type_by_total: biggest ? biggest.place_type : null,
            largest_place_type_by_total_kwh: biggest ? biggest.group_stats.sum : null,
            largest_place_type_by_total_supply_points: biggest ? (biggest.all_cups_deviations || []).length : null,
            largest_place_type_by_avg_per_point: biggestAvg ? biggestAvg.place_type : null,
            largest_place_type_by_avg_per_point_kwh: biggestAvg ? biggestAvg.group_stats.avg : null,
            absent_place_types: (missingTypes.find(m => m.n === ci + 1) || { absent: [] }).absent,
            flagged_supply_points: flagged, hourly_records: ex ? ex.records : null,
            first_timestamp: ex ? ex.first : null, last_timestamp: ex ? ex.last : null,
            days_with_data: rx ? rx.days : null
        });
    });
    const days = first && last ? Math.round((Date.parse(last.slice(0, 10)) - Date.parse(first.slice(0, 10))) / 86400000) + 1 : 0;
    const periodText = first ? `${first} to ${last} (${days} calendar day${days === 1 ? "" : "s"}), timestamps used as written in the data` : "no timestamps found";

    const fileList = CTX_RUN.files.map(f => f.status === "read" && !f.communities && !f.cups
        ? `${f.file} (read as a data file like every input; it contained no community data, so it contributed nothing${f.skippedCommunities ? `; ${f.skippedCommunities} entries without id/name skipped` : ""})`
        : f.status === "read"
        ? `${f.file} (${f.format}: ${f.communities} communit${f.communities === 1 ? "y" : "ies"}, ${f.cups} supply points, ${f.records} hourly records${f.skippedCommunities ? `, ${f.skippedCommunities} entries without id/name skipped` : ""})`
        : `${f.file} (FAILED: ${f.error})`).join("; ");

    const run = [
        { label: "Marketplace / data space", value: "Empower-X (Compute-to-Data)" },
        { label: "Algorithm", value: `${REPORT_TITLE} (empower-x/profile_analytic.js); no version number is recorded in the code` },
        { label: "Generated at", value: `${generatedAt} (UTC)` },
        { label: "Input folder", value: CTX_RUN.inputDirFound ? "found" : "not found" },
        { label: "Input files processed", value: CTX_RUN.files.length ? fileList : "none" },
        { label: "Input files ignored", value: CTX_RUN.ignored.length ? `${CTX_RUN.ignored.length} (hidden files or extensions other than .json/.csv/.txt/none): ${CTX_RUN.ignored.slice(0, 20).join(", ")}` : "none" },
        { label: "Communities analysed", value: results.length },
        { label: "Supply points (CUPS) analysed", value: totalPoints },
        { label: "Place types (distinct names over all communities)", value: typeSet.size ? `${typeSet.size}: ${[...typeSet].join(", ")}` : "0" },
        { label: "Hourly records read", value: totalRecords },
        { label: "Time period covered", value: periodText },
        { label: "Supply point ids", value: allIds.length ? `${allIds.length} ids, length ${idLengths.join("/")} characters; ${nonStdIds} of them do not follow the standard Spanish CUPS format (ES + 16 digits + 2 check letters, optionally + 1 digit and 1 letter = 20 or 22 characters). Ids are shortened in this file; full ids are only in profile_analysis.json.` : "none" },
        { label: "Parameters", value: `None. This algorithm has no settings, so there are no defaults to report.${CTX_RUN.files.some(f => f.file === "algoCustomData.json") ? " algoCustomData.json was present and was read only as a possible data file (it contained no community data); its values are never used as configuration." : ""} Fixed rules: outlier band = 5th and 95th percentile of each place type; statistics rounded to 4 decimals, deviations to 2 decimals.` }
    ];

    const files = [
        { file: "profile_analysis.json", format: "JSON (array, pretty-printed)", contents: `One object per analysed community (${results.length} in this run): consumption statistics of the community and, per place type, statistics, flagged supply points (outliers) and every supply point's % deviation from its type average. Full CUPS ids.` },
        { file: "profile_analysis.html", format: "HTML (self-contained, open in a browser)", contents: "Visual report: KPIs, consumption per community by place type, share donut, per-type range chart, average hourly load profile per type, deviation bar charts and a flagged-supply-points table. CUPS ids are shortened (first 4 + last 4 characters)." }
    ];

    const statFields = (prefix, scope) => [
        ["sum", `total consumption of all supply points of the ${scope}`],
        ["avg", `mean of the per-supply-point totals of the ${scope} (sum / number of supply points)`],
        ["min", `smallest per-supply-point total in the ${scope}`],
        ["max", `largest per-supply-point total in the ${scope}`],
        ["median", `median per-supply-point total in the ${scope} (linear interpolation)`],
        ["p05", `5th percentile of per-supply-point totals in the ${scope} (linear interpolation)`],
        ["p95", `95th percentile of per-supply-point totals in the ${scope} (linear interpolation)`]
    ].map(([k, m]) => ({ file: "profile_analysis.json", field: `${prefix}.${k}`, type: "number (4 decimals)", unit: "kWh over the whole period", meaning: m }));

    const fields = [
        { file: "profile_analysis.json", field: "[] (top level)", type: "array of community objects", unit: "", meaning: "One element per community found in the input files, in input order. Empty array when no community data was found." },
        { file: "profile_analysis.json", field: "[].community_id", type: "string", unit: "", meaning: "Community id from the input (for CSV/text input: the input file name)." },
        { file: "profile_analysis.json", field: "[].community_name", type: "string (may be missing if the input had no name)", unit: "", meaning: "Community name from the input (for CSV/text input: file name without extension)." },
        { file: "profile_analysis.json", field: "[].community_stats", type: "object, or null when the community has no supply points", unit: "", meaning: "Statistics over the total consumption of every supply point of the community (one value per supply point)." },
        ...statFields("[].community_stats", "community"),
        { file: "profile_analysis.json", field: "[].place_type_analysis", type: "array of place-type objects", unit: "", meaning: "One element per place type present in the community, in order of first appearance in the input." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].place_type", type: "string", unit: "", meaning: "Place type of the supply points (e.g. education, office, sports, street_lighting, swimming_pool, healthcare); 'Unspecified' when the input has none (always for CSV input)." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].group_stats", type: "object", unit: "", meaning: "Statistics over the per-supply-point totals of this place type only." },
        ...statFields("[].place_type_analysis[].group_stats", "place type"),
        { file: "profile_analysis.json", field: "[].place_type_analysis[].outliers", type: "array of objects", unit: "", meaning: "Flagged supply points of this type: total consumption at or below group p05 or at or above group p95." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].outliers[].cups_id", type: "string", unit: "", meaning: "Full CUPS id (supply point identifier) of the flagged supply point." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].outliers[].consumption", type: "number (4 decimals)", unit: "kWh over the whole period", meaning: "Total consumption of that supply point (sum of its hourly kwh_in)." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].outliers[].deviation_pct", type: "number (2 decimals)", unit: "%", meaning: "(consumption - group_stats.avg) / group_stats.avg x 100; 0 when the group average is 0." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].all_cups_deviations", type: "array of objects", unit: "", meaning: "Every supply point of this type (flagged or not), in input order. Its length is the number of supply points of the type." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].all_cups_deviations[].cups_id", type: "string", unit: "", meaning: "Full CUPS id of the supply point." },
        { file: "profile_analysis.json", field: "[].place_type_analysis[].all_cups_deviations[].deviation_pct", type: "number (2 decimals)", unit: "%", meaning: "Same formula as outliers[].deviation_pct. Note: this array has NO consumption field; see section 8 for how to recover it." },
        { file: "profile_analysis.html", field: "(whole file)", type: "HTML page", unit: "kWh, kWh per hour, %", meaning: "Charts and tables built from the same data as the JSON. Ids shortened as first 4 + '…' + last 4 characters (with ' #k' added when two ids shorten identically). The hourly load profile (average kWh per supply point for each hour 00:00-23:00) appears only in the HTML; a summary is in section 6 here." }
    ];

    const method = [
        "Input: every file in the input folder whose name does not start with '.' and ends in .json, .csv, .txt or has no extension is read. JSON is used as-is; if JSON parsing fails, the file is read as comma-separated text (4th column = CUPS id, 6th = timestamp, 7th = kWh; rows with fewer than 7 columns and header rows are skipped; place type 'Unspecified'; the whole file is one community named after the file).",
        "Communities are taken from data[], a top-level array, communities[], or the object itself if it has an id or name. Entries with neither an id nor a name are skipped.",
        "Total consumption of a supply point = sum over all its hourly records of kwhIn (or kwh_in if kwhIn is missing/0). Values are parsed as numbers; missing or non-numeric values count as 0. All records are summed: there is no date filter, so the period is whatever the input contains. Other fields (kwh_out, production, battery) are not used.",
        "community_stats = statistics over the list of per-supply-point totals of the community. group_stats = the same statistics over the totals of one place type.",
        "Statistics: sum; avg = sum / count; min; max; median, p05 and p95 by linear interpolation between sorted values at position (count - 1) x p. All rounded to 4 decimals (rounding applied after calculation).",
        "deviation_pct = (supply point total - group_stats.avg) / group_stats.avg x 100, rounded to 2 decimals; 0 if the average is 0. It compares a supply point only with others of the SAME place type in the SAME community.",
        "A supply point is flagged as an outlier when its (unrounded) total <= group p05 or >= group p95 (both rounded to 4 decimals). Consequence: the lowest and highest point of every place type are always flagged, and in a place type with 1 or 2 supply points every point is flagged.",
        "Time handling: timestamps (info_dt) are used exactly as written; no time-zone conversion. The hourly profile in the HTML (and section 6) takes the hour from the timestamp text and averages kWh per record for each hour of day.",
        "Nothing is weighted by area, occupancy or number of days: a supply point with fewer records simply has a smaller total."
    ];

    const results6 = [
        { label: "Communities analysed", value: results.length, unit: "" },
        { label: "Supply points analysed", value: totalPoints, unit: "" },
        { label: "Total consumption (sum of community_stats.sum)", value: ctxFmt(totalKwh, 4), unit: "kWh" },
        { label: "Flagged supply points (all communities)", value: totalFlagged, unit: "" },
        { label: "Of which in place types with only 1-2 supply points (flagged automatically)", value: smallGroupFlagged, unit: "" },
        { label: "Period", value: first ? `${first} to ${last}` : "n/a", unit: "" }
    ];
    if (bestPoint) results6.push({ label: "Largest single supply point (all communities)", value: `${bestPoint.type} in community ${bestPoint.comm}, id ${bestPoint.id} (ends ${bestPoint.tail}): ${ctxFmt(bestPoint.total, 4)}${bestPoint.share !== null ? ` (${ctxFmt(bestPoint.share, 1)} % of its community)` : ""}`, unit: "kWh" });
    if (bestDev) results6.push({ label: "Largest absolute deviation from the place-type average", value: `${ctxFmt(bestDev.abs, 2)} % in a place type with ${bestDev.n} point(s): ${bestDev.items.join("; ")}`, unit: "%" });
    commRows.forEach(r => {
        results6.push({ label: `Community ${r.n} (${r.name}) total consumption`, value: r.sum, unit: "kWh" });
        results6.push({ label: `Community ${r.n} average per supply point`, value: r.avg, unit: "kWh" });
        results6.push({ label: `Community ${r.n} largest place type by TOTAL (all its points summed; depends on how many points the type has)`, value: r.biggest, unit: "" });
        results6.push({ label: `Community ${r.n} largest place type PER SUPPLY POINT (group_stats.avg)`, value: r.biggestAvg, unit: "" });
    });

    const cut = (rows, max) => rows.slice(0, max);
    const extraMd = [];
    extraMd.push("#### Communities");
    extraMd.push("");
    extraMd.push(mdTable([{ key: "n", label: "#" }, { key: "id", label: "community_id" }, { key: "name", label: "Name" }, { key: "points", label: "Supply points" },
        { key: "types", label: "Place types" }, { key: "sum", label: "Total kWh" }, { key: "avg", label: "Avg kWh per point" }, { key: "biggest", label: "Largest type by total (sum of its points)" }, { key: "biggestAvg", label: "Largest type per point (avg)" },
        { key: "flagged", label: "Flagged" }, { key: "period", label: "Period (first to last timestamp)" }], cut(commRows, 50)));
    if (commRows.length > 50) extraMd.push(`_Only the first 50 of ${commRows.length} communities are listed; all are in profile_analysis.json._\n`);
    extraMd.push("#### Place types per community");
    extraMd.push("");
    extraMd.push(mdTable([{ key: "comm", label: "Community" }, { key: "type", label: "Place type" }, { key: "n", label: "Supply points" }, { key: "sum", label: "Total kWh" },
        { key: "share", label: "% of community" }, { key: "avg", label: "Avg kWh per point" }, { key: "range", label: "Min to max kWh" }, { key: "flagged", label: "Flagged" }], cut(typeRows, 150)));
    if (typeRows.length > 150) extraMd.push(`_Only the first 150 of ${typeRows.length} rows are listed._\n`);
    extraMd.push("#### Largest consumers (top 10 per community, ids shortened)");
    extraMd.push("");
    extraMd.push(mdTable([{ key: "comm", label: "Community #" }, { key: "rank", label: "Rank" }, { key: "id", label: "Supply point (HTML label)" }, { key: "tail", label: "Id ends in" }, { key: "type", label: "Place type" },
        { key: "kwh", label: "Total kWh" }, { key: "share", label: "% of community" }, { key: "records", label: "Hourly records" }], cut(topRows, 300)));
    extraMd.push("#### Flagged supply points (ids shortened)");
    extraMd.push("");
    extraMd.push(mdTable([{ key: "comm", label: "Community #" }, { key: "type", label: "Place type" }, { key: "id", label: "Supply point (HTML label)" }, { key: "tail", label: "Id ends in" }, { key: "kwh", label: "Total kWh" },
        { key: "dev", label: "Vs type avg (%)" }, { key: "n", label: "Points in type" }, { key: "why", label: "Why flagged" }], cut(flaggedRows, 100)));
    if (flaggedRows.length > 100) extraMd.push(`_Only the first 100 of ${flaggedRows.length} flagged supply points are listed; all are in profile_analysis.json._\n`);
    extraMd.push("#### Average daily load profile per place type (from the HTML chart)");
    extraMd.push("Average kWh of one supply point of the type in each clock hour, over all days (sum of kwh_in in that hour / number of hourly records in that hour).");
    extraMd.push("");
    extraMd.push("");
    extraMd.push(mdTable([{ key: "comm", label: "Community #" }, { key: "type", label: "Place type" }, { key: "peak", label: "Peak hour (avg kWh per point)" },
        { key: "low", label: "Lowest hour (avg kWh per point)" }, { key: "day", label: "% of daily use 08:00-19:59" }], cut(profileRows, 150)));

    const limitations = [
        "Consumption means grid import (kwh_in) only. Own solar production, export (kwh_out) and battery are ignored, so supply points with solar panels look smaller than their real use.",
        "Totals are sums over the records present; there is no normalisation per day, per m2 or per user. Supply points with gaps in the data look smaller.",
        "Outliers are relative to the place type within the same community: the minimum and maximum of every type are always flagged, so a flag is not by itself a sign of a problem. Look at deviation_pct and the group size.",
        `In this run ${totalFlagged} of ${totalPoints} supply points are flagged, ${smallGroupFlagged} of them in place types with only 1 or 2 supply points where flagging is automatic.`,
        "all_cups_deviations[] has no consumption value; only outliers[] carries consumption. Recomputed values (avg x (1 + deviation_pct / 100)) can differ slightly from the true total because deviation_pct is rounded to 2 decimals.",
        "Rounding: statistics are rounded to 4 decimals independently, so the sum of group_stats.sum over place types can differ from community_stats.sum in the last decimal; the HTML shows rounded numbers (usually 0 decimals for kWh).",
        "Place types are compared by their exact text; differently spelled types (e.g. 'school' vs 'education') are treated as different groups.",
        "Every readable .json file in the input folder is treated as data, including algoCustomData.json; it adds nothing unless it contains id/name fields."
    ];
    missingTypes.forEach(m => limitations.push(`Community ${m.n} (${m.name}) has no supply point of type ${m.absent.join(", ")}. The HTML community bar chart still lists ${m.absent.length === 1 ? "that type" : "these types"} for it with a 0 kWh bar: that means "type not present", not zero consumption.`));
    zeroHours.forEach(z => limitations.push(`Zero grid import in the hourly profile: ${z}. Since only grid import (kwh_in) is counted, this most likely means the site covered its own use (e.g. on-site solar) or the meter recorded 0 at those hours; it is not necessarily a closed building or missing data.`));
    if (tieNotes.length) limitations.push(`Flat minimum in the hourly profile (the 'Lowest hour' is effectively a tie, do not quote a single hour): ${tieNotes.slice(0, 15).join("; ")}${tieNotes.length > 15 ? `; and ${tieNotes.length - 15} more` : ""}.`);
    if (allIds.length) {
        limitations.push(`Shortened ids: the HTML label (first 4 + last 4 characters, plus ' #k' numbered per community) is ambiguous here because many ids share a long common prefix; the same label can denote different supply points in different communities. This file therefore also gives the last 8 characters ('Id ends in')${tailCollisions ? `, which still collide for ${tailCollisions} group(s) of ids` : ", which are unique in this run"}. Full ids are only in profile_analysis.json.`);
        if (nonStdIds) limitations.push(`${nonStdIds} of ${allIds.length} supply point ids (length ${idLengths.join("/")} characters) do not follow the standard 20/22-character Spanish CUPS format; they may be synthetic or test ids. This does not affect the calculations.`);
    }
    if (maxGroupSize > 0 && maxGroupSize < 3) limitations.push(`Every place type in this run has at most ${maxGroupSize} supply point(s), so p05/p95, median and outlier flags carry no statistical meaning here; compare totals and averages directly instead.`);
    if (!CTX_RUN.inputDirFound) limitations.push("The input folder was not found, so no outputs were produced from data.");
    if (failedFiles.length) limitations.push(`${failedFiles.length} input file(s) could not be read and were skipped: ${failedFiles.map(f => `${f.file} (${f.error})`).join("; ")}.`);
    if (!results.length) limitations.push("No community data was found in this run, so profile_analysis.json is an empty array.");
    if (badKwh) limitations.push(`${badKwh} hourly record(s) had a non-numeric consumption value and were counted as 0 kWh.`);
    if (negKwh) limitations.push(`${negKwh} hourly record(s) had a negative consumption value; they were summed as-is (reducing totals).`);
    if (badTs) limitations.push(`${badTs} hourly record(s) had a missing or unreadable timestamp; they still count in totals but not in the period or hourly profile.`);
    if (dupTs) limitations.push(`${dupTs} hourly record(s) repeat a timestamp already seen for the same supply point; duplicates are summed (double counted).`);
    if (dupIds) limitations.push(`${dupIds} supply point id(s) appear more than once in a community; each occurrence is analysed as a separate supply point.`);
    if (emptyCups) limitations.push(`${emptyCups} supply point(s) have no hourly records; they count as 0 kWh and lower the averages.`);
    if (camel) limitations.push(`${camel} record(s) use the field name kwhIn instead of kwh_in (both are accepted).`);
    if (!badKwh && !negKwh && !badTs && !dupTs && !dupIds && !emptyCups && results.length) limitations.push("No data anomalies were detected in the input records (no non-numeric or negative kWh, no unreadable or duplicate timestamps, no empty or duplicate supply points).");

    const questions = [
        { question: "How much electricity did community X consume?", answer: "profile_analysis.json: find the element with that community_name / community_id and read community_stats.sum (kWh over the whole period). Also in section 6 and the Communities table above." },
        { question: "Which place type consumes the most?", answer: "Within a community, compare place_type_analysis[].group_stats.sum; the 'Place types per community' table above gives totals and % shares. For an average building of each type compare group_stats.avg instead (types have different numbers of supply points)." },
        { question: "How many supply points does a community / place type have?", answer: "Count place_type_analysis[].all_cups_deviations[] (per type) and add them up (per community)." },
        { question: "Which supply point consumed the most?", answer: "The top-10 table above (ids shortened; quote the community and the 'Id ends in' value, not only the HTML label). In the JSON the largest point of each type is always in outliers[] with its consumption; take the highest consumption over all outliers[] of the community. Full CUPS ids are only in profile_analysis.json." },
        { question: "What is the consumption of a supply point that is not flagged?", answer: "It is not stored. Estimate it as group_stats.avg x (1 + deviation_pct / 100) of its place type (small rounding error), or use the top-10 table above." },
        { question: "Which supply points are unusual?", answer: "outliers[] lists flagged points; prefer those in place types with 3 or more supply points and with a large absolute deviation_pct. Flags in types with 1-2 points are automatic and mean nothing on their own." },
        { question: "What does deviation_pct = 25 mean?", answer: "That supply point used 25 % more than the average supply point of the same place type in the same community over the period; -25 means 25 % less." },
        { question: "When during the day do buildings use most energy?", answer: "See the 'Average daily load profile' table above or the line chart in profile_analysis.html; the hourly profile is not in the JSON." },
        { question: "What period does the analysis cover?", answer: `From the first to the last timestamp in the input: ${first ? `${first} to ${last}` : "unknown in this run"}. The JSON does not store dates.` },
        { question: "Why does an id look like 'ES00…AB0F' or 'ES00…AB0F #2'?", answer: "That is the HTML label: first 4 + '…' + last 4 characters, shortened for privacy. When two ids of the same community shorten identically, ' #k' numbers them in order of first appearance in that community's place_type_analysis[].all_cups_deviations[] (place types in JSON order). The numbering restarts in every community, so the same label (e.g. 'ES00…AB0F #1') can be a different supply point in another community: always quote the community too. The 'Id ends in' column of this file (last 8 characters) is much less ambiguous; to identify a point exactly, match the last 8 characters against cups_id in profile_analysis.json, which holds the full ids." },
        { question: "Which kind of building uses the most: by total or per building?", answer: "Two different answers. By TOTAL, compare group_stats.sum (a type with several supply points adds them up). Per BUILDING / supply point, compare group_stats.avg. Section 6 gives both per community ('largest place type by TOTAL' and 'PER SUPPLY POINT'); state which one you mean and how many supply points the type has." },
        { question: "How was a supply point's deviation computed?", answer: "deviation_pct = (supply point total - group_stats.avg of its place type in the same community) / group_stats.avg x 100, rounded to 2 decimals; the total is the sum of its hourly kwh_in over the whole period. A type with a single supply point always gives 0 %; a type with 2 points always gives +x % and -x %." },
        { question: "When during the day does a place type (e.g. street lighting) use electricity?", answer: "Use the 'Average daily load profile' table in section 6 (peak hour, lowest hour, % of use 08:00-19:59) or the line chart in profile_analysis.html. Values are average kWh per supply point per clock hour. Where the table says 'flat minimum', many hours are practically equal, so do not name a single lowest hour." },
        { question: "Is a building's consumption good or bad / efficient?", answer: "The outputs cannot say. They only compare a supply point with others of the same place type in the same community; there are no benchmarks, floor areas, occupancy, opening hours or weather data, and only grid import is counted (solar self-consumption is invisible). A type with one supply point has no peer at all (deviation 0 %)." },
        { question: "How much money or CO2 was saved / what did it cost?", answer: "Not available. The outputs contain only consumption (kWh of grid import). There are no prices, tariffs, production, export, savings or emissions figures, and the algorithm has no parameters for them." },
        { question: "The HTML shows a place type with 0 kWh in a community. Did it use nothing?", answer: "Usually not: the HTML community bar chart draws every place type found in ANY community, so a type that does not exist in a community appears as a 0 kWh bar. Check place_type_analysis[] of that community in profile_analysis.json (or 'absent_place_types' in the facts block of section 10): if the type is missing there, the community simply has no supply point of that type." },
        { question: "Can I compare communities?", answer: "Yes for totals and averages (community_stats), but outlier flags and deviations are only computed within a community and place type." }
    ];

    const glossary = [
        { term: "CUPS", meaning: "Código Universal del Punto de Suministro: the unique id of an electricity supply point (meter) in Spain. A standard CUPS is 20 or 22 characters in total: 'ES' + 16 digits + 2 check letters, optionally followed by a 2-character suffix (1 digit + 1 letter). Ids in some datasets (see section 2) do not follow this format; the algorithm treats any text as an id." },
        { term: "Supply point", meaning: "One metered connection (one CUPS), typically one building or installation." },
        { term: "Place type", meaning: "Category of use of the supply point (education, office, sports, street_lighting, swimming_pool, healthcare, ...)." },
        { term: "Energy community", meaning: "Group of supply points (here mostly municipal buildings) analysed together." },
        { term: "kWh", meaning: "Kilowatt-hour, unit of electrical energy. All consumption figures are kWh summed over the analysed period." },
        { term: "kwh_in", meaning: "Energy taken from the grid in one hour (input field)." },
        { term: "Load profile", meaning: "How consumption is distributed over the hours of the day." },
        { term: "Median", meaning: "Middle value when supply points are sorted by consumption." },
        { term: "p05 / p95", meaning: "5th / 95th percentile of the per-supply-point totals, computed by linear interpolation between sorted values. With many supply points roughly 5 % lie below p05 and 5 % above p95. With few points (1-2, as in small place types) they are just values interpolated very close to the minimum and maximum, so they say nothing about a distribution." },
        { term: "Outlier / flagged", meaning: "Supply point at or below p05 or at or above p95 of its place type." },
        { term: "Deviation (%)", meaning: "Difference between a supply point's total and its place-type average, as a percentage of that average." },
        { term: "Compute-to-Data (C2D)", meaning: "The algorithm runs next to the data; only these output files leave the data provider." }
    ];

    const facts = {
        algorithm: "profile_analytic.js",
        title: REPORT_TITLE,
        generated_at: generatedAt,
        parameters: { none: true, outlier_low_percentile: 5, outlier_high_percentile: 95, stats_decimals: 4, deviation_decimals: 2 },
        input_files: CTX_RUN.files.map(f => ({ file: f.file, status: f.status, format: f.format || null, communities: f.communities, supply_points: f.cups, hourly_records: f.records, error: f.error || null })),
        ignored_input_files: CTX_RUN.ignored.length,
        period: { first_timestamp: first, last_timestamp: last, calendar_days: days || null, timezone: "as written in the data (no conversion)" },
        communities: results.length,
        supply_points: totalPoints,
        place_types: [...typeSet],
        hourly_records: totalRecords,
        total_consumption_kwh: Number(totalKwh.toFixed(4)),
        flagged_supply_points: totalFlagged,
        flagged_in_groups_of_1_or_2: smallGroupFlagged,
        anomalies: { non_numeric_kwh: badKwh, negative_kwh: negKwh, bad_timestamps: badTs, duplicate_timestamps: dupTs, duplicate_cups_ids: dupIds, supply_points_without_records: emptyCups },
        per_community: factsComms.slice(0, 50)
    };

    const doc = contextDoc({
        title: REPORT_TITLE,
        summary: "This Empower-X Compute-to-Data algorithm totals the electricity consumption (grid import, kWh) of every supply point (CUPS) in each energy community over the period in the data, " +
            "and compares supply points of the same place type (school, office, sports centre, street lighting, ...). " +
            "For each community and place type it reports total, average, median, minimum, maximum and 5th/95th percentile consumption, each supply point's % difference from its type average, " +
            "and flags the supply points at the low and high end of their type.",
        run, files, fields, method, results: results6, limitations, questions, glossary, facts
    });
    // Detailed per-community tables go right after section 6 (Key results).
    const marker = "## 7. Data quality and limitations";
    const detail = "### Detail tables\n\nCommunity numbers (#) below refer to the Communities table. Supply-point ids are shortened; full ids are in profile_analysis.json.\n\n" + extraMd.join("\n") + "\n";
    return doc.includes(marker) ? doc.replace(marker, () => detail + marker) : doc + "\n" + detail;
}

/* =========================
   MAIN EXECUTION
   ========================= */

try {
    if (!fs.existsSync(INPUT_DIR)) {
        throw new Error(`Input directory ${INPUT_DIR} not found`);
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => !f.startsWith(".") && (f.endsWith(".json") || f.endsWith(".csv") || f.endsWith(".txt") || !f.includes(".")));
    try { CTX_RUN.inputDirFound = true; CTX_RUN.ignored = fs.readdirSync(INPUT_DIR).filter(f => !files.includes(f)); } catch (e) {}
    console.log(`Found ${files.length} files in input directory.`);

    let combinedResults = [];

    files.forEach(file => {
        console.log(`Processing file: ${file}`);
        const ctxEntry = ctxFileStart(file);
        try {
            const data = loadData(path.join(INPUT_DIR, file));
            const analysis = analyzeProfiles(data);
            ctxFileDone(ctxEntry, data, analysis);
            combinedResults = combinedResults.concat(analysis);
        } catch (err) {
            ctxFileFailed(ctxEntry, err);
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
    contextWrite(fs, path.join(OUTPUT_DIR, CONTEXT_FILE), () => buildContext(combinedResults));

} catch (error) {
    console.error("❌ Fatal Error:", error.message);
    process.exit(1);
}
