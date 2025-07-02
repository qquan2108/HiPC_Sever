document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';
  try {
    const res = await fetch('/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    if (data.user.role !== 'admin') {
      errorEl.textContent = 'Tài khoản không có quyền truy cập.';
      return;
    }
    localStorage.setItem('token', data.token);
    window.location.href = '/admin';
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
