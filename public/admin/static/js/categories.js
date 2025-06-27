// public/admin/static/js/categories.js

// 1. API endpoint đúng
const apiCategory    = "/category";

let catCurrentPage = 1;
let catHasMore     = true;
const catLimit     = 20;
let catObserver;
let allCategories = [];

/**
 * Fetch categories (pagination)
 */
async function fetchCategories(page = 1) {
  if (!catHasMore && page !== 1) return;
  try {
    const res = await fetch(`${apiCategory}/all?page=${page}&limit=${catLimit}`);
    if (!res.ok) throw new Error(`HTTP lỗi! status: ${res.status}`);
    const data = await res.json();

    // Đảm bảo categories luôn là mảng
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const more       = !!data.hasMore;

    // Lưu cho search client-side (nếu có)
    if (page === 1) allCategories = categories;
    else            allCategories = allCategories.concat(categories);

    renderCategories(categories, page > 1);

    // Cập nhật trạng thái
    catHasMore     = more;
    catCurrentPage = page;

    // Nếu còn trang, re-attach observer
    if (catHasMore && catObserver) {
      const sentinel = document.getElementById("categoryScrollSentinel");
      if (sentinel) catObserver.observe(sentinel);
    }
  } catch (err) {
    console.error("Lỗi tải danh mục:", err);
  }
}

/**
 * Render vào table
 * @param {Array} categories 
 * @param {boolean} append 
 */
function renderCategories(categories, append = false) {
  const tbody = document.getElementById("categoryTable");
  if (!tbody) return;
  if (!append) tbody.innerHTML = "";

  categories.forEach((c, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-6 py-4">
        ${(catCurrentPage - 1) * catLimit + idx + 1}
      </td>
      <td class="px-6 py-4">${c.name}</td>
      <td class="px-6 py-4">${c.description || ""}</td>
      <td class="px-6 py-4 text-center">
        <a href="/admin/categories/${c._id}/edit" class="inline-block mx-1 p-2 hover:bg-gray-100 rounded">
          <i class="bx bx-edit text-xl"></i>
        </a>
        <a href="#" onclick="deleteCategory('${c._id}')" class="inline-block mx-1 p-2 hover:bg-gray-100 rounded">
          <i class="bx bx-trash text-xl"></i>
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Xóa danh mục
 */
async function deleteCategory(id) {
  if (!confirm("Xác nhận xóa danh mục này?")) return;
  try {
    const res = await fetch(`${apiCategory}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Xóa thất bại (${res.status})`);
    // Reset pagination và reload
    catCurrentPage = 1;
    catHasMore     = true;
    fetchCategories(1);
  } catch (err) {
    console.error("Lỗi xóa danh mục:", err);
  }
}

/**
 * Thiết lập infinite scroll
 */
function initCategoryScroll() {
  const sentinel = document.getElementById("categoryScrollSentinel");
  if (!sentinel) return;

  catObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Tạm dừng observer để tránh call trùng
        catObserver.unobserve(sentinel);
        fetchCategories(catCurrentPage + 1);
      }
    });
  }, {
    root      : null,
    rootMargin: "200px",
    threshold : 0
  });

  catObserver.observe(sentinel);
}

// Khởi động khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  initCategoryScroll();
  fetchCategories(1);
});
