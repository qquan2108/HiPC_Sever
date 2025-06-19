const API       = 'http://localhost:5000/product';
const CAT_API   = 'http://localhost:5000/category';
const BRAND_API = 'http://localhost:5000/brands';
const TSKT_API  = 'http://localhost:5000/tsktproducts';

// 3.1. List page: fetch & render
async function fetchProducts() {
  const list = await fetch(API).then(r=>r.json());
  const tb = document.getElementById('productTable');
  tb.innerHTML = '';
  list.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${p.image || ''}" style="max-width:50px" /></td>
      <td>${p.name}</td>
      <td>${p.price.toLocaleString()}₫</td>
      <td>${p.stock}</td>
      <td>
        <button onclick="editProduct('${p._id}')">Sửa</button>
        <button onclick="deleteProduct('${p._id}')">Xóa</button>
      </td>`;
    tb.appendChild(tr);
  });
}
window.fetchProducts = fetchProducts;

function editProduct(id) {
  location.href = `form.html?id=${id}`;
}

async function deleteProduct(id) {
  if (!confirm('Xóa sản phẩm này?')) return;
  await fetch(`${API}/${id}`, { method:'DELETE' });
  fetchProducts();
}

// 3.2. Form page: init & submit
async function initForm() {
  // load categories & brands
  const [cats, brands] = await Promise.all([
    fetch(CAT_API).then(r=>r.json()),
    fetch(BRAND_API).then(r=>r.json())
  ]);
  const catEl   = document.getElementById('categorySpinner');
  const brandEl = document.getElementById('brandSpinner');
  cats.forEach(c=>catEl.append(new Option(c.name,c._id)));
  brands.forEach(b=>brandEl.append(new Option(b.name,b._id)));

  // Nếu đã chọn sẵn danh mục (ví dụ khi edit), hoặc muốn tự động hiển thị specs cho danh mục đầu tiên:
  if (catEl.value) {
    catEl.dispatchEvent(new Event('change'));
  }

  // dynamic specs on category change
  const specCtn = document.getElementById('specContainer');
  catEl.addEventListener('change', async ()=>{
    specCtn.innerHTML = '';
    const cid = catEl.value;
    if (!cid) return;
    const temps = await fetch(`${TSKT_API}/category/${cid}`).then(r=>r.json());
    const keys = temps.flatMap(t=>t.value);
    keys.forEach(k=>{
      const div = document.createElement('div');
      div.innerHTML = `<label>${k}:<input name=\`specs[${k}]\` required /></label>`;
      specCtn.append(div);
    });
  });

  // if edit, load data
  const url = new URL(location);
  const id  = url.searchParams.get('id');
  if (id) {
    const p = await fetch(`${API}/${id}`).then(r=>r.json());
    document.querySelector('h1').textContent = 'Chỉnh sửa sản phẩm';
    document.querySelector('[name=id]').value = p._id;
    document.querySelector('[name=name]').value = p.name;
    // set price/stock/image/desc
    document.querySelector('[name=price]').value = p.price;
    document.querySelector('[name=stock]').value = p.stock;
    document.querySelector('[name=image]').value = p.image || '';
    document.querySelector('[name=description]').value = p.description;
    catEl.value   = p.category_id._id||p.category_id;
    brandEl.value = p.brand_id._id   ||p.brand_id;
    catEl.dispatchEvent(new Event('change'));
    setTimeout(()=>{
      (p.specifications||[]).forEach(s=>{
        const inp = specCtn.querySelector(`[name=\`specs[${s.key}]\`]`);
        if (inp) inp.value = s.value;
      });
    },200);
  }

  // form submit
  document.getElementById('productForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    for (let [k,v] of fd.entries()) body[k] = v;
    body.specifications = Object.entries(body)
      .filter(([k])=>k.startsWith('specs['))
      .map(([k,v])=>({ key:k.match(/\[(.*)\]/)[1], value:v }));
    delete body.id;
    Object.keys(body).filter(k=>k.startsWith('specs[')).forEach(k=>delete body[k]);

    const method = id ? 'PUT':'POST';
    const urlReq = id ? `${API}/${id}`:API;
    const res = await fetch(urlReq, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if (!res.ok) return alert('Lỗi!');
    location.href = 'index3.html';
  });

  // cancel button
  document.getElementById('cancelBtn').addEventListener('click', ()=>location.href='index3.html');
}
window.initForm = initForm;