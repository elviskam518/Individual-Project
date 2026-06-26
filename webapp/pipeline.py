from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import random
import re
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import f1_score

import bias_analysis
import adversarial_baselines
from latent_visualisation import run_latent_visualisation

LogFn = Callable[[str], None]
ProgressFn = Callable[[int, str], None]
EPOCH_RE = re.compile(r"Epoch\s+(\d+)\s*/\s*(\d+)|Epoch\s+(\d+)/(\d+)")


def _convert_numpy_types(obj):
    """Recursively convert numpy types to Python types for JSON serialization."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, dict):
        return {key: _convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_convert_numpy_types(item) for item in obj]
    else:
        return obj


@dataclass
class PipelineResult:
    summary: dict
    artifact_paths: dict


def _load_fair_cvae_module():
    module_path = Path("fair_cvae.py").resolve()
    spec = importlib.util.spec_from_file_location("fair_cvae_module", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load Fair CVAE module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _save_df(df: pd.DataFrame, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)


@contextlib.contextmanager
def _capture_stdout(log_fn: LogFn, line_handler: Optional[Callable[[str], None]] = None):
    class _Writer(io.StringIO):
        def write(self, s):
            super().write(s)
            if s.strip():
                for line in s.rstrip().splitlines():
                    log_fn(line)
                    if line_handler:
                        line_handler(line)
            return len(s)

    writer = _Writer()
    with contextlib.redirect_stdout(writer), contextlib.redirect_stderr(writer):
        yield


def run_intermediate_analysis(csv_path: Path, out_dir: Path, log: LogFn, progress: ProgressFn) -> dict:
    progress(5, "Running intermediate fairness analysis from bias_analysis.py")
    df = bias_analysis.load_data(str(csv_path))
    df = bias_analysis.add_proxy_qualified(df)

    fairness_df = bias_analysis.compute_fairness_metrics(df)
    odds_df = bias_analysis.compute_odds_ratios(df)
    shap_results = bias_analysis.run_shap_analysis(df, out_dir=str(out_dir))

    _save_df(fairness_df, out_dir / "fairness_metrics.csv")
    _save_df(odds_df, out_dir / "odds_ratios.csv")

    summary = {
        "rows": int(len(df)),
        "groups": sorted(df["Group"].unique().tolist()),
        "fairness_file": "fairness_metrics.csv",
        "odds_file": "odds_ratios.csv",
    }

    if shap_results:
        _save_df(shap_results["results"], out_dir / "shap_bias_analysis.csv")
        shap_results["summary"].to_csv(out_dir / "shap_feature_summary.csv")
        summary["shap_results_file"] = "shap_bias_analysis.csv"
        summary["shap_summary_file"] = "shap_feature_summary.csv"

        plot_files = ["shap_summary_plot.png"]
        for plot in plot_files:
            if (out_dir / plot).exists():
                key = plot.replace(".png", "_file")
                summary[key] = plot

    progress(30, "Intermediate analysis complete")
    return summary


def _extract_epoch(line: str) -> tuple[int, int] | None:
    match = EPOCH_RE.search(line)
    if not match:
        return None

    current = match.group(1) or match.group(3)
    total = match.group(2) or match.group(4)

    if not current or not total:
        return None

    return int(current), int(total)


def _build_progress_tracker(model_name: str, include_latent_vis: bool, progress: ProgressFn):
    state = {"last_pct": 0}

    def push(pct: int, text: str):
        pct = int(max(state["last_pct"], min(100, pct)))
        state["last_pct"] = pct
        progress(pct, text)

    def handle_log(line: str):
        epoch_info = _extract_epoch(line)

        if epoch_info:
            current, total = epoch_info

            if total == 150:
                if include_latent_vis and "Loss:" in line and "Phase" not in line:
                    start, end = 88, 96
                    label = f"Generating latent visualisations ({current}/{total})"
                else:
                    start, end = 45, 78
                    label = f"Training baseline MLP ({current}/{total})"

            elif total == 200:
                start, end = 45, 78
                if "intersectional" in model_name:
                    label = f"Training intersectional adversarial baseline ({current}/{total})"
                else:
                    label = f"Training gender adversarial baseline ({current}/{total})"

            elif total == 350:
                start, end = 45, 78
                pretty = model_name.replace("_", " ")
                label = f"Training {pretty} ({current}/{total})"

            else:
                return

            span = end - start
            pct = start + round((current / max(total, 1)) * span)
            push(pct, label)
            return

        normalized = line.lower()

        if "fitting orthogonal projection layer" in normalized:
            push(63, "Fitting orthogonal projection layer")
        elif "probe before projection" in normalized or "probe after projection" in normalized:
            push(64, "Evaluating projection leakage")
        elif "adversary reset at epoch" in normalized:
            push(state["last_pct"], "Refreshing adversary during training")

    return push, handle_log


def run_selected_model(
    csv_path: Path,
    out_dir: Path,
    model_name: str,
    seed: int,
    include_latent_vis: bool,
    log: LogFn,
    progress: ProgressFn,
    run_analysis: bool = True,
) -> PipelineResult:
    model_name = model_name.strip().lower()
    artifact_paths: dict[str, str] = {}
    tracked_progress, line_handler = _build_progress_tracker(model_name, include_latent_vis, progress)

    random.seed(seed)
    torch.manual_seed(seed)
    np.random.seed(seed)

    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)

    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

    with _capture_stdout(log, line_handler=line_handler):
        analysis_summary = {}

        if run_analysis:
            analysis_summary = run_intermediate_analysis(csv_path, out_dir, log, progress)

            random.seed(seed)
            torch.manual_seed(seed)
            np.random.seed(seed)

            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)
                torch.cuda.manual_seed_all(seed)

            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False

        tracked_progress(35, f"Preparing model run: {model_name}")

        if model_name in {
            "baseline_mlp",
            "adversarial_baseline",
            "adversarial_gender",
            "adversarial_intersectional",
        }:
            data = adversarial_baselines.load_and_prepare_data(str(csv_path))
            input_dim = data["input_dim"]

            if model_name == "baseline_mlp":
                tracked_progress(45, "Training baseline MLP")

                model = adversarial_baselines.SimpleClassifier(input_dim, hidden_dim=128)

                adversarial_baselines.train_baseline_model(
                    model,
                    data["X_train"],
                    data["y_train"],
                    epochs=150,
                    batch_size=256,
                    lr=0.001,
                )

                fairness_df, pred = adversarial_baselines.evaluate_model(
                    model,
                    data["X_test"],
                    data["df_test"],
                    model_type="simple",
                )

                model_label = "Baseline MLP"

            else:
                if model_name in {"adversarial_baseline", "adversarial_gender"}:
                    tracked_progress(45, "Training standalone adversarial baseline (gender)")

                    num_groups = data["n_genders"]
                    g_train = data["g_gen_train"]
                    g_val = data["g_gen_val"]
                    model_label = "Standalone Adversarial Baseline (Gender)"
                    history_name = "adversarial_gender_history.csv"

                elif model_name == "adversarial_intersectional":
                    tracked_progress(45, "Training standalone adversarial baseline (intersectional)")

                    num_groups = data["n_groups"]
                    g_train = data["g_int_train"]
                    g_val = data["g_int_val"]
                    model_label = "Standalone Adversarial Baseline (Intersectional)"
                    history_name = "adversarial_intersectional_history.csv"

                else:
                    raise ValueError(f"Unsupported adversarial model_name: {model_name}")

                model = adversarial_baselines.AdversarialDebiasingGRL(
                    input_dim,
                    hidden_dim=64,
                    num_groups=num_groups,
                )

                history = adversarial_baselines.train_adversarial_model_grl(
                    model,
                    data["X_train"],
                    data["y_train"],
                    g_train,
                    data["X_val"],
                    data["y_val"],
                    g_val,
                    epochs=200,
                    verbose=True,
                )

                pd.DataFrame(history).to_csv(out_dir / history_name, index=False)
                artifact_paths["adversarial_history"] = history_name

                fairness_df, pred = adversarial_baselines.evaluate_model(
                    model,
                    data["X_test"],
                    data["df_test"],
                    model_type="adversarial",
                )

            tracked_progress(80, "Computing model metrics")

            y_true = data["y_test"].numpy().flatten()
            pred_np = np.asarray(pred).astype(int).flatten()

            acc = float((pred_np == y_true).mean())
            f1 = float(f1_score(y_true.astype(int), pred_np, zero_division=0))

            _save_df(fairness_df, out_dir / "model_fairness.csv")
            artifact_paths["model_fairness"] = "model_fairness.csv"

            result = {
                "model": model_label,
                "accuracy": acc,
                "f1": f1,
                "min_di": float(fairness_df["DI"].min()),
            }

        elif model_name in {"fair_cvae_adv_only", "fair_cvae_no_adv", "fair_cvae_full"}:
            fair = _load_fair_cvae_module()
            data = fair.load_and_prepare_data(str(csv_path))
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

            mode_map = {
                "fair_cvae_adv_only": "adv_only",
                "fair_cvae_no_adv": "no_adv",
                "fair_cvae_full": "full",
            }
            mode = mode_map[model_name]

            tracked_progress(45, f"Training Fair CVAE mode={mode}")

            cvae_model = fair.FairCVAE_v4(
                x_dim=data["input_dim"],
                n_sensitive=data["n_genders"],
                z_dim=64,
                hidden_dim=256,
                n_sensitive_directions=3,
            ).to(device)

            history = fair.train_fair_cvae_v4(
                cvae_model,
                data,
                epochs=350,
                batch_size=256,
                lr_main=1e-3,
                lr_adv=2e-3,
                adv_steps=5,
                lambda_hsic=50.0,
                lambda_adv=2.0,
                alpha_max=8.0,
                adv_reset_every=40,
                projection_update_every=20,
                device=device,
                verbose=True,
                mode=mode,
            )

            history_name = f"fair_cvae_{mode}_history.csv"
            pd.DataFrame(history).to_csv(out_dir / history_name, index=False)
            artifact_paths["training_history"] = history_name

            tracked_progress(78, "Training baseline for Fair CVAE threshold calibration")

            baseline = fair.SimpleClassifier(data["input_dim"]).to(device)

            fair.train_baseline(
                baseline,
                data,
                epochs=150,
                batch_size=256,
                lr=1e-3,
                device=device,
                verbose=False,
            )

            target_rate, _ = fair.baseline_val_pred_rate(
                baseline,
                data,
                device=device,
                threshold=0.5,
            )

            tracked_progress(82, "Calibrating Fair CVAE threshold on validation set")

            cvae_model.eval()
            X_val = data["X_val"].to(device)
            a_val = data["a_val"].to(device)

            with torch.no_grad():
                out_val = cvae_model(
                    X_val,
                    a_val,
                    use_grl=False,
                    alpha=0,
                    use_projection=True,
                )

                y_prob_val = torch.sigmoid(out_val["y_logit"]).squeeze().cpu().numpy()

            threshold = fair.threshold_for_target_rate(y_prob_val, target_rate)

            eval_res = fair.evaluate_model_at_threshold(
                cvae_model,
                data,
                threshold=threshold,
                device=device,
            )

            _save_df(eval_res["fairness"], out_dir / "model_fairness.csv")
            artifact_paths["model_fairness"] = "model_fairness.csv"

            result = {
                "model": f"Fair CVAE ({mode})",
                "accuracy": float(eval_res["accuracy"]),
                "f1": float(eval_res["f1"]),
                "min_di": float(eval_res["fairness"]["DI"].min()),
                "threshold": float(eval_res["threshold"]),
                "target_rate": float(target_rate),
                "pred_rate": float(eval_res["pred_rate"]),
            }

            if include_latent_vis:
                tracked_progress(88, "Generating latent-space visualisations")

                latent_dir = out_dir / "latent_vis"

                latent_summary = run_latent_visualisation(
                    baseline_model=baseline,
                    cvae_model=cvae_model,
                    data=data,
                    device=device,
                    output_dir=str(latent_dir),
                )

                result["latent_summary"] = latent_summary
                artifact_paths["latent_vis_dir"] = "latent_vis"

        else:
            raise ValueError(f"Unsupported model_name: {model_name}")

    tracked_progress(98, "Finalising output files")

    summary = {
        "analysis": analysis_summary,
        "result": result,
        "seed": seed,
    }

    summary_path = out_dir / "result_summary.json"
    summary_path.write_text(
        json.dumps(_convert_numpy_types(summary), indent=2),
        encoding="utf-8",
    )

    artifact_paths["summary"] = "result_summary.json"

    tracked_progress(100, "Completed")

    return PipelineResult(summary=summary, artifact_paths=artifact_paths)


def run_pipeline_job(
    csv_path: Path,
    out_dir: Path,
    model_name: str,
    seed: int,
    include_latent_vis: bool,
    log: LogFn,
    progress: ProgressFn,
    run_analysis: bool = True,
):
    try:
        return run_selected_model(
            csv_path=csv_path,
            out_dir=out_dir,
            model_name=model_name,
            seed=seed,
            include_latent_vis=include_latent_vis,
            log=log,
            progress=progress,
            run_analysis=run_analysis,
        )
    except Exception as exc:
        log("Pipeline failed:\n" + traceback.format_exc())
        raise exc