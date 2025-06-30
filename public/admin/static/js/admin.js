/* Admin JS for Products, Users, Categories */

const apiProduct  = "/product";
const apiUsers    = "/users/all";
const apiCategory = "/category";
const apiTskt     = "/tsktproducts";

/* —— PRODUCTS —— */
let currentPage = 1;
let hasMore     = true;
const limit      = 20;
let observer; // IntersectionObserver reference

/**
 * Fetch products from API with pagination
 * @param {number} page - Page number to fetch
 */
async function fetchProducts(page = 1) {
  if (!hasMore && page !== 1) return;
  try {
    const res = await fetch(`${apiProduct}?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const { products, hasMore: more } = await res.json();

    renderProducts(products, page > 1);
    hasMore     = more;
    currentPage = page;

    // Re-attach observer if more pages remain
    if (hasMore && observer) {
      const sentinel = document.getElementById("scrollSentinel");
      if (sentinel) observer.observe(sentinel);
    }
  } catch (err) {
    console.error("Lỗi tải sản phẩm:", err);
  }
}

/**
 * Render product rows into table
 * @param {Array} products - List of product objects
 * @param {boolean} append - Whether to append or replace
 */
function renderProducts(products, append = false) {
  const tbody = document.getElementById("productTable");
  if (!tbody) return;
  if (!append) tbody.innerHTML = "";

  products.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img src="${p.image}" class="product-img" alt="${p.name}"></td>
      <td>${p.name}</td>
      <td>${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(p.price)}</td>
      <td>${p.stock}</td>
       <td class="actions text-center">
           <a href="/admin/products/${p._id}/edit" class="inline-block mx-1 p-2 hover:bg-gray-100 rounded">
             <i class="bx bx-edit text-xl"></i>
           </a>
           <a href="#" onclick="deleteProduct('${p._id}')" class="inline-block mx-1 p-2 hover:bg-gray-100 rounded">
             <i class="bx bx-trash text-xl"></i>
           </a>
         </td>`;
    tbody.appendChild(tr);
  });
}

/**
 * Delete a product by ID, then refresh list
 * @param {string} id - Product ID to delete
 */
async function deleteProduct(id) {
  if (!confirm("Xác nhận xóa sản phẩm này?")) return;
  try {
    const res = await fetch(`${apiProduct}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    // Reset pagination and reload
    currentPage = 1;
    hasMore     = true;
    fetchProducts(1);
  } catch (err) {
    console.error("Lỗi xóa sản phẩm:", err);
  }
}

/**
 * Initialize Add/Edit Product form: load specs and preload
 */
async function initProductForm() {
  const form            = document.getElementById("productForm");
  const categorySelect  = document.getElementById("categorySelect");
  const specContainer   = document.getElementById("specContainer");
  const descInput       = document.getElementById("descriptionInput");
  const descEditorEl    = document.getElementById("descriptionEditor");
  const imageFile       = document.getElementById("imageFile");
  const imagePreview    = document.getElementById("imagePreview");
  const imageUrlInput   = document.getElementById("imageUrl");
  let   quill;
  if (!form || !categorySelect || !specContainer || !descInput || !descEditorEl) return;
  quill = new Quill(descEditorEl, { theme: "snow" });

  if (imageFile) {
    imageFile.addEventListener('change', () => {
      const file = imageFile.files[0];
      if (file) {
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.display = '';
      }
    });
  }

  if (!form.dataset.id) {
    const hiddenId = form.querySelector("input[name='id']");
    if (hiddenId) form.dataset.id = hiddenId.value;
  }

  // Load specs when category changes
  categorySelect.addEventListener("change", async () => {
    const catId = categorySelect.value;
    specContainer.innerHTML = "";
    if (!catId) return;
    try {
      const res  = await fetch(`${apiTskt}/category/${catId}`);
      const data = await res.json();
      const specs = (data[0] && data[0].value) || [];
      specs.forEach(fieldName => {
        const div = document.createElement("div");
        div.className   = "spec-item";
        div.innerHTML   = `<label>${fieldName}</label><input type="text" name="specs[${fieldName}]" placeholder="Nhập ${fieldName}" />`;
        specContainer.appendChild(div);
      });
    } catch (err) {
      console.error("Lỗi tải thông số kỹ thuật:", err);
    }
  });

  // Preload form data in edit mode
  if (form.dataset.mode === "edit") {
    const id = form.dataset.id;
    try {
      const res  = await fetch(`${apiProduct}/${id}`);
      const prod = await res.json();
      // fill basic fields
      form.querySelector('input[name="name"]').value        = prod.name;
      form.querySelector('input[name="price"]').value       = prod.price;
      form.querySelector('input[name="stock"]').value       = prod.stock;
      quill.root.innerHTML = prod.description || "";
      if (imagePreview) {
        imagePreview.src = prod.image || '';
        imagePreview.style.display = prod.image ? '' : 'none';
      }
      if (imageUrlInput) imageUrlInput.value = prod.image || '';
      categorySelect.value = prod.category_id._id;
      // trigger specs load
      await new Promise(r => setTimeout(r, 0));
      categorySelect.dispatchEvent(new Event("change"));
      // fill specs values
      prod.specifications.forEach(spec => {
        const input = Array.from(specContainer.querySelectorAll(".spec-item input")).find(
          inp => inp.previousElementSibling.textContent === spec.key
        );
        if (input) input.value = spec.value;
      });
    } catch (err) {
      console.error("Lỗi preload sản phẩm:", err);
    }
  }

  // Submit handler
  form.addEventListener("submit", async e => {
    e.preventDefault();
    descInput.value = quill.root.innerHTML;
    const fd = new FormData(form);

    let imageUrl = imageUrlInput ? imageUrlInput.value : '';
    if (imageFile && imageFile.files[0]) {
      const fdImg = new FormData();
      fdImg.append('image', imageFile.files[0]);
      try {
        const upRes = await fetch(`${apiProduct}/upload`, {
          method: 'POST',
          body: fdImg
        });
        if (upRes.ok) {
          const data = await upRes.json();
          imageUrl = data.url;
        }
      } catch (err) {
        console.error('Upload image error:', err);
      }
    }

    const payload = {
      name           : fd.get("name"),
      category_id    : fd.get("category_id"),
      brand_id       : fd.get("brand_id"),
      price          : parseFloat(fd.get("price")),
      stock          : parseInt(fd.get("stock")),
      image          : imageUrl,
      description    : fd.get("description"),
      specifications : Array.from(form.querySelectorAll(".spec-item input")).map(
        inp => ({ key: inp.previousElementSibling.textContent, value: inp.value })
      )
    };
    const url    = fd.get("id") ? `${apiProduct}/${fd.get("id")}` : apiProduct;
    const method = fd.get("id") ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      window.location.href = "/admin/products";
    } catch (err) {
      console.error("Lỗi lưu sản phẩm:", err);
    }
  });
}

function initCategoryForm() {
  const form = document.getElementById("categoryForm");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const fd = new FormData(form);
    const payload = {
      name:        fd.get("name"),
      description: fd.get("description") || ""
    };
    const id     = fd.get("id");              // hidden input khi edit
    const url    = id ? `${apiCategory}/${id}` : apiCategory;
    const method = id ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      // Sau khi lưu, quay về trang danh sách
      window.location.href = "/admin/categories";
    } catch (err) {
      console.error("Lỗi lưu danh mục:", err);
      // TODO: show toast lỗi nếu cần
    }
  });
}

/**
 * Initialize infinite scroll for products
 */
function initProductScroll() {
  const sentinel = document.getElementById("scrollSentinel");
  if (!sentinel) return;
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        observer.unobserve(sentinel);
        fetchProducts(currentPage + 1);
      }
    });
  }, {
    root      : null,
    rootMargin: "200px",
    threshold : 0
  });
  observer.observe(sentinel);
}

/* —— USERS, CATEGORIES, ... (không thay đổi) —— */

// DOM ready: init modules
document.addEventListener("DOMContentLoaded", () => {
  // Products
  if (document.getElementById("productTable")) {
    initProductScroll();
    fetchProducts(1);
  }
  // Users
  if (document.getElementById("userTable")) fetchUsers();
  // Categories
  if (document.getElementById("categoryTable")) fetchCategories();
  // Forms
  initProductForm();
  initCategoryForm();
});
