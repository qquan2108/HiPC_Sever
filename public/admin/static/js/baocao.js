// Báo cáo doanh thu - sử dụng dữ liệu từ API

// Định dạng tiền tệ
const fmtCur = (v) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

// Khởi tạo AOS và tải dữ liệu ban đầu
document.addEventListener('DOMContentLoaded', async () => {
  AOS.init({ duration: 800, easing: 'ease-out-cubic', once: true });

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
  document.getElementById('periodSelect')?.addEventListener('change', updateInputs);
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
function renderRevenueChart(data) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(102,126,234,0.5)');
  grad.addColorStop(1, 'rgba(102,126,234,0)');

  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.data,
        borderColor: '#667eea',
        backgroundColor: grad,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: fmtCur } },
        x: { grid: { display: false } }
      }
    }
  });
}

// -------- Bảng chi tiết --------
function fillTable(data) {
  const tbody = document.getElementById('revenueTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.labels.forEach((lbl, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${lbl}</strong></td>` +
                   `<td class="text-end"><strong>${fmtCur(data.data[idx])}</strong></td>`;
    tbody.appendChild(tr);
  });
}

// -------- Bộ lọc --------
function updateInputs() {
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
  try {
    const res = await fetch(`/reports/revenue?${query}`);
    if (!res.ok) return console.error('fetch revenue error', res.status);
    const data = await res.json();
    renderRevenueChart(data);
    fillTable(data);
  } catch (err) {
    console.error('loadRevenueData error', err);
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

// -------- So sánh tháng --------
let compareChart;
async function compareMonths() {
  const m1 = document.getElementById('month1')?.value;
  const m2 = document.getElementById('month2')?.value;
  if (!m1 || !m2 || m1 === m2) return;
  const res = await fetch(`/reports/compare?months=${m1},${m2}`);
  if (!res.ok) return console.error('compare fetch error', res.status);
  const data = await res.json();
  renderCompareChart(data);
}

function renderCompareChart(data) {
  const ctx = document.getElementById('compareChart').getContext('2d');
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.data,
        backgroundColor: '#4e79a7'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: fmtCur } } }
    }
  });
}

function populateMonthSelectors() {
  const s1 = document.getElementById('month1');
  const s2 = document.getElementById('month2');
  if (!s1 || !s2) return;
  for (let i = 1; i <= 12; i++) {
    const opt1 = new Option(`Th${i}`, i);
    const opt2 = new Option(`Th${i}`, i);
    s1.add(opt1);
    s2.add(opt2);
  }
}
