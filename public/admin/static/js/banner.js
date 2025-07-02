    const UPLOAD_API = '/banners/upload';
    const BANNER_API = '/banners';

    // Load & hiển thị danh sách banner
    async function loadBanners() {
      console.log('[loadBanners] GET', BANNER_API);
      try {
        const res = await fetch(BANNER_API, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        console.log('[loadBanners] data:', list);

        const container = document.getElementById('bannerList');
        container.innerHTML = '';
        list.forEach(b => {
          const col = document.createElement('div');
          col.className = 'col-md-4';
          col.innerHTML = `
            <div class="card shadow-sm">
              <img src="${b.imageUrl}" class="card-img-top" alt="${b.title}">
              <div class="card-body text-center">
                <h5 class="card-title">${b.title}</h5>
                <p class="text-sm my-1">${b.content || ''}</p>
                <div class="btn-group" role="group">
                  <button class="btn btn-sm btn-outline-secondary"
                          onclick="previewBanner('${b.imageUrl}')">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger"
                          onclick="deleteBanner('${b._id}')">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>`;
          container.appendChild(col);
        });
      } catch (err) {
        console.error('[loadBanners] Lỗi:', err);
        alert('Lỗi khi tải banner. Xem console để biết chi tiết.');
      }
    }

    // Upload file & tạo record banner
    document.getElementById('bannerForm').addEventListener('submit', async e => {
      e.preventDefault();
      const title = document.getElementById('bannerTitle').value.trim();
      const content = document.getElementById('bannerContent')
        ? document.getElementById('bannerContent').value.trim()
        : '';
      const file  = document.getElementById('bannerFile').files[0];
      if (!file) return alert('Chưa chọn file.');

      try {
        // 1) Upload ảnh
        const fd = new FormData();
        fd.append('image', file);
        const upRes = await fetch(UPLOAD_API, { method: 'POST', body: fd });
        if (!upRes.ok) throw new Error(`Upload lỗi ${upRes.status}`);
        const { url } = await upRes.json();
        console.log('[upload] url:', url);

        // 2) Tạo banner record
        const createRes = await fetch(BANNER_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, imageUrl: url, content })
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Tạo banner lỗi: ${errText}`);
        }
        console.log('[create] success');

        // 3) Đóng modal & reload
        bootstrap.Modal.getInstance(document.getElementById('addBannerModal')).hide();
        e.target.reset();
        loadBanners();
      } catch (err) {
        console.error('[bannerForm] Lỗi:', err);
        alert(err.message);
      }
    });

    // Xóa banner
    async function deleteBanner(id) {
      if (!confirm('Chắc chắn xóa?')) return;
      try {
        const res = await fetch(`${BANNER_API}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        loadBanners();
      } catch (err) {
        console.error('[deleteBanner] Lỗi:', err);
        alert('Xóa banner thất bại.');
      }
    }

    // Xem trước
    function previewBanner(url) {
      document.getElementById('previewImage').src = url;
      new bootstrap.Modal(document.getElementById('bannerPreviewModal')).show();
    }

    document.addEventListener('DOMContentLoaded', loadBanners);