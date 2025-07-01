/* —— USERS —— */
let userCurrentPage = 1;
let userHasMore     = true;
const userLimit     = 20;
let userObserver;
let allUsers = [];  // để hỗ trợ search client-side

/** Fetch users với pagination */
async function fetchUsers(page = 1) {
  if (!userHasMore && page !== 1) return;
  try {
    const res = await fetch(`/users?page=${page}&limit=${userLimit}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const { users, hasMore: more } = await res.json();

    // lưu tạm để search
    if (page === 1) allUsers = users;
    else            allUsers = allUsers.concat(users);

    renderUsers(users, page > 1);
    userHasMore     = more;
    userCurrentPage = page;

    // re-attach observer
    if (userHasMore && userObserver) {
      const sentinel = document.getElementById('userScrollSentinel');
      if (sentinel) userObserver.observe(sentinel);
    }
  } catch (err) {
    console.error('Lỗi tải user:', err);
  }
}

/** Render users vào bảng */
function renderUsers(users, append = false) {
  const tbody = document.getElementById('userTable');
  if (!append) tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    const avatarUrl = u.avatar || 'https://via.placeholder.com/40';
    tr.innerHTML = `
      <td class="px-6 py-4"><img src="${avatarUrl}" alt="avatar" class="w-10 h-10 rounded-full object-cover"></td>
      <td class="px-6 py-4">${u.name}</td>
      <td class="px-6 py-4">${u.email}</td>
      <td class="px-6 py-4">${u.role}</td>
      <td class="px-6 py-4"> </td>
      <td class="px-6 py-4 text-center">
        <a href="/admin/users/${u._id}/edit" class="inline-block mx-1 p-2 hover:bg-gray-100 rounded">
          <i class="bx bx-edit text-xl"></i>
        </a>
        <a href="#" onclick="deleteUser('${u._id}')" class="inline-block mx-1 p-2 hover:bg-gray-100 rounded">
          <i class="bx bx-trash text-xl"></i>
        </a>
      </td>`;
    tbody.appendChild(tr);
  });
}

/** Xóa user */
async function deleteUser(id) {
  if (!confirm('Bạn có chắc muốn xóa user này?')) return;
  try {
    const res = await fetch(`/users/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Xóa thất bại: ${res.status}`);
    // reset và load lại
    userCurrentPage = 1;
    userHasMore     = true;
    fetchUsers(1);
  } catch (err) {
    console.error('Lỗi xóa user:', err);
  }
}

/** Infinite scroll cho USERS */
function initUserScroll() {
  const sentinel = document.getElementById('userScrollSentinel');
  if (!sentinel) return;
  userObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        userObserver.unobserve(sentinel);
        fetchUsers(userCurrentPage + 1);
      }
    });
  }, {
    root: null,
    rootMargin: '200px',
    threshold: 0
  });
  userObserver.observe(sentinel);
}
