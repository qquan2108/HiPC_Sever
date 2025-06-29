const API = '/orders';
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('orderForm');
  const mode = form.dataset.mode;
  const id = form.dataset.id;

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
});
