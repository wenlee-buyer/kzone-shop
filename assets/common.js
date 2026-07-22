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

// 上傳短影片到 Cloudinary（resource_type=video），回傳網址。不加浮水印，也不做裁切。
async function uploadVideoToStorage(file, pathPrefix = 'products') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `kzone/${pathPrefix}`);
  formData.append('resource_type', 'video');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Cloudinary 影片上傳失敗:', errText);
    throw new Error('影片上傳失敗，請稍後再試');
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
    ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `${icon('photo', 30)}`;
  const soldOut = isProductSoldOut(product);
  const soldOutOverlay = soldOut ? `<div class="sold-out-overlay">已售完</div>` : '';
  const priceInfo = getDisplayPriceInfo(product);

  // 判斷是否為14天內新上架（顯示NEW緞帶）
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const createdAt = product.createdAt?.toDate ? product.createdAt.toDate().getTime() : null;
  const isNew = createdAt !== null && createdAt >= fourteenDaysAgo;
  const newRibbon = isNew && !soldOut ? `<div class="new-ribbon"></div>` : '';
  const videoBadge = product.video ? `<span class="pbadge" style="left:5px; right:auto; top:auto; bottom:5px; background:rgba(0,0,0,0.6)">${icon('video', 12)} 影片</span>` : '';

  return `
    <div class="pcard ${soldOut ? 'pcard-soldout' : ''}" data-id="${product.id}" ${soldOut ? '' : `onclick="goToProduct('${product.id}')"`}>
      <div class="pimg">
        ${imgHtml}
        <span class="${badgeClass}">${badgeText}</span>
        ${videoBadge}
        ${soldOutOverlay}
        ${newRibbon}
      </div>
      <div class="pinfo">
        <div class="pname">${escapeHtml(product.name)}</div>
        <div class="psrc">${escapeHtml(product.categoryName || '')}</div>
        <div class="pprice" style="${soldOut ? 'color:var(--c-rose-text); text-decoration:line-through' : ''}">${priceInfo.isRange ? formatPrice(priceInfo.price) + ' 起' : formatPrice(priceInfo.price)}</div>
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

// ---- 外部連結網址正規化 ----
// 後台填 LINE 官方帳號/社群連結時，如果忘記打 https:// （例如只填 lin.ee/xxx 或 line.me/ti/p/xxx），
// 瀏覽器會把它當成「目前網站底下的相對路徑」，點了完全不會跳轉、也不會報錯，客人只會覺得按鈕沒反應。
// 這裡統一補上協定，讓連結一定能正確導向外部網站。
function normalizeExternalUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // 已經有協定（https:, line:, tel:...），原樣使用
  return 'https://' + trimmed;
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

// ---- 「最新上架」與排序共用邏輯（index.html / products.html 共用，避免重複實作）----
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// 商品是否為14天內新上架
function isNewProduct(product) {
  const createdAt = product.createdAt?.toDate ? product.createdAt.toDate().getTime() : null;
  return createdAt !== null && createdAt >= (Date.now() - FOURTEEN_DAYS_MS);
}

// 從商品清單中篩出「最新上架」商品，並依上架時間新到舊排序
function filterAndSortNewProducts(products) {
  return products
    .filter(isNewProduct)
    .sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return tb - ta;
    });
}

// 取得商品在「某個分類」底下要用的排序值：
// 同一個商品可能掛在多個分類，每個分類要能各自獨立調整順序，
// 所以優先看 sortOrderByCategory[categoryId]（後台在該分類底下拖拉調整的值），
// 沒有設定過的話（例如舊資料、或還沒在這個分類拖拉過）就退回共用的 sortOrder。
// categoryId 為 null/undefined 時（例如首頁「全部」精選區塊），一律用共用的 sortOrder。
function getCategorySortOrder(product, categoryId) {
  if (categoryId && product.sortOrderByCategory && product.sortOrderByCategory[categoryId] !== undefined) {
    return product.sortOrderByCategory[categoryId];
  }
  return product.sortOrder ?? 9999;
}

// 一般分類/全部商品的共用排序：依排序值排序，售完商品強制排到最後
// categoryId 有給的話（例如正在看某個分類的商品列表），會優先採用該分類專屬的排序值
function sortBySortOrderSoldOutLast(products, categoryId) {
  return products.slice().sort((a, b) => {
    const aSoldOut = isProductSoldOut(a) ? 1 : 0;
    const bSoldOut = isProductSoldOut(b) ? 1 : 0;
    if (aSoldOut !== bSoldOut) return aSoldOut - bSoldOut;
    return getCategorySortOrder(a, categoryId) - getCategorySortOrder(b, categoryId);
  });
}

// ---- 款式資料正規化（相容舊格式：純字串陣列 → 新格式：{name, stock, price}物件陣列）----
// price 是選填的「這個款式專屬的價格」，沒設定（null/undefined）就是跟商品共用同一個 price
function normalizeStyles(styles) {
  if (!styles || !Array.isArray(styles)) return [];
  return styles.map(s => {
    if (typeof s === 'string') return { name: s, stock: null, price: null };
    return { name: s.name || '', stock: s.stock ?? null, price: s.price ?? null };
  }).filter(s => s.name);
}

// 取得指定款式（或無款式商品本身）實際要收的價格：
// 款式有自己的 price 就用款式的，沒有就退回商品共用的 price
function getStylePrice(product, styleName) {
  const styles = normalizeStyles(product.styles);
  if (styles.length > 0 && styleName) {
    const style = styles.find(s => s.name === styleName);
    if (style && style.price !== null && style.price !== undefined) return style.price;
  }
  return product.price;
}

// 取得商品在商品卡/列表上要顯示的價格資訊：
// 如果各款式價格都一樣（或沒有款式），回傳單一價格；
// 如果款式價格不同，回傳最低價，並標記 isRange，前台顯示可以加上「起」字樣
function getDisplayPriceInfo(product) {
  const styles = normalizeStyles(product.styles);
  const stylePrices = styles
    .map(s => (s.price !== null && s.price !== undefined) ? s.price : product.price)
    .filter(p => p !== null && p !== undefined);

  if (stylePrices.length === 0) {
    return { price: product.price, isRange: false };
  }
  const min = Math.min(...stylePrices);
  const max = Math.max(...stylePrices);
  return { price: min, isRange: min !== max };
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

// ---- 結帳時扣減庫存（用 Transaction 確保多人同時下單不會扣錯，且不會超賣）----
// cartItems: [{ productId, style, qty, name }]
// 若庫存不足，會 throw StockInsufficientError（交易自動 rollback，不會扣到一半）
class StockInsufficientError extends Error {
  constructor(problems) {
    super('庫存不足，無法完成結帳');
    this.name = 'StockInsufficientError';
    this.problems = problems; // 陣列，內容為造成問題的商品說明文字
  }
}

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

    // 先用交易內讀到的「最新」資料完整檢查一輪，任何一項不夠就整筆中止（rollback），
    // 避免同時有多筆結帳時，先前的 validateCartStock 預檢查結果已經過期
    const problems = [];
    for (const item of cartItems) {
      const entry = productDocs[item.productId];
      if (!entry) continue;
      const data = entry.data;

      if (data.styles && data.styles.length > 0) {
        const styleIdx = data.styles.findIndex(s => s.name === item.style);
        if (styleIdx === -1) continue;
        const stock = data.styles[styleIdx].stock;
        if (stock !== null && stock !== undefined && item.qty > stock) {
          problems.push(`「${item.name}${item.style ? '（'+item.style+'）' : ''}」庫存剩 ${stock} 件，但訂購了 ${item.qty} 件`);
        }
      } else if (data.stock !== null && data.stock !== undefined && item.qty > data.stock) {
        problems.push(`「${item.name}」庫存剩 ${data.stock} 件，但訂購了 ${item.qty} 件`);
      }
    }
    if (problems.length > 0) {
      throw new StockInsufficientError(problems);
    }

    for (const item of cartItems) {
      const entry = productDocs[item.productId];
      if (!entry) continue;
      const data = entry.data;

      if (data.styles && data.styles.length > 0) {
        const styleIdx = data.styles.findIndex(s => s.name === item.style);
        if (styleIdx !== -1 && data.styles[styleIdx].stock !== null && data.styles[styleIdx].stock !== undefined) {
          data.styles[styleIdx].stock = data.styles[styleIdx].stock - item.qty;
        }
      } else if (data.stock !== null && data.stock !== undefined) {
        data.stock = data.stock - item.qty;
      }
    }

    for (const pid of productIds) {
      const entry = productDocs[pid];
      if (entry) tx.update(entry.ref, { styles: entry.data.styles || [], stock: entry.data.stock ?? null });
    }
  });
}

// ---- 產生訂單編號（給客人截圖對照用，非資料庫 doc id）----
function genOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000); // 4碼隨機數字
  return `K${ymd}${rand}`;
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
