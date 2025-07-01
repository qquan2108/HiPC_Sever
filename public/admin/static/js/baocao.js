
// 1. Khởi động AOS sau khi DOM sẵn sàng
const fmt = v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

document.addEventListener('DOMContentLoaded', async () => {
  AOS.init({ duration: 600, once: true });

  console.log('⚡ baocao.js: bắt đầu chạy');

  // fetch dữ liệu mặc định theo tháng hiện tại
  const now = new Date();
  const [sumRes, dataRes] = await Promise.all([
    fetch('/reports/summary'),
    fetch(`/reports/revenue?period=month&month=${now.toISOString().slice(0,7)}`)
  ]);
  if (!sumRes.ok || !dataRes.ok) {
    console.error('Fetch lỗi', sumRes.status, dataRes.status);
    return;
  }
  const summary = await sumRes.json();
  const chartData = await dataRes.json();
  console.log('⤷ summary:', summary, '\n⤷ data:', chartData);

  // render CountUp nếu thư viện tồn tại
  const CountUpCls = window.CountUp || (window.countUp && window.countUp.CountUp);
  if (CountUpCls) {
    new CountUpCls('revenue', summary.revenue, { duration: 1.2, formattingFn: fmt }).start();
    new CountUpCls('orders', summary.orders, { duration: 1.2 }).start();
    new CountUpCls('avgRevenue', summary.avgRevenue, { duration: 1.2, formattingFn: fmt }).start();
  } else {
    document.getElementById('revenue').textContent = fmt(summary.revenue);
    document.getElementById('orders').textContent = summary.orders;
    document.getElementById('avgRevenue').textContent = fmt(summary.avgRevenue);
  }

  renderRevenueChart(chartData);

  // render bảng doanh thu nếu có phần tử
  const tableBody = document.getElementById('revenueTable');
  if (tableBody) {
    chartData.labels.forEach((label, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td class="text-end">${fmt(chartData.data[idx])}</td>`;
      tableBody.appendChild(tr);
    });
  }
});

// ==== So sánh doanh thu giữa các tháng ====
const fmtCur = v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

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

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function getWeekString(date) {
  const w = getISOWeek(date);
  return `${date.getFullYear()}-W${String(w).padStart(2,'0')}`;
}

async function loadRevenueData() {
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
}

function renderRevenueChart(data) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,200);
  grad.addColorStop(0,'rgba(0,98,255,0.5)');
  grad.addColorStop(1,'rgba(0,98,255,0)');
  if (window.revenueChart && typeof window.revenueChart.destroy === 'function') {
    window.revenueChart.destroy();
  }
  window.revenueChart = new Chart(ctx, {
    type: 'line',
    data: { labels: data.labels, datasets: [{ data: data.data, backgroundColor: grad, borderColor: 'var(--primary)', fill: true, tension: 0.3 }] },
    options: { responsive: true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, ticks:{ callback: fmt } }, x:{ grid:{ display:false } } } }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const select1 = document.getElementById('month1');
  const select2 = document.getElementById('month2');
  if (select1 && select2) {
    for (let i = 1; i <= 12; i++) {
      const opt1 = document.createElement('option');
      opt1.value = i;
      opt1.textContent = `Th${i}`;
      select1.appendChild(opt1.cloneNode(true));
      select2.appendChild(opt1);
    }
  }

  // init period inputs
  const now = new Date();
  const monthInput = document.getElementById('monthInput');
  const weekInput = document.getElementById('weekInput');
  const yearInput = document.getElementById('yearInput');
  if (monthInput) monthInput.value = now.toISOString().slice(0,7);
  if (weekInput) weekInput.value = getWeekString(now);
  if (yearInput) yearInput.value = now.getFullYear();

  updateInputs();
  document.getElementById('periodSelect')?.addEventListener('change', updateInputs);
  document.getElementById('loadRevenue')?.addEventListener('click', loadRevenueData);
});

let compareChart;
document.getElementById('compareBtn')?.addEventListener('click', async () => {
  const m1 = document.getElementById('month1')?.value;
  const m2 = document.getElementById('month2')?.value;
  if (!m1 || !m2) return;
  const res = await fetch(`/reports/compare?months=${m1},${m2}`);
  if (!res.ok) {
    console.error('Compare fetch error', res.status);
    return;
  }
  const data = await res.json();
  renderCompareChart(data);
});

function renderCompareChart(data) {
  const ctx = document.getElementById('compareChart')?.getContext('2d');
  if (!ctx) return;
  if (compareChart && typeof compareChart.destroy === 'function') {
    compareChart.destroy();
  }
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
      scales: {
        y: { beginAtZero: true, ticks: { callback: fmtCur } }
      }
    }
  });
}
