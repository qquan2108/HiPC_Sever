const API_REGISTER = '/users/register';
const API_USER = '/users';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('userForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const id = fd.get('id');
    let url, method, payload;
    if (id) {
      url = `${API_USER}/${id}`;
      method = 'PUT';
      payload = {
        full_name: fd.get('full_name'),
        phone: fd.get('phone') || '',
        address: fd.get('address') || ''
      };
    } else {
      url = API_REGISTER;
      method = 'POST';
      payload = {
        full_name: fd.get('full_name'),
        email: fd.get('email'),
        password: fd.get('password'),
        phone: fd.get('phone') || '',
        address: fd.get('address') || ''
      };
    }
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert('Lỗi: ' + (data.message || res.status));
        return;
      }
      window.location.href = '/admin/users';
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  });
});
