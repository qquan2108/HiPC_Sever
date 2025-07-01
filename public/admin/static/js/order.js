const API = '/orders';
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('orderForm');
  if (!form) return;
  const mode = form.dataset.mode;
  const id = form.dataset.id;
  const currentStatus = form.dataset.status;

  // Submit create hoặc update
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const url = mode === 'edit' ? `${API}/${id}` : API;
    const method = mode === 'edit' ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) window.location.href = '/admin/orders';
    else alert('Lỗi: ' + (await res.json()).error);
  });

  // Delete (chỉ edit mode)
  const delBtn = document.getElementById('deleteBtn');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('Bạn có chắc muốn xóa đơn này không?')) return;
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (res.ok) window.location.href = '/admin/orders';
      else alert('Xóa thất bại');
    });
  }

  // Hiển thị nút chuyển trạng thái nếu có cấu hình
  const transitions = window.orderTransitions || {};
  const container = document.getElementById('statusButtons');
  if (mode === 'edit' && container) {
    const allowed = transitions[currentStatus] || [];
    allowed.forEach(st => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn order-btn';
      btn.textContent = st.charAt(0).toUpperCase() + st.slice(1);
      btn.addEventListener('click', () => updateStatus(st));
      container.appendChild(btn);
    });
  }

  async function updateStatus(newStatus) {
    if (!newStatus) return;
    try {
      const res = await fetch(`${API}/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const { error } = await res.json();
        return alert('Lỗi cập nhật trạng thái: ' + error);
      }
      const updated = await res.json();
      alert(`Đã chuyển đơn #${id} sang trạng thái "${updated.status}"`);
      window.location.reload();
    } catch (err) {
      alert('Lỗi mạng: ' + err.message);
    }
  }
});
