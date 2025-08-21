document.addEventListener('DOMContentLoaded', function () {
  const tableBody = document.querySelector('#voucherTable tbody');
  const modal = document.getElementById('voucherModal');
  const form = document.getElementById('voucherForm');
  const addBtn = document.getElementById('addVoucherBtn');
  let editingId = null;

  function fetchVouchers() {
    fetch('/vouchers')
      .then(res => res.json())
      .then(data => {
        tableBody.innerHTML = '';
        data.vouchers.forEach(v => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${v.code}</td>
            <td>${v.discount_type}</td>
            <td>${v.discount_value}</td>
            <td>${v.quantity}</td>
            <td>${v.apply_for}</td>
            <td>${v.start_date ? new Date(v.start_date).toLocaleDateString() : ''}</td>
            <td>${v.end_date ? new Date(v.end_date).toLocaleDateString() : ''}</td>
            <td>
              <button onclick="editVoucher('${v._id}')">Sửa</button>
              <button onclick="deleteVoucher('${v._id}')">Xóa</button>
            </td>
          `;
          tableBody.appendChild(tr);
        });
      });
  }

  window.editVoucher = function (id) {
    fetch('/vouchers/' + id)
      .then(res => res.json())
      .then(v => {
        editingId = v._id;
        form.code.value = v.code;
        form.discount_type.value = v.discount_type;
        form.discount_value.value = v.discount_value;
        form.quantity.value = v.quantity;
        form.apply_for.value = v.apply_for;
        form.start_date.value = v.start_date ? v.start_date.substr(0, 10) : '';
        form.end_date.value = v.end_date ? v.end_date.substr(0, 10) : '';
        modal.style.display = 'block';
        document.getElementById('modalTitle').innerText = 'Sửa Voucher';
      });
  };

  window.deleteVoucher = function (id) {
    if (confirm('Xóa voucher này?')) {
      fetch('/vouchers/' + id, { method: 'DELETE' })
        .then(res => res.json())
        .then(() => fetchVouchers());
    }
  };

  addBtn.onclick = function () {
    editingId = null;
    form.reset();
    modal.style.display = 'block';
    document.getElementById('modalTitle').innerText = 'Thêm Voucher';
  };

  form.onsubmit = function (e) {
    e.preventDefault();
    const data = {
      code: form.code.value,
      discount_type: form.discount_type.value,
      discount_value: form.discount_value.value,
      quantity: form.quantity.value,
      apply_for: form.apply_for.value,
      start_date: form.start_date.value,
      end_date: form.end_date.value
    };
    let url = '/vouchers', method = 'POST';
    if (editingId) {
      url += '/' + editingId;
      method = 'PUT';
    }
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json())
      .then(() => {
        modal.style.display = 'none';
        fetchVouchers();
      });
  };

  window.closeModal = function () {
    modal.style.display = 'none';
  };

  fetchVouchers();
});