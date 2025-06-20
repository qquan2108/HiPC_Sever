const apiProduct  = '/product';
const apiUsers    = '/users/all';
const apiCategory = '/category';
const apiTskt     = '/tsktproducts';

/* —— PRODUCTS —— */
let currentPage = 1;
let hasMore     = true;
const limit     = 20;

async function fetchProducts(page = 1) {
  if (!hasMore && page !== 1) return;
  try {
    const res = await fetch(`${apiProduct}`);
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
  await fetch(`${apiProduct}/${id}`, { method: 'DELETE' });
  currentPage = 1;
  hasMore     = true;
  fetchProducts();
}

async function initProductForm() {
  const form          = document.getElementById('productForm');
  const categorySelect= document.getElementById('categorySelect');
  const specContainer = document.getElementById('specContainer');
  if (!form || !categorySelect || !specContainer) return;

  // Load specs when category changes
  categorySelect.addEventListener('change', async () => {
    const catId = categorySelect.value;
    specContainer.innerHTML = '';
    if (!catId) return;
    try {
      const res  = await fetch(`${apiTskt}/category/${catId}`);
      const data = await res.json();
      const specs = (data[0] && data[0].value) || [];
      specs.forEach(fieldName => {
        const div = document.createElement('div');
        div.className = 'spec-item';
        div.innerHTML = `
          <label>${fieldName}</label>
          <input type="text" name="specs[${fieldName}]" placeholder="Nhập ${fieldName}" />`;
        specContainer.appendChild(div);
      });
    } catch (err) {
      console.error('Lỗi tải thông số kỹ thuật:', err);
    }
  });

  // Preload form if in edit mode
  if (form.dataset.mode === 'edit') {
    const id = form.dataset.id;
    // fetch product data
    try {
      const res  = await fetch(`${apiProduct}/${id}`);
      const prod = await res.json();
      form.querySelector('input[name="name"]').value        = prod.name;
      form.querySelector('input[name="price"]').value       = prod.price;
      form.querySelector('input[name="stock"]').value       = prod.stock;
      form.querySelector('textarea[name="description"]').value = prod.description || '';
      form.querySelector('input[name="image"]').value       = prod.image || '';
      categorySelect.value = prod.category_id._id;
      // trigger specs load
      await new Promise(r => setTimeout(r, 0));
      categorySelect.dispatchEvent(new Event('change'));
      // fill specs values
      prod.specifications.forEach(spec => {
        const input = Array.from(specContainer.querySelectorAll('.spec-item input'))
          .find(inp => inp.previousElementSibling.textContent === spec.key);
        if (input) input.value = spec.value;
      });
    } catch (err) {
      console.error('Lỗi preload sản phẩm:', err);
    }
  }

  // Submit handler
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd  = new FormData(form);
    const id  = fd.get('id');
    const payload = {
      name: fd.get('name'),
      category_id: fd.get('category_id'),
      brand_id: fd.get('brand_id'),
      price: parseFloat(fd.get('price')),
      stock: parseInt(fd.get('stock')),
      image: fd.get('image'),
      description: fd.get('description'),
      specifications: Array.from(form.querySelectorAll('.spec-item input'))
        .map(inp => ({ key: inp.previousElementSibling.textContent, value: inp.value }))
    };
    const url    = id ? `${apiProduct}/${id}` : apiProduct;
    const method = id ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    window.location.href = '/admin/products';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('productTable')) fetchProducts();
  if (document.getElementById('userTable')) fetchUsers();
  if (document.getElementById('categoryTable')) fetchCategories();
  initProductForm();
  initCategoryForm();
});
