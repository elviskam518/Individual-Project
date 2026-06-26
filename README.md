## What is included

- Intermediate fairness analysis from `bias_analysis.py`
- Baseline MLP and standalone adversarial baseline from `adversarial_baselines.py`
- Fair CVAE models from `fair_cvae.py`
  - `adv_only`
  - `no_adv`
  - `full`
- Latent-space visualisation from `latent_visualisation.py`
- Synthetic hiring dataset generation from `generate_dataset.py`

## Output text files

Three experiment output files are included for reference:

- `bias_analysis_output.txt` records the printed fairness metrics, odds ratios, and SHAP bias-analysis output.
- `adversarial_baseline_output.txt` records the printed training logs and final results for the baseline MLP and standalone adversarial baseline.
- `fair_cvae_output.txt` records the printed training logs and final results for the Fair CVAE variants.

These `.txt` files are not required to run the website, but they provide saved console outputs for checking the reported experimental results.

## Website pages

- `/` Home
- `/results` Results
- `/demo` Interactive demo
- `/bias-analysis` Intermediate fairness analysis

## Running the website

From the project root directory, start the FastAPI web application with:
python -m uvicorn webapp.main:app --host 127.0.0.1 --port 8000


## Interactive demo workflow

1. Upload a CSV dataset, such as `tech_diversity_hiring_data.csv`.
2. Optionally run intermediate fairness analysis using `bias_analysis.py`.
3. Select exactly one model:
   - Baseline MLP
   - Standalone adversarial baseline
   - Fair CVAE `adv_only`
   - Fair CVAE `no_adv`
   - Fair CVAE `full`
4. The backend starts a background job.
5. The frontend polls and displays:
   - status (`queued`, `running`, `completed`, or `failed`)
   - progress percentage
   - progress text
   - live logs
6. Final results are shown only after job completion.
7. Optional latent-space visualisation can be generated for Fair CVAE runs.

## Folder structure

```text
project-root/
  generate_dataset.py             # Generates the synthetic hiring dataset
  bias_analysis.py                # Fairness metrics, odds ratios, and SHAP analysis
  adversarial_baselines.py        # Baseline MLP and standalone adversarial baseline
  fair_cvae.py                    # Fair CVAE model, training, and evaluation
  latent_visualisation.py         # PCA/t-SNE and latent-space metrics

  webapp/
    main.py                       # FastAPI app, API routes, and page routes
    job_manager.py                # Background job queue and state manager
    pipeline.py                   # Execution pipeline wrappers for the analysis and model scripts
    templates/
      base.html
      home.html
      demo.html
      results.html
      bias_analysis.html
    static/
      style.css
      demo.js
      results.js
      bias_analysis.js

  runs/
    uploads/                      # Uploaded CSV files
    <job_id>/                     # Per-job outputs such as CSV, JSON, and plots