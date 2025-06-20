// public/admin/static/js/admin.js

const apiProduct = '/product';       // :contentReference[oaicite:0]{index=0}  
const apiUsers = '/users/all';     // :contentReference[oaicite:1]{index=1}  
const apiCategory = '/category';      // :contentReference[oaicite:2]{index=2}  
const apiTskt = '/tsktproducts';  // :contentReference[oaicite:3]{index=3}  

/* —— PRODUCTS —— */

// pagination state
let currentPage = 1;
let hasMore     = true;
const limit     = 20;

async function fetchProducts(page = 1) {
  if (!hasMore && page !== 1) return;
  try {
    const res = await fetch(`/product?page=${page}&limit=${limit}`);
    const { products, hasMore: more } = await res.json();
    renderProducts(products, page > 1);
    hasMore = more;
    currentPage = page;
  } catch (err) {
    console.error('Lỗi tải sản phẩm:', err);
  }
}

function renderProducts(products, append = false) {
  const tbody = document.getElementById('productTable');
  if (!append) tbody.innerHTML = '';
  products.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${p.image}" class="product-img" alt="${p.name}"></td>
      <td>${p.name}</td>
      <td>${new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(p.price)}</td>
      <td>${p.stock}</td>
      <td class="actions">
        <a href="/admin/products/${p._id}/edit"><i class="bx bx-edit"></i></a>
        <a href="#" onclick="deleteProduct('${p._id}')"><i class="bx bx-trash"></i></a>
      </td>`;
    tbody.appendChild(tr);
  });
}

async function deleteProduct(id) {
  if (!confirm('Xác nhận xóa sản phẩm này?')) return;
  await fetch(`/product/${id}`, { method: 'DELETE' });
  // reset scroll load
  currentPage = 1;
  hasMore = true;
  fetchProducts();
}

function initProductScroll() {
  fetchProducts(); // load page 1

  const sentinel = document.getElementById('scrollSentinel');
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      fetchProducts(currentPage + 1);
    }
  }, {
    root: document.getElementById('tableContainer'),
    rootMargin: '0px',
    threshold: 1.0
  });

  observer.observe(sentinel);
}

/* —— USERS —— */
async function fetchUsers() {
    try {
        const res = await fetch(`${apiUsers}`);
        const users = await res.json();
        renderUsers(users);
    } catch (err) { console.error(err); }
}

function renderUsers(users) {
    const tbody = document.getElementById('userTable');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${u.full_name}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td class="actions">
        <a href="#" onclick="deleteUser('${u._id}')"><i class="bx bx-trash"></i></a>
      </td>`;
        tbody.appendChild(tr);
    });
}

async function deleteUser(id) {
    if (!confirm('Xác nhận xóa người dùng này?')) return;
    await fetch(`/users/${id}`, { method: 'DELETE' });
    fetchUsers();
}

/* —— CATEGORIES —— */
async function fetchCategories() {
    try {
        const res = await fetch(`${apiCategory}`);
        const cats = await res.json();
        renderCategories(cats);
    } catch (err) { console.error(err); }
}

function renderCategories(cats) {
    const tbody = document.getElementById('categoryTable');
    tbody.innerHTML = '';
    cats.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${c.name}</td>
      <td class="actions">
        <a href="#" onclick="deleteCategory('${c._id}')"><i class="bx bx-trash"></i></a>
      </td>`;
        tbody.appendChild(tr);
    });
}

async function deleteCategory(id) {
    if (!confirm('Xác nhận xóa danh mục này?')) return;
    await fetch(`${apiCategory}/${id}`, { method: 'DELETE' });
    fetchCategories();
}

function initCategoryForm() {
    const form = document.getElementById('categoryForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const id = fd.get('id');
        const payload = { name: fd.get('name') };
        const url = id ? `${apiCategory}/${id}` : `${apiCategory}`;
        const method = id ? 'PUT' : 'POST';
        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        window.location.reload();
    });
}

/* —— PRODUCT FORM (CREATE / EDIT) —— */
function initProductForm() {
    const form = document.getElementById('productForm');
    const categorySelect = document.getElementById('categorySelect');
    const specContainer = document.getElementById('specContainer');

    if (!form || !categorySelect || !specContainer) return;

    // 1. Khi thay đổi danh mục
    categorySelect.addEventListener('change', async () => {
        const catId = categorySelect.value;
        specContainer.innerHTML = '';  // clear cũ

        if (!catId) return;

        try {
            const res = await fetch(`/tsktproducts/category/${catId}`);
            const data = await res.json();
            // data là mảng, element đầu có .value là mảng tên specs
            const specs = (data[0] && data[0].value) || [];

            specs.forEach(fieldName => {
                const div = document.createElement('div');
                div.className = 'spec-item';
                div.innerHTML = `
          <label>${fieldName}</label>
          <input
            type="text"
            name="specs[${fieldName}]"
            placeholder="Nhập ${fieldName}"
          />`;
                specContainer.appendChild(div);
            });
        } catch (err) {
            console.error('Lỗi tải Thông số kỹ thuật:', err);
        }
    });

    // 2. Preload nếu edit
    if (form.dataset.mode === 'edit') {
        categorySelect.dispatchEvent(new Event('change'));
        // Nếu muốn preload giá trị cũ, phải điền form.product.specs trước
    }

    // 3. Submit form như bình thường...
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const id = fd.get('id');
        const payload = {
            name: fd.get('name'),
            category_id: fd.get('category_id'),
            brand_id: fd.get('brand_id'),
            price: +fd.get('price'),
            stock: +fd.get('stock'),
            image: fd.get('image'),
            description: fd.get('description'),
            // gom specs theo fieldName string
            specifications: Array.from(form.querySelectorAll('.spec-item input'))
                .map(inp => ({
                    key: inp.previousElementSibling.textContent,
                    value: inp.value
                }))
        };
        const url = id ? `/product/${id}` : '/product';
        const method = id ? 'PUT' : 'POST';

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        window.location.href = '/admin/products';
    });
}


/* —— INIT —— */
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('productTable')) fetchProducts();
    if (document.getElementById('userTable')) fetchUsers();
    if (document.getElementById('categoryTable')) fetchCategories();
    initProductForm();
    initCategoryForm();
});
