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

    feature_frame = build_feature_frame(combined, target_col, feature_config)
    for column in model_package["features"]:
        if column not in feature_frame.columns:
            feature_frame[column] = 0
    future_mask = combined["info_dt"].isin(future["info_dt"])
    out = combined.loc[future_mask, ["info_dt"]].copy().reset_index(drop=True)
    out["local_dt"] = out["info_dt"].dt.tz_convert("Europe/Madrid")
    features = feature_frame.loc[future_mask, model_package["features"]].fillna(0)
    out["predicted_surplus_kwh"] = np.clip(model_package["model"].predict(features), 0, None)
    return out


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
    return 0 if any("output" in item for item in summary["inputs"]) else 1


if __name__ == "__main__":
    sys.exit(main())
