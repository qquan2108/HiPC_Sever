// Fetch latest banner and show popup on page load
async function fetchBanner() {
  try {
    const res = await fetch('/banners/latest');
    if (!res.ok) return;
    const banner = await res.json();
    if (!banner || !banner.imageUrl) return;
    showBannerPopup(banner);
  } catch (err) {
    console.error('Banner fetch error:', err);
  }
}

function showBannerPopup(banner) {
  const overlay = document.createElement('div');
  overlay.id = 'bannerOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded shadow-lg p-4 max-w-lg w-full relative">
      <button id="bannerClose" class="absolute top-2 right-2 text-gray-500">&times;</button>
      <h2 class="text-xl font-semibold mb-2">${banner.title || ''}</h2>
      <img src="${banner.imageUrl}" alt="banner" class="mb-2 w-full object-contain">
      <p class="mb-2">${banner.content || ''}</p>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('bannerClose').addEventListener('click', () => overlay.remove());
}

document.addEventListener('DOMContentLoaded', fetchBanner);
