const apiProduct = '/product';
const apiTskt    = '/tsktproducts';
let variantsContainer;

async function loadSpecsAndVariants(
  catId,
  specContainer,
  variantsContainer,
  existingVariants = {}
) {
  specContainer.innerHTML = '';
  variantsContainer.innerHTML = '';
  if (!catId) return;
  try {
    let res = await fetch(`${apiTskt}/filters/${catId}`);
    if (!res.ok) {
      // fallback to legacy endpoint
      res = await fetch(`${apiTskt}/category/${catId}`);
    }
    const data = await res.json();
    let specs = [];
    let variantOpts = [];
    if (Array.isArray(data.specs)) {
      specs = data.specs;
      variantOpts = Array.isArray(data.variantOptions) ? data.variantOptions : [];
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
    specs.forEach(name => {
      const div = document.createElement('div');
      div.className = 'spec-item';
      div.innerHTML = `<label>${name}</label><input type="text" name="specs[${name}]" placeholder="Nhập ${name}" />`;
      specContainer.appendChild(div);
    });
    renderVariantOptions(variantOpts, variantsContainer, existingVariants);
  } catch (err) {
    console.error('Load specs/variants error:', err);
  }
}

function renderVariantOptions(list, container, existing) {
  container.innerHTML = '';
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
      if (existing && Array.isArray(existing[opt.name]) && existing[opt.name].includes(val)) {
        o.selected = true;
      }
      select.appendChild(o);
    });
    div.appendChild(label);
    div.appendChild(select);
    container.appendChild(div);
    used.add(opt.name);
  });

  // render existing variants that are not in template as custom rows
  if (existing) {
    Object.keys(existing).forEach(k => {
      if (!used.has(k)) {
        addCustomVariantRow(k, existing[k].join(', '));
      }
    });
  }
}

function addCustomVariantRow(name = '', values = '') {
  const div = document.createElement('div');
  div.className = 'spec-item variant-custom';
  div.innerHTML = `<input type="text" class="form-control variant-name" placeholder="Tên biến thể" value="${name}">
                    <input type="text" class="form-control variant-values" placeholder="Giá trị (cách nhau bằng dấu phẩy)" value="${values}">
                    <button type="button" class="btn btn-sm btn-danger remove-variant"><i class="fas fa-times"></i></button>`;
  div.querySelector('.remove-variant').addEventListener('click', () => div.remove());
  variantsContainer.appendChild(div);
}

document.addEventListener('DOMContentLoaded', () => {
  const form           = document.getElementById('productForm');
  if (!form) return;
  const categorySelect = document.getElementById('categorySelect');
  const specContainer  = document.getElementById('specContainer');
  variantsContainer = document.getElementById('variantsContainer');
  const variantsInput     = document.getElementById('variantsInput');
  const brandSelect    = document.getElementById('brandSpinner');
  const addVariantBtn = document.getElementById('addVariantBtn');
  const descInput      = document.getElementById('descriptionInput');
  const descEditorEl   = document.getElementById('descriptionEditor');
  const imageFile      = document.getElementById('imageFile');
  const imagePreview   = document.getElementById('imagePreview');
  const imageUrlInput  = document.getElementById('imageUrl');
  let quill;
  quill = new Quill(descEditorEl, { theme: 'snow' });

  if (addVariantBtn) {
    addVariantBtn.addEventListener('click', () => addCustomVariantRow());
  }

  if (imageFile) {
    imageFile.addEventListener('change', () => {
      const file = imageFile.files[0];
      if (file) {
        imagePreview.src = URL.createObjectURL(file);
        imagePreview.style.display = '';
      }
    });
  }

  async function preload(id) {
    try {
      const res = await fetch(`${apiProduct}/${id}`);
      const prod = await res.json();
      form.querySelector('input[name="name"]').value  = prod.name;
      form.querySelector('input[name="price"]').value = prod.price;
      form.querySelector('input[name="stock"]').value = prod.stock;
      quill.root.innerHTML = prod.description || '';
      if (imagePreview) {
        imagePreview.src = prod.image || '';
        imagePreview.style.display = prod.image ? '' : 'none';
      }
      if (imageUrlInput) imageUrlInput.value = prod.image || '';
      categorySelect.value = prod.category_id._id;
      await loadSpecsAndVariants(prod.category_id._id, specContainer, variantsContainer, prod.variants || {});
      const specList = Array.isArray(prod.tskt) ? prod.tskt : prod.specifications || [];
      specList.forEach(spec => {
        const input = Array.from(specContainer.querySelectorAll('.spec-item input')).find(inp => inp.previousElementSibling.textContent === spec.key || inp.previousElementSibling.textContent === spec.label);
        if (input) input.value = spec.value;
      });
    } catch (err) {
      console.error('Preload product error:', err);
    }
  }

  categorySelect.addEventListener('change', () => {
    loadSpecsAndVariants(categorySelect.value, specContainer, variantsContainer);
  });
  if (brandSelect) {
    brandSelect.addEventListener('change', () => {
      loadSpecsAndVariants(categorySelect.value, specContainer, variantsContainer);
    });
  }

  if (form.dataset.mode === 'edit') {
    preload(form.dataset.id);
  } else if (categorySelect.value) {
    loadSpecsAndVariants(categorySelect.value, specContainer, variantsContainer);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    descInput.value = quill.root.innerHTML;

    const variantData = {};
    variantsContainer.querySelectorAll('select').forEach(sel => {
      const name = sel.dataset.name;
      const vals = Array.from(sel.selectedOptions).map(o => o.value);
      if (vals.length) variantData[name] = vals;
    });
    variantsContainer.querySelectorAll('.variant-custom').forEach(div => {
      const name = div.querySelector('.variant-name').value.trim();
      const vals = div.querySelector('.variant-values').value.split(',').map(v => v.trim()).filter(v => v);
      if (name && vals.length) variantData[name] = vals;
    });
    variantsInput.value = JSON.stringify(variantData);

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
      name        : fd.get('name'),
      category_id : fd.get('category_id'),
      brand_id    : fd.get('brand_id'),
      price       : parseFloat(fd.get('price')),
      stock       : parseInt(fd.get('stock')),
      image       : imageUrl,
      description : fd.get('description'),
      tskt: Array.from(specContainer.querySelectorAll('.spec-item input')).map(inp => ({ key: inp.previousElementSibling.textContent, value: inp.value })),
      variants: variantsInput.value
    };
    const url = fd.get('id') ? `${apiProduct}/${fd.get('id')}` : apiProduct;
    const method = fd.get('id') ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      window.location.href = '/admin/products';
    } catch (err) {
      console.error('Save product error:', err);
    }
  });
});
