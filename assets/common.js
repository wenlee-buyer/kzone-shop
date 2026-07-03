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
        ctx.globalAlpha = 0.12;
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

// ============================================
// 圖片上傳改用 Cloudinary（免費額度大、不依賴 Firebase Storage 計費）
// 共用同一個帳號的 unsigned preset，但用資料夾路徑做區隔，
// 不會跟原本訂單系統(proxy-tool)的圖片混在一起
// ============================================
const CLOUDINARY_CLOUD_NAME = 'dkuseooqg';
const CLOUDINARY_UPLOAD_PRESET = 'proxy_upload';

// 上傳圖片到 Cloudinary，回傳網址（注意：Firestore 只存網址，不存圖片本身）
async function uploadImageToStorage(blob, pathPrefix = 'products') {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `kzone/${pathPrefix}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Cloudinary 上傳失敗:', errText);
    throw new Error('圖片上傳失敗，請稍後再試');
  }

  const data = await response.json();
  return data.secure_url;
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
    : `${icon('photo', 30)}`;
  const soldOut = isProductSoldOut(product);
  const soldOutOverlay = soldOut ? `<div class="sold-out-overlay">已售完</div>` : '';

  // 判斷是否為14天內新上架（顯示NEW緞帶）
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const createdAt = product.createdAt?.toDate ? product.createdAt.toDate().getTime() : null;
  const isNew = createdAt !== null && createdAt >= fourteenDaysAgo;
  const newRibbon = isNew && !soldOut ? `<div class="new-ribbon">NEW</div>` : '';

  return `
    <div class="pcard" data-id="${product.id}" onclick="goToProduct('${product.id}')">
      <div class="pimg">
        ${imgHtml}
        <span class="${badgeClass}">${badgeText}</span>
        ${soldOutOverlay}
        ${newRibbon}
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

// ---- 款式資料正規化（相容舊格式：純字串陣列 → 新格式：{name, stock}物件陣列）----
function normalizeStyles(styles) {
  if (!styles || !Array.isArray(styles)) return [];
  return styles.map(s => {
    if (typeof s === 'string') return { name: s, stock: null };
    return { name: s.name || '', stock: s.stock ?? null };
  }).filter(s => s.name);
}

// ---- 庫存/售完判斷共用邏輯 ----
// 商品本身是否完全售完（所有款式都賣完，或無款式商品本身庫存為0）
function isProductSoldOut(product) {
  const styles = normalizeStyles(product.styles);
  if (styles.length > 0) {
    return styles.every(s => s.stock !== null && s.stock !== undefined && s.stock <= 0);
  }
  if (product.stock === null || product.stock === undefined) return false; // 不限制庫存
  return product.stock <= 0;
}

// 指定款式（或無款式商品本身）是否售完
function isStyleSoldOut(product, styleName) {
  const styles = normalizeStyles(product.styles);
  if (styles.length > 0) {
    const style = styles.find(s => s.name === styleName);
    if (!style) return false;
    return style.stock !== null && style.stock !== undefined && style.stock <= 0;
  }
  if (product.stock === null || product.stock === undefined) return false;
  return product.stock <= 0;
}

// 取得指定款式（或無款式商品）目前剩餘庫存，null 表示不限制
function getAvailableStock(product, styleName) {
  const styles = normalizeStyles(product.styles);
  if (styles.length > 0) {
    const style = styles.find(s => s.name === styleName);
    return style ? style.stock : null;
  }
  return product.stock;
}

// ---- 結帳時扣減庫存（用 Transaction 確保多人同時下單不會扣錯）----
// cartItems: [{ productId, style, qty, name }]
async function deductStockForOrder(cartItems) {
  // 同一個商品在購物車可能出現多次（不同款式），先依商品分組減少讀取次數
  const productIds = [...new Set(cartItems.map(i => i.productId))];

  await db.runTransaction(async (tx) => {
    const productDocs = {};
    for (const pid of productIds) {
      const ref = db.collection(COL.PRODUCTS).doc(pid);
      const doc = await tx.get(ref);
      if (doc.exists) productDocs[pid] = { ref, data: doc.data() };
    }

    for (const pid of productIds) {
      const entry = productDocs[pid];
      if (entry) {
        entry.data.styles = normalizeStyles(entry.data.styles);
      }
    }

    for (const item of cartItems) {
      const entry = productDocs[item.productId];
      if (!entry) continue;
      const data = entry.data;

      if (data.styles && data.styles.length > 0) {
        const styleIdx = data.styles.findIndex(s => s.name === item.style);
        if (styleIdx !== -1 && data.styles[styleIdx].stock !== null && data.styles[styleIdx].stock !== undefined) {
          data.styles[styleIdx].stock = Math.max(0, data.styles[styleIdx].stock - item.qty);
        }
      } else if (data.stock !== null && data.stock !== undefined) {
        data.stock = Math.max(0, data.stock - item.qty);
      }
    }

    for (const pid of productIds) {
      const entry = productDocs[pid];
      if (entry) tx.update(entry.ref, { styles: entry.data.styles || [], stock: entry.data.stock ?? null });
    }
  });
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
