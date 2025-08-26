/* Admin JS for Products, Users, Categories */

// Kiểm tra xem các biến đã được khai báo chưa
if (typeof window.adminConfig === 'undefined') {
  window.adminConfig = {
    apiProduct: "/product",
    apiUsers: "/users/all",
    apiCategory: "/category",
    apiTskt: "/tsktproducts",
    initialized: false
  };
}

const { apiProduct, apiUsers, apiCategory, apiTskt } = window.adminConfig;

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = type;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function setupNumberInput(input) {
  if (!input) return;
  const format = () => {
    const raw = input.value.replace(/[^0-9]/g, '');
    input.value = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  input.addEventListener('input', format);
  format();
}

/* —— PRODUCTS —— */
let currentPage = 1;
let hasMore = true;
const limit = 20;
let observer; // IntersectionObserver reference
let productQuery = '';

/**
 * Fetch products from API with pagination
 * @param {number} page - Page number to fetch
 */
async function fetchProducts(page = 1, q = productQuery) {
  if (!hasMore && page !== 1) return;
  try {
    const url = `${apiProduct}?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const data = await res.json();
    const products = data.products || data.items || [];

    if (typeof data.total === 'number') {
      const countEl = document.getElementById('productCount');
      if (countEl) countEl.textContent = data.total;
    }

    const more = 'hasMore' in data ? data.hasMore
      : (data.page && data.totalPages ? data.page < data.totalPages : false);
    renderProducts(products, page > 1);
    hasMore = more;
    currentPage = page;
    const sentinel = document.getElementById("scrollSentinel");
    if (sentinel) sentinel.style.display = hasMore ? 'block' : 'none';

    // Re-attach observer if more pages remain
    if (hasMore && observer && sentinel) {
      observer.observe(sentinel);
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
    hasMore = true;
    fetchProducts(1);
    showToast('Xóa sản phẩm thành công', 'success');
  } catch (err) {
    console.error("Lỗi xóa sản phẩm:", err);
    showToast('Lỗi xóa sản phẩm', 'error');
  }
}

/**
 * Initialize Add/Edit Product form: load specs and preload
 */
async function initProductForm() {
  console.log('Initializing product form...');

  const form = document.getElementById("productForm");
  const categorySelect = document.getElementById("categorySelect");
  const specContainer = document.getElementById("specContainer");
  const variantsContainer = document.getElementById("variantsContainer");
  const addVariantBtn = document.getElementById("addVariantBtn");
  const variantsInput = document.getElementById("variantsInput");
  const descInput = document.getElementById("descriptionInput");
  const descEditorEl = document.getElementById("descriptionEditor");
  const imageFile = document.getElementById("imageFile");
  const imagePreview = document.getElementById("imagePreview");
  const imageUrlInput = document.getElementById("imageUrl");
  const imageSourceSelect = document.getElementById("imageSourceSelect");
  const imageLink = document.getElementById("imageLink");
  const imageFileGroup = document.getElementById("imageFileGroup");
  const imageLinkGroup = document.getElementById("imageLinkGroup");
  const stockInput = form.querySelector('input[name="stock"]');

  const getSpecInputs = () =>
    Array.from(specContainer.querySelectorAll(".spec-item input")).filter(
      inp => inp.previousElementSibling && inp.previousElementSibling.tagName === "LABEL"
    );

  let editor;

  if (!form || !categorySelect || !specContainer || !descInput || !descEditorEl) {
    console.error('Required form elements not found');
    return;
  }

  setupNumberInput(stockInput);

  // Initialize CKEditor
  try {
    editor = await ClassicEditor.create(descEditorEl);
    if (descInput.value) editor.setData(descInput.value);
  } catch (error) {
    console.error('Error initializing CKEditor:', error);
    return;
  }

  // Image upload handler
  if (imageFile && imagePreview) {
    imageFile.addEventListener('change', () => {
      const file = imageFile.files[0];
      if (file) {
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.display = 'block';
      }
    });
  }

  if (imageLink) {
    imageLink.addEventListener('input', () => {
      if (imageLink.value) {
        imagePreview.src = imageLink.value;
        imagePreview.style.display = 'block';
      }
    });
  }

  if (imageSourceSelect && imageFileGroup && imageLinkGroup) {
    imageSourceSelect.addEventListener('change', () => {
      const mode = imageSourceSelect.value;
      if (mode === 'link') {
        imageFileGroup.style.display = 'none';
        imageLinkGroup.style.display = 'block';
      } else {
        imageFileGroup.style.display = 'block';
        imageLinkGroup.style.display = 'none';
      }
    });
  }

  // Set form dataset id if not exists
  if (!form.dataset.id) {
    const hiddenId = form.querySelector("input[name='id']");
    if (hiddenId) form.dataset.id = hiddenId.value;
  }

  function addCustomVariantRow(name = '', values = '') {
    const div = document.createElement('div');
    div.className = 'spec-item variant-custom';
    div.innerHTML = `
      <input type="text" class="form-control variant-name" placeholder="Tên biến thể" value="${name}">
      <input type="text" class="form-control variant-values" placeholder="Giá trị (cách nhau bằng dấu phẩy)" value="${values}">
      <button type="button" class="btn btn-sm btn-danger remove-variant">&times;</button>`;

    div.querySelector('.remove-variant').addEventListener('click', () => div.remove());
    variantsContainer.appendChild(div);
  }

  function renderVariantOptions(list, existing = {}) {
    console.log('Rendering variant options:', list, existing);
    variantsContainer.innerHTML = '';
    const used = new Set();

    list.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'spec-item';
      const label = document.createElement('label');
      label.textContent = opt.name;
      const select = document.createElement('select');
      select.multiple = true;
      select.className = 'form-select';
      select.dataset.name = opt.name;

      (opt.options || []).forEach(val => {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = val;
        if (existing[opt.name] && existing[opt.name].includes(val)) {
          o.selected = true;
        }
        select.appendChild(o);
      });

      div.appendChild(label);
      div.appendChild(select);
      variantsContainer.appendChild(div);
      used.add(opt.name);
    });

    // Add custom variants that aren't in the predefined list
    Object.keys(existing).forEach(k => {
      if (!used.has(k)) {
        addCustomVariantRow(k, existing[k].join(', '));
      }
    });
  }

  async function loadSpecsAndVariants(catId, existingVariants = {}) {
    console.log('Loading specs and variants for category:', catId);

    specContainer.innerHTML = '';
    variantsContainer.innerHTML = '';

    if (!catId) {
      console.log('No category selected');
      return;
    }

    try {
      // Try filters endpoint first, then fallback to category endpoint
      let res = await fetch(`${apiTskt}/filters/${catId}`);
      if (!res.ok) {
        console.log('Filters endpoint failed, trying category endpoint');
        res = await fetch(`${apiTskt}/category/${catId}`);
      }

      if (!res.ok) {
        throw new Error(`API call failed: ${res.status}`);
      }

      const data = await res.json();
      console.log('Received data:', data);

      let specs = [];
      let variantOpts = [];

      // Parse response data
      if (Array.isArray(data.specs)) {
        specs = data.specs;
        variantOpts = Array.isArray(data.variantOptions) ? data.variantOptions : [];
      } else if (Array.isArray(data.fields)) {
        specs = data.fields; // ← Thêm dòng này để hỗ trợ `fields` thay vì `specs`
      } else if (Array.isArray(data)) {
        const first = data[0] || {};
        if (Array.isArray(first.specs)) {
          specs = first.specs;
        } else if (Array.isArray(first.value)) {
          specs = first.value;
        }
        if (Array.isArray(first.variantOptions)) {
          variantOpts = first.variantOptions;
        }
      }
      console.log('Parsed specs:', specs);
      console.log('Parsed variants:', variantOpts);

      // Render specification fields
      specs.forEach(fieldName => {
        const div = document.createElement('div');
        div.className = 'spec-item';
        div.innerHTML = `
          <label>${fieldName}</label>
          <input type="text" name="specifications[${fieldName}]" placeholder="Nhập ${fieldName}" />
        `;
        specContainer.appendChild(div);
      });

      // Render variant options
      renderVariantOptions(variantOpts, existingVariants);

    } catch (err) {
      console.error('Load specs/variants error:', err);
      showToast('Lỗi tải thông số kỹ thuật', 'error');
    }
  }

  // Category change event handler
  categorySelect.addEventListener('change', async (e) => {
    console.log('Category changed to:', e.target.value);
    await loadSpecsAndVariants(e.target.value);
  });

  // Add variant button
  if (addVariantBtn) {
    addVariantBtn.addEventListener('click', () => addCustomVariantRow());
  }

  // Preload form data in edit mode
  if (form.dataset.mode === "edit") {
    const id = form.dataset.id;
    if (id) {
      try {
        console.log('Loading product data for edit mode:', id);
        const res = await fetch(`${apiProduct}/${id}`);
        if (!res.ok) throw new Error(`Failed to load product: ${res.status}`);

        const prod = await res.json();
        console.log('Loaded product:', prod);

        // Fill basic fields
        form.querySelector('input[name="name"]').value = prod.name || '';
        if (stockInput) { stockInput.value = prod.stock || ''; stockInput.dispatchEvent(new Event('input')); }
        if (editor) editor.setData(prod.description || "");
        if (descInput) descInput.value = prod.description || '';

        if (imagePreview) {
          imagePreview.src = prod.image || '';
          imagePreview.style.display = prod.image ? 'block' : 'none';
        }
        if (imageUrlInput) imageUrlInput.value = prod.image || '';
        if (imageLink) imageLink.value = prod.image || '';
        if (imageSourceSelect && prod.image) {
          imageSourceSelect.value = 'link';
          if (imageFileGroup) imageFileGroup.style.display = 'none';
          if (imageLinkGroup) imageLinkGroup.style.display = 'block';
        }

        if (prod.category_id && prod.category_id._id) {
          categorySelect.value = prod.category_id._id;

          const existingVariantMap = Array.isArray(prod.variants)
            ? prod.variants.reduce((acc, g) => {
                const vals = Array.isArray(g.options)
                  ? g.options.map(o => o.label || o)
                  : [];
                acc[g.key || g.name] = vals;
                return acc;
              }, {})
            : {};

          await loadSpecsAndVariants(prod.category_id._id, existingVariantMap);

          // Fill spec values
          const specList = Array.isArray(prod.tskt) ? prod.tskt : prod.specifications || [];
          specList.forEach(spec => {
            const input = getSpecInputs().find(
              inp => inp.previousElementSibling.textContent === spec.key || inp.previousElementSibling.textContent === spec.label
            );
            if (input) input.value = spec.value;
          });
        }

      } catch (err) {
        console.error("Lỗi preload sản phẩm:", err);
        showToast('Lỗi tải dữ liệu sản phẩm', 'error');
      }
    }
  } else if (categorySelect.value) {
    // Load specs for initially selected category in create mode
    console.log('Loading specs for initial category:', categorySelect.value);
    await loadSpecsAndVariants(categorySelect.value);
  }

  // Form submit handler
  form.addEventListener("submit", async e => {
    e.preventDefault();

    try {
      // Update description from CKEditor
      descInput.value = editor.getData();

      const fd = new FormData(form);
      let imageUrl = imageUrlInput ? imageUrlInput.value : '';

      if (imageSourceSelect && imageSourceSelect.value === 'link') {
        imageUrl = imageLink ? imageLink.value.trim() : '';
      } else if (imageFile && imageFile.files[0]) {
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
          showToast('Lỗi upload ảnh', 'error');
        }
      }

      // Collect variant data
      const variantsArray = [];
      variantsContainer.querySelectorAll('select').forEach(sel => {
        const name = sel.dataset.name;
        const vals = Array.from(sel.selectedOptions).map(o => o.value);
        if (vals.length) variantsArray.push({ name, values: vals });
      });

      // Các row custom
      variantsContainer.querySelectorAll('.variant-custom').forEach(div => {
        const name = div.querySelector('.variant-name').value.trim();
        const vals = div.querySelector('.variant-values')
          .value
          .split(',')
          .map(v => v.trim())
          .filter(v => v);
        if (name && vals.length) variantsArray.push({ name, values: vals });
      });

      variantsInput.value = JSON.stringify(variantsArray);

      

      // Prepare payload
      const payload = {
        name: fd.get("name"),
        category_id: fd.get("category_id"),
        brand_id: fd.get("brand_id"),
        stock: Number(String(fd.get("stock")).replace(/[^0-9]/g, '')),
        image: imageUrl,
        description: fd.get("description"),
        specifications: getSpecInputs()
          .map(inp => ({
            key: inp.previousElementSibling.textContent,
            value: inp.value
          }))
          .filter(item => item.key && item.value.trim()),
        // Mặc định gửi '[]' nếu không có variants
        variants: variantsInput.value
      };

      const url = fd.get("id") ? `${apiProduct}/${fd.get("id")}` : apiProduct;
      const method = fd.get("id") ? "PUT" : "POST";

      console.log('Submitting product:', payload);

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Save failed (${res.status}): ${errorText}`);
      }

      showToast('Lưu sản phẩm thành công', 'success');
      setTimeout(() => {
        window.location.href = "/admin/products";
      }, 1000);

    } catch (err) {
      console.error("Lỗi lưu sản phẩm:", err);
      showToast('Lỗi lưu sản phẩm: ' + err.message, 'error');
    }
  });

  console.log('Product form initialized successfully');
}

function initCategoryForm() {
  const form = document.getElementById("categoryForm");
  if (!form) return;

  const imageFile = document.getElementById("imageFile");
  const imagePreview = document.getElementById("imagePreview");
  const imageUrlInput = document.getElementById("imageUrl");
  const imageSourceSelect = document.getElementById("imageSourceSelect");
  const imageLink = document.getElementById("imageLink");
  const imageFileGroup = document.getElementById("imageFileGroup");
  const imageLinkGroup = document.getElementById("imageLinkGroup");

  if (imageFile && imagePreview) {
    imageFile.addEventListener('change', () => {
      const file = imageFile.files[0];
      if (file) {
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.display = 'block';
      }
    });
  }

  if (imageLink) {
    imageLink.addEventListener('input', () => {
      if (imageLink.value) {
        imagePreview.src = imageLink.value;
        imagePreview.style.display = 'block';
      }
    });
  }

  if (imageSourceSelect && imageFileGroup && imageLinkGroup) {
    imageSourceSelect.addEventListener('change', () => {
      const mode = imageSourceSelect.value;
      if (mode === 'link') {
        imageFileGroup.style.display = 'none';
        imageLinkGroup.style.display = 'block';
      } else {
        imageFileGroup.style.display = 'block';
        imageLinkGroup.style.display = 'none';
      }
    });
  }

  if (imageUrlInput && imageUrlInput.value) {
    if (imageSourceSelect) imageSourceSelect.value = 'link';
    if (imageFileGroup) imageFileGroup.style.display = 'none';
    if (imageLinkGroup) imageLinkGroup.style.display = 'block';
    if (imageLink) imageLink.value = imageUrlInput.value;
    if (imagePreview) {
      imagePreview.src = imageUrlInput.value;
      imagePreview.style.display = 'block';
    }
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      description: fd.get("description") || ""
    };
    const id = fd.get("id");

    let imageUrl = imageUrlInput ? imageUrlInput.value : '';
    if (imageSourceSelect && imageSourceSelect.value === 'link') {
      imageUrl = imageLink ? imageLink.value.trim() : '';
    } else if (imageFile && imageFile.files[0]) {
      const fdImg = new FormData();
      fdImg.append('image', imageFile.files[0]);
      try {
        const upRes = await fetch(`${apiCategory}/upload`, {
          method: 'POST',
          body: fdImg
        });
        if (upRes.ok) {
          const data = await upRes.json();
          imageUrl = data.url;
        }
      } catch (err) {
        console.error('Upload image error:', err);
        showToast('Lỗi upload ảnh', 'error');
      }
    }
    if (imageUrl) payload.image = imageUrl;

    const url = id ? `${apiCategory}/${id}` : apiCategory;
    const method = id ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`Save failed (${res.status})`);

      showToast('Lưu danh mục thành công', 'success');
      setTimeout(() => {
        window.location.href = "/admin/categories";
      }, 1000);
    } catch (err) {
      console.error("Lỗi lưu danh mục:", err);
      showToast('Lỗi lưu danh mục', 'error');
    }
  });
}

/**
 * Initialize Excel upload for products
 */
function initExcelUpload() {
  const input = document.getElementById('excelFile');
  if (!input) return;

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;

    const fd = new FormData();
    fd.append('file', input.files[0]);

    try {
      const res = await fetch(`${apiProduct}/upload-excel`, {
        method: 'POST',
        body: fd
      });

      if (!res.ok) throw new Error(`Upload failed (${res.status})`);

      const data = await res.json();
      currentPage = 1;
      hasMore = true;
      fetchProducts(1);
      alert(`Đã nhập ${data.imported} sản phẩm\nLỗi: ${data.failed}`);
      showToast('Tải lên thành công', 'success');
    } catch (err) {
      console.error('Excel upload error:', err);
      showToast('Tải lên thất bại', 'error');
    } finally {
      input.value = '';
    }
  });
}

/**
 * Initialize Excel export for products
 */
function initExcelExport() {
  const btn = document.getElementById('excelExportBtn');
  if (!btn) return;

  btn.addEventListener('click', async e => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiProduct}/export-excel`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Xuất Excel thành công', 'success');
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('Xuất Excel thất bại', 'error');
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
        fetchProducts(currentPage + 1, productQuery);
      }
    });
  }, {
    root: null,
    rootMargin: "200px",
    threshold: 0
  });

  observer.observe(sentinel);
}

// DOM ready: init modules
document.addEventListener("DOMContentLoaded", () => {
  console.log('Admin JS DOM loaded');

  // Prevent multiple initialization
  if (window.adminConfig.initialized) {
    console.log('Admin already initialized, skipping...');
    return;
  }
  window.adminConfig.initialized = true;

  // Products
  if (document.getElementById("productTable")) {
    initProductScroll();
    fetchProducts(1);
    initExcelUpload();
    initExcelExport();

    const search = document.getElementById('searchInput');
    if (search) {
      search.addEventListener('input', () => {
        productQuery = search.value.trim();
        currentPage = 1;
        hasMore = true;
        fetchProducts(1, productQuery);
      });
    }
  }

  // Users
  // (page-specific scripts handle fetching users)

  // Categories
  // (page-specific scripts handle fetching categories)

  // Forms
  if (document.getElementById("productForm")) initProductForm();
  if (document.getElementById("categoryForm")) initCategoryForm();

  // Responsive menu
  const menuBtn = document.getElementById('menuBtn');
  const mainNav = document.getElementById('mainNav');
  if (menuBtn && mainNav) {
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      mainNav.classList.toggle('active');
    });

    document.addEventListener('click', function (e) {
      if (
        window.innerWidth < 900 &&
        !mainNav.contains(e.target) &&
        e.target !== menuBtn &&
        !menuBtn.contains(e.target)
      ) {
        mainNav.classList.remove('active');
      }
    });
  }
});