const analysisForm = document.getElementById('analysis-form');

const COLORS = {
  blue:    'rgba(37, 99, 235, 0.8)',
  orange:  'rgba(234, 88, 12, 0.8)',
  green:   'rgba(22, 163, 74, 0.8)',
  red:     'rgba(220, 38, 38, 0.8)',
  purple:  'rgba(124, 58, 237, 0.8)',
  teal:    'rgba(13, 148, 136, 0.8)',
  pink:    'rgba(219, 39, 119, 0.8)',
  gray:    'rgba(107, 114, 128, 0.8)',
};

const GROUP_COLORS = [
  COLORS.blue, COLORS.orange, COLORS.green, COLORS.red,
  COLORS.purple, COLORS.teal, COLORS.pink, COLORS.gray,
];

const charts = {};
function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  charts[id] = new Chart(ctx, config);
  return charts[id];
}

function renderDIChart(fairness) {
  const labels = fairness.map(r => r.Group);
  const diData = fairness.map(r => +r.DI);
  const hrData = fairness.map(r => +(r.Hire_Rate * 100).toFixed(1));

  makeChart('chart-di', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Disparate Impact (DI)',
          data: diData,
          backgroundColor: labels.map((_, i) => diData[i] < 0.8 ? COLORS.red : COLORS.blue),
          yAxisID: 'y',
        },
        {
          label: 'Hire Rate (%)',
          data: hrData,
          backgroundColor: 'rgba(34,197,94,0.5)',
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        annotation: undefined,
        legend: { position: 'top' },
      },
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'DI' },
          min: 0,
          max: 1.2,
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'Hire Rate (%)' },
          min: 0,
          grid: { drawOnChartArea: false },
        },
      },
    },
    plugins: [{
      id: 'diThreshold',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        const yPixel = yScale.getPixelForValue(0.8);
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(220,38,38,0.7)';
        ctx.lineWidth = 2;
        ctx.moveTo(chart.chartArea.left, yPixel);
        ctx.lineTo(chart.chartArea.right, yPixel);
        ctx.stroke();
        ctx.fillStyle = 'rgba(220,38,38,0.9)';
        ctx.font = '11px sans-serif';
        ctx.fillText('DI = 0.8 threshold', chart.chartArea.left + 4, yPixel - 5);
        ctx.restore();
      },
    }],
  });
}

function renderEOChart(fairness) {
  const labels = fairness.map(r => r.Group);
  const eoData = fairness.map(r => +(+r.EO_Gap * 100).toFixed(2));

  makeChart('chart-eo', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'EO Gap (%)',
        data: eoData,
        backgroundColor: labels.map((_, i) => Math.abs(eoData[i]) > 10 ? COLORS.red : COLORS.blue),
      }],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: 'EO Gap (%)' },
        },
      },
    },
    plugins: [{
      id: 'eoThresholds',
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const ctx = chart.ctx;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(220,38,38,0.6)';
        ctx.lineWidth = 2;
        [-10, 10].forEach(val => {
          const xPixel = xScale.getPixelForValue(val);
          if (xPixel >= chart.chartArea.left && xPixel <= chart.chartArea.right) {
            ctx.beginPath();
            ctx.moveTo(xPixel, chart.chartArea.top);
            ctx.lineTo(xPixel, chart.chartArea.bottom);
            ctx.stroke();
          }
        });
        ctx.restore();
      },
    }],
  });
}

function renderOddsChart(odds) {
  const groupOdds = odds.filter(r => r.Term.startsWith('G_'));
  const labels = groupOdds.map(r => r.Term.replace('G_', ''));
  const orData = groupOdds.map(r => +parseFloat(r.Odds_Ratio).toFixed(4));

  makeChart('chart-odds', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Odds Ratio',
        data: orData,
        backgroundColor: labels.map((_, i) => orData[i] < 0.8 ? COLORS.red : COLORS.blue),
      }],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { display: true, text: 'Odds Ratio (vs Male_White)' },
          min: 0,
        },
      },
    },
    plugins: [{
      id: 'orLines',
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(107,114,128,0.5)';
        ctx.lineWidth = 1.5;
        let xPx = xScale.getPixelForValue(1);
        ctx.moveTo(xPx, chart.chartArea.top);
        ctx.lineTo(xPx, chart.chartArea.bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(220,38,38,0.6)';
        ctx.lineWidth = 2;
        xPx = xScale.getPixelForValue(0.8);
        ctx.moveTo(xPx, chart.chartArea.top);
        ctx.lineTo(xPx, chart.chartArea.bottom);
        ctx.stroke();
        ctx.fillStyle = 'rgba(220,38,38,0.8)';
        ctx.font = '11px sans-serif';
        ctx.fillText('OR = 0.8', xPx + 3, chart.chartArea.top + 12);
        ctx.restore();
      },
    }],
  });
}

function renderShapFeaturesChart(shapSummary) {
  const sorted = [...shapSummary].sort((a, b) => +a.Avg_Diff - +b.Avg_Diff);
  const labels = sorted.map(r => r.Feature);
  const avgData = sorted.map(r => +parseFloat(r.Avg_Diff).toFixed(4));
  const worstData = sorted.map(r => +parseFloat(r.Worst_Diff).toFixed(4));

  makeChart('chart-shap-features', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Avg SHAP Diff',
          data: avgData,
          backgroundColor: avgData.map(v => v < -0.01 ? COLORS.red : COLORS.gray),
        },
        {
          label: 'Worst SHAP Diff',
          data: worstData,
          backgroundColor: 'rgba(234,88,12,0.4)',
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { position: 'top' } },
      scales: {
        x: {
          title: { display: true, text: 'SHAP Difference (negative = bias source)' },
        },
      },
    },
  });
}

function renderHeatmap(shapBias) {
  const groups = [...new Set(shapBias.map(r => r.Group))];
  const features = [...new Set(shapBias.map(r => r.Feature))];

  const featAvg = {};
  features.forEach(f => { featAvg[f] = 0; });
  shapBias.forEach(r => { featAvg[r.Feature] += +r.SHAP_Diff; });
  features.sort((a, b) => featAvg[a] - featAvg[b]);

  const lookup = {};
  shapBias.forEach(r => { lookup[r.Group + '|' + r.Feature] = +r.SHAP_Diff; });

  const data = [];
  let minVal = 0, maxVal = 0;
  groups.forEach((g, gi) => {
    features.forEach((f, fi) => {
      const val = lookup[g + '|' + f] || 0;
      data.push({ x: fi, y: gi, v: val });
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    });
  });

  const canvas = document.getElementById('chart-heatmap');
  if (!canvas) return;

 
  const container = canvas.parentElement;
  const maxW = Math.min(container.clientWidth, 850);
  const cellW = Math.max(55, Math.floor((maxW - 140) / features.length));
  const cellH = 30;
  const padLeft = 140;
  const padTop = 150;
  const padBottom = 60;
  const width = padLeft + features.length * cellW + 10;
  const height = padTop + groups.length * cellH + padBottom;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  function valToColor(v) {
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal), 0.01);
    const ratio = Math.max(-1, Math.min(1, v / absMax));
    if (ratio < 0) {
      const intensity = Math.abs(ratio);
      const r = Math.round(220 + (255 - 220) * (1 - intensity));
      const g = Math.round(38 + (255 - 38) * (1 - intensity));
      const b = Math.round(38 + (255 - 38) * (1 - intensity));
      return `rgb(${r},${g},${b})`;
    } else {
      const intensity = ratio;
      const r = Math.round(37 + (255 - 37) * (1 - intensity));
      const g = Math.round(99 + (255 - 99) * (1 - intensity));
      const b = Math.round(235 + (255 - 235) * (1 - intensity));
      return `rgb(${r},${g},${b})`;
    }
  }

  ctx.clearRect(0, 0, width, height);

  data.forEach(d => {
    const x = padLeft + d.x * cellW;
    const y = padTop + d.y * cellH;
    ctx.fillStyle = valToColor(d.v);
    ctx.fillRect(x, y, cellW - 1, cellH - 1);

    ctx.fillStyle = Math.abs(d.v) > 0.3 ? '#fff' : '#333';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.v.toFixed(3), x + cellW / 2, y + cellH / 2);
  });

  ctx.fillStyle = '#333';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  groups.forEach((g, gi) => {
    ctx.fillText(g, padLeft - 6, padTop + gi * cellH + cellH / 2);
  });

  features.forEach((f, fi) => {
    const x = padLeft + fi * cellW + cellW / 2;
    const y = padTop - 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#333';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(f, 0, 0);
    ctx.restore();
  });

  const legendX = padLeft;
  const legendY = padTop + groups.length * cellH + 12;
  const legendW = features.length * cellW;
  const legendH = 12;
  const grad = ctx.createLinearGradient(legendX, 0, legendX + legendW, 0);
  grad.addColorStop(0, valToColor(minVal));
  grad.addColorStop(0.5, '#fff');
  grad.addColorStop(1, valToColor(maxVal));
  ctx.fillStyle = grad;
  ctx.fillRect(legendX, legendY, legendW, legendH);
  ctx.strokeStyle = '#ccc';
  ctx.strokeRect(legendX, legendY, legendW, legendH);

  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${minVal.toFixed(2)} (bias)`, legendX, legendY + legendH + 12);
  ctx.textAlign = 'center';
  ctx.fillText('0', legendX + legendW / 2, legendY + legendH + 12);
  ctx.textAlign = 'right';
  ctx.fillText(`+${maxVal.toFixed(2)}`, legendX + legendW, legendY + legendH + 12);
}

function parseCSV(text) {
  const lines = text.trim().replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = vals[i] ? vals[i].trim() : ''; });
    return obj;
  });
}

async function fetchCSV(analysisId, filename) {
  const resp = await fetch(`/runs/analysis/${analysisId}/${filename}`);
  if (!resp.ok) return null;
  const text = await resp.text();
  return parseCSV(text);
}

async function renderAnalysisResult(summary, analysisId) {
  const container = document.getElementById('analysis-result');
  container.style.display = 'block';
  document.getElementById('analysis-loading').style.display = 'none';

  const summaryText = document.getElementById('summary-text');
  summaryText.innerHTML = `
    <strong>Rows:</strong> ${summary.rows ?? '-'} &nbsp;|&nbsp;
    <strong>Groups:</strong> ${summary.groups ? summary.groups.join(', ') : '-'}
  `;

  const [fairness, odds, shapBias, shapSummary] = await Promise.all([
    fetchCSV(analysisId, 'fairness_metrics.csv'),
    fetchCSV(analysisId, 'odds_ratios.csv'),
    fetchCSV(analysisId, 'shap_bias_analysis.csv'),
    fetchCSV(analysisId, 'shap_feature_summary.csv'),
  ]);

  if (fairness && fairness.length) {
    renderDIChart(fairness);
    renderEOChart(fairness);
  }

  if (odds && odds.length) {
    renderOddsChart(odds);
  }

  if (shapSummary && shapSummary.length) {
    renderShapFeaturesChart(shapSummary);
  }

  if (shapBias && shapBias.length) {
    renderHeatmap(shapBias);
  }

  const shapPlotSection = document.getElementById('shap-plot-section');
  if (summary.shap_summary_plot_file) {
    const imgUrl = `/runs/analysis/${analysisId}/${summary.shap_summary_plot_file}`;
    document.getElementById('shap-plot-img').src = imgUrl;
    shapPlotSection.style.display = 'block';
  }

  const filesList = document.getElementById('files-list');
  const artifacts = [
    { label: 'Fairness Metrics', file: 'fairness_metrics.csv' },
    { label: 'Odds Ratios', file: 'odds_ratios.csv' },
  ];
  if (summary.shap_results_file) {
    artifacts.push({ label: 'SHAP Bias Analysis', file: summary.shap_results_file });
  }
  if (summary.shap_summary_file) {
    artifacts.push({ label: 'SHAP Feature Summary', file: summary.shap_summary_file });
  }
  if (summary.shap_summary_plot_file) {
    artifacts.push({ label: 'SHAP Summary Plot', file: summary.shap_summary_plot_file });
  }

  filesList.innerHTML = artifacts.map(a =>
    `<li>📄 <a href="/runs/analysis/${analysisId}/${a.file}" target="_blank">${a.label}</a></li>`
  ).join('');
}

analysisForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(analysisForm);

  document.getElementById('analysis-result').style.display = 'none';
  document.getElementById('analysis-loading').style.display = 'block';

  try {
    const resp = await fetch('/api/analysis/bias', { method: 'POST', body: data });
    const payload = await resp.json();
    if (!resp.ok) {
      alert(payload.detail || 'Failed to run bias analysis');
      document.getElementById('analysis-loading').style.display = 'none';
      return;
    }
    await renderAnalysisResult(payload.summary, payload.analysis_id);
  } catch (err) {
    alert('Error: ' + err.message);
    document.getElementById('analysis-loading').style.display = 'none';
  }
});
