// BannerManager.js

const BannerManager = {
  // API endpoints
  UPLOAD_API: '/banners/upload',
  BANNER_API: '/banners',
  currentId: null,

  // Initialize: tải banner và gắn event
  init() {
    this.loadBanners();
    this.setupEventListeners();
  },

  // Nếu là URL đầy đủ trả về nguyên, ngược lại prepend "/"
  getFullImageUrl(imageUrl) {
    if (!imageUrl)
      return '/images/placeholder.jpg';
    if (/^https?:\/\//.test(imageUrl))
      return imageUrl;
    return imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl;
  },


  // Escape HTML để tránh XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Load danh sách banner từ server và render
  async loadBanners() {
    const container = document.getElementById('bannerList');
    try {
      console.log('🔄 Đang tải banner từ:', this.BANNER_API);
      const res = await fetch(this.BANNER_API);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const list = await res.json();
      console.log('📊 Banner data:', list);

      if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = `
          <div class="col-12 text-center">
            <div class="alert alert-info">
              <i class="bi bi-info-circle me-2"></i>
              Chưa có banner nào. Nhấn "Thêm Banner" để tạo banner đầu tiên.
            </div>
          </div>`;
        return;
      }

      container.innerHTML = '';
      list.forEach(banner => {
        const col = document.createElement('div');
        col.className = 'col-md-4';

        const fullImageUrl = this.getFullImageUrl(banner.imageUrl);
        const title = this.escapeHtml(banner.title || 'Không có tiêu đề');
        const content = this.escapeHtml(banner.content || '');
        const createdDate = new Date(banner.createdAt).toLocaleDateString('vi-VN');

        col.innerHTML = `
          <div class="card shadow-sm banner-card" style="border: 2px red">
            <img src="${fullImageUrl}"
                 class="card-img-top"
                 alt="${title}"
                 onerror="this.src='/images/placeholder.jpg'">
            <div class="card-body d-flex flex-column">
              <h5 class="card-title">${title}</h5>
              <small class="text-muted d-block mb-2">${createdDate}</small>
              <p class="card-text flex-grow-1">${content}</p>
                <div class="btn-group mt-auto" role="group">
                  <button class="btn btn-sm btn-outline-primary"
                          onclick="BannerManager.previewBanner('${fullImageUrl}', '${title}')"
                          title="Xem trước">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-secondary"
                          onclick="BannerManager.editBanner('${banner._id}')"
                          title="Sửa">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger"
                          onclick="BannerManager.deleteBanner('${banner._id}')"
                          title="Xóa">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
            </div>
          </div>`;
        container.appendChild(col);
      });
    } catch (err) {
      console.error('Lỗi khi tải banner:', err);
      container.innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">
            <i class="bi bi-exclamation-triangle me-2"></i>
            Lỗi khi tải banner: ${err.message}
            <br><small>Vui lòng kiểm tra kết nối mạng và server backend.</small>
          </div>
        </div>`;
    }
  },

  // Gắn sự kiện cho form, file input, modal
  setupEventListeners() {
    const form = document.getElementById('bannerForm');
    form.addEventListener('submit', e => this.handleSubmit(e));

    const fileInput = document.getElementById('bannerFile');
    fileInput.addEventListener('change', e => this.validateFile(e));

    const modalEl = document.getElementById('addBannerModal');
    modalEl.addEventListener('hidden.bs.modal', () => {
      form.reset();
      this.clearErrors();
      this.currentId = null;
      document.getElementById('previewCurrent').classList.add('d-none');
      document.getElementById('bannerFile').required = true;
      document.getElementById('addBannerModalLabel').textContent = 'Thêm Banner';
    });
  },

  // Validate file về size và type
  validateFile(event) {
    const file = event.target.files[0];
    const errorDiv = document.getElementById('fileError');
    if (!file) {
      errorDiv.textContent = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      errorDiv.textContent = 'File quá lớn! Vui lòng chọn file nhỏ hơn 5MB.';
      event.target.value = '';
    } else if (!file.type.startsWith('image/')) {
      errorDiv.textContent = 'Vui lòng chọn file hình ảnh.';
      event.target.value = '';
    } else {
      errorDiv.textContent = '';
    }
  },

  clearErrors() {
    document.getElementById('titleError').textContent = '';
    document.getElementById('fileError').textContent = '';
  },

  // Xử lý submit tạo/sửa banner
  async handleSubmit(e) {
    e.preventDefault();
    this.clearErrors();

    const title = document.getElementById('bannerTitle').value.trim();
    const content = document.getElementById('bannerContent').value.trim();
    const file = document.getElementById('bannerFile').files[0];
    const isEdit = !!this.currentId;
    let hasError = false;

    if (!title) {
      document.getElementById('titleError').textContent = 'Vui lòng nhập tiêu đề.';
      hasError = true;
    }
    if (!file && !isEdit) {
      document.getElementById('fileError').textContent = 'Vui lòng chọn file hình ảnh.';
      hasError = true;
    }
    if (hasError) return;

    const submitBtn = document.getElementById('submitBtn');
    const spinner = document.getElementById('submitSpinner');
    submitBtn.disabled = true;
    spinner.classList.remove('d-none');

    try {
      let imageUrl = '';
      if (file) {
        const formData = new FormData();
        formData.append('image', file);
        const uploadRes = await fetch(this.UPLOAD_API, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
        const data = await uploadRes.json();
        imageUrl = data.url;
      }

      if (isEdit) {
        const payload = { title, content };
        if (imageUrl) payload.imageUrl = imageUrl;
        const updateRes = await fetch(`${this.BANNER_API}/${this.currentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!updateRes.ok) throw new Error(`Update failed: ${updateRes.status}`);
      } else {
        const createRes = await fetch(this.BANNER_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content, imageUrl })
        });
        if (!createRes.ok) throw new Error(`Create failed: ${createRes.status}`);
      }

      // Thành công: refresh list và đóng modal
      document.getElementById('bannerForm').reset();
      this.currentId = null;
      document.getElementById('bannerFile').required = true;
      document.getElementById('previewCurrent').classList.add('d-none');
      this.loadBanners();
      const bsModal = bootstrap.Modal.getInstance(document.getElementById('addBannerModal'));
      bsModal.hide();
      document.getElementById('addBannerModalLabel').textContent = 'Thêm Banner';
      this.showToast(isEdit ? 'Cập nhật banner thành công!' : 'Thêm banner thành công!', 'success');
    } catch (err) {
      console.error('Lỗi tạo banner:', err);
      this.showToast(`Lỗi tạo banner: ${err.message}`, 'danger');
    } finally {
      submitBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  },

  // Mở modal chỉnh sửa banner
  async editBanner(id) {
    try {
      const res = await fetch(`${this.BANNER_API}/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const banner = await res.json();
      document.getElementById('bannerTitle').value = banner.title || '';
      document.getElementById('bannerContent').value = banner.content || '';
      const preview = document.getElementById('previewCurrent');
      preview.src = this.getFullImageUrl(banner.imageUrl);
      preview.classList.remove('d-none');
      document.getElementById('bannerFile').required = false;
      document.getElementById('addBannerModalLabel').textContent = 'Sửa Banner';
      this.currentId = id;
      new bootstrap.Modal(document.getElementById('addBannerModal')).show();
    } catch (err) {
      console.error('Lỗi tải banner:', err);
      this.showToast('Không thể tải banner', 'danger');
    }
  },

  // Hiển thị modal xem trước
  previewBanner(imageUrl, title) {
    const modal = document.getElementById('bannerPreviewModal');
    document.getElementById('previewImage').src = imageUrl;
    document.getElementById('previewTitle').textContent = title;
    new bootstrap.Modal(modal).show();
  },

  // Xóa banner
  async deleteBanner(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa banner này?')) return;
    try {
      const res = await fetch(`${this.BANNER_API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      this.loadBanners();
      this.showToast('Xóa banner thành công!', 'success');
    } catch (err) {
      console.error('Lỗi xóa banner:', err);
      this.showToast('Không thể xóa banner', 'danger');
    }
  },

  // Tạo và hiển thị Bootstrap toast
  showToast(message, type = 'info') {
    // Tạo container nếu chưa có
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container position-fixed top-0 end-0 p-3';
      document.body.appendChild(container);
    }

    // Tạo toast element
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;

    container.appendChild(toastEl);
    new bootstrap.Toast(toastEl, { delay: 3000 }).show();
  }
};

// Khởi chạy khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', () => {
  BannerManager.init();
});
