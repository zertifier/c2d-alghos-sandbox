// PV-to-EV Energy Matcher — Empower-X Compute-to-Data algorithm (Rubí pilot).
// Based on gist grigorevaiv/a8308e99feca5600e522635e0ef8b2dd (energy-matcher.js, version of 2026-10-16),
// which is what the published marketplace asset ran. The calculation and result.json are unchanged;
// this copy also writes energy-matcher.html (charts) and AI_CONTEXT.md (explanation for AI assistants).
// INPUTS / OUTPUTS env vars override /data/inputs and /data/outputs for local runs.
const fs = require("fs");
const path = require("path");

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

const inputDir = process.env.INPUTS || "/data/inputs";
const outputDir = process.env.OUTPUTS || "/data/outputs";
const outputFile = path.join(outputDir, "result.json");

if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function buildBalanceMap(chargersData, solarData) {
    const balanceMap = {};

    const ensureBucket = (dt) => {
        if (!balanceMap[dt]) {
            balanceMap[dt] = {
                datetime: dt,
                totalNetworkConsumptionKwh: 0,
                solarProductionKwh: 0,
                chargers: [],
            };
        }
        return balanceMap[dt];
    };

    chargersData.forEach((item) => {
        const bucket = ensureBucket(item.datetime);
        (item.chargers || []).forEach((ch) => {
            const val = ch.consumptionKWh || 0;
            bucket.totalNetworkConsumptionKwh += Number(val);
            bucket.chargers.push(ch);
        });
    });

    solarData.forEach((solar) => {
        const bucket = ensureBucket(solar.datetime);
        bucket.solarProductionKwh = solar.productionKwh || 0;
    });

    return balanceMap;
}

function computeDailyReport(dayHours) {
    let bank = 0;

    const computed = dayHours.map((hour) => {
        const consumption = hour.totalNetworkConsumptionKwh || 0;
        const production = hour.solarProductionKwh || 0;

        const nativeSolarKwh = Math.min(consumption, production);
        const remainingAfterNative = consumption - nativeSolarKwh;
        const bankSolarKwh = Math.min(remainingAfterNative, bank);
        const gridConsumptionKwh = remainingAfterNative - bankSolarKwh;

        bank = bank - bankSolarKwh + (production - nativeSolarKwh);

        return { hour, consumption, production, nativeSolarKwh, bankSolarKwh, gridConsumptionKwh };
    });

    let leftover = bank;
    for (const entry of computed) {
        if (leftover <= 0) break;
        if (entry.gridConsumptionKwh > 0) {
            const applied = Math.min(entry.gridConsumptionKwh, leftover);
            entry.bankSolarKwh += applied;
            entry.gridConsumptionKwh -= applied;
            leftover -= applied;
        }
    }

    return computed.map(({ hour, consumption, production, nativeSolarKwh, bankSolarKwh, gridConsumptionKwh }) => {
        const usedSolarKwh = nativeSolarKwh + bankSolarKwh;
        const solarPercentage = consumption > 0
            ? Math.round((usedSolarKwh / consumption) * 100)
            : 0;

        const guaranteeOfOriginSurplusKwh = Math.max(0, production - nativeSolarKwh);

        return {
            datetime: hour.datetime,
            summary: {
                totalConsumption: Number(consumption.toFixed(2)),
                totalSolarProduction: Number(production.toFixed(2)),
                usedSolarKwh: Number(usedSolarKwh.toFixed(2)),
                guaranteeOfOriginKwh: Number(nativeSolarKwh.toFixed(2)),
                guaranteeOfOriginSpreadKwh: Number(bankSolarKwh.toFixed(2)),
                guaranteeOfOriginSurplusKwh: Number(guaranteeOfOriginSurplusKwh.toFixed(2)),
                unadressedConsumptionKwh: Number(gridConsumptionKwh.toFixed(2)),
                solarPercentage,
            },
            chargers: hour.chargers,
        };
    });
}

function getPowerBalanceReport(chargersData, solarData) {
    const balanceMap = buildBalanceMap(chargersData, solarData);

    const sortedHours = Object.values(balanceMap).sort((a, b) =>
        a.datetime.localeCompare(b.datetime)
    );

    const dayGroups = {};
    sortedHours.forEach((hour) => {
        const day = hour.datetime.split(" ")[0];
        (dayGroups[day] ||= []).push(hour);
    });

    let report = [];
    Object.values(dayGroups).forEach((dayHours) => {
        report = report.concat(computeDailyReport(dayHours));
    });

    const dailyTotals = report.reduce((acc, hour) => {
        acc.totalConsumption += hour.summary.totalConsumption;
        acc.totalSolarProduction += hour.summary.totalSolarProduction;
        acc.usedSolarKwh += hour.summary.usedSolarKwh;
        acc.guaranteeOfOriginKwh += hour.summary.guaranteeOfOriginKwh;
        acc.guaranteeOfOriginSpreadKwh += hour.summary.guaranteeOfOriginSpreadKwh;
        acc.guaranteeOfOriginSurplusKwh += hour.summary.guaranteeOfOriginSurplusKwh;
        acc.unadressedConsumptionKwh += hour.summary.unadressedConsumptionKwh;
        return acc;
    }, {
        totalConsumption: 0,
        totalSolarProduction: 0,
        usedSolarKwh: 0,
        guaranteeOfOriginKwh: 0,
        guaranteeOfOriginSpreadKwh: 0,
        guaranteeOfOriginSurplusKwh: 0,
        unadressedConsumptionKwh: 0,
    });

    const dailySolarPercentage = dailyTotals.totalConsumption > 0
        ? Math.round((dailyTotals.usedSolarKwh / dailyTotals.totalConsumption) * 100)
        : 0;

    const realTimePVPercent = dailyTotals.totalConsumption > 0
        ? Math.round((dailyTotals.guaranteeOfOriginKwh / dailyTotals.totalConsumption) * 100)
        : 0;
    const spreadPVPercent = dailyTotals.totalConsumption > 0
        ? Math.round((dailyTotals.guaranteeOfOriginSpreadKwh / dailyTotals.totalConsumption) * 100)
        : 0;

    return {
        dailySummary: {
            totalConsumption: Number(dailyTotals.totalConsumption.toFixed(2)),
            totalSolarProduction: Number(dailyTotals.totalSolarProduction.toFixed(2)),
            usedSolarKwh: Number(dailyTotals.usedSolarKwh.toFixed(2)),
            guaranteeOfOriginKwh: Number(dailyTotals.guaranteeOfOriginKwh.toFixed(2)),
            guaranteeOfOriginSpreadKwh: Number(dailyTotals.guaranteeOfOriginSpreadKwh.toFixed(2)),
            guaranteeOfOriginSurplusKwh: Number(dailyTotals.guaranteeOfOriginSurplusKwh.toFixed(2)),
            unadressedConsumptionKwh: Number(dailyTotals.unadressedConsumptionKwh.toFixed(2)),
            solarPercentage: dailySolarPercentage,
            realTimePVPercent,
            spreadPVPercent,
        },
        hourlyData: report.sort((a, b) => a.datetime.localeCompare(b.datetime)),
    };
}

function transformToChart(hourlyData) {
    return {
        labels: hourlyData.map((h) => h.datetime.slice(11, 13)),
        guaranteeOfOrigin: hourlyData.map((h) => h.summary.guaranteeOfOriginKwh),
        unadressedConsumption: hourlyData.map((h) => h.summary.totalConsumption),
        guaranteeOfOriginSpread: hourlyData.map((h) => h.summary.guaranteeOfOriginSpreadKwh),
        guaranteeOfOriginSurplus: hourlyData.map((h) => h.summary.guaranteeOfOriginSurplusKwh),
    };
}

function computeChargerBreakdown(chargersData) {
    const chargerMap = new Map();

    for (const hour of chargersData) {
        for (const charger of hour.chargers || []) {
            const current = chargerMap.get(charger.id) || 0;
            chargerMap.set(charger.id, current + Number(charger.consumptionKWh || 0));
        }
    }

    const breakdown = Array.from(chargerMap.entries())
        .map(([id, value]) => ({ label: `Charger ${id}`, value }))
        .sort((a, b) => b.value - a.value);

    return { breakdown, totalChargers: chargerMap.size };
}

function buildDashboardModel(balance, chargersData) {
    const chart = transformToChart(balance.hourlyData);
    const { breakdown, totalChargers } = computeChargerBreakdown(chargersData);

    const guaranteeOfOriginTotal = chart.guaranteeOfOrigin.reduce((sum, v) => sum + (v ?? 0), 0);
    const guaranteeOfOriginSpreadTotal = chart.guaranteeOfOriginSpread.reduce((sum, v) => sum + (v ?? 0), 0);
    const totalConsumption = balance.dailySummary.totalConsumption || 0;

    const guaranteeOfOriginPercent = totalConsumption > 0 ? (guaranteeOfOriginTotal / totalConsumption) * 100 : 0;
    const guaranteeOfOriginSpreadPercent = totalConsumption > 0 ? (guaranteeOfOriginSpreadTotal / totalConsumption) * 100 : 0;

    return {
        energy: balance.dailySummary.solarPercentage,
        surplus: balance.dailySummary.totalSolarProduction,
        chargers: balance.dailySummary.totalConsumption,
        guaranteeOfOriginPercent: Number(guaranteeOfOriginPercent.toFixed(0)),
        guaranteeOfOriginSpreadPercent: Number(guaranteeOfOriginSpreadPercent.toFixed(0)),
        chargerBreakdown: breakdown,
        totalChargers,
        chart,
    };
}

function parseContent(raw) {
    try {
        return JSON.parse(raw);
    } catch {}

    try {
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        return lines.map((l) => JSON.parse(l));
    } catch {}

    return raw;
}

function detectKind(content, fileName) {
    if (Array.isArray(content) && content.length > 0) {
        const sample = content[0];
        if (sample && Array.isArray(sample.chargers)) return "chargers";
        if (sample && typeof sample.productionKwh !== "undefined") return "solar";
    }
    if (/solar/i.test(fileName)) return "solar";
    if (/charger/i.test(fileName)) return "chargers";
    return "unknown";
}

const entries = fs.readdirSync(inputDir, { withFileTypes: true });

let chargersData = null;
let chargersFileName = null;
let solarData = null;
let solarFileName = null;

for (const entry of entries) {
    if (!entry.isFile() || entry.name === "algoCustomData.json") continue;

    const file = entry.name;
    const raw = fs.readFileSync(path.join(inputDir, file), "utf8");

    console.log(`\n===== ${file} =====`);
    raw.split(/\r?\n/).forEach((line, i) => console.log(`${i + 1}: ${line}`));

    const content = parseContent(raw);
    const kind = detectKind(content, file);
    console.log(`-> ${file}: ${typeof content === "string" ? "plain text" : "parsed"}, detected as "${kind}"`);

    if (kind === "chargers" && !chargersData) {
        chargersData = content;
        chargersFileName = file;
    } else if (kind === "solar" && !solarData) {
        solarData = content;
        solarFileName = file;
    }
}

if (!chargersData || !solarData) {
    throw new Error(
        `Could not identify both input files (chargers found: ${!!chargersData}, solar found: ${!!solarData}).`
    );
}

console.log(`\nChargers consumption file: ${chargersFileName}`);
console.log(`Solar production file: ${solarFileName}`);

const balance = getPowerBalanceReport(chargersData, solarData);
const dashboard = buildDashboardModel(balance, chargersData);

const result = { balance, dashboard };

fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

console.log(`Done. Saved calculation results to ${outputFile}`);

// ---------------------------------------------------------------------------
// HTML report + AI_CONTEXT.md. Read-only on the results above; result.json is
// already written, and a failure here never fails the job.
// ---------------------------------------------------------------------------
const EM_HTML_FILE = "energy-matcher.html";
const EM_COLORS = { realTime: "#16a34a", banked: "#0891b2", grid: "#64748b", solar: "#f59e0b", load: "#2563eb" };

function emSum(values) {
    return values.reduce((a, v) => a + (Number(v) || 0), 0);
}

// Everything the report and the context need, derived from result.json values.
function emAnalyse(bal, chargersIn, solarIn) {
    const hours = bal.hourlyData || [];
    const s = (h) => h.summary || {};
    const dayMap = new Map();
    for (const h of hours) {
        const day = String(h.datetime).slice(0, 10);
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day).push(h);
    }
    const days = [...dayMap.entries()].map(([day, hs]) => {
        const consumption = emSum(hs.map((h) => s(h).totalConsumption));
        const used = emSum(hs.map((h) => s(h).usedSolarKwh));
        return {
            day,
            hours: hs.length,
            consumption,
            production: emSum(hs.map((h) => s(h).totalSolarProduction)),
            realTime: emSum(hs.map((h) => s(h).guaranteeOfOriginKwh)),
            banked: emSum(hs.map((h) => s(h).guaranteeOfOriginSpreadKwh)),
            grid: emSum(hs.map((h) => s(h).unadressedConsumptionKwh)),
            surplus: emSum(hs.map((h) => s(h).guaranteeOfOriginSurplusKwh)),
            coverage: consumption > 0 ? (used / consumption) * 100 : null,
        };
    });

    // Average day: mean kWh per hour of the day over all days in the period.
    const profile = Array.from({ length: 24 }, () => ({ n: 0, realTime: 0, banked: 0, grid: 0, production: 0 }));
    for (const h of hours) {
        const p = profile[Number(String(h.datetime).slice(11, 13))];
        if (!p) continue;
        p.n++;
        p.realTime += s(h).guaranteeOfOriginKwh || 0;
        p.banked += s(h).guaranteeOfOriginSpreadKwh || 0;
        p.grid += s(h).unadressedConsumptionKwh || 0;
        p.production += s(h).totalSolarProduction || 0;
    }
    profile.forEach((p) => ["realTime", "banked", "grid", "production"].forEach((k) => (p[k] = p.n ? p[k] / p.n : 0)));

    // Per charger. Solar per charger is an estimate: each hour's used solar is
    // shared among that hour's chargers in proportion to their energy.
    const chargers = new Map();
    for (const h of hours) {
        const total = s(h).totalConsumption || 0;
        const used = s(h).usedSolarKwh || 0;
        for (const ch of h.chargers || []) {
            const kwh = Number(ch.consumptionKWh) || 0;
            const c = chargers.get(ch.id) || { id: ch.id, origin: ch.origin || "", energy: 0, solar: 0, hours: 0, cars: new Set() };
            c.energy += kwh;
            c.solar += total > 0 ? (used * kwh) / total : 0;
            if (kwh > 0) c.hours++;
            (ch.cars || []).forEach((car) => car && car.id !== undefined && c.cars.add(car.id));
            chargers.set(ch.id, c);
        }
    }
    const chargerRows = [...chargers.values()].sort((a, b) => b.energy - a.energy);
    const allCars = new Set();
    chargerRows.forEach((c) => c.cars.forEach((id) => allCars.add(id)));
    const origins = [...new Set(chargerRows.map((c) => c.origin).filter(Boolean))];

    const chargerHours = new Set((chargersIn || []).map((x) => x.datetime));
    const solarHours = new Set((solarIn || []).map((x) => x.datetime));
    const noSolar = [...chargerHours].filter((d) => !solarHours.has(d)).sort();
    const noCharging = [...solarHours].filter((d) => !chargerHours.has(d)).sort();
    const odd = days.filter((d) => d.hours !== 24);

    const totals = {
        consumption: emSum(days.map((d) => d.consumption)),
        production: emSum(days.map((d) => d.production)),
        realTime: emSum(days.map((d) => d.realTime)),
        banked: emSum(days.map((d) => d.banked)),
        grid: emSum(days.map((d) => d.grid)),
        surplus: emSum(days.map((d) => d.surplus)),
    };
    // Solar not used by the chargers over the period.
    totals.unused = Math.max(0, totals.production - totals.realTime - totals.banked);
    const ranked = days.filter((d) => d.coverage !== null).sort((a, b) => b.coverage - a.coverage);

    return {
        hours, days, profile, chargerRows, origins,
        cars: allCars.size,
        period: hours.length ? `${String(hours[0].datetime).slice(0, 16)} to ${String(hours[hours.length - 1].datetime).slice(0, 16)}` : "no data",
        noSolar, noCharging, odd, totals,
        bestDay: ranked[0] || null,
        worstDay: ranked[ranked.length - 1] || null,
    };
}

function emRenderReport(bal, dash, a, jsonName) {
    const d = bal.dailySummary || {};
    const sections = [];
    sections.push(reportSection("Summary", reportKpis([
        { label: "EV charging", value: reportNum(d.totalConsumption, 0), unit: "kWh" },
        { label: "Solar production", value: reportNum(d.totalSolarProduction, 0), unit: "kWh" },
        { label: "Charging covered by solar", value: reportNum(d.solarPercentage, 0), unit: "%", hint: "real-time + banked the same day" },
        { label: "Real-time solar", value: reportNum(d.realTimePVPercent, 0), unit: "%", hint: "solar produced in the same hour" },
        { label: "Banked solar", value: reportNum(d.spreadPVPercent, 0), unit: "%", hint: "surplus of other hours of the same day" },
        { label: "From the grid", value: reportNum(d.unadressedConsumptionKwh, 0), unit: "kWh", hint: "not covered by solar" },
        { label: "Chargers", value: reportNum(dash.totalChargers, 0) },
        { label: "Cars", value: reportNum(a.cars, 0), hint: "different car ids seen" },
    ]), `Period ${a.period} (${a.days.length} days). Each hour, the chargers' consumption is matched first with the solar produced in that hour, then with surplus solar of other hours of the same day (a daily "bank"); the rest comes from the grid.`));

    sections.push(reportSection("Where the charging energy came from",
        reportDonut({ title: "EV charging by source (whole period)", unit: "kWh", slices: [
            { label: "Real-time solar", value: a.totals.realTime, color: EM_COLORS.realTime },
            { label: "Banked solar (same day)", value: a.totals.banked, color: EM_COLORS.banked },
            { label: "Grid", value: a.totals.grid, color: EM_COLORS.grid },
        ] }) +
        reportDonut({ title: "What happened to the solar production", unit: "kWh",
            note: "Used = matched with charging (real-time or banked). Not used = left over after all charging of its day.",
            slices: [
                { label: "Used in the same hour", value: a.totals.realTime, color: EM_COLORS.realTime },
                { label: "Used later the same day", value: a.totals.banked, color: EM_COLORS.banked },
                { label: "Not used by the chargers", value: a.totals.unused, color: EM_COLORS.solar },
            ] })));

    const dayLabels = a.days.map((x) => x.day.slice(5));
    sections.push(reportSection("Day by day",
        reportBarChart({ title: "EV charging per day by source", categories: dayLabels, unit: "kWh", stacked: true, series: [
            { name: "Real-time solar", values: a.days.map((x) => x.realTime), color: EM_COLORS.realTime },
            { name: "Banked solar", values: a.days.map((x) => x.banked), color: EM_COLORS.banked },
            { name: "Grid", values: a.days.map((x) => x.grid), color: EM_COLORS.grid },
        ] }) +
        reportBarChart({ title: "Solar production vs EV charging per day", categories: dayLabels, unit: "kWh", series: [
            { name: "Solar production", values: a.days.map((x) => x.production), color: EM_COLORS.solar },
            { name: "EV charging", values: a.days.map((x) => x.consumption), color: EM_COLORS.load },
        ] }),
        "How much charging each day was matched with solar, and how the day's solar compared with the charging."));

    sections.push(reportSection("Hour by hour",
        reportLineChart({ title: "Solar production and EV charging", unit: "kWh",
            labels: a.hours.map((h) => String(h.datetime).slice(0, 16)),
            series: [
                { name: "Solar production", values: a.hours.map((h) => h.summary.totalSolarProduction), color: EM_COLORS.solar, area: true },
                { name: "EV charging", values: a.hours.map((h) => h.summary.totalConsumption), color: EM_COLORS.load },
            ] }) +
        reportBarChart({ title: "Average day: EV charging per hour by source", unit: "kWh", stacked: true,
            categories: a.profile.map((_, i) => String(i).padStart(2, "0")),
            note: "Mean over all days of the period, per hour of the day.",
            series: [
                { name: "Real-time solar", values: a.profile.map((p) => p.realTime), color: EM_COLORS.realTime },
                { name: "Banked solar", values: a.profile.map((p) => p.banked), color: EM_COLORS.banked },
                { name: "Grid", values: a.profile.map((p) => p.grid), color: EM_COLORS.grid },
            ] }) +
        reportHeatmap({ title: "Share of charging covered by solar (day x hour)", unit: "%",
            rows: a.days.map((x) => x.day.slice(5)),
            cols: Array.from({ length: 24 }, (_, i) => String(i)),
            note: "Empty cells: no charging in that hour.",
            values: a.days.map((x) => {
                const row = Array(24).fill(null);
                a.hours.filter((h) => String(h.datetime).startsWith(x.day)).forEach((h) => {
                    if (h.summary.totalConsumption > 0) row[Number(String(h.datetime).slice(11, 13))] = h.summary.solarPercentage;
                });
                return row;
            }) })));

    sections.push(reportSection("Chargers",
        reportHBarChart({ title: "Energy delivered per charger (top 15)", unit: "kWh", color: EM_COLORS.load,
            items: a.chargerRows.slice(0, 15).map((c) => ({ label: String(c.id), value: c.energy })) }) +
        reportTable({ title: "All chargers", limit: 25,
            columns: [
                { key: "id", label: "Charger" }, { key: "origin", label: "Operator / source" },
                { key: "energy", label: "Energy (kWh)", num: true }, { key: "solar", label: "Solar, est. (kWh)", num: true },
                { key: "share", label: "Solar share (%)", num: true }, { key: "hours", label: "Hours charging", num: true },
                { key: "cars", label: "Cars", num: true },
            ],
            rows: a.chargerRows.map((c) => ({ id: c.id, origin: c.origin, energy: c.energy, solar: c.solar,
                share: c.energy > 0 ? (c.solar / c.energy) * 100 : null, hours: c.hours, cars: c.cars.size })),
            note: "Solar per charger is an estimate: the solar used in each hour is shared among the chargers active in that hour in proportion to their energy. Car ids are not shown." }),
        "Which chargers delivered the most energy, and how much of it was matched with solar."));

    sections.push(reportSection("Daily table", reportTable({ title: "Totals per day", limit: 40,
        columns: [
            { key: "day", label: "Day" }, { key: "consumption", label: "Charging (kWh)", num: true },
            { key: "production", label: "Solar (kWh)", num: true }, { key: "realTime", label: "Real-time solar (kWh)", num: true },
            { key: "banked", label: "Banked solar (kWh)", num: true }, { key: "grid", label: "Grid (kWh)", num: true },
            { key: "coverage", label: "Covered by solar (%)", num: true },
        ],
        rows: a.days })));

    return reportPage({
        title: "PV-to-EV Energy Matcher",
        subtitle: `Matching electric-vehicle charging with local solar production, ${a.period}`,
        sections,
        jsonFile: jsonName,
    });
}

function emBuildContext(bal, dash, a, files) {
    const d = bal.dailySummary || {};
    const r2 = (n) => (Number.isFinite(Number(n)) ? Number(Number(n).toFixed(2)) : null);
    const hourFields = [
        ["totalConsumption", "kWh", "Energy delivered by all chargers in the hour (sum of chargers[].consumptionKWh)."],
        ["totalSolarProduction", "kWh", "Solar production in the hour (productionKwh of the solar input)."],
        ["usedSolarKwh", "kWh", "Charging matched with solar = guaranteeOfOriginKwh + guaranteeOfOriginSpreadKwh."],
        ["guaranteeOfOriginKwh", "kWh", "Real-time match: min(consumption, production) of the same hour."],
        ["guaranteeOfOriginSpreadKwh", "kWh", "Charging matched with banked solar surplus from other hours of the same day."],
        ["guaranteeOfOriginSurplusKwh", "kWh", "Production minus the real-time match (surplus before banking; part of it may later appear as spread)."],
        ["unadressedConsumptionKwh", "kWh", "Charging not matched with solar (from the grid). Spelling as in the code."],
        ["solarPercentage", "%", "usedSolarKwh / totalConsumption x 100, rounded to an integer (0 when no charging)."],
    ];
    const totalKeys = ["totalConsumption", "totalSolarProduction", "usedSolarKwh", "guaranteeOfOriginKwh", "guaranteeOfOriginSpreadKwh", "guaranteeOfOriginSurplusKwh", "unadressedConsumptionKwh"];
    return contextDoc({
        title: "PV-to-EV Energy Matcher",
        summary: "Matches, hour by hour, the energy delivered by public electric-vehicle chargers with the production of a local solar installation (Rubí pilot, Empower-X). " +
            "Charging is covered first by solar produced in the same hour, then by surplus solar of other hours of the same day (a daily virtual bank), and the rest is counted as grid energy. " +
            "The result supports guarantee-of-origin style statements such as 'X % of the EV charging was solar'.",
        run: [
            { label: "Chargers input file", value: files.chargers },
            { label: "Solar input file", value: files.solar },
            { label: "Period", value: a.period },
            { label: "Days", value: a.days.length },
            { label: "Hours in the result", value: a.hours.length },
            { label: "Chargers", value: dash.totalChargers },
            { label: "Operators / sources", value: a.origins.join(", ") || "not given" },
            { label: "Different cars", value: a.cars },
            { label: "Generated at", value: new Date().toISOString() },
        ],
        files: [
            { file: path.basename(outputFile), format: "JSON", contents: "{ balance: { dailySummary, hourlyData[] }, dashboard: {...} }: the calculation result (main output)." },
            { file: EM_HTML_FILE, format: "HTML", contents: "Charts and tables of this run; opens offline in any browser." },
        ],
        fields: [
            ...totalKeys.map((k) => {
                const f = hourFields.find((x) => x[0] === k);
                return { file: "result.json", field: `balance.dailySummary.${k}`, type: "number", unit: f[1], meaning: "Total over the WHOLE period (not one day). " + f[2] };
            }),
            { file: "result.json", field: "balance.dailySummary.solarPercentage", type: "integer", unit: "%", meaning: "usedSolarKwh / totalConsumption x 100 over the whole period." },
            { file: "result.json", field: "balance.dailySummary.realTimePVPercent", type: "integer", unit: "%", meaning: "guaranteeOfOriginKwh / totalConsumption x 100." },
            { file: "result.json", field: "balance.dailySummary.spreadPVPercent", type: "integer", unit: "%", meaning: "guaranteeOfOriginSpreadKwh / totalConsumption x 100." },
            { file: "result.json", field: "balance.hourlyData[].datetime", type: "string", unit: "local time", meaning: "Hour start, 'YYYY-MM-DD HH:00:00', as in the inputs." },
            ...hourFields.map(([k, unit, meaning]) => ({ file: "result.json", field: `balance.hourlyData[].summary.${k}`, type: "number", unit, meaning: meaning + " Rounded to 2 decimals." })),
            { file: "result.json", field: "balance.hourlyData[].chargers[]", type: "array", unit: "", meaning: "The input records of that hour, copied unchanged: { id, origin, consumptionKWh, cars: [{ id, consumption }] }." },
            { file: "result.json", field: "dashboard.energy", type: "integer", unit: "%", meaning: "Same as balance.dailySummary.solarPercentage." },
            { file: "result.json", field: "dashboard.surplus", type: "number", unit: "kWh", meaning: "Despite the name: total SOLAR PRODUCTION of the period (= dailySummary.totalSolarProduction)." },
            { file: "result.json", field: "dashboard.chargers", type: "number", unit: "kWh", meaning: "Despite the name: total CHARGING ENERGY (= dailySummary.totalConsumption), not a count." },
            { file: "result.json", field: "dashboard.totalChargers", type: "integer", unit: "", meaning: "Number of different charger ids." },
            { file: "result.json", field: "dashboard.guaranteeOfOriginPercent / guaranteeOfOriginSpreadPercent", type: "integer", unit: "%", meaning: "Real-time / banked share of charging, recomputed from the hourly values." },
            { file: "result.json", field: "dashboard.chargerBreakdown[]", type: "array", unit: "kWh", meaning: "{ label: 'Charger <id>', value } energy per charger, largest first." },
            { file: "result.json", field: "dashboard.chart.labels", type: "string[]", unit: "hour", meaning: "Hour of day 'HH' only; repeats every day. Pair with balance.hourlyData by index." },
            { file: "result.json", field: "dashboard.chart.guaranteeOfOrigin / guaranteeOfOriginSpread / guaranteeOfOriginSurplus", type: "number[]", unit: "kWh", meaning: "Hourly series, same order as balance.hourlyData." },
            { file: "result.json", field: "dashboard.chart.unadressedConsumption", type: "number[]", unit: "kWh", meaning: "Despite the name: hourly TOTAL charging (totalConsumption), not the grid part." },
        ],
        method: [
            "Inputs are recognised by content: a JSON array whose items have chargers[] is the charging file; items with productionKwh are the solar file. The first file of each kind is used; others are ignored.",
            "Hours are joined on the exact datetime string. An hour with charging but no solar record has production 0; an hour with solar but no charging has consumption 0.",
            "For each hour: real-time match = min(consumption, production); the production left after it goes into a bank for the same day; the charging still uncovered takes energy from the bank if available; the rest is grid.",
            "The bank resets every day. Bank energy left at the end of the day is then applied to the earliest hours of that day that still had grid consumption (so morning charging can be covered by afternoon surplus). There is no loss and no capacity limit.",
            "usedSolarKwh = real-time + banked; solarPercentage = usedSolarKwh / consumption x 100 (integer).",
            "Totals in balance.dailySummary are sums of the rounded hourly values over the whole period.",
            "In the HTML report and in this file, solar per charger is an estimate: each hour's used solar is split among the chargers of that hour in proportion to their energy.",
        ],
        results: [
            { label: "EV charging", value: r2(d.totalConsumption), unit: "kWh" },
            { label: "Solar production", value: r2(d.totalSolarProduction), unit: "kWh" },
            { label: "Charging matched with solar", value: r2(d.usedSolarKwh), unit: "kWh" },
            { label: "... in real time", value: r2(d.guaranteeOfOriginKwh), unit: "kWh" },
            { label: "... from the daily bank", value: r2(d.guaranteeOfOriginSpreadKwh), unit: "kWh" },
            { label: "Charging from the grid", value: r2(d.unadressedConsumptionKwh), unit: "kWh" },
            { label: "Solar share of charging", value: d.solarPercentage, unit: "%" },
            { label: "Real-time share", value: d.realTimePVPercent, unit: "%" },
            { label: "Banked share", value: d.spreadPVPercent, unit: "%" },
            { label: "Solar not used by the chargers", value: r2(a.totals.unused), unit: "kWh" },
            { label: "Best day (solar share)", value: a.bestDay ? `${a.bestDay.day}: ${r2(a.bestDay.coverage)}` : "-", unit: "%" },
            { label: "Worst day (solar share)", value: a.worstDay ? `${a.worstDay.day}: ${r2(a.worstDay.coverage)}` : "-", unit: "%" },
            ...a.chargerRows.slice(0, 5).map((c, i) => ({ label: `Charger #${i + 1} by energy: ${c.id}`, value: r2(c.energy), unit: "kWh" })),
        ],
        limitations: [
            "Field names in dashboard are misleading: 'surplus' is total production, 'chargers' is total charging kWh, chart.unadressedConsumption is total charging. Use balance.* for grid/unmatched energy.",
            "Do not add guaranteeOfOriginSurplusKwh and guaranteeOfOriginSpreadKwh: the surplus is counted before banking, so banked energy appears in both.",
            "'dailySummary' covers the whole period, not one day.",
            "The bank is a modelling choice (same-day virtual storage, no losses, no limit); it is not a physical battery.",
            a.noSolar.length ? `${a.noSolar.length} hour(s) with charging but no solar record (counted as zero production), e.g. ${a.noSolar.slice(0, 3).join(", ")}.` : "Every charging hour has a solar record.",
            a.noCharging.length ? `${a.noCharging.length} hour(s) with solar but no charging record (counted as zero charging), e.g. ${a.noCharging.slice(0, 3).join(", ")}.` : "Every solar hour has a charging record.",
            a.odd.length ? `Day(s) without exactly 24 hours (daylight-saving change or missing data): ${a.odd.map((x) => `${x.day} (${x.hours} h)`).join(", ")}.` : "Every day has 24 hours.",
            "Times are local wall-clock strings as in the inputs; no time-zone conversion is done.",
            "Car ids are pseudonymous identifiers and are kept in result.json (inside chargers[].cars); they are not shown here or in the HTML report.",
            "The job log (not the outputs) prints the full content of every input file.",
        ],
        questions: [
            { question: "What share of the EV charging was solar?", answer: `balance.dailySummary.solarPercentage (${d.solarPercentage} %); split into realTimePVPercent (${d.realTimePVPercent} %) and spreadPVPercent (${d.spreadPVPercent} %).` },
            { question: "How much came from the grid?", answer: `balance.dailySummary.unadressedConsumptionKwh (${r2(d.unadressedConsumptionKwh)} kWh). Per hour: balance.hourlyData[].summary.unadressedConsumptionKwh.` },
            { question: "Which day or hour was best?", answer: "Group balance.hourlyData by the date part of datetime and compute sum(usedSolarKwh) / sum(totalConsumption); the daily table of the HTML report shows it." },
            { question: "How much did one charger use, and how much was solar?", answer: "Sum chargers[].consumptionKWh for that id over balance.hourlyData (or read dashboard.chargerBreakdown). The solar part per charger is not in result.json; estimate it by splitting each hour's usedSolarKwh in proportion to the charger's energy." },
            { question: "How much solar was not used / could have charged more cars?", answer: `Solar production minus the energy matched with charging: ${r2(a.totals.unused)} kWh over the period.` },
            { question: "How many cars charged?", answer: `Count different ids in chargers[].cars[] (${a.cars} in this run).` },
        ],
        glossary: [
            { term: "Guarantee of origin (GO)", meaning: "Here: the amount of charging that can be attributed to the local solar production." },
            { term: "Real-time match", meaning: "Charging covered by solar produced in the same hour." },
            { term: "Spread / bank", meaning: "Solar surplus of one hour credited to charging in another hour of the same day." },
            { term: "Unaddressed consumption", meaning: "Charging not covered by solar, i.e. grid energy." },
            { term: "OCM-...", meaning: "Charger id from Open Charge Map." },
            { term: "kWh", meaning: "Kilowatt-hour, unit of energy." },
        ],
        facts: {
            algorithm: "pv_to_ev_energy_matcher",
            period: a.period,
            days: a.days.length,
            hours: a.hours.length,
            chargers: dash.totalChargers,
            cars: a.cars,
            totalConsumptionKwh: r2(d.totalConsumption),
            totalSolarProductionKwh: r2(d.totalSolarProduction),
            usedSolarKwh: r2(d.usedSolarKwh),
            realTimeSolarKwh: r2(d.guaranteeOfOriginKwh),
            bankedSolarKwh: r2(d.guaranteeOfOriginSpreadKwh),
            gridKwh: r2(d.unadressedConsumptionKwh),
            solarPercentage: d.solarPercentage,
            realTimePVPercent: d.realTimePVPercent,
            spreadPVPercent: d.spreadPVPercent,
            unusedSolarKwh: r2(a.totals.unused),
            hoursWithoutSolarRecord: a.noSolar.length,
            hoursWithoutChargingRecord: a.noCharging.length,
        },
    });
}

let emAnalysis = null;
try {
    emAnalysis = emAnalyse(balance, chargersData, solarData);
} catch (err) {
    console.error(`Report analysis skipped (${err && err.message ? err.message : err})`);
}
if (emAnalysis) {
    reportWrite(fs, path.join(outputDir, EM_HTML_FILE), () => emRenderReport(balance, dashboard, emAnalysis, path.basename(outputFile)));
    contextWrite(fs, path.join(outputDir, CONTEXT_FILE), () => emBuildContext(balance, dashboard, emAnalysis, { chargers: chargersFileName, solar: solarFileName }));
}
