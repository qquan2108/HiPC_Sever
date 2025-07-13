document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = '';

    try {
      const res = await fetch('/users/logadmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/admin/dashboard';
        console.log("Đăng nhập thành công, chuyển hướng tới /admin ✅");
      } else {
        errorDiv.textContent = data.message || 'Sai thông tin đăng nhập';
      }
    } catch (err) {
      errorDiv.textContent = 'Lỗi máy chủ hoặc mạng.';
      console.error(err);
    }
  });
});
