"""Empower-X (Ocean Enterprise) compute-to-data entrypoint for the solar surplus forecaster.

Ocean mounts the consumer's dataset under /data/inputs/<did>/<index>, optional parameters
in /data/inputs/algoCustomData.json, and collects whatever is written to /data/outputs.
The dataset is the hourly history of one installation (same columns as cups_surplus_clean.csv,
at minimum info_dt/timestamp plus grid_import_kwh and grid_export_kwh). The algorithm
forecasts surplus_kwh for the hours following the last row of that history.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

APP_DIR = Path(os.environ.get("APP_DIR", "/app"))
sys.path.insert(0, str(APP_DIR / "src"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from feature_engineering import build_feature_frame, load_house_data  # noqa: E402
from live_recommendations import (  # noqa: E402
    build_future_input_frame,
    combined_weather_csv,
    fetch_open_meteo_forecast,
    localize_feature_config,
)
from recommend_appliances import load_config, load_model_package  # noqa: E402

INPUTS_DIR = Path(os.environ.get("C2D_INPUTS", "/data/inputs"))
OUTPUTS_DIR = Path(os.environ.get("C2D_OUTPUTS", "/data/outputs"))
CUSTOM_DATA_NAME = "algoCustomData.json"


def log(message: str) -> None:
    print(f"[solar-forecaster] {message}", flush=True)


def read_custom_data() -> dict:
    path = INPUTS_DIR / CUSTOM_DATA_NAME
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        log(f"Ignoring unreadable {CUSTOM_DATA_NAME}")
        return {}


def find_input_files() -> list[Path]:
    dids = json.loads(os.environ.get("DIDS", "[]") or "[]")
    roots = [INPUTS_DIR / did for did in dids] or [INPUTS_DIR]
    files = []
    for root in roots:
        if root.is_file():
            files.append(root)
        elif root.is_dir():
            files.extend(p for p in sorted(root.rglob("*")) if p.is_file() and p.name != CUSTOM_DATA_NAME)
    return files


def forecast_one(path: Path, config: dict, model_package: dict, horizon_hours: int, fetch_weather: bool) -> pd.DataFrame:
    history = load_house_data(str(path))
    if history.empty:
        raise ValueError("no rows with a valid info_dt/timestamp")
    target_col = model_package["target_column"]
    if target_col not in history.columns:
        history[target_col] = np.nan

    start_utc = history["info_dt"].max().floor("h") + pd.Timedelta(hours=1)
    future = build_future_input_frame(history, start_utc, horizon_hours)
    combined = pd.concat([history, future], ignore_index=True, sort=False).sort_values("info_dt").reset_index(drop=True)

    feature_config = localize_feature_config(config, model_package)
    forecast_path = fetch_open_meteo_forecast(config, start_utc, horizon_hours) if fetch_weather else None
    weather = combined_weather_csv(config, forecast_path)
    feature_config["weather_csv"] = str(weather) if weather else None
    log(f"Weather forecast {'used' if forecast_path else 'not available, using history only'}")
    _keep_for_report(path, history=history, target_col=target_col, weather_used=bool(forecast_path))

    feature_frame = build_feature_frame(combined, target_col, feature_config)
    for column in model_package["features"]:
        if column not in feature_frame.columns:
            feature_frame[column] = 0
    future_mask = combined["info_dt"].isin(future["info_dt"])
    out = combined.loc[future_mask, ["info_dt"]].copy().reset_index(drop=True)
    out["local_dt"] = out["info_dt"].dt.tz_convert("Europe/Madrid")
    features = feature_frame.loc[future_mask, model_package["features"]].fillna(0)
    out["predicted_surplus_kwh"] = np.clip(model_package["model"].predict(features), 0, None)
    _keep_for_report(path, forecast=out)
    return out


# ---- BEGIN html-report ------------------------------------------------------------------
# Dependency-free (stdlib only) HTML report: one self-contained page with inline CSS and
# inline SVG, no scripts and no network, written next to summary.json. Same look as the
# other Empower-X reports (empower-x/report/html-report.js). Any error here is logged and
# swallowed so it can never change the forecast outputs or the exit code.

REPORT_NAME = "surplus_forecast_report.html"
REPORT_CONTEXT: dict = {}  # str(input path) -> {"history", "weather_used", "forecast"}
REPORT_TZ = "Europe/Madrid"
REPORT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"]
REPORT_HISTORY_HOURS = 72  # recent history drawn before the forecast
REPORT_APPLIANCES = [  # (config key, friendly name) used for the "when to run" table
    ("Washingmachine", "Washing machine"),
    ("Dishwasher", "Dishwasher"),
    ("LaundryDryer", "Tumble dryer"),
    ("WaterBoiler", "Electric water heater"),
    ("Iron", "Iron"),
    ("ElectricVehicleCharger", "Electric car charger"),
]


def _keep_for_report(path: Path, history=None, target_col=None, **extra) -> None:
    """Remember data for the HTML report only (never used by the forecast); can never raise."""
    try:
        ctx = REPORT_CONTEXT.setdefault(str(path), {})
        if history is not None:
            ctx["history"] = history[["info_dt", target_col]].copy()
        ctx.update(extra)
    except Exception:  # noqa: BLE001 - the report is optional
        pass


def _esc(value) -> str:
    import html

    return html.escape("" if value is None else str(value), quote=True)


def _num(value, decimals: int = 2) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return "–"
    if n != n or n in (float("inf"), float("-inf")):
        return "–"
    text = f"{n:,.{decimals}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _mask_ids(text) -> str:
    """Mask Spanish supply-point ids (CUPS: ES + 16 digits + up to 4 check/border chars) in free text."""
    import re

    return re.sub(r"ES\d{16}[A-Z0-9]{0,4}", lambda m: m.group(0)[:4] + "…" + m.group(0)[-4:], str(text or ""), flags=re.I)


def _nice_ticks(lo: float, hi: float, count: int = 5) -> list:
    import math

    if hi <= lo:
        hi = lo + 1
    raw = (hi - lo) / count
    mag = 10 ** math.floor(math.log10(raw))
    step = next((m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw), raw)
    t = math.floor(lo / step) * step
    ticks = []
    while True:
        ticks.append(round(t, 10))
        if t >= hi - step * 1e-9 or len(ticks) > 50:
            break
        t += step
    return ticks


def _figure(title: str, svg: str, legend: str = "", note: str = "") -> str:
    return (
        f"<figure><figcaption>{_esc(title)}</figcaption>{svg}{legend}"
        + (f'<p class="note">{_esc(note)}</p>' if note else "")
        + "</figure>"
    )


def _legend(items: list) -> str:
    spans = "".join(f'<span><i style="background:{color}"></i>{_esc(name)}</span>' for name, color in items)
    return f'<div class="legend">{spans}</div>'


def _kpis(items: list) -> str:
    out = '<div class="kpis">'
    for label, value, unit, hint in items:
        out += (
            f'<div class="kpi"><div class="kpi-label">{_esc(label)}</div>'
            f'<div class="kpi-value{" small" if len(str(value)) > 10 else ""}">{_esc(value)}'
            + (f'<span class="kpi-unit"> {_esc(unit)}</span>' if unit else "")
            + "</div>"
            + (f'<div class="kpi-hint">{_esc(hint)}</div>' if hint else "")
            + "</div>"
        )
    return out + "</div>"


def _table(title: str, columns: list, rows: list, note: str = "") -> str:
    if not rows:
        return _figure(title, '<p class="empty">No data</p>', note=note)
    head = "".join(f'<th{" class=num" if num else ""}>{_esc(label)}</th>' for label, num in columns)
    body = "".join(
        "<tr>" + "".join(f'<td{" class=num" if num else ""}>{_esc(cell)}</td>' for cell, (_, num) in zip(row, columns)) + "</tr>"
        for row in rows
    )
    return _figure(title, f'<div class="table-wrap"><table><tr>{head}</tr>{body}</table></div>', note=note)


def _section(title: str, body: str, intro: str = "") -> str:
    return f"<section><h2>{_esc(title)}</h2>" + (f'<p class="intro">{_esc(intro)}</p>' if intro else "") + body + "</section>"


def _timeline_chart(title: str, hist: list, fcst: list, note: str = "") -> str:
    """hist/fcst: lists of (local naive Timestamp, kWh). History as a line, forecast as a filled area."""
    if not fcst:
        return _figure(title, '<p class="empty">No data</p>')
    points = hist + fcst
    W, H, L, R, T, B = 760, 300, 52, 16, 30, 40
    t0, t1 = points[0][0], points[-1][0]
    span = max(1.0, (t1 - t0).total_seconds() / 3600)
    values = [v for _, v in points if v == v]
    ticks = _nice_ticks(0.0, max(values + [0.1]))
    y_max = ticks[-1]

    def x(ts) -> float:
        return L + (W - L - R) * ((ts - t0).total_seconds() / 3600) / span

    def y(v) -> float:
        return T + (H - T - B) * (1 - v / y_max)

    svg = f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{_esc(title)}">'
    for t in ticks:
        svg += (
            f'<line class="grid" x1="{L}" x2="{W - R}" y1="{y(t):.1f}" y2="{y(t):.1f}"/>'
            f'<text class="axis" x="{L - 6}" y="{y(t) + 4:.1f}" text-anchor="end">{_num(t)}</text>'
        )
    split = x(fcst[0][0])
    svg += f'<rect x="{split:.1f}" y="{T}" width="{W - R - split:.1f}" height="{H - T - B}" class="shade"/>'
    # day separators at local midnight, day name under its midday
    day = t0.normalize()
    while day <= t1:
        if day > t0:
            svg += f'<line class="grid" x1="{x(day):.1f}" x2="{x(day):.1f}" y1="{T}" y2="{H - B}"/>'
        noon = day + pd.Timedelta(hours=12)
        if L + 34 <= x(noon) <= W - R - 34:  # skip labels that would be cut at the edges
            svg += f'<text class="axis" x="{x(noon):.1f}" y="{H - B + 16}" text-anchor="middle">{_esc(noon.strftime("%a %d %b"))}</text>'
        day = (day + pd.Timedelta(hours=36)).normalize()
    svg += (
        f'<line class="divider" x1="{split:.1f}" x2="{split:.1f}" y1="{T - 10}" y2="{H - B}"/>'
        f'<text class="axis" x="{split + 6:.1f}" y="{T - 12}">forecast →</text>'
    )
    if hist:
        svg += f'<text class="axis" x="{split - 6:.1f}" y="{T - 12}" text-anchor="end">← measured</text>'
    base = y(0)
    if hist:  # missing values and missing hours break the line instead of being drawn as 0
        d, prev = "", None
        for ts, v in hist:
            if v != v:
                prev = None
                continue
            gap = prev is None or (ts - prev).total_seconds() > 3600
            d += f'{"M" if gap else "L"}{x(ts):.1f},{y(v):.1f}'
            prev = ts
        if d:
            svg += f'<path d="{d}" fill="none" stroke="{REPORT_COLORS[0]}" stroke-width="1.6"/>'
    d = "".join(f'{"M" if i == 0 else "L"}{x(ts):.1f},{y(v):.1f}' for i, (ts, v) in enumerate(fcst))
    svg += (
        f'<path d="{d}L{x(fcst[-1][0]):.1f},{base:.1f}L{x(fcst[0][0]):.1f},{base:.1f}Z" fill="{REPORT_COLORS[2]}" opacity="0.25"/>'
        f'<path d="{d}" fill="none" stroke="{REPORT_COLORS[2]}" stroke-width="2.2"/>'
    )
    step = (W - L - R) / span
    for ts, v in fcst:  # invisible hover targets with exact values
        svg += (
            f'<rect x="{x(ts) - step / 2:.1f}" y="{T}" width="{step:.1f}" height="{H - T - B}" fill="transparent">'
            f'<title>{_esc(ts.strftime("%a %d %b %H:00"))}: {_num(v, 3)} kWh (forecast)</title></rect>'
        )
    svg += f'<line class="baseline" x1="{L}" x2="{W - R}" y1="{base:.1f}" y2="{base:.1f}"/>'
    svg += '<text class="axis" x="4" y="12">kWh per hour</text></svg>'
    legend = _legend(([("Measured surplus (your data)", REPORT_COLORS[0])] if hist else []) + [("Forecast surplus", REPORT_COLORS[2])])
    return _figure(title, svg, legend, note)


def _hour_profile_chart(title: str, series: list, note: str = "") -> str:
    """Grouped bars per local hour 0-23. series: [(name, color, [24 values or None])]."""
    W, H, L, R, T, B = 760, 250, 52, 16, 22, 26
    vals = [v for _, _, s in series for v in s if v is not None]
    if not vals:
        return _figure(title, '<p class="empty">No data</p>')
    ticks = _nice_ticks(0.0, max(vals + [0.1]))
    y_max = ticks[-1]
    band = (W - L - R) / 24
    group = band * 0.8
    bar = group / len(series)

    def y(v) -> float:
        return T + (H - T - B) * (1 - v / y_max)

    svg = f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{_esc(title)}">'
    for t in ticks:
        svg += (
            f'<line class="grid" x1="{L}" x2="{W - R}" y1="{y(t):.1f}" y2="{y(t):.1f}"/>'
            f'<text class="axis" x="{L - 6}" y="{y(t) + 4:.1f}" text-anchor="end">{_num(t)}</text>'
        )
    for h in range(24):
        x0 = L + band * h + (band - group) / 2
        for si, (name, color, s) in enumerate(series):
            v = s[h]
            if v is None:
                continue
            top = y(max(0.0, v))
            svg += (
                f'<rect x="{x0 + bar * si:.1f}" y="{top:.1f}" width="{max(1.0, bar - 1):.1f}" height="{max(0.0, y(0) - top):.1f}" fill="{color}">'
                f"<title>{h:02d}:00 · {_esc(name)}: {_num(v, 3)} kWh</title></rect>"
            )
        if h % 2 == 0:
            svg += f'<text class="axis" x="{L + band * h + band / 2:.1f}" y="{H - B + 15}" text-anchor="middle">{h:02d}h</text>'
    svg += f'<line class="baseline" x1="{L}" x2="{W - R}" y1="{y(0):.1f}" y2="{y(0):.1f}"/>'
    svg += '<text class="axis" x="4" y="12">kWh per hour</text></svg>'
    return _figure(title, svg, _legend([(name, color) for name, color, _ in series]), note)


def _best_window(hours: list, values: list, power_kw: float, duration_h: float):
    """Best start hour for an appliance: maximises the part of its energy covered by forecast surplus."""
    import math

    need = power_kw * duration_h
    slots = math.ceil(duration_h)
    best = None
    for start in range(0, len(values) - slots + 1):
        covered = sum(min(power_kw * min(1.0, duration_h - k), values[start + k]) for k in range(slots))
        if best is None or covered > best[1] + 1e-9:
            best = (start, covered)
    if best is None or need <= 0:
        return None
    start, covered = best
    return hours[start], hours[start] + pd.Timedelta(hours=duration_h), need, covered, 100.0 * covered / need


def _render_input(index: int, item: dict, path: Path, config: dict) -> str:
    name = _mask_ids(item.get("input", path.name))
    title = f"Input {index + 1}: {name}"
    if "error" in item:
        return _section(
            title,
            f'<p class="warn">No forecast could be made for this file: {_esc(_mask_ids(item["error"]))}</p>',
            "The algorithm could not process this file. The input should be an hourly CSV with an info_dt (or timestamp) "
            "column and grid_import_kwh / grid_export_kwh columns.",
        )
    ctx = REPORT_CONTEXT.get(str(path), {})
    forecast = ctx.get("forecast")
    if forecast is None or not len(forecast):
        return ""
    local = pd.to_datetime(forecast["info_dt"], utc=True).dt.tz_convert(REPORT_TZ).dt.tz_localize(None)
    hours = list(local)
    values = [float(v) for v in forecast["predicted_surplus_kwh"]]
    total = sum(values)
    peak_i = max(range(len(values)), key=lambda i: values[i])
    threshold = float(config.get("minimum_recommended_surplus_kwh", 0.05))
    surplus_hours = sum(1 for v in values if v >= threshold)

    history = ctx.get("history")
    hist_points, hist_profile, hist_days = [], [None] * 24, 0
    if history is not None and len(history):
        hist = history.dropna(subset=["info_dt"]).copy()
        target = hist.columns[1]
        hist["local"] = hist["info_dt"].dt.tz_convert(REPORT_TZ).dt.tz_localize(None)
        hist[target] = pd.to_numeric(hist[target], errors="coerce")
        recent = hist[hist["local"] > hours[0] - pd.Timedelta(hours=REPORT_HISTORY_HOURS + 1)]
        hist_points = [(ts, float(v)) for ts, v in zip(recent["local"], recent[target])]
        last14 = hist[hist["local"] >= hours[0] - pd.Timedelta(days=14)].dropna(subset=[target])
        if len(last14):
            hist_days = max(1, round((hours[0] - last14["local"].min()).total_seconds() / 86400))
            by_hour = last14.groupby(last14["local"].dt.hour)[target].mean()
            hist_profile = [float(by_hour[h]) if h in by_hour.index else None for h in range(24)]

    fc_sum, fc_n = [0.0] * 24, [0] * 24
    for ts, v in zip(hours, values):
        fc_sum[ts.hour] += v
        fc_n[ts.hour] += 1
    fc_profile = [s / n if n else None for s, n in zip(fc_sum, fc_n)]

    fmt = "%a %d %b %H:%M"
    end = hours[-1] + pd.Timedelta(hours=1)
    weather_used = bool(ctx.get("weather_used"))
    kpis = _kpis(
        [
            ("Forecast horizon", f"{len(values)}", "hours", f"{hours[0].strftime(fmt)} – {end.strftime(fmt)}"),
            ("Total forecast surplus", _num(total, 1), "kWh", "solar energy expected to go to the grid"),
            ("Peak hour", hours[peak_i].strftime("%H:%M"), "", f"{hours[peak_i].strftime('%a %d %b')} · {_num(values[peak_i])} kWh")
            if values[peak_i] > 0
            else ("Peak hour", "–", "", "no surplus expected in this period"),
            ("Hours with surplus", f"{surplus_hours}", f"of {len(values)}", f"at least {_num(threshold)} kWh in the hour"),
            ("Live weather forecast", "Used" if weather_used else "Not used", "", "Open-Meteo forecast" if weather_used else "history and stored weather only"),
        ]
    )
    chart = _timeline_chart(
        "Measured and forecast surplus per hour",
        hist_points,
        list(zip(hours, values)),
        f"Local time ({REPORT_TZ}). Left of the dashed line: up to the last {REPORT_HISTORY_HOURS} hours of your own data. "
        "Right of it (shaded): the forecast. Hover over the forecast to see each hour's value.",
    )
    profile_series = [("Forecast", REPORT_COLORS[2], fc_profile)]
    if any(v is not None for v in hist_profile):
        profile_series.append((f"Your last {hist_days} days (average)", REPORT_COLORS[0], hist_profile))
    profile = _hour_profile_chart(
        "Average surplus by hour of the day",
        profile_series,
        "If the orange bars are lower than the blue ones, the coming hours are expected to be cloudier (or your use higher) than usual.",
    )

    by_day: dict = {}
    for ts, v in zip(hours, values):
        by_day.setdefault(ts.normalize(), []).append((ts, v))
    day_rows = []
    for day, items in by_day.items():
        best_ts, best_v = max(items, key=lambda it: it[1])
        day_rows.append(
            [day.strftime("%a %d %b %Y"), f"{len(items)}", _num(sum(v for _, v in items), 2), best_ts.strftime("%H:%M") if best_v > 0 else "–", _num(best_v, 2)]
        )
    days_table = _table(
        "Forecast per day",
        [("Day", False), ("Hours covered", True), ("Surplus (kWh)", True), ("Best hour", False), ("Best hour (kWh)", True)],
        day_rows,
        "The first and last day can be partial: only the hours inside the forecast horizon are counted.",
    )
    top = [i for i in sorted(range(len(values)), key=lambda i: (-values[i], i))[:10] if values[i] > 0]
    top_rows = [
        [hours[i].strftime("%a %d %b"), f"{hours[i].strftime('%H:%M')}–{(hours[i] + pd.Timedelta(hours=1)).strftime('%H:%M')}", _num(values[i], 3)]
        for i in top
    ]
    top_table = _table(f"The {len(top_rows) or 10} hours with the most surplus", [("Day", False), ("Hour (local)", False), ("Surplus (kWh)", True)], top_rows)

    appl_rows = []
    appliances = config.get("schedulable_appliances", {}) or {}
    for key, label in REPORT_APPLIANCES:
        spec = appliances.get(key) or {}
        power, duration = spec.get("estimated_power_kw"), spec.get("duration_hours")
        if not power or not duration:
            continue
        best = _best_window(hours, values, float(power), float(duration))
        if not best or best[3] <= 0:
            continue
        start, stop, need, covered, pct = best
        appl_rows.append(
            [label, f"{start.strftime('%a %d %b, %H:%M')}–{stop.strftime('%H:%M')}", f"{_num(power)} kW × {_num(duration)} h", _num(need, 2), _num(covered, 2), f"{_num(pct, 0)} %"]
        )
    appl_table = _table(
        "Best time to run common appliances",
        [("Appliance", False), ("Best window (local time)", False), ("Typical use", False), ("Needs (kWh)", True), ("From surplus (kWh)", True), ("Solar share", True)],
        appl_rows,
        "Worked out in this report from the hourly forecast and typical appliance power and duration. Each appliance is "
        "considered on its own: running several in the same window shares the same surplus."
        if appl_rows
        else "No forecast hour has enough surplus to run these appliances on solar energy.",
    )

    return (
        _section(title, kpis + chart, "How much solar energy your installation is expected to send to the grid in each coming hour. Using that energy yourself is usually cheaper than buying it back later.")
        + _section("Daily pattern", profile, "Hour by hour, the forecast compared with your recent average.")
        + _section("When is the surplus?", days_table + top_table, "The days and hours with the most spare solar energy.")
        + _section("Plan your appliances", appl_table, "Running flexible appliances in these windows uses your own solar energy instead of exporting it.")
    )


def render_report(summary: dict, inputs: list, config: dict, model_package: dict, custom: dict, fetch_weather: bool) -> str:
    items = summary.get("inputs", [])
    parts = [_render_input(i, item, path, config) for i, (item, path) in enumerate(zip(items, inputs))]

    metrics = model_package.get("metrics", {}) or {}
    solar = config.get("solar_system", {}) or {}
    weather = config.get("weather_api", {}) or {}
    trained = str(model_package.get("trained_until", "") or "")[:10]
    model_kpis = _kpis(
        [
            ("Model", str(model_package.get("selected_model", "unknown")).replace("_", " ").capitalize(), "", f"trained on data up to {trained}" if trained else ""),
            ("Typical error", "±" + _num(metrics.get("mae_kwh"), 2), "kWh per hour", "mean absolute error on test data"),
            ("Fit (R²)", _num(metrics.get("r2"), 2), "", "1 = perfect, 0 = no better than the average"),
            ("Test period", _num(metrics.get("test_rows"), 0), "hours", f"{str(metrics.get('test_start', ''))[:10]} – {str(metrics.get('test_end', ''))[:10]}"),
        ]
    )
    accuracy_note = (
        f"On test data the forecast was off by {_num(metrics.get('mae_kwh'), 2)} kWh per hour on average, and by less than "
        f"{_num(metrics.get('p95_abs_error_kwh'), 2)} kWh in 95 % of hours. Errors are larger around midday than at night, "
        "so read single hours as estimates; daily totals are more reliable."
        if metrics
        else ""
    )

    def source(*keys: str) -> str:
        return "your setting" if all(k in custom for k in keys) else "default"

    param_rows = [
        ["Forecast horizon", f"{summary.get('horizon_hours')} hours", source("horizon_hours")],
        ["Installed solar power", f"{_num(solar.get('installed_kwp'))} kWp", source("installed_kwp")],
        ["Panel tilt / orientation", f"{_num(solar.get('panel_tilt_degrees'))}° / {_num(solar.get('panel_azimuth_degrees'))}° (180° = south)", "default"],
        ["Location (rounded)", _latlon(weather.get("latitude"), weather.get("longitude")), source("latitude", "longitude")],
        ["Fetch live weather forecast", "yes" if fetch_weather else "no", source("fetch_weather")],
        ["Minimum useful surplus", f"{_num(config.get('minimum_recommended_surplus_kwh', 0.05))} kWh per hour", "default"],
        ["Time zone of this report", REPORT_TZ, "fixed"],
        ["Run time", f"{_num(summary.get('elapsed_seconds'), 1)} s", ""],
    ]
    params = _table("Parameters used", [("Parameter", False), ("Value", False), ("Source", False)], param_rows)

    ok = [it for it in items if "output" in it]
    subtitle = f"Hour-by-hour forecast of the solar energy your installation will send to the grid · {len(ok)} of {len(items)} input file(s) forecast"
    sections = parts + [
        _section(
            "About the model",
            model_kpis + (f'<p class="note">{_esc(accuracy_note)}</p>' if accuracy_note else ""),
            "A machine-learning model trained on the MareNostrum 5 supercomputer with hourly data from real solar installations.",
        ),
        _section("Parameters", params, "The settings this run used. Anything you did not set falls back to the default shown here."),
    ]
    return _page("Solar surplus forecast", subtitle, sections, ", ".join(it["output"] for it in ok))


def _latlon(lat, lon) -> str:
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return "–"
    return f"{_num(abs(lat), 1)}° {'N' if lat >= 0 else 'S'}, {_num(abs(lon), 1)}° {'E' if lon >= 0 else 'W'}"


def _page(title: str, subtitle: str, sections: list, outputs: str) -> str:
    css = """
:root{--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0;--grid:#eef2f7;--shade:rgba(245,158,11,.07);--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#111a2e;--text:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--grid:#1a2438;--shade:rgba(245,158,11,.05);--warn:#fbbf24}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 16px 48px}header h1{margin:0 0 4px;font-size:24px}header p{margin:0;color:var(--muted)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 8px;margin-top:18px}
h2{margin:0 0 6px;font-size:18px}.intro{margin:0 0 12px;color:var(--muted)}
figure{margin:12px 0 16px}figcaption{font-weight:600;margin-bottom:6px}svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.baseline{stroke:var(--muted);stroke-width:1}.divider{stroke:var(--muted);stroke-width:1;stroke-dasharray:4 3}
.shade{fill:var(--shade)}.axis{fill:var(--muted);font-size:11px}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:6px;font-size:13px;color:var(--muted);align-items:center}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.note{font-size:12px;color:var(--muted);margin:6px 0 10px}.empty{color:var(--muted);font-style:italic;font-size:13px}.warn{color:var(--warn)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 14px}
.kpi{border:1px solid var(--line);border-radius:10px;padding:10px 12px}.kpi-label{font-size:12px;color:var(--muted)}
.kpi-value{font-size:22px;font-weight:700}.kpi-value.small{font-size:17px;line-height:1.3;padding-top:3px}.kpi-unit{font-size:13px;font-weight:400;color:var(--muted)}.kpi-hint{font-size:12px;color:var(--muted)}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
th{color:var(--muted);font-weight:600}.num{text-align:right;font-variant-numeric:tabular-nums}
footer{margin-top:24px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff}section{break-inside:avoid}}"""
    when = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{_esc(title)}</title><style>{css}</style></head><body><main>"
        f"<header><h1>{_esc(title)}</h1><p>{_esc(subtitle)}</p></header>"
        + "".join(sections)
        + f"<footer>Generated {_esc(when)} by the Empower-X Compute-to-Data algorithm “Solar Surplus Forecaster”."
        + (f" The hourly numbers are in <code>{_esc(outputs)}</code> and <code>summary.json</code> next to this file." if outputs else "")
        + " Hover over a chart to see exact values.</footer></main></body></html>"
    )


def write_report(target: Path, summary: dict, inputs: list, config: dict, model_package: dict, custom: dict, fetch_weather: bool) -> None:
    """Write the HTML report; never raises, so the forecast outputs and the exit code stay as they are."""
    try:
        target.write_text(render_report(summary, inputs, config, model_package, custom, fetch_weather), encoding="utf-8")
        log(f"HTML report written: {target}")
    except Exception as error:  # noqa: BLE001 - the report is optional
        log(f"HTML report skipped ({error})")


# ---- END html-report --------------------------------------------------------------------


# ---- BEGIN ai-context -------------------------------------------------------------------
# AI_CONTEXT.md: a plain Markdown description of this job's outputs, written for an AI
# assistant (or a person) that is handed the extracted outputs folder and asked questions
# about it. Same section order and wording as contextDoc in empower-x/report/html-report.js:
#   1 What this algorithm does · 2 This run · 3 Output files · 4 Fields and units
#   5 Method and definitions · 6 Key results · 7 Data quality and limitations
#   8 How to answer common questions · 9 Glossary
# plus a machine-readable "facts" JSON block at the end. Stdlib only (plus the pandas the
# forecast already uses); any error is logged and swallowed, never failing the job.

CONTEXT_FILE = "AI_CONTEXT.md"
CONTEXT_TITLE = "Solar Surplus Forecaster – trained on MareNostrum 5"
CONTEXT_MAX_INPUTS = 20  # inputs described one by one; the rest are only counted


def _md_text(value) -> str:
    """Single-line, Markdown-safe text (no HTML interpretation, no table breaks)."""
    import re

    text = "" if value is None else str(value)
    text = re.sub(r"[\r\n]+", " ", text)
    text = text.replace("<", "&lt;").replace(">", "&gt;").replace("|", "\\|")
    return text.strip()


def _ctx_mask(text) -> str:
    """Context-only id masking: the HTML rule (_mask_ids) plus any ES + 16–20 letters/digits
    token with at least 8 digits (CUPS written with letters earlier, or longer variants)."""
    import re

    text = _mask_ids(text)
    return re.sub(
        r"(?<![0-9A-Za-z])ES(?=[0-9A-Z]*?\d{8})[0-9A-Z]{16,20}(?![0-9A-Za-z])",
        lambda m: m.group(0)[:4] + "…" + m.group(0)[-4:],
        text,
        flags=re.I,
    )


def _md_table(columns: list, rows: list) -> str:
    """columns: [(key, label)]; rows: dicts. Values pass through _md_text."""
    if not rows:
        return "_None._\n"
    head = "| " + " | ".join(_md_text(label) for _, label in columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(_md_text(row.get(key)) for key, _ in columns) + " |" for row in rows]
    return "\n".join([head, sep, *body]) + "\n"


def _md_list(items: list) -> str:
    if not items:
        return "_None._\n"
    return "\n".join("- " + _md_text(it) for it in items) + "\n"


def _json_safe(value):
    """Plain JSON values only: NaN/inf -> None, numpy/pandas scalars -> Python."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)) or hasattr(value, "item"):
        try:
            value = value.item() if hasattr(value, "item") else value
        except Exception:  # noqa: BLE001
            return str(value)
        if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
            return None
        return value
    return str(value)


def context_doc(title: str, summary: str = "", run=(), files=(), fields=(), method=(), results=(), limitations=(), questions=(), glossary=(), facts=None) -> str:
    out = [f"# AI context: {_md_text(title)}", ""]
    out.append(
        "> This file explains the outputs of one Compute-to-Data job of the Empower-X data space, "
        "so that an AI assistant (or a person) can answer questions about them. "
        "All numbers below come from this run. Where the data contains identifiers of supply points (CUPS), cars or people, they are shortened here for privacy."
    )
    out.append("")
    out += ["## 1. What this algorithm does", "", _md_text(summary), ""]
    out += ["## 2. This run", "", _md_table([("label", "Item"), ("value", "Value")], list(run))]
    out += [
        "## 3. Output files",
        "",
        _md_table(
            [("file", "File"), ("format", "Format"), ("contents", "Contents")],
            list(files) + [{"file": CONTEXT_FILE, "format": "Markdown", "contents": "This description."}],
        ),
    ]
    out += ["## 4. Fields and units", ""]
    out.append(_md_table([("file", "File"), ("field", "Field / column"), ("type", "Type"), ("unit", "Unit"), ("meaning", "Meaning")], list(fields)))
    out += ["## 5. Method and definitions", "", _md_list(list(method))]
    out += ["## 6. Key results", ""]
    out.append(_md_table([("label", "Result"), ("value", "Value"), ("unit", "Unit")], list(results)))
    out += ["## 7. Data quality and limitations", "", _md_list(list(limitations))]
    out += ["## 8. How to answer common questions", ""]
    out.append("\n".join(f"**{_md_text(q['question'])}**  \n{_md_text(q['answer'])}\n" for q in questions) if questions else "_None._\n")
    out += ["## 9. Glossary", "", _md_table([("term", "Term"), ("meaning", "Meaning")], list(glossary))]
    out += ["## 10. Facts (machine-readable)", ""]
    out += ["```json", json.dumps(_json_safe(facts or {}), indent=2, ensure_ascii=False), "```", ""]
    return "\n".join(out)


def _ctx_input_header(path: Path) -> dict:
    """Columns, data-line count and timestamp style of one input file (for the context only)."""
    import re

    info: dict = {}
    try:
        head = pd.read_csv(path, nrows=5, dtype=str)
        info["columns"] = [str(c) for c in head.columns]
        col = "info_dt" if "info_dt" in head.columns else ("timestamp" if "timestamp" in head.columns else None)
        if col and len(head):
            sample = str(head[col].dropna().iloc[0]) if head[col].notna().any() else ""
            info["timestamp_column"] = col
            info["timestamp_has_offset"] = bool(re.search(r"(Z|[+-]\d{2}:?\d{2})\s*$", sample))
    except Exception:  # noqa: BLE001
        pass
    try:
        with open(path, "rb") as handle:
            data = handle.read()
        lines = data.count(b"\n") + (0 if data.endswith(b"\n") or not data else 1)
        info["data_lines"] = max(0, lines - 1)
    except Exception:  # noqa: BLE001
        pass
    return info


def _ctx_weather_range(config: dict):
    try:
        weather_csv = APP_DIR / config["weather_csv"]
        times = pd.to_datetime(pd.read_csv(weather_csv, usecols=["time"])["time"], utc=True, errors="coerce").dropna()
        if len(times):
            return times.min(), times.max()
    except Exception:  # noqa: BLE001
        pass
    return None


def _ctx_input_stats(item: dict, path: Path, config: dict, weather_range) -> dict:
    """Same figures as the HTML report (same rules), plus data-quality checks on the history."""
    stats: dict = {"name": _ctx_mask(item.get("input", path.name)), "header": _ctx_input_header(path)}
    if "error" in item:
        stats["error"] = _ctx_mask(item["error"])
        return stats
    ctx = REPORT_CONTEXT.get(str(path), {})
    stats["weather_used"] = bool(ctx.get("weather_used"))
    threshold = float(config.get("minimum_recommended_surplus_kwh", 0.05))

    history = ctx.get("history")
    if history is not None:
        hist = history.dropna(subset=["info_dt"]).copy()
        target = hist.columns[1]
        hist[target] = pd.to_numeric(hist[target], errors="coerce")
        stats["history_rows"] = int(len(hist))
        stats["target"] = target
        if len(hist):
            first, last = hist["info_dt"].min(), hist["info_dt"].max()
            stats["history_start"], stats["history_end"] = first, last
            hours_span = int(round((last - first).total_seconds() / 3600)) + 1
            stats["history_hours_span"] = hours_span
            unique_hours = hist["info_dt"].dt.floor("h").nunique()
            stats["duplicate_rows"] = int(len(hist) - hist["info_dt"].nunique())
            stats["missing_hours"] = max(0, hours_span - int(unique_hours))
            measured = hist[target]
            stats["target_present"] = int(measured.notna().sum())
            stats["target_total"] = float(measured.sum(skipna=True))
            local = hist["info_dt"].dt.tz_convert(REPORT_TZ)
            night = local.dt.hour.isin([22, 23, 0, 1, 2, 3, 4, 5])
            stats["night_surplus_hours"] = int(((measured >= threshold) & night).sum())
    forecast = ctx.get("forecast")
    if forecast is None or not len(forecast):
        return stats
    utc = pd.to_datetime(forecast["info_dt"], utc=True)
    local_aware = utc.dt.tz_convert(REPORT_TZ)
    local = local_aware.dt.tz_localize(None)
    hours = list(local)
    values = [float(v) for v in forecast["predicted_surplus_kwh"]]
    # naive local hour -> ISO text with its UTC offset (as in the CSV local_dt column)
    stats["iso_local"] = {h: a.isoformat() for h, a in zip(hours, local_aware)}
    stats["end_local_iso"] = (local_aware.iloc[-1] + pd.Timedelta(hours=1)).isoformat()
    fc_sum, fc_n = [0.0] * 24, [0] * 24
    for ts, v in zip(hours, values):
        fc_sum[ts.hour] += v
        fc_n[ts.hour] += 1
    stats["fc_profile"] = [s / n if n else None for s, n in zip(fc_sum, fc_n)]
    stats["hours"] = len(values)
    stats["start_local"], stats["end_local"] = hours[0], hours[-1] + pd.Timedelta(hours=1)
    stats["start_utc"], stats["end_utc_excl"] = utc.iloc[0], utc.iloc[-1] + pd.Timedelta(hours=1)
    stats["total"] = sum(values)
    peak_i = max(range(len(values)), key=lambda i: values[i])
    stats["peak"] = (hours[peak_i], values[peak_i]) if values[peak_i] > 0 else None
    stats["surplus_hours"] = sum(1 for v in values if v >= threshold)
    stats["zero_hours"] = sum(1 for v in values if v <= 0)
    by_day: dict = {}
    for ts, v in zip(hours, values):
        by_day.setdefault(ts.normalize(), []).append((ts, v))
    stats["days"] = []
    for day, items in by_day.items():
        best_ts, best_v = max(items, key=lambda it: it[1])
        stats["days"].append((day, len(items), sum(v for _, v in items), best_ts if best_v > 0 else None, best_v))
    top = [i for i in sorted(range(len(values)), key=lambda i: (-values[i], i))[:10] if values[i] > 0]
    stats["top"] = [(hours[i], values[i]) for i in top]
    appl = []
    appliances = config.get("schedulable_appliances", {}) or {}
    for key, label in REPORT_APPLIANCES:
        spec = appliances.get(key) or {}
        power, duration = spec.get("estimated_power_kw"), spec.get("duration_hours")
        if not power or not duration:
            continue
        best = _best_window(hours, values, float(power), float(duration))
        if not best or best[3] <= 0:
            continue
        appl.append((label, float(power), float(duration)) + tuple(best))
    stats["appliances"] = appl
    if history is not None and len(history):
        hist = history.dropna(subset=["info_dt"]).copy()
        target = hist.columns[1]
        hist["local"] = hist["info_dt"].dt.tz_convert(REPORT_TZ).dt.tz_localize(None)
        hist[target] = pd.to_numeric(hist[target], errors="coerce")
        last14 = hist[hist["local"] >= hours[0] - pd.Timedelta(days=14)].dropna(subset=[target])
        if len(last14):
            stats["recent_days"] = max(1, round((hours[0] - last14["local"].min()).total_seconds() / 86400))
            stats["recent_total"] = float(last14[target].sum())
            stats["recent_rows"] = int(len(last14))
            by_hour = last14.groupby(last14["local"].dt.hour)[target].mean()
            stats["recent_profile"] = [float(by_hour[h]) if h in by_hour.index else None for h in range(24)]
    if not stats["weather_used"] and weather_range is not None:
        lo, hi = weather_range
        stats["weather_hours_covered"] = int(((utc >= lo) & (utc <= hi)).sum())
        stats["weather_range"] = weather_range
    return stats


def render_context(summary: dict, inputs: list, config: dict, model_package: dict, custom: dict, fetch_weather: bool, out_dir: Path) -> str:
    fmt_day = "%a %d %b %Y"
    fmt = "%Y-%m-%d %H:%M"
    items = summary.get("inputs", [])
    weather_range = _ctx_weather_range(config)
    stats = [_ctx_input_stats(item, path, config, weather_range) for item, path in zip(items, inputs)]
    ok = [s for s in stats if "hours" in s]
    failed = [s for s in stats if "error" in s]
    shown = stats[:CONTEXT_MAX_INPUTS]
    metrics = model_package.get("metrics", {}) or {}
    solar = config.get("solar_system", {}) or {}
    weather = config.get("weather_api", {}) or {}
    threshold = float(config.get("minimum_recommended_surplus_kwh", 0.05))
    trained = str(model_package.get("trained_until", "") or "")
    generated = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    now_utc = pd.Timestamp.now(tz="UTC")
    model_name = str(model_package.get("selected_model", "unknown"))
    multi = len(inputs) > 1
    params = model_package.get("best_params") or metrics.get("best_params") or {}
    try:
        cutoff = float(params.get("probability_cutoff", 0.35))
    except (TypeError, ValueError):
        cutoff = 0.35
    try:
        cls_threshold = float(params.get("threshold_kwh", 0.05))
    except (TypeError, ValueError):
        cls_threshold = 0.05
    try:
        test_pred, test_act = float(metrics["predicted_total_kwh"]), float(metrics["actual_total_kwh"])
        test_ratio = (test_pred / test_act - 1) * 100 if test_act else None
    except (KeyError, TypeError, ValueError):
        test_pred = test_act = test_ratio = None

    def per_day(s: dict):
        return s["total"] / (s["hours"] / 24) if s.get("hours") else None

    def recent_per_day(s: dict):
        return s["recent_total"] / s["recent_days"] if s.get("recent_days") else None

    def ago(delta) -> str:
        hours_ago = delta.total_seconds() / 3600
        return f"{_num(hours_ago, 0)} hour(s)" if hours_ago < 48 else f"{_num(hours_ago / 24, 0)} days"

    def odd_hours(s: dict) -> list:
        """Local hours of day where the forecast and the recent measured average disagree sharply."""
        fc, rc = s.get("fc_profile") or [], s.get("recent_profile") or []
        out = []
        for h in range(min(len(fc), len(rc))):
            f, r = fc[h], rc[h]
            if f is None or r is None:
                continue
            if r >= max(0.2, 3 * threshold) and f < threshold:
                out.append((h, f, r, "forecast ~0 although recent days had surplus"))
        return out

    def source(*keys: str) -> str:
        return "your setting (algoCustomData)" if all(k in custom for k in keys) else "default"

    def lat_r(v):
        try:
            return round(float(v), 1)
        except (TypeError, ValueError):
            return None

    def label_of(s: dict, i: int) -> str:
        return f"Input {i + 1} ({s['name']})"

    known_keys = {"horizon_hours", "installed_kwp", "latitude", "longitude", "fetch_weather"}
    ignored = sorted(str(k) for k in custom if k not in known_keys) if isinstance(custom, dict) else []

    # ---- 2. this run
    run = [
        {"label": "Algorithm", "value": f"{CONTEXT_TITLE} (Empower-X Compute-to-Data job)"},
        {"label": "Algorithm version", "value": "not recorded by the algorithm; model package: " + model_name + (f", trained on data up to {trained[:16]} UTC" if trained else "")},
        {"label": "Generated at", "value": generated},
        {"label": "Input files found", "value": f"{len(inputs)} (every file under /data/inputs except algoCustomData.json)"},
        {"label": "Input files forecast", "value": str(len(ok))},
        {"label": "Input files skipped", "value": f"{len(failed)}" + (" – " + "; ".join(f"{s['name']}: {s['error']}" for s in failed[:CONTEXT_MAX_INPUTS]) if failed else "")},
    ]
    for i, s in enumerate(shown):
        head = s.get("header", {})
        parts = []
        if "data_lines" in head:
            parts.append(f"{head['data_lines']} data line(s) in the file")
        if "history_rows" in s:
            parts.append(f"{s['history_rows']} rows with a valid timestamp used")
        if "history_start" in s:
            gaps = []
            if s.get("missing_hours"):
                gaps.append(f"{s['missing_hours']} hour(s) missing")
            if s.get("duplicate_rows"):
                gaps.append(f"{s['duplicate_rows']} duplicate timestamp row(s)")
            parts.append(
                f"history from {s['history_start'].strftime(fmt)} to {s['history_end'].strftime(fmt)} UTC (both hours included: "
                f"{s['history_hours_span']} hourly time slots, {_num((s['history_hours_span']) / 24, 1)} days; "
                + (", ".join(gaps) if gaps else "no missing or duplicate hours")
                + ")"
            )
        if "target_present" in s:
            parts.append(f"{s['target_present']} rows with a measured surplus value")
        if head.get("columns"):
            parts.append("columns: " + ", ".join(_ctx_mask(c) for c in head["columns"][:30]))
        if "error" in s:
            parts.append("SKIPPED: " + s["error"])
        elif "hours" in s:
            parts.append(f"forecast {s['hours']} h from {s['start_local'].strftime(fmt)} to {s['end_local'].strftime(fmt)} local time")
            parts.append("live weather forecast used" if s["weather_used"] else "live weather forecast not used")
        run.append({"label": label_of(s, i), "value": "; ".join(parts)})
    if len(stats) > len(shown):
        run.append({"label": "More inputs", "value": f"{len(stats) - len(shown)} more input file(s) not listed one by one; see summary.json"})
    run += [
        {"label": "Parameter horizon_hours", "value": f"{summary.get('horizon_hours')} hours – {source('horizon_hours')} (default {config.get('default_horizon_hours', 24)})"},
        {"label": "Parameter installed_kwp", "value": f"{_num(solar.get('installed_kwp'))} kWp – {source('installed_kwp')}"},
        {"label": "Parameters latitude / longitude", "value": f"{_latlon(weather.get('latitude'), weather.get('longitude'))} (rounded to 0.1°, about 10 km, as in the HTML; the exact coordinates are not written to any output) – {source('latitude', 'longitude')}" + (" (both must be set to take effect)" if ("latitude" in custom) != ("longitude" in custom) else "")},
        {"label": "Parameter fetch_weather", "value": f"{'yes' if fetch_weather else 'no'} – {source('fetch_weather')} (default yes)"},
        {"label": "Panel tilt / azimuth", "value": f"{_num(solar.get('panel_tilt_degrees'))}° / {_num(solar.get('panel_azimuth_degrees'))}° (180° = south) – default, not settable"},
        {"label": "Minimum useful surplus", "value": f"{_num(threshold)} kWh per hour – default, not settable"},
        {"label": "Time zone for local times", "value": f"{REPORT_TZ} (fixed)"},
        {"label": "Ignored algoCustomData keys", "value": ", ".join(_ctx_mask(k)[:40] for k in ignored[:20]) if ignored else "none"},
        {"label": "Run time", "value": f"{_num(summary.get('elapsed_seconds'), 2)} s (summary.json elapsed_seconds; the HTML shows it rounded to 1 decimal, {_num(summary.get('elapsed_seconds'), 1)} s)"},
        {"label": "Privacy of identifiers", "value": "Supply-point ids (CUPS) in input file names are masked in this file and in the HTML (first 4 + last 4 characters). summary.json (inputs[].input and any inputs[].error) writes the input file names in FULL, so it may contain a full CUPS – treat it as personal data. The CSV forecast files contain no ids."},
    ]

    # ---- 3. output files (what is really in the folder)
    present = []
    try:
        present = sorted(p.name for p in out_dir.iterdir() if p.is_file() and p.name != CONTEXT_FILE)
    except Exception:  # noqa: BLE001
        pass
    by_output = {}
    for s, item in zip(stats, items):
        if "output" in item:
            by_output[item["output"]] = s
    files = []
    for name in present:
        if name == "summary.json":
            files.append({"file": name, "format": "JSON", "contents": f"Run summary: model name, requested horizon, one entry per input file ({len(items)}) with its output file, forecast period and total forecast surplus, or the error that made it skip; run time. Input file names are written in full here (may include a full supply-point id)."})
        elif name in by_output:
            s = by_output[name]
            files.append({"file": name, "format": "CSV (comma-separated, header row)", "contents": f"Hourly forecast for {s['name']}: {s.get('hours', '?')} rows, one per forecast hour, with UTC time, local time and predicted surplus in kWh."})
        elif name == REPORT_NAME:
            files.append({"file": name, "format": "HTML (self-contained, open in a browser)", "contents": "Visual report: key figures, measured vs forecast chart, daily pattern, per-day table, top-10 hours, best appliance windows, model accuracy and parameters. Supply-point ids in file names are masked here."})
        else:
            files.append({"file": name, "format": name.rsplit(".", 1)[-1].upper() if "." in name else "file", "contents": "Not written by this algorithm's known outputs."})

    # ---- 4. fields
    csv_name = "surplus_forecast_<n>.csv" if multi else "surplus_forecast.csv"
    rep = REPORT_NAME
    fields = [
        {"file": "summary.json", "field": "model", "type": "string", "unit": "", "meaning": f"Name of the forecasting model used ({model_name})."},
        {"file": "summary.json", "field": "horizon_hours", "type": "integer", "unit": "hours", "meaning": "Requested forecast length (algoCustomData horizon_hours or the default). Values below 1 still produce 1 hour."},
        {"file": "summary.json", "field": "inputs", "type": "array of objects", "unit": "", "meaning": "One object per input file, in the order the files were processed (sorted by path)."},
        {"file": "summary.json", "field": "inputs[].input", "type": "string", "unit": "", "meaning": "Input file name (full, may contain the full supply-point id / CUPS; masked in this file and in the HTML)."},
        {"file": "summary.json", "field": "inputs[].output", "type": "string", "unit": "", "meaning": "Name of the CSV with this input's hourly forecast. Only present when the forecast succeeded."},
        {"file": "summary.json", "field": "inputs[].start_utc", "type": "string (timestamp 'YYYY-MM-DD HH:MM:SS+00:00')", "unit": "UTC", "meaning": "Start of the first forecast hour."},
        {"file": "summary.json", "field": "inputs[].end_utc", "type": "string (timestamp 'YYYY-MM-DD HH:MM:SS+00:00')", "unit": "UTC", "meaning": "Start of the LAST forecast hour (the period ends one hour later)."},
        {"file": "summary.json", "field": "inputs[].total_predicted_surplus_kwh", "type": "number", "unit": "kWh", "meaning": "Sum of predicted_surplus_kwh over all forecast hours, rounded to 3 decimals."},
        {"file": "summary.json", "field": "inputs[].error", "type": "string", "unit": "", "meaning": "Why this input was skipped (only present for skipped inputs; no output then)."},
        {"file": "summary.json", "field": "elapsed_seconds", "type": "number", "unit": "s", "meaning": "Wall-clock run time of the job up to writing summary.json, rounded to 2 decimals."},
        {"file": csv_name, "field": "info_dt", "type": "string (timestamp 'YYYY-MM-DD HH:MM:SS+00:00')", "unit": "UTC", "meaning": "Start of the forecast hour in UTC."},
        {"file": csv_name, "field": "local_dt", "type": "string (timestamp with offset, e.g. +01:00 / +02:00)", "unit": f"local time {REPORT_TZ}", "meaning": "Same hour in Spanish local time (CET/CEST)."},
        {"file": csv_name, "field": "predicted_surplus_kwh", "type": "number (float, not rounded)", "unit": "kWh in that hour", "meaning": "Forecast solar energy sent to the grid during that hour (never negative; 0 = no surplus expected)."},
        {"file": rep, "field": "KPI Forecast horizon", "type": "count + local period", "unit": "hours", "meaning": "Number of forecast hours and their local start – end."},
        {"file": rep, "field": "KPI Total forecast surplus", "type": "number (1 decimal)", "unit": "kWh", "meaning": "Sum of the hourly forecast."},
        {"file": rep, "field": "KPI Peak hour", "type": "local time + number", "unit": "kWh", "meaning": "Hour with the highest forecast surplus ('–' if all are 0)."},
        {"file": rep, "field": "KPI Hours with surplus", "type": "count", "unit": "hours", "meaning": f"Forecast hours with at least {_num(threshold)} kWh."},
        {"file": rep, "field": "KPI Live weather forecast", "type": "Used / Not used", "unit": "", "meaning": "Whether an Open-Meteo weather forecast was fetched for this input."},
        {"file": rep, "field": "Chart Measured and forecast surplus per hour", "type": "line/area chart", "unit": "kWh per hour", "meaning": f"Up to {REPORT_HISTORY_HOURS} h of measured surplus from the input, then the forecast (shaded)."},
        {"file": rep, "field": "Chart Average surplus by hour of the day", "type": "bar chart", "unit": "kWh per hour", "meaning": "Forecast average per local hour vs the average measured surplus per local hour over the last 14 days of history."},
        {"file": rep, "field": "Table Forecast per day", "type": "table", "unit": "kWh", "meaning": "Columns Day, Hours covered, Surplus (kWh, 2 decimals), Best hour, Best hour (kWh) per local calendar day."},
        {"file": rep, "field": "Table The hours with the most surplus", "type": "table (up to 10 rows)", "unit": "kWh", "meaning": "Columns Day, Hour (local), Surplus (kWh, 3 decimals); only hours above 0."},
        {"file": rep, "field": "Table Best time to run common appliances", "type": "table", "unit": "kWh, %", "meaning": "Columns Appliance, Best window (local time), Typical use (kW × h), Needs (kWh), From surplus (kWh), Solar share (%)."},
        {"file": rep, "field": "About the model", "type": "key figures", "unit": "kWh, hours", "meaning": "Model name, training cut-off, MAE, R², test period length and dates."},
        {"file": rep, "field": "Parameters", "type": "table", "unit": "", "meaning": "Columns Parameter, Value, Source (your setting / default / fixed)."},
    ]

    # ---- 5. method
    method = [
        "Input: each file must be an hourly CSV with an info_dt (or timestamp) column. Timestamps are parsed as UTC; a timestamp without a time-zone offset is taken as UTC (not Spanish local time). Rows with an unreadable timestamp are dropped and the rest sorted by time.",
        "Measured surplus (the model target, surplus_kwh) = the surplus_kwh column if present, else excedent_net_kwh / exportada_kwh / Exportada, else grid_export_kwh; negative values are set to 0. grid_import_kwh and grid_export_kwh are also clipped at 0.",
        "Forecast window: starts at the full hour after the last history timestamp (last timestamp rounded down to the hour + 1 h) and covers horizon_hours consecutive hours.",
        "For the future hours the meter columns (production, consumption, import, export, ...) are filled with the history's average for the same local weekday and hour (falling back to the same hour, then the overall average); these filled values only feed the model features.",
        "Features (255 in total): calendar (hour, weekday, month, weekend, holidays/behaviour), values 24, 48, 72, 168 and 336 hours earlier and 24/72/168-hour rolling averages of the history, solar geometry from latitude, longitude, panel tilt/azimuth and installed kWp (hour angle uses the UTC hour), typical appliance and electric-car usage patterns, and weather (temperature, humidity, precipitation, cloud cover, solar radiation). Any feature that cannot be computed is set to 0.",
        "Weather: stored weather history bundled with the model" + (f" (covers {weather_range[0].strftime(fmt)} – {weather_range[1].strftime(fmt)} UTC)" if weather_range else "") + ", plus a live Open-Meteo forecast for the chosen location when fetch_weather is on and the internet is reachable. Hours without weather data get weather features 0.",
        f"Model (two-stage extra trees): a classifier gives the probability p that the hour has more than {_num(cls_threshold)} kWh surplus; a regressor gives the amount a. Prediction = p × a, set to 0 when p < {_num(cutoff)}, never below 0. Result = predicted_surplus_kwh (kWh in that hour). "
        f"Because of this cut-off the forecast is all-or-nothing at the edges of the day: an hour whose probability is just under {_num(cutoff)} becomes exactly 0, and the next hour can jump straight to a large value. Sudden starts or ends of the surplus (e.g. 0 in one morning hour and a large value in the next) are a model effect, not a measured event.",
        "total_predicted_surplus_kwh = sum of predicted_surplus_kwh over the forecast hours, rounded to 3 decimals (summary.json). The HTML shows the same total rounded to 1 decimal.",
        f"Hours with surplus = number of forecast hours with predicted_surplus_kwh ≥ {_num(threshold)} kWh (minimum_recommended_surplus_kwh). Peak hour = hour with the largest forecast (earliest one on ties).",
        f"Per-day figures group forecast hours by local calendar day ({REPORT_TZ}); first and last day can be partial. Top hours = the 10 largest hourly forecasts above 0 (earliest first on ties).",
        "Best appliance window (HTML only): an appliance of power P kW running D hours needs P × D kWh. For each possible start hour, the energy covered by surplus = sum over its hours k = 0..ceil(D)−1 of min(P × min(1, D − k), forecast of hour start+k). The start with the most covered energy wins (earliest on ties); solar share = covered ÷ need × 100 %. Each appliance is considered alone. Appliances: "
        + ", ".join(f"{label} {_num((config.get('schedulable_appliances', {}) or {}).get(key, {}).get('estimated_power_kw'))} kW × {_num((config.get('schedulable_appliances', {}) or {}).get(key, {}).get('duration_hours'))} h" for key, label in REPORT_APPLIANCES)
        + ".",
        "Recent average (HTML daily-pattern chart): mean measured surplus per local hour of the day over the history rows from 14 days before the forecast start (local time) up to the forecast start; rows without a measured value are left out. "
        "Recent measured total (section 6) = sum of the measured surplus over those same rows; per day = that total ÷ the number of days (14 when the history is long enough). "
        "Only the 24 hourly averages are visible in the HTML (and in the facts block below), not the raw history; their sum ≈ the measured kWh per day.",
        "Forecast vs recent comparison (section 6): forecast kWh per day = total forecast ÷ (forecast hours ÷ 24); difference % = (forecast per day ÷ recent measured per day − 1) × 100.",
        "Times: CSV info_dt and summary.json start_utc/end_utc are UTC; CSV local_dt, the HTML and the local times in this file are Europe/Madrid (UTC+1 in winter, UTC+2 in summer).",
    ]
    if metrics:
        method.append(
            f"Model accuracy (from training, on {_num(metrics.get('test_rows'), 0)} held-out test hours {str(metrics.get('test_start', ''))[:10]} – {str(metrics.get('test_end', ''))[:10]}): "
            f"MAE {_num(metrics.get('mae_kwh'), 3)} kWh, RMSE {_num(metrics.get('rmse_kwh'), 3)} kWh, R² {_num(metrics.get('r2'), 3)}, bias {_num(metrics.get('bias_kwh'), 3)} kWh, "
            f"95 % of hourly errors below {_num(metrics.get('p95_abs_error_kwh'), 3)} kWh. These are the model's general figures, not measured for this run. "
            "The MAE is averaged over ALL test hours, including night hours where both forecast and reality are 0, so typical errors in daylight hours are larger than the MAE (the 95 % error and the RMSE show the size of the bigger daytime misses)."
            + (
                f" Over the whole test period the model forecast {_num(test_pred, 1)} kWh against {_num(test_act, 1)} kWh actually exported ({_num(test_ratio, 1)} %), i.e. it tends to under-forecast slightly."
                if test_ratio is not None and test_ratio < 0
                else (f" Over the whole test period the model forecast {_num(test_pred, 1)} kWh against {_num(test_act, 1)} kWh actually exported ({_num(test_ratio, 1)} %)." if test_ratio is not None else "")
            )
        )

    # ---- 6. results
    results = [
        {"label": "Input files forecast / found", "value": f"{len(ok)} / {len(items)}", "unit": "files"},
        {"label": "Forecast model", "value": model_name, "unit": ""},
    ]
    for i, s in enumerate(shown):
        tag = label_of(s, i) if multi else "Forecast"
        if "error" in s:
            results.append({"label": f"{tag}: status", "value": "skipped – " + s["error"], "unit": ""})
            continue
        if "hours" not in s:
            continue
        item_total = next((it.get("total_predicted_surplus_kwh") for it, st in zip(items, stats) if st is s), None)
        results += [
            {"label": f"{tag}: period (local)", "value": f"{s['start_local'].strftime(fmt)} – {s['end_local'].strftime(fmt)} ({s['hours']} h)", "unit": REPORT_TZ},
            {"label": f"{tag}: total forecast surplus", "value": item_total, "unit": "kWh"},
            {"label": f"{tag}: peak hour", "value": f"{s['peak'][0].strftime(fmt)} local, {_num(s['peak'][1], 3)}" if s["peak"] else "none (no surplus expected)", "unit": "kWh" if s["peak"] else ""},
            {"label": f"{tag}: hours with surplus ≥ {_num(threshold)} kWh", "value": f"{s['surplus_hours']} of {s['hours']}", "unit": "hours"},
            {"label": f"{tag}: live weather forecast", "value": "used" if s["weather_used"] else "not used", "unit": ""},
        ]
        if s["hours"] >= 24:
            results.append({"label": f"{tag}: forecast average per day", "value": f"{_num(per_day(s), 3)} (total ÷ {_num(s['hours'] / 24, 2)} day(s))", "unit": "kWh/day"})
        for day, n, total, best_ts, best_v in s["days"][:10]:
            results.append({"label": f"{tag}: {day.strftime(fmt_day)}", "value": f"{_num(total, 3)} over {n} h" + (f", best hour {best_ts.strftime('%H:%M')} ({_num(best_v, 3)} kWh)" if best_ts is not None else ""), "unit": "kWh"})
        for label, power, duration, start, stop, need, covered, pct in s["appliances"]:
            results.append(
                {
                    "label": f"{tag}: best window {label}",
                    "value": f"{start.strftime('%a %d %b, %H:%M')}–{stop.strftime('%H:%M')} local, {_num(covered, 3)} of {_num(need, 3)} kWh from surplus ({_num(pct, 1)} %; the HTML shows {_num(covered, 2)} kWh and {_num(pct, 0)} %)",
                    "unit": "kWh",
                }
            )
        if "recent_total" in s:
            rpd = recent_per_day(s)
            results.append({"label": f"{tag}: measured surplus, last {s['recent_days']} days of history", "value": f"{_num(s['recent_total'], 3)} over {s.get('recent_rows', '?')} measured hours (≈ {_num(rpd, 3)} per day)", "unit": "kWh"})
            fpd = per_day(s)
            if fpd is not None and rpd and s["hours"] >= 24:
                diff = (fpd / rpd - 1) * 100
                results.append(
                    {
                        "label": f"{tag}: forecast vs recent measured",
                        "value": f"{_num(fpd, 3)} vs {_num(rpd, 3)} kWh per day: the forecast is {_num(abs(diff), 1)} % {'lower' if diff < 0 else 'higher'} than the last {s['recent_days']} days",
                        "unit": "kWh/day, %",
                    }
                )
        for h, f, r, _why in odd_hours(s)[:6]:
            results.append({"label": f"{tag}: unusual hour {h:02d}:00–{(h + 1) % 24:02d}:00 local", "value": f"forecast average {_num(f, 3)} kWh vs recent measured average {_num(r, 3)} kWh at this hour", "unit": "kWh"})
        if s["end_utc_excl"] < now_utc:
            results.append({"label": f"{tag}: forecast period vs run date", "value": f"the whole forecast period is in the past: it ended {ago(now_utc - s['end_utc_excl'])} before this job ran ({generated})", "unit": ""})
    results.append(
        {
            "label": "Rounding",
            "value": "Values above use 3 decimals (percentages 1 decimal); the CSV has full precision, summary.json 3 decimals for the total, the HTML 1 decimal for the total and 2 decimals / whole % in its tables.",
            "unit": "",
        }
    )

    # ---- 7. limitations
    limitations = [
        "This is a forecast, not a measurement. "
        + (
            f"The model's average hourly error is {_num(metrics.get('mae_kwh'), 2)} kWh, but that average includes night hours (error ≈ 0); in daylight, and above all around midday, single hours are typically off by more, and 5 % of hours by more than {_num(metrics.get('p95_abs_error_kwh'), 2)} kWh. "
            if metrics
            else "Single hours can be off noticeably. "
        )
        + "Daily totals are more reliable than single hours.",
        "Surplus is energy exported to the grid, i.e. solar production minus what the home uses at that moment. The algorithm does not forecast production or consumption separately, and it computes no prices, savings or CO2.",
        "The model was trained on hourly data from a limited set of real installations (Catalonia/Spain); homes with very different size, orientation or habits may be forecast less accurately. Panel tilt and azimuth are fixed at the defaults.",
        "installed_kwp, latitude and longitude only change the solar-geometry and weather features; they do not scale the forecast directly.",
        "Output CSV numbering: with more than one input file, surplus_forecast_<n>.csv uses the position n (from 0) of the input in the sorted file list, counting skipped files too, so numbers can have gaps.",
        "Rounding: the CSV keeps full precision, summary.json rounds the total to 3 decimals, the HTML to 1–3 decimals. Small differences between files are rounding only.",
        "Privacy: input file names in summary.json are written in full (they may contain the supply-point id/CUPS), so the outputs folder as a whole is not anonymous; only this file and the HTML mask them (first 4 and last 4 characters). Do not quote full ids from summary.json back to people who should not see them.",
        "This job contains no measured values for the forecast period itself, so it cannot say how accurate this particular forecast was; only the model's general test accuracy (section 5) is known.",
    ]
    if isinstance(custom.get("fetch_weather"), str):
        limitations.append("fetch_weather was given as text; any non-empty text (even \"false\") counts as yes.")
    if "horizon_hours" in custom:
        try:
            if int(custom["horizon_hours"]) < 1:
                limitations.append("horizon_hours was below 1; the forecast still covers 1 hour while summary.json shows the requested value.")
        except (TypeError, ValueError):
            pass
    for i, s in enumerate(shown):
        tag = label_of(s, i)
        if "error" in s:
            limitations.append(f"{tag} was skipped: {s['error']}")
            continue
        head = s.get("header", {})
        if head.get("timestamp_has_offset") is False:
            limitations.append(f"{tag}: timestamps have no time-zone offset, so they were read as UTC. If they were Spanish local time, the history is shifted by 1–2 hours.")
        if "data_lines" in head and "history_rows" in s and head["data_lines"] > s["history_rows"]:
            limitations.append(f"{tag}: {head['data_lines'] - s['history_rows']} line(s) without a readable timestamp were dropped (blank lines are counted too).")
        if s.get("target_present") == 0:
            limitations.append(f"{tag}: no measured surplus/export values in the history, so the forecast relies only on calendar, solar geometry and weather patterns.")
        if s.get("history_hours_span", 10**9) < 336:
            limitations.append(f"{tag}: history covers only {s['history_hours_span']} hours (< 14 days); features that look back 1–2 weeks are missing and set to 0, which makes the forecast less reliable.")
        if s.get("missing_hours"):
            limitations.append(f"{tag}: {s['missing_hours']} hour(s) missing inside the history period.")
        if s.get("duplicate_rows"):
            limitations.append(f"{tag}: {s['duplicate_rows']} duplicate timestamp row(s) in the history.")
        if s.get("night_surplus_hours"):
            limitations.append(f"{tag}: {s['night_surplus_hours']} night-time hour(s) (22:00–05:59 local) with measured surplus ≥ {_num(threshold)} kWh – unusual for solar, maybe a time-zone shift or another source (battery, other generator).")
        if "hours" in s and not s["weather_used"]:
            covered = s.get("weather_hours_covered")
            if covered is not None:
                limitations.append(
                    f"{tag}: no live weather forecast was used ({'turned off' if not fetch_weather else 'not reachable'}); the stored weather history covers {covered} of {s['hours']} forecast hours"
                    + ("; the other hours have no weather information, so cloudy or sunny days are not anticipated." if covered < s["hours"] else ".")
                )
            else:
                limitations.append(f"{tag}: no live weather forecast was used ({'turned off' if not fetch_weather else 'not reachable'}).")
        if "hours" in s and s["total"] <= 0:
            limitations.append(f"{tag}: the forecast is 0 kWh in every hour (night-only window, winter, or too little history/weather to predict surplus).")
        if "hours" in s and s["end_utc_excl"] < now_utc:
            limitations.append(
                f"{tag}: the forecast period ({s['start_local'].strftime(fmt)} – {s['end_local'].strftime(fmt)} local) lies entirely before the date this job ran ({generated}). "
                "The forecast is made 'as if' at the end of the uploaded history (it only uses data up to then), so it is a retrospective forecast. "
                "Real meter values for that period may well exist at the data provider, but they are not in the input history nor in these outputs, so no comparison was made."
            )
        odd = odd_hours(s)
        if odd:
            limitations.append(
                f"{tag}: the forecast shape differs from the recent measured pattern at "
                + ", ".join(f"{h:02d}:00 local (forecast {_num(f, 3)} vs recent average {_num(r, 3)} kWh)" for h, f, r, _ in odd[:6])
                + f". This usually comes from the model's on/off cut-off (an hour whose surplus probability is below {_num(cutoff)} is set to exactly 0, see section 5), not from anything known about that day; "
                "treat the start/end of the surplus period as uncertain by about an hour. The outputs do not tell the exact reason."
            )
        fpd, rpd = per_day(s), recent_per_day(s)
        if fpd is not None and rpd and s["hours"] >= 24 and abs(fpd / rpd - 1) >= 0.1:
            limitations.append(
                f"{tag}: the forecast ({_num(fpd, 2)} kWh/day) is {_num(abs(fpd / rpd - 1) * 100, 0)} % {'below' if fpd < rpd else 'above'} the last {s['recent_days']} days' measured surplus ({_num(rpd, 2)} kWh/day). "
                + ("Possible reasons: weather expected to be less sunny, higher expected use" + (", and the model's slight tendency to under-forecast (section 5)" if test_ratio is not None and test_ratio < 0 else "") + "; the outputs do not say which." if fpd < rpd else "Possible reasons: sunnier weather or lower expected use; the outputs do not say which.")
            )
    if len(stats) > len(shown):
        limitations.append(f"Only the first {len(shown)} inputs are described one by one here; check summary.json for the others.")

    # ---- 8. questions
    first_csv = next((it["output"] for it in items if "output" in it), csv_name)
    questions = [
        {"question": "How much solar surplus is expected in total?", "answer": "summary.json → inputs[i].total_predicted_surplus_kwh (kWh, 3 decimals); see section 6. Equivalent to summing predicted_surplus_kwh in the input's CSV."},
        {"question": "Which hour will have the most surplus?", "answer": f"Sort {first_csv} by predicted_surplus_kwh descending and read local_dt (Spanish local time). Section 6 gives the peak hour; the HTML lists the top 10 hours."},
        {"question": "How much surplus on a given day?", "answer": "Sum predicted_surplus_kwh of the CSV rows whose local_dt date is that day (use local_dt, not info_dt, which is UTC). The HTML table 'Forecast per day' and section 6 give the same totals (rounded)."},
        {"question": "When should I run the washing machine / dishwasher / car charger?", "answer": "See the HTML table 'Best time to run common appliances' or section 6 'best window' (exact formula in section 5). To redo it: for every start hour, add min(appliance kWh in that hour, predicted_surplus_kwh) over the run's hours; take the start with the largest sum (earliest on ties). Running two appliances in the same window shares the same surplus."},
        {"question": "How much money will I save?", "answer": "Not answerable from these outputs: no prices, tariffs, savings or CO2 are computed. Only the kWh of surplus that could be used is given."},
        {"question": "How many hours will have surplus?", "answer": f"Count CSV rows with predicted_surplus_kwh ≥ {_num(threshold)} kWh (the threshold the HTML uses); rows above 0 if any surplus counts."},
        {"question": "Why is the forecast 0 at night (or 0 everywhere)?", "answer": "There is no solar production at night. If daytime hours are also 0, the model saw no likely surplus (winter, cloudy, little history, or no weather data) – check section 7."},
        {"question": "How accurate is the forecast?", "answer": "Section 5 'Model accuracy' (MAE, R², 95 % error) and the HTML 'About the model'. These are general test figures; the outputs contain no measured values for the forecast period, so this run's own accuracy is unknown. The MAE includes night hours, so daytime errors are larger than the MAE."},
        {"question": "Is this forecast higher or lower than what I normally export?", "answer": "Section 6 'forecast vs recent measured': forecast kWh per day (total ÷ forecast days) against the measured kWh per day of the last 14 days of the uploaded history. Hour by hour: the HTML chart 'Average surplus by hour of the day' (also recent_hourly_avg_kwh vs forecast_hourly_avg_kwh in the facts block, index = local hour 0–23)."},
        {"question": "Why does the surplus start (or stop) so suddenly, or why is a morning hour 0 when it is usually sunny then?", "answer": f"The model sets an hour to exactly 0 when its probability of surplus is below {_num(cutoff)} (section 5), so the edges of the sunny period jump from 0 to a large value. Section 6/7 list 'unusual hour' rows where the forecast is ~0 although the recent days had surplus. It is a model effect; the outputs do not give a day-specific reason."},
        {"question": "Is the forecast for the future or the past? Can it be checked against what really happened?", "answer": "Compare the forecast period (section 6, local time) with 'Generated at' in section 2. The forecast always starts right after the end of the uploaded history, whatever the run date; if the period is before the run date it is a retrospective forecast. Actual values for that period are not in these outputs; they would have to come from the meter data provider."},
        {"question": "Where is the installation, and what is its supply-point id?", "answer": "Only an approximate location (0.1°, about 10 km) is given in section 2 and the HTML. The supply-point id (CUPS) is masked here and in the HTML; summary.json inputs[].input holds the full input file name, which may contain the full id."},
        {"question": "How can I check the 'last 14 days measured' figure?", "answer": "The raw history is not in the outputs. The HTML daily-pattern chart (and recent_hourly_avg_kwh in the facts) gives the 14-day average per local hour; their sum ≈ the measured kWh per day in section 6, and × the number of days ≈ the 14-day total."},
        {"question": "What period does the forecast cover, and in which time zone?", "answer": "summary.json start_utc / end_utc are UTC and end_utc is the START of the last hour. The CSV local_dt and the HTML use Europe/Madrid time. Section 6 gives the local period."},
        {"question": "Was a weather forecast used?", "answer": "Section 2 / 6 'live weather forecast' and the HTML KPI 'Live weather forecast'. Without it, weather comes only from stored history (see section 7)."},
        {"question": "Which output file belongs to which input, and why was a file skipped?", "answer": "summary.json → inputs[i].input and inputs[i].output; a skipped input has inputs[i].error instead of output. File names are full in summary.json but masked here and in the HTML."},
        {"question": "Does it tell me my production, consumption or savings?", "answer": "No. Only exported surplus (kWh per hour) is forecast; no prices or savings are computed."},
    ]

    # ---- 9. glossary
    glossary = [
        {"term": "Surplus (excedent)", "meaning": "Solar energy the home does not use at that moment and sends to the grid (grid export), in kWh per hour."},
        {"term": "Grid import / export", "meaning": "Energy bought from / sent to the electricity grid in an hour (kWh)."},
        {"term": "Self-consumption", "meaning": "Using your own solar energy in the home instead of exporting it; moving appliance use into surplus hours increases it."},
        {"term": "kWh", "meaning": "Kilowatt-hour, an amount of energy. Hourly values here are kWh in that hour, which equals the average kW over that hour."},
        {"term": "kW / kWp", "meaning": "kW is power (rate of energy use). kWp (kilowatt-peak) is a solar installation's nominal power under standard test conditions."},
        {"term": "CUPS", "meaning": "Código Universal del Punto de Suministro: the Spanish id of an electricity supply point (ES + 16 digits + 2–4 letters). Masked in this file."},
        {"term": "Forecast horizon", "meaning": "How many hours ahead are forecast."},
        {"term": "UTC / local time", "meaning": "UTC is universal time; Europe/Madrid local time is UTC+1 in winter (CET) and UTC+2 in summer (CEST)."},
        {"term": "Panel tilt / azimuth", "meaning": "Tilt = angle of the panels from horizontal; azimuth = direction they face (180° = south)."},
        {"term": "GHI / shortwave radiation", "meaning": "Global horizontal irradiance: total sunlight on a flat surface (W/m²); one of the weather inputs."},
        {"term": "POA", "meaning": "Plane-of-array irradiance: sunlight on the tilted panel surface; approximated here by panel-incidence features."},
        {"term": "Open-Meteo", "meaning": "Free weather-forecast service used for the live weather forecast."},
        {"term": "Two-stage extra trees", "meaning": "The model: one tree ensemble decides whether there will be surplus, a second one how much."},
        {"term": "MAE / RMSE / R² / P95 error", "meaning": "Accuracy measures: average absolute error; root-mean-square error (punishes large errors); share of variation explained (1 = perfect); error not exceeded in 95 % of hours."},
        {"term": "MareNostrum 5", "meaning": "Supercomputer at the Barcelona Supercomputing Center on which the model was trained."},
        {"term": "2.0TD", "meaning": "Spanish household electricity tariff with peak/flat/valley periods; not used in this algorithm's outputs."},
        {"term": "Payback", "meaning": "Years for savings to repay an investment; not computed by this algorithm."},
        {"term": "Compute-to-Data", "meaning": "The algorithm runs where the data is; only these outputs leave, not the raw input data."},
    ]

    # ---- 10. facts
    facts = {
        "algorithm": CONTEXT_TITLE,
        "generated_at_utc": generated,
        "model": {
            "name": model_name,
            "trained_until_utc": trained or None,
            "mae_kwh": metrics.get("mae_kwh"),
            "rmse_kwh": metrics.get("rmse_kwh"),
            "r2": metrics.get("r2"),
            "p95_abs_error_kwh": metrics.get("p95_abs_error_kwh"),
            "test_hours": metrics.get("test_rows"),
            "test_start_utc": metrics.get("test_start"),
            "test_end_utc": metrics.get("test_end"),
            "bias_kwh": metrics.get("bias_kwh"),
            "test_predicted_total_kwh": test_pred,
            "test_actual_total_kwh": test_act,
            "probability_cutoff": cutoff,
            "surplus_class_threshold_kwh": cls_threshold,
        },
        "notes": "Times in this block are ISO 8601 with UTC offset (local = Europe/Madrid, as in the CSV local_dt column). summary.json writes UTC times as 'YYYY-MM-DD HH:MM:SS+00:00'. Hourly profile arrays are indexed by local hour 0–23 (null = no data). Values are rounded to 3 decimals.",
        "parameters": {
            "horizon_hours": summary.get("horizon_hours"),
            "installed_kwp": solar.get("installed_kwp"),
            "latitude_rounded": lat_r(weather.get("latitude")),
            "longitude_rounded": lat_r(weather.get("longitude")),
            "fetch_weather": fetch_weather,
            "panel_tilt_degrees": solar.get("panel_tilt_degrees"),
            "panel_azimuth_degrees": solar.get("panel_azimuth_degrees"),
            "minimum_recommended_surplus_kwh": threshold,
            "time_zone_local": REPORT_TZ,
            "from_algoCustomData": sorted(k for k in known_keys if k in custom),
        },
        "inputs_found": len(items),
        "inputs_forecast": len(ok),
        "inputs_skipped": len(failed),
        "elapsed_seconds": summary.get("elapsed_seconds"),
        "inputs": [],
    }
    for s, item in list(zip(stats, items))[:CONTEXT_MAX_INPUTS]:
        entry = {"input_masked": s["name"]}
        if "error" in s:
            entry["error"] = s["error"]
        else:
            entry.update(
                {
                    "output": item.get("output"),
                    "history_rows": s.get("history_rows"),
                    "history_start_utc": s["history_start"].isoformat() if "history_start" in s else None,
                    "history_end_utc": s["history_end"].isoformat() if "history_end" in s else None,
                    "history_hour_slots_inclusive": s.get("history_hours_span"),
                    "history_missing_hours": s.get("missing_hours"),
                    "history_duplicate_rows": s.get("duplicate_rows"),
                }
            )
            if "hours" in s:
                iso = s["iso_local"]
                rnd = lambda v: None if v is None else round(v, 3)  # noqa: E731
                fpd, rpd = per_day(s), recent_per_day(s)
                entry.update(
                    {
                        "forecast_hours": s["hours"],
                        "forecast_start_utc": s["start_utc"].isoformat(),
                        "forecast_end_utc_exclusive": s["end_utc_excl"].isoformat(),
                        "forecast_start_local": iso.get(s["start_local"]),
                        "forecast_end_local_exclusive": s["end_local_iso"],
                        "forecast_period_in_past_at_run": bool(s["end_utc_excl"] < now_utc),
                        "total_predicted_surplus_kwh": item.get("total_predicted_surplus_kwh"),
                        "forecast_kwh_per_day": rnd(fpd) if s["hours"] >= 24 else None,
                        "peak_hour_local": iso.get(s["peak"][0]) if s["peak"] else None,
                        "peak_kwh": round(s["peak"][1], 3) if s["peak"] else None,
                        "hours_with_surplus": s["surplus_hours"],
                        "hours_with_surplus_threshold_kwh": threshold,
                        "live_weather_used": s["weather_used"],
                        "stored_weather_hours_covered": s.get("weather_hours_covered"),
                        "daily_kwh_local": {d.strftime("%Y-%m-%d"): round(t, 3) for d, _, t, _, _ in s["days"][:31]},
                        "best_appliance_windows_local": [
                            {
                                "appliance": a[0],
                                "start": iso.get(a[3]),
                                "power_kw": a[1],
                                "duration_h": a[2],
                                "need_kwh": round(a[5], 3),
                                "from_surplus_kwh": round(a[6], 3),
                                "solar_share_pct": round(a[7], 1),
                            }
                            for a in s["appliances"]
                        ],
                        "recent_measured_days": s.get("recent_days"),
                        "recent_measured_total_kwh": rnd(s.get("recent_total")),
                        "recent_measured_kwh_per_day": rnd(rpd),
                        "forecast_vs_recent_pct": round((fpd / rpd - 1) * 100, 1) if fpd is not None and rpd and s["hours"] >= 24 else None,
                        "forecast_hourly_avg_kwh": [rnd(v) for v in s.get("fc_profile") or []],
                        "recent_hourly_avg_kwh": [rnd(v) for v in s.get("recent_profile") or []],
                        "unusual_local_hours": [h for h, _, _, _ in odd_hours(s)],
                    }
                )
        facts["inputs"].append(entry)

    summary_text = (
        "Forecasts, hour by hour, how much solar energy a home installation will send to the grid (its surplus) in the hours right after the end of the uploaded "
        "history. It runs on the Empower-X marketplace as the Compute-to-Data algorithm “" + CONTEXT_TITLE + "”: a machine-learning model trained on the MareNostrum 5 "
        "supercomputer with hourly data from real Spanish solar installations, applied to the installation's own recent meter data, calendar, sun position and weather. "
        "The result helps decide when to run appliances or charge a car on your own solar energy instead of exporting it."
    )
    return _ctx_mask(context_doc(CONTEXT_TITLE, summary_text, run, files, fields, method, results, limitations, questions, glossary, facts))


def write_context(target: Path, summary: dict, inputs: list, config: dict, model_package: dict, custom: dict, fetch_weather: bool) -> None:
    """Write AI_CONTEXT.md; never raises, so the forecast outputs and the exit code stay as they are."""
    try:
        text = render_context(summary, inputs, config, model_package, custom if isinstance(custom, dict) else {}, fetch_weather, target.parent)
        target.write_text(text, encoding="utf-8")
        log(f"AI context written: {target}")
    except Exception as error:  # noqa: BLE001 - the context is optional
        log(f"AI context skipped ({error})")


# ---- END ai-context ---------------------------------------------------------------------


def main() -> int:
    started = time.perf_counter()
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    custom = read_custom_data()
    config = load_config(APP_DIR / "config.json")
    if "latitude" in custom and "longitude" in custom:
        config["weather_api"]["latitude"] = float(custom["latitude"])
        config["weather_api"]["longitude"] = float(custom["longitude"])
    if "installed_kwp" in custom:
        config["solar_system"]["installed_kwp"] = float(custom["installed_kwp"])
    horizon_hours = int(custom.get("horizon_hours", config.get("default_horizon_hours", 24)))
    fetch_weather = bool(custom.get("fetch_weather", True))

    model_package = load_model_package(config)
    log(f"Loaded model: {model_package.get('selected_model', 'unknown')}")

    inputs = find_input_files()
    if not inputs:
        log(f"No input files found under {INPUTS_DIR}")
        return 1

    summary = {"model": model_package.get("selected_model"), "horizon_hours": horizon_hours, "inputs": []}
    for index, path in enumerate(inputs):
        try:
            forecast = forecast_one(path, config, model_package, horizon_hours, fetch_weather)
        except Exception as error:  # one bad input should not fail the whole job
            log(f"Skipping {path}: {error}")
            summary["inputs"].append({"input": path.name, "error": str(error)})
            continue
        name = f"surplus_forecast_{index}.csv" if len(inputs) > 1 else "surplus_forecast.csv"
        forecast.to_csv(OUTPUTS_DIR / name, index=False)
        summary["inputs"].append(
            {
                "input": path.name,
                "output": name,
                "start_utc": str(forecast["info_dt"].min()),
                "end_utc": str(forecast["info_dt"].max()),
                "total_predicted_surplus_kwh": round(float(forecast["predicted_surplus_kwh"].sum()), 3),
            }
        )
        log(f"Wrote {name} ({len(forecast)} hours)")

    summary["elapsed_seconds"] = round(time.perf_counter() - started, 2)
    (OUTPUTS_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    write_report(OUTPUTS_DIR / REPORT_NAME, summary, inputs, config, model_package, custom, fetch_weather)
    write_context(OUTPUTS_DIR / CONTEXT_FILE, summary, inputs, config, model_package, custom, fetch_weather)
    return 0 if any("output" in item for item in summary["inputs"]) else 1


if __name__ == "__main__":
    sys.exit(main())
