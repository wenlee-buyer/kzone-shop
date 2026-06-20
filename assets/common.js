// ============================================
// K.Zone 共用元件函式
// ============================================

// ---- 浮水印處理（上傳照片時自動加上斜體多行半透明浮水印）----
function applyWatermark(file, watermarkText = 'k.zone.buying') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = w * ratio;
          h = h * ratio;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // 繪製斜體多行半透明浮水印
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.font = `italic 700 ${Math.max(14, w * 0.045)}px sans-serif`;
        ctx.textAlign = 'center';
        const angle = -25 * Math.PI / 180;
        const spacingY = Math.max(50, h * 0.16);
        const spacingX = Math.max(120, w * 0.35);

        ctx.translate(w / 2, h / 2);
        ctx.rotate(angle);

        const rangeY = Math.ceil((h * 1.5) / spacingY);
        const rangeX = Math.ceil((w * 1.5) / spacingX);

        for (let row = -rangeY; row <= rangeY; row++) {
          for (let col = -rangeX; col <= rangeX; col++) {
            const x = col * spacingX;
            const y = row * spacingY;
            ctx.fillText(watermarkText, x, y);
          }
        }
        ctx.restore();

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.88);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 將 blob 轉成可預覽的 dataURL
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// 上傳圖片到 Firebase Storage，回傳網址（注意：Firestore 只存網址，不存圖片本身）
async function uploadImageToStorage(blob, pathPrefix = 'products') {
  const storage = firebase.storage();
  const filename = `${pathPrefix}/${genId('img')}.jpg`;
  const ref = storage.ref().child(filename);
  await ref.put(blob);
  return await ref.getDownloadURL();
}

// ---- 處理剪貼簿貼上圖片（電腦版可直接 Ctrl+V）----
function setupPasteListener(targetElement, onImagePasted) {
  targetElement.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) onImagePasted(file);
      }
    }
  });
}

// ---- 商品卡片 HTML 產生器 ----
function renderProductCard(product, watermarkText) {
  const badgeClass = product.stockType === 'preorder' ? 'pbadge pre' : 'pbadge';
  const badgeText = product.stockType === 'preorder' ? '預購' : '現貨';
  const imgUrl = (product.images && product.images[0]) || '';
  const imgHtml = imgUrl
    ? `<img src="${imgUrl}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `<i class="ti ti-photo" style="font-size:30px;color:#e9cdae"></i>`;

  return `
    <div class="pcard" data-id="${product.id}" onclick="goToProduct('${product.id}')">
      <div class="pimg">
        ${imgHtml}
        <span class="${badgeClass}">${badgeText}</span>
      </div>
      <div class="pinfo">
        <div class="pname">${escapeHtml(product.name)}</div>
        <div class="psrc">${escapeHtml(product.categoryName || '')}</div>
        <div class="pprice">${formatPrice(product.price)}</div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function goToProduct(id) {
  window.location.href = `product.html?id=${id}`;
}

// ---- Toast 提示 ----
function showToast(msg, duration = 2200) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---- 更新購物車數字徽章（所有頁面共用）----
function refreshCartBadge() {
  const badges = document.querySelectorAll('.cart-badge');
  const count = getCartCount();
  badges.forEach(b => {
    b.textContent = count;
    b.style.display = count > 0 ? 'flex' : 'none';
  });
}
