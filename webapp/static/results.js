const resultButtons = Array.from(document.querySelectorAll('.result-item'));
const viewerTitle = document.getElementById('viewer-title');
const viewerSubtitle = document.getElementById('viewer-subtitle');
const viewerContent = document.getElementById('viewer-content');
const resultsCharts = {};

function parseCSV(text) {
  const lines = text.trim().replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ? values[index].trim() : '';
    });
    return row;
  });
}

function makeChart(id, config) {
  if (resultsCharts[id]) resultsCharts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  resultsCharts[id] = new Chart(ctx, config);
  return resultsCharts[id];
}

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(digits);
}

function renderFairnessTable(rows) {
  const headers = ['Group', 'Size', 'Hire_Rate', 'Qualified_Count', 'TPR_proxy', 'DI', 'EO_gap'];
  const head = headers.map((header) => `<th>${header}</th>`).join('');
  const body = rows.map((row) => `
    <tr>
      <td>${row.Group ?? '-'}</td>
      <td>${row.Size ?? '-'}</td>
      <td>${formatNumber(row.Hire_Rate)}</td>
      <td>${row.Qualified_Count ?? '-'}</td>
      <td>${formatNumber(row.TPR_proxy)}</td>
      <td>${formatNumber(row.DI)}</td>
      <td>${formatNumber(row.EO_gap)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-shell">
      <h4>Fairness Data</h4>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderDIChart(rows, canvasId) {
  const labels = rows.map((row) => row.Group);
  const diData = rows.map((row) => Number(row.DI));
  const hireRate = rows.map((row) => Number(row.Hire_Rate) * 100);

  makeChart(canvasId, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Disparate Impact',
          data: diData,
          backgroundColor: diData.map((value) => value < 0.8 ? 'rgba(220,38,38,0.75)' : 'rgba(37,99,235,0.75)'),
          yAxisID: 'y',
        },
        {
          label: 'Hire Rate (%)',
          data: hireRate,
          backgroundColor: 'rgba(16,185,129,0.45)',
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
      },
      scales: {
        y: {
          min: 0,
          max: 1.2,
          title: { display: true, text: 'DI' },
        },
        y1: {
          position: 'right',
          min: 0,
          title: { display: true, text: 'Hire Rate (%)' },
          grid: { drawOnChartArea: false },
        },
      },
    },
    plugins: [{
      id: 'threshold',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        const yPixel = yScale.getPixelForValue(0.8);
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(220,38,38,0.8)';
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, yPixel);
        ctx.lineTo(chart.chartArea.right, yPixel);
        ctx.stroke();
        ctx.restore();
      },
    }],
  });
}

async function loadJobData(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  if (!response.ok) throw new Error('Failed to load job');
  return response.json();
}

async function loadArtifact(jobId, artifactName) {
  const response = await fetch(`/api/jobs/${jobId}/artifact/${artifactName}`);
  if (!response.ok) return null;
  return response.text();
}

async function openResult(button) {
  resultButtons.forEach((item) => item.classList.remove('active'));
  button.classList.add('active');

  const { jobId, model, finished } = button.dataset;
  viewerTitle.textContent = model || 'Completed run';
  viewerSubtitle.textContent = finished || '';
  viewerContent.innerHTML = '<p>Loading run data...</p>';

  try {
    const job = await loadJobData(jobId);
    const fairnessText = job.artifacts?.model_fairness ? await loadArtifact(jobId, 'model_fairness') : null;
    const fairnessRows = fairnessText ? parseCSV(fairnessText) : [];
    const accuracy = job.summary?.result?.accuracy;
    const f1 = job.summary?.result?.f1;
    const minDi = job.summary?.result?.min_di;

    let html = `
      <div class="viewer-grid">
        <div class="viewer-stat">
          <span class="viewer-stat-label">Accuracy</span>
          <span class="viewer-stat-value">${accuracy !== undefined ? `${(Number(accuracy) * 100).toFixed(1)}%` : '-'}</span>
        </div>
        <div class="viewer-stat">
          <span class="viewer-stat-label">F1</span>
          <span class="viewer-stat-value">${f1 !== undefined ? formatNumber(f1) : '-'}</span>
        </div>
        <div class="viewer-stat">
          <span class="viewer-stat-label">Min DI</span>
          <span class="viewer-stat-value">${minDi !== undefined ? formatNumber(minDi) : '-'}</span>
        </div>
      </div>
      <div class="viewer-links">
        <a href="/api/jobs/${jobId}">Open JSON</a>
        ${job.artifacts?.model_fairness ? `<a href="/api/jobs/${jobId}/artifact/model_fairness">Download fairness CSV</a>` : ''}
        ${job.artifacts?.training_history ? `<a href="/api/jobs/${jobId}/artifact/training_history">Download training history</a>` : ''}
      </div>
    `;

    if (fairnessRows.length) {
      html += `
        <div class="chart-shell">
          <h4>DI Graph</h4>
          <p>This chart shows disparate impact and hire rate for the selected historical run.</p>
          <canvas id="result-di-chart"></canvas>
        </div>
      `;
      html += renderFairnessTable(fairnessRows);
    } else {
      html += '<p>No fairness artifact found for this run.</p>';
    }

    viewerContent.innerHTML = html;

    if (fairnessRows.length) {
      renderDIChart(fairnessRows, 'result-di-chart');
    }
  } catch (error) {
    viewerContent.innerHTML = `<p>Failed to load this run: ${error.message}</p>`;
  }
}

if (resultButtons.length) {
  openResult(resultButtons[0]);
  resultButtons.forEach((button) => {
    button.addEventListener('click', () => openResult(button));
  });
}
