const jobForm = document.getElementById('job-form');
const jobCard = document.getElementById('job-card');
let pollHandle = null;

function setState(job) {
  document.getElementById('status').innerText = job.status;
  document.getElementById('progress').innerText = job.progress;
  document.getElementById('progress-text').innerText = job.progress_text;
  document.getElementById('bar').style.width = `${job.progress}%`;
  const logs = job.logs.join('\n');
  const logEl = document.getElementById('logs');
  logEl.textContent = logs;
  logEl.scrollTop = logEl.scrollHeight;

  const resultPanel = document.getElementById('result-panel');
  if (job.status === 'completed' && job.summary) {
    const result = job.summary.result || {};
    const hasLatentImages = job.artifacts && job.artifacts.latent_vis_dir;
    let html = `
      <h4>Completed Result</h4>
      <p><b>Model:</b> ${result.model || '-'}</p>
      <p><b>Seed:</b> ${job.summary.seed ?? '-'}</p>
      <p><b>Accuracy:</b> ${result.accuracy ?? '-'}</p>
      <p><b>F1:</b> ${result.f1 ?? '-'}</p>
      <p><b>Min DI:</b> ${result.min_di ?? '-'}</p>
      <p><a href="/api/jobs/${job.id}">Full job JSON</a></p>
      <p><a href="/results">View all completed runs</a></p>
    `;

    if (result.latent_summary) {
      const metrics = result.latent_summary;
      html += `
        <h4>Latent Space Metrics</h4>
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Metric</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Baseline</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Fair CVAE</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Reduction</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">Centroid Distance</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${metrics.metrics_baseline?.centroid_distance?.toFixed(4) ?? '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${metrics.metrics_cvae?.centroid_distance?.toFixed(4) ?? '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${((1 - (metrics.metrics_cvae?.centroid_distance ?? 0) / (metrics.metrics_baseline?.centroid_distance ?? 1)) * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">Probe Accuracy</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${metrics.metrics_baseline?.probe_accuracy?.toFixed(4) ?? '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${metrics.metrics_cvae?.probe_accuracy?.toFixed(4) ?? '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${((1 - (metrics.metrics_cvae?.probe_accuracy ?? 0) / (metrics.metrics_baseline?.probe_accuracy ?? 1)) * 100).toFixed(1)}%</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">MMD (approx)</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${metrics.metrics_baseline?.mmd_approx?.toFixed(4) ?? '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${metrics.metrics_cvae?.mmd_approx?.toFixed(4) ?? '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${((1 - (metrics.metrics_cvae?.mmd_approx ?? 0) / (metrics.metrics_baseline?.mmd_approx ?? 1)) * 100).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    if (hasLatentImages) {
      html += '<h4>Latent space visualizations</h4><div id="latent-images"><p>Loading images...</p></div>';
    }

    resultPanel.innerHTML = html;
    if (hasLatentImages) {
      loadLatentImages(job.id);
    }
  } else if (job.status === 'failed') {
    resultPanel.innerHTML = `<h4>Job failed</h4><p>${job.error || ''}</p>`;
  }
}

async function loadLatentImages(jobId) {
  try {
    const response = await fetch(`/api/jobs/${jobId}/latent-images`);
    const images = await response.json();
    const container = document.getElementById('latent-images');
    if (!container) return;
    if (!images.length) {
      container.innerHTML = '<p>No latent visualizations available.</p>';
      return;
    }

    let html = '<div style="max-height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px;">';
    html += '<p>Click an image to view:</p><ul style="list-style: none; padding: 0;">';
    images.forEach((img, index) => {
      html += `<li style="margin: 5px 0;"><a href="#" onclick="showImage('${img.url}', '${img.name}'); return false;">${img.name}</a></li>`;
    });
    html += '</ul></div>';
    html += '<div id="image-viewer" style="margin-top: 20px;"></div>';

    container.innerHTML = html;
  } catch (err) {
    const container = document.getElementById('latent-images');
    if (container) {
      container.innerHTML = '<p>Failed to load latent visualizations.</p>';
    }
  }
}

function showImage(url, name) {
  const viewer = document.getElementById('image-viewer');
  viewer.innerHTML = `
    <h5>${name}</h5>
    <img src="${url}" alt="${name}" style="max-width: 100%; height: auto; border: 1px solid #ddd;" />
  `;
}

async function pollJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  const job = await response.json();
  setState(job);
  if (['completed', 'failed'].includes(job.status)) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

jobForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(jobForm);
  data.set('include_latent_vis', jobForm.include_latent_vis.checked ? 'true' : 'false');

  const resp = await fetch('/api/jobs/start', { method: 'POST', body: data });
  const payload = await resp.json();
  if (!resp.ok) {
    alert(payload.detail || 'Failed to start job');
    return;
  }

  jobCard.style.display = 'block';
  document.getElementById('job-id').innerText = payload.job_id;
  if (pollHandle) clearInterval(pollHandle);
  await pollJob(payload.job_id);
  pollHandle = setInterval(() => pollJob(payload.job_id), 2000);
});
