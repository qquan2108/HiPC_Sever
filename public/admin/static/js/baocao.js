
// 1. Khởi động AOS
AOS.init({ duration: 600, once: true });

// 2. Gọi ngay IIFE
(async () => {
  console.log("⚡ baocao.js: bắt đầu chạy");

  // fetch dữ liệu
  const [sumRes, monRes] = await Promise.all([
    fetch("/reports/summary"),
    fetch("/reports/monthly"),
  ]);
  if (!sumRes.ok || !monRes.ok) {
    console.error("Fetch lỗi", sumRes.status, monRes.status);
    return;
  }
  const summary = await sumRes.json();
  const monthly = await monRes.json();
  console.log("⤷ summary:", summary, "\n⤷ monthly:", monthly);

  // render CountUp
  const fmt = v => new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND"
  }).format(v);
  new CountUp("revenue",    summary.revenue,    { duration: 1.2, formattingFn: fmt }).start();
  new CountUp("orders",     summary.orders,     { duration: 1.2 }).start();
  new CountUp("avgRevenue", summary.avgRevenue, { duration: 1.2, formattingFn: fmt }).start();

  // vẽ Chart.js
  const ctx = document.getElementById("revenueChart").getContext("2d");
  const grad = ctx.createLinearGradient(0,0,0,200);
  grad.addColorStop(0, "rgba(0,98,255,0.5)");
  grad.addColorStop(1, "rgba(0,98,255,0)");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: monthly.labels,
      datasets: [{
        data: monthly.data,
        backgroundColor: grad,
        borderColor: "var(--primary)",
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: fmt } },
        x: { grid: { display: false } }
      }
    }
  });

  // render bảng doanh thu theo tháng nếu có phần tử
  const tableBody = document.getElementById("revenueTable");
  if (tableBody) {
    monthly.labels.forEach((label, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${label}</td><td class="text-end">${fmt(monthly.data[idx])}</td>`;
      tableBody.appendChild(tr);
    });
  }
})();
