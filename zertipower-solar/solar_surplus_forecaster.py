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
    return 0 if any("output" in item for item in summary["inputs"]) else 1


if __name__ == "__main__":
    sys.exit(main())
