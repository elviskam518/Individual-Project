# Fair Representation Learning for Hiring Predictions

Can a model reduce demographic disparities in hiring predictions while preserving useful predictive performance?

This **BSc Computer Science individual project at Durham University** investigates that question using a controlled synthetic hiring dataset. I built a workflow covering data generation, bias diagnosis, baseline models, a fairness-aware conditional variational autoencoder (**Fair CVAE**), latent-space analysis and an interactive web application.

The project studies the trade-off between predictive accuracy and group-level fairness in a simulated setting.

**[Read the dissertation](cqst66%20Diversity%20in%20Tech%20.pdf)** · **[Browse latent-space visualisations](latent_vis/)** · **[View the main experiment log](fair_cvae_seed42_log.txt)**

## Main result

In the dissertation's main experiment, the full Fair CVAE improved the minimum intersectional Disparate Impact (DI) from **0.3421 to 0.7011**, while test accuracy decreased from **69.03% to 65.97%**.

| Model | Test accuracy | F1 | Minimum DI |
| --- | ---: | ---: | ---: |
| Baseline MLP | 69.03% | 0.5492 | 0.3421 |
| Standalone adversarial model: gender | 68.07% | 0.5523 | 0.4664 |
| Standalone adversarial model: intersectional groups | 67.63% | 0.5431 | 0.4968 |
| Fair CVAE: `adv_only` | 65.13% | 0.4942 | 0.6131 |
| Fair CVAE: `no_adv` | 66.17% | 0.5085 | 0.4817 |
| Fair CVAE: `full` | **65.97%** | **0.5163** | **0.7011** |

DI is calculated as a group's positive prediction rate divided by the rate for the **Male White reference group**. The minimum is the lowest ratio across the evaluated groups. The improvement does not mean that bias was eliminated: the lowest ratio remains below the report's 0.8 comparison threshold.

These are reported experimental results, not newly reproduced measurements. Standalone adversarial models use a fixed decision threshold, while Fair CVAE variants use validation-based calibration, so the comparisons are not identical in every evaluation detail.

## What I built

### 1. A controlled hiring dataset and bias-analysis pipeline

Generated **15,000 synthetic candidate records** across eight gender–race groups, with controlled disparities in resume screening, technical interviews and culture-fit assessment.

The analysis examines group-level selection rates, DI and a proxy Equal Opportunity measure, alongside controlled logistic-regression analysis and SHAP-based feature diagnostics. Synthetic data makes the injected mechanisms inspectable; it does not establish how a real employer behaves.

### 2. Baselines and the Fair CVAE

Implemented an MLP baseline and standalone adversarial debiasing models, then developed a Fair CVAE combining:

- A variational encoder–decoder and prediction head.
- Adversarial learning through gradient reversal.
- **HSIC regularisation** to penalise statistical dependence between latent representations and sensitive labels.
- Gradient projection and an orthogonal latent projection.
- A staged training schedule that introduces the objectives over 350 epochs.

The `adv_only`, `no_adv` and `full` configurations compare different combinations of these mechanisms. The main Fair CVAE targets gender-related representation information; outcome fairness is assessed separately across all eight intersectional groups.

### 3. Evaluation of predictions and representations

The main pipeline uses **10,200 training, 1,800 validation and 3,000 test records**. Fair CVAE thresholds are selected on validation data to match the baseline's overall positive prediction rate.

Beyond accuracy and F1, I examined group-level outcomes and latent-space behaviour using PCA, t-SNE, density plots, sensitive-label probes, centroid distances and approximate MMD. This provides evidence about representation changes as well as the final decisions.

### 4. An interactive experiment interface

Built a **FastAPI web application** with Jinja2 templates, JavaScript and CSS. The interface supports:

- Uploading a CSV in the expected hiring-data schema.
- Running intermediate bias analysis.
- Selecting a baseline, adversarial model or Fair CVAE variant.
- Monitoring a background job through status, progress and live logs.
- Inspecting completed metrics, artifacts and optional latent visualisations.

The web application wraps the underlying experiment modules rather than implementing a separate modelling pipeline.

## Skills demonstrated

**Python · PyTorch · scikit-learn · pandas · NumPy · SHAP · Matplotlib · FastAPI · JavaScript**

The project combines ML experimentation, fairness metrics, representation learning, model comparison, visual diagnostics and a working interface for running experiments.

## Scope and limitations

The main results use synthetic data and a single primary random seed. They demonstrate improvement under the chosen setup, rather than validated fairness in real hiring.

The Equal Opportunity diagnostic uses a constructed qualification proxy, not an externally validated merit label. DI depends on the decision threshold and reference group. Residual sensitive information remains recoverable, and the ablation variants change multiple components, limiting claims about the contribution of each mechanism.

The application is a research demonstration for exploring model behaviour, not an operational hiring decision tool.

## Repository guide

| File or folder | Purpose |
| --- | --- |
| [`generate_dataset.py`](generate_dataset.py) | Synthetic candidate data and controlled bias mechanisms. |
| [`bias_analysis.py`](bias_analysis.py) | Group metrics, controlled analysis and SHAP diagnostics. |
| [`adversarial_baselines.py`](adversarial_baselines.py) | Baseline and standalone adversarial models. |
| [`fair_cvae.py`](fair_cvae.py) | Fair CVAE variants, training, calibration and evaluation. |
| [`latent_visualisation.py`](latent_visualisation.py) | Representation plots and diagnostic comparisons. |
| [`webapp/`](webapp/) | API, background jobs, pipeline wrappers and interface. |
| [`latent_vis/`](latent_vis/) | Included representation-analysis figures. |
| [`tech_diversity_hiring_data.csv`](tech_diversity_hiring_data.csv) | Included synthetic dataset. |

Saved experiment evidence is available in [`bias_analysis_output.txt`](bias_analysis_output.txt), [`adversarial_baseline_output.txt`](adversarial_baseline_output.txt) and [`fair_cvae_seed42_log.txt`](fair_cvae_seed42_log.txt).

<details>
<summary>Running the local research demo</summary>

From the repository root:

```bash
pip install -r requirements.txt
python -m uvicorn webapp.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. Pages include Home (`/`), Results (`/results`), Interactive Demo (`/demo`) and Bias Analysis (`/bias-analysis`).

Upload the included CSV or compatible data, select a model, and start a job. Results appear after completion. Uploads and per-job artifacts are written under `runs/`; training duration depends on the selected model and hardware.

</details>
