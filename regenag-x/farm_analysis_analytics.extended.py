# https://raw.githubusercontent.com/zertifier/c2d-alghos-sandbox/refs/heads/main/regenag-x/farm_analysis_analytics.extended.py?token=GHSAT0AAAAAAC45ITPUAK6HKJACOYMGBYNU2KBNQEQ
import sys
import subprocess
import importlib.util

def ensure_packages(packages):
    for pkg in packages:
        spec_name = pkg.replace("-", "_")
        if importlib.util.find_spec(spec_name) is None:
            print(f"Installing {pkg}...")
            try:
                subprocess.check_call([
                    sys.executable, "-m", "pip", "install", pkg
                ])
            except subprocess.CalledProcessError as e:
                print(f"Failed to install {pkg}. Error: {e}")
                sys.exit(1)

REQUIRED_PACKAGES = [
    "numpy",
    "pandas",
    "scipy",
    "statsmodels",
    "scikit-posthocs"
]

ensure_packages(REQUIRED_PACKAGES)

import os
import json
import warnings
import numpy as np
import pandas as pd
import scipy.stats as stats
from scipy.stats import shapiro, levene, kruskal
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.multicomp import pairwise_tukeyhsd
import scikit_posthocs as sp # Обратите внимание на underscore

warnings.filterwarnings("ignore", category=UserWarning)

INPUT_DIR = "/data/inputs"
SKIP_FILES = {"algoCustomData.json"}

data_files = [
    f for f in os.listdir(INPUT_DIR)
    if f not in SKIP_FILES
]

if not data_files:
    raise RuntimeError(f"No usable input files found in {INPUT_DIR}")

DATA_FILE = os.path.join(INPUT_DIR, data_files[0])
print(f"Using data file: {DATA_FILE}")

with open(DATA_FILE, "r", encoding="utf-8") as f:
    raw = f.read()

try:
    data = json.loads(raw)
    df = pd.DataFrame(data)
    print("Loaded RAW JSON into DataFrame")
except Exception as e:
    raise RuntimeError(f"File is not valid JSON:\n{e}")

GROUP_COLS = ["Kind of farm"]
SKIP_COLS = ["Farm ID", "Plot", "Time of sampling", "Soil type"]

MIN_SAMPLE = 4
MAX_NA_RATIO = 0.5

numeric_cols = df.select_dtypes(include=[np.number]).columns

report_lines = []

def test_normality(series):
    if len(series) < MIN_SAMPLE:
        return None
    try:
        _, p = shapiro(series)
        return p
    except:
        return None


def test_variances(df, col, group_col):
    groups = [
        g[col].dropna().values
        for name, g in df.groupby(group_col)
        if len(g[col].dropna()) >= MIN_SAMPLE
    ]
    if len(groups) < 2:
        return None
    _, p = levene(*groups)
    return p


def recommend_test(normal_p, variance_p):
    if normal_p is None:
        return "SKIP"
    if normal_p > 0.05:
        if variance_p is None or variance_p > 0.05:
            return "ANOVA"
        else:
            return "Welch"
    else:
        return "Kruskal"


def run_anova(df, col, group):
    formula = f"Q('{col}') ~ C(Q('{group}'))"
    model = smf.ols(formula, data=df).fit()
    table = sm.stats.anova_lm(model, typ=2)
    return table["PR(>F)"][0]


def run_welch(df, col, group):
    formula = f"Q('{col}') ~ C(Q('{group}'))"
    model = smf.ols(formula, data=df).fit()
    welch = sm.stats.anova_lm(model, typ=2, robust='hc3')
    return welch["PR(>F)"][0]


def run_kruskal(df, col, group):
    groups = [
        g[col].dropna().values
        for _, g in df.groupby(group)
        if len(g[col].dropna()) >= MIN_SAMPLE
    ]

    if len(groups) < 2:
        return None

    all_vals = np.concatenate(groups)

    if np.all(all_vals == all_vals[0]):
        return 1.0

    try:
        _, p = kruskal(*groups)
        return p
    except Exception:
        return 1.0


def posthoc_test(df, col, group, test_type):
    temp = df[[col, group]].dropna()
    if temp[group].nunique() < 2:
        return None

    if test_type in ["ANOVA", "Welch"]:
        res = pairwise_tukeyhsd(temp[col], temp[group])
        return str(res)

    if test_type == "Kruskal":
        res = sp.posthoc_dunn(
            temp, val_col=col, group_col=group, p_adjust="bonferroni"
        )
        return res.to_string()

    return None


def short_conclusion(col, group, p):
    if p is None:
        return f"{col} by {group}: not enough data."
    if p < 0.05:
        return f"{col} differs between groups {group} (p={p:.4f})."
    else:
        return f"{col} does not differ between groups {group} (p={p:.4f})."

for col in numeric_cols:
    if col in SKIP_COLS:
        continue
    series = df[col].dropna()
    n = len(series)
    na_ratio = df[col].isna().mean()

    if n < MIN_SAMPLE or na_ratio > MAX_NA_RATIO:
        report_lines.append(f"[SKIP] {col}: insufficient data\n")
        continue

    normal_p = test_normality(series)

    report_lines.append(f"\n=== {col} ===")
    report_lines.append(f"n={n}, NA ratio={na_ratio:.2f}, normality_p={normal_p}")

    for gcol in GROUP_COLS:
        variance_p = test_variances(df, col, gcol)
        test = recommend_test(normal_p, variance_p)

        if test == "ANOVA":
            p = run_anova(df, col, gcol)
        elif test == "Welch":
            p = run_welch(df, col, gcol)
        elif test == "Kruskal":
            p = run_kruskal(df, col, gcol)
        else:
            p = None

        report_lines.append(
            f"{col} by {gcol}: test={test}, variance_p={variance_p}, p={p}"
        )

        report_lines.append(short_conclusion(col, gcol, p))

        if p is not None and p < 0.05:
            post = posthoc_test(df, col, gcol, test)
            report_lines.append("Post-hoc:\n" + str(post))


OUTPUT_DIR = "/data/outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

OUTPUT_FILE = os.path.join(OUTPUT_DIR, "comparison_by_farm_type.txt")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write("\n".join(report_lines))

print(f"Saved result to {OUTPUT_FILE}")
