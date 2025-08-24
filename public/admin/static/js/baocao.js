// Báo cáo doanh thu - sử dụng dữ liệu từ API

// Định dạng tiền tệ
const fmtCur = (v) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

// Khởi tạo AOS và tải dữ liệu ban đầu
document.addEventListener('DOMContentLoaded', async () => {
  AOS.init({ duration: 800, easing: 'ease-out-cubic', once: true });
  // Move detail table modal to body so it overlays correctly
  const tableModal = document.getElementById('tableModal');
  if (tableModal) document.body.appendChild(tableModal);

  const spinner = document.getElementById('loadingSpinner');
  if (spinner) spinner.style.display = 'flex';

  const now = new Date();
  const period = 'month';
  const monthStr = now.toISOString().slice(0, 7);

  try {
    const [sumRes, revRes] = await Promise.all([
      fetch('/reports/summary'),
      fetch(`/reports/revenue?period=${period}&month=${monthStr}`)
    ]);
    if (sumRes.ok && revRes.ok) {
      const summary = await sumRes.json();
      const revenue = await revRes.json();
      animateSummary(summary);
      renderRevenueChart(revenue);
      setTableHeader('Thời gian', 'Doanh thu');
      fillTable(revenue);
    } else {
      console.error('Fetch error', sumRes.status, revRes.status);
    }
  } catch (err) {
    console.error('Init load error', err);
  } finally {
    if (spinner) spinner.style.display = 'none';
  }

  populateMonthSelectors();
  initInputs();
  AOS.refresh();
  document.getElementById('periodSelect')?.addEventListener('change', updateInputs);
  document.getElementById('reportType')?.addEventListener('change', updateInputs);
  document.getElementById('loadRevenue')?.addEventListener('click', loadRevenueData);
  document.getElementById('compareBtn')?.addEventListener('click', compareMonths);
});

// -------- Tóm tắt doanh thu --------
function animateSummary(sum) {
  const CountUpCls = window.CountUp || (window.countUp && window.countUp.CountUp);
  if (CountUpCls) {
    new CountUpCls('revenue', sum.revenue, { duration: 1.2, formattingFn: fmtCur }).start();
    new CountUpCls('orders', sum.orders, { duration: 1.2 }).start();
    new CountUpCls('avgRevenue', sum.avgRevenue, { duration: 1.2, formattingFn: fmtCur }).start();
  } else {
    document.getElementById('revenue').textContent = fmtCur(sum.revenue);
    document.getElementById('orders').textContent = sum.orders;
    document.getElementById('avgRevenue').textContent = fmtCur(sum.avgRevenue);
  }
}

// -------- Biểu đồ doanh thu --------
let revenueChart;
const chartColors = ['#667eea', '#f093fb', '#4e79a7', '#e15759', '#76b7b2'];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderLineChart(labels, datasets) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        y: { beginAtZero: true, ticks: { callback: fmtCur } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderBarChart(labels, label, data, currency = false) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{
      label,
      data,
      backgroundColor: hexToRgba(chartColors[1], 0.6)
    }] },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: currency ? { callback: fmtCur } : {}
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderRevenueChart(data) {
  renderLineChart(data.labels, [{
    label: 'Doanh thu',
    data: data.data,
    borderColor: chartColors[0],
    backgroundColor: hexToRgba(chartColors[0], 0.2),
    fill: true,
    tension: 0.4,
    pointRadius: 4,
    pointHoverRadius: 6
  }]);
}

// -------- Bảng chi tiết --------
function setTableHeader(c1, c2) {
  const tr = document.querySelector('#tableModal thead tr');
  if (tr) tr.innerHTML = `<th>${c1}</th><th class="text-end">${c2}</th>`;
}

function fillTable(data, currency = true) {
  const tbody = document.getElementById('revenueTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.labels.forEach((lbl, idx) => {
    const val = currency ? fmtCur(data.data[idx]) : data.data[idx];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${lbl}</strong></td>` +
                   `<td class="text-end"><strong>${val}</strong></td>`;
    tbody.appendChild(tr);
  });
}

// -------- Bộ lọc --------
function updateInputs() {
  const reportType = document.getElementById('reportType')?.value;
  const periodRow = document.getElementById('periodRow');
  const timeRow = document.getElementById('timeRow');
  const compareSection = document.getElementById('compareSection');

  if (reportType !== 'revenue') {
    periodRow?.classList.add('d-none');
    timeRow?.classList.add('d-none');
    compareSection?.classList.add('d-none');
    return;
  }

  periodRow?.classList.remove('d-none');
  timeRow?.classList.remove('d-none');
  compareSection?.classList.remove('d-none');

  const period = document.getElementById('periodSelect')?.value;
  const monthInput = document.getElementById('monthInput');
  const weekInput  = document.getElementById('weekInput');
  const yearInput  = document.getElementById('yearInput');
  if (!period || !monthInput || !weekInput || !yearInput) return;
  monthInput.classList.add('d-none');
  weekInput.classList.add('d-none');
  yearInput.classList.add('d-none');
  if (period === 'month') monthInput.classList.remove('d-none');
  else if (period === 'week') weekInput.classList.remove('d-none');
  else yearInput.classList.remove('d-none');
}

function initInputs() {
  const now = new Date();
  document.getElementById('monthInput').value = now.toISOString().slice(0, 7);
  const week = getWeekString(now);
  document.getElementById('weekInput').value = week;
  document.getElementById('yearInput').value = now.getFullYear();
  updateInputs();
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
function getWeekString(date) {
  const w = getISOWeek(date);
  return `${date.getFullYear()}-W${String(w).padStart(2, '0')}`;
}

async function loadRevenueData() {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) spinner.style.display = 'flex';

  const reportType = document.getElementById('reportType')?.value || 'revenue';

  try {
    if (reportType === 'revenue') {
      const period = document.getElementById('periodSelect')?.value;
      let query = '';
      if (period === 'month') {
        const m = document.getElementById('monthInput').value;
        if (!m) return;
        query = `period=month&month=${m}`;
      } else if (period === 'week') {
        const w = document.getElementById('weekInput').value;
        if (!w) return;
        query = `period=week&week=${w}`;
      } else {
        const y = document.getElementById('yearInput').value;
        if (!y) return;
        query = `period=year&year=${y}`;
      }
      const res = await fetch(`/reports/revenue?${query}`);
      if (!res.ok) return console.error('fetch revenue error', res.status);
      const data = await res.json();
      renderRevenueChart(data);
      setTableHeader('Thời gian', 'Doanh thu');
      fillTable(data, true);
    } else if (reportType === 'category') {
      const res = await fetch('/reports/category');
      if (!res.ok) return console.error('fetch category error', res.status);
      const data = await res.json();
      renderBarChart(data.labels, 'Số lượng', data.data);
      setTableHeader('Danh mục', 'Số lượng');
      fillTable(data, false);
    } else if (reportType === 'best-sellers') {
      const res = await fetch('/reports/best-sellers');
      if (!res.ok) return console.error('fetch best sellers error', res.status);
      const data = await res.json();
      renderBarChart(data.labels, 'Số lượng', data.data);
      setTableHeader('Sản phẩm', 'Số lượng');
      fillTable(data, false);
    } else if (reportType === 'top-buyers') {
      const res = await fetch('/reports/top-buyers');
      if (!res.ok) return console.error('fetch top buyers error', res.status);
      const data = await res.json();
      renderBarChart(data.labels, 'Doanh thu', data.data, true);
      setTableHeader('Người mua', 'Doanh thu');
      fillTable(data, true);
    }
  } catch (err) {
    console.error('loadRevenueData error', err);
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

// -------- So sánh tháng --------
async function compareMonths() {
  const months = [];
  const m1 = document.getElementById('month1')?.value;
  const m2 = document.getElementById('month2')?.value;
  if (m1) months.push(m1);
  if (m2 && m2 !== m1) months.push(m2);
  if (months.length === 0) return;

  const datasets = [];
  let maxLen = 0;
  for (let i = 0; i < months.length; i++) {
    const res = await fetch(`/reports/revenue?period=month&month=${months[i]}`);
    if (!res.ok) return console.error('compare fetch error', res.status);
    const data = await res.json();
    maxLen = Math.max(maxLen, data.data.length);
    datasets.push({ label: months[i], data: data.data });
  }

  const labels = Array.from({ length: maxLen }, (_, i) => String(i + 1));
  const dsCfg = datasets.map((d, idx) => {
    const arr = Array(maxLen).fill(0);
    d.data.forEach((v, i) => { arr[i] = v; });
    const color = chartColors[(idx + 1) % chartColors.length];
    const text = new Date(d.label + '-01').toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    return {
      label: text,
      data: arr,
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.2),
      fill: false,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 5
    };
  });

  renderLineChart(labels, dsCfg);
}

function populateMonthSelectors() {
  const s1 = document.getElementById('month1');
  const s2 = document.getElementById('month2');
  if (!s1 || !s2) return;
  const year = new Date().getFullYear();
  for (let i = 1; i <= 12; i++) {
    const val = `${year}-${String(i).padStart(2, '0')}`;
    const text = `Tháng ${i}/${year}`;
    s1.add(new Option(text, val));
    s2.add(new Option(text, val));
  }
}
