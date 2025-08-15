const API_REGISTER = '/users/register';
const API_USER = '/users';
const API_UPLOAD = '/users/upload';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('userForm');
  if (!form) return;

  const avatarInput = document.getElementById('avatar');
  const avatarPreview = document.getElementById('avatarPreview');

  // Ensure existing avatar path is absolute
  if (avatarPreview && avatarPreview.src) {
    const src = avatarPreview.getAttribute('src');
    if (src && !src.startsWith('http') && src.trim() !== '') {
      avatarPreview.src = '/' + src.replace(/^\/+/, '');
      avatarPreview.classList.remove('d-none');
    }
  }

  // Preview avatar when file selected
  if (avatarInput) {
    avatarInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file && avatarPreview) {
        avatarPreview.src = URL.createObjectURL(file);
        avatarPreview.classList.remove('d-none');
      }
    });
  }

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
    if (!payload.full_name || (!id && !payload.email) || (!id && !payload.password)) {
      alert('Vui lòng nhập đầy đủ họ tên, email và mật khẩu');
      return;
    }
    try {
      // Upload avatar file if provided
      if (avatarInput && avatarInput.files[0]) {
        const upFd = new FormData();
        upFd.append('file', avatarInput.files[0]);
        const upRes = await fetch(API_UPLOAD, { method: 'POST', body: upFd });
        if (!upRes.ok) {
          const data = await upRes.json().catch(() => ({}));
          alert('Lỗi upload: ' + (data.message || upRes.status));
          return;
        }
        const upData = await upRes.json();
        payload.avatarUrl = upData.url;
      }

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
