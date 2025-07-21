const apiProduct = '/product';
const apiTskt    = '/tsktproducts';

async function loadSpecsAndVariants(catId, specContainer, variantsContainer, existingVariants = {}) {
  specContainer.innerHTML = '';
  variantsContainer.innerHTML = '';
  if (!catId) return;
  try {
    const res = await fetch(`${apiTskt}/filters/${catId}`);
    const data = await res.json();
    const specs = Array.isArray(data.specs) ? data.specs : [];
    const variantOpts = Array.isArray(data.variantOptions) ? data.variantOptions : [];
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
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const form           = document.getElementById('productForm');
  if (!form) return;
  const categorySelect = document.getElementById('categorySelect');
  const specContainer  = document.getElementById('specContainer');
  const variantsContainer = document.getElementById('variantsContainer');
  const variantsInput     = document.getElementById('variantsInput');
  const descInput      = document.getElementById('descriptionInput');
  const descEditorEl   = document.getElementById('descriptionEditor');
  const imageFile      = document.getElementById('imageFile');
  const imagePreview   = document.getElementById('imagePreview');
  const imageUrlInput  = document.getElementById('imageUrl');
  let quill;
  quill = new Quill(descEditorEl, { theme: 'snow' });

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
      prod.specifications.forEach(spec => {
        const input = Array.from(specContainer.querySelectorAll('.spec-item input')).find(inp => inp.previousElementSibling.textContent === spec.key);
        if (input) input.value = spec.value;
      });
    } catch (err) {
      console.error('Preload product error:', err);
    }
  }

  categorySelect.addEventListener('change', () => {
    loadSpecsAndVariants(categorySelect.value, specContainer, variantsContainer);
  });

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
      specifications: Array.from(specContainer.querySelectorAll('.spec-item input')).map(inp => ({ key: inp.previousElementSibling.textContent, value: inp.value })),
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
