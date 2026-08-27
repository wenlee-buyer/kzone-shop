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
  // 混合款式（有些現貨有些預購）的商品，卡片上統一顯示「現貨」徽章，實際狀態進商品頁看各款式
  const cardIsPreorder = !isMixedStockProduct(product) && productHasStockType(product, 'preorder') && !productHasStockType(product, 'instock');
  const badgeClass = cardIsPreorder ? 'pbadge pre' : 'pbadge';
  const badgeText = cardIsPreorder ? '預購' : '現貨';
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

// ---- 複製文字到剪貼簿（優先用 Clipboard API，某些較舊瀏覽器/非https環境不支援時退回傳統做法）----
// 用途：客人點「聯繫LINE官方小編」按鈕如果剛好被瀏覽器擋住跳轉（常見於Instagram/LINE本身的內建瀏覽器），
// 讓客人可以直接複製官方帳號ID，自己到LINE App裡搜尋加入，不需要依賴跳轉連結
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// 渲染「LINE按鈕點了沒反應時，長按複製官方帳號ID」的備援區塊。
// 頁面上要有一個 id="lineIdFallbackWrap" 的容器，這裡才會把內容塞進去；
// 沒設定 lineOfficialId（後台留空）時什麼都不顯示，不佔版面
function renderLineIdFallback(lineOfficialId) {
  const wrap = document.getElementById('lineIdFallbackWrap');
  if (!wrap) return;
  if (!lineOfficialId) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="line-id-fallback">
      按鈕沒反應？長按複製 LINE ID 手動搜尋加入：<span class="line-id-copy" id="lineIdCopyText">${escapeHtml(lineOfficialId)}</span>
    </div>
  `;
  document.getElementById('lineIdCopyText').addEventListener('click', async () => {
    const ok = await copyTextToClipboard(lineOfficialId);
    showToast(ok ? '已複製！請到 LINE 搜尋加入好友' : '複製失敗，請手動長按選取文字複製');
  });
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

// ---- 搜尋功能共用邏輯（首頁彈出搜尋框 → 導到 products.html?q=xxx 顯示結果）----
// 別名字典：客人習慣用的暱稱不一定等於商品名稱裡打的官方角色名，搜其中一個要能連帶搜到另一個
// 例如「粉豆」是玩家對「皮卡啾」的暱稱，之後有其他角色暱稱也可以直接加在這裡（雙向都會生效，不用重複寫兩次）
const SEARCH_SYNONYMS = [
  ['粉豆', '皮卡啾']
];

// 把搜尋關鍵字展開成「所有要一起比對的詞」：原本輸入的詞 + 別名字典裡有對應到的詞
function expandSearchTerms(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const terms = new Set([q]);
  SEARCH_SYNONYMS.forEach(group => {
    if (group.some(word => word.toLowerCase() === q)) {
      group.forEach(word => terms.add(word.toLowerCase()));
    }
  });
  return Array.from(terms);
}

// 判斷商品是否符合搜尋關鍵字：模糊比對商品名稱 + 所有款式名稱，任何一個詞有比對到就算符合
function productMatchesSearch(product, query) {
  const terms = expandSearchTerms(query);
  if (terms.length === 0) return true; // 沒輸入關鍵字時不篩選
  const name = (product.name || '').toLowerCase();
  const styleNames = normalizeStyles(product.styles).map(s => (s.name || '').toLowerCase());
  return terms.some(term => name.includes(term) || styleNames.some(sn => sn.includes(term)));
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

// ---- 款式資料正規化（相容舊格式：純字串陣列 → 新格式：{name, stock, price, stockType}物件陣列）----
// price 是選填的「這個款式專屬的價格」，沒設定（null/undefined）就是跟商品共用同一個 price
// stockType 是選填的「這個款式專屬的現貨/預購」，沒設定（''/null/undefined）就是跟商品共用同一個 stockType
function normalizeStyles(styles) {
  if (!styles || !Array.isArray(styles)) return [];
  return styles.map(s => {
    if (typeof s === 'string') return { name: s, stock: null, price: null, stockType: null };
    return { name: s.name || '', stock: s.stock ?? null, price: s.price ?? null, stockType: s.stockType || null };
  }).filter(s => s.name);
}

// 取得指定款式實際的現貨/預購狀態：款式自己有設定就用款式的，沒有就退回商品共用的 stockType（預設現貨）
function getStyleStockType(product, styleName) {
  const styles = normalizeStyles(product.styles);
  if (styles.length > 0 && styleName) {
    const style = styles.find(s => s.name === styleName);
    if (style && style.stockType) return style.stockType;
  }
  return product.stockType === 'preorder' ? 'preorder' : 'instock';
}

// 商品是否「混合款式」：同一個商品裡有些款式現貨、有些預購
function isMixedStockProduct(product) {
  const styles = normalizeStyles(product.styles);
  if (styles.length === 0) return false;
  const types = new Set(styles.map(s => getStyleStockType(product, s.name)));
  return types.size > 1;
}

// 商品是否「含有」某個現貨/預購狀態（用於列表篩選：只要有任何一個款式符合就算符合）
function productHasStockType(product, wantedType) {
  const styles = normalizeStyles(product.styles);
  if (styles.length === 0) {
    return (product.stockType === 'preorder' ? 'preorder' : 'instock') === wantedType;
  }
  return styles.some(s => getStyleStockType(product, s.name) === wantedType);
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

    // 先把購物車依「商品+款式」加總數量，再拿加總後的數量去比對庫存。
    // 一定要加總，不能逐行比對：同一個款式有可能在購物車裡變成兩行（例如加購流程把它拆開），
    // 逐行比對的話「剩2件、兩行各買2件」每行看起來都合法，結果通過檢查後扣成 -2 件，變成超賣。
    const wantedMap = {};
    for (const item of cartItems) {
      if (!productDocs[item.productId]) continue;
      const key = item.productId + '::' + (item.style || '');
      if (!wantedMap[key]) {
        wantedMap[key] = { productId: item.productId, style: item.style || '', name: item.name, qty: 0 };
      }
      wantedMap[key].qty += item.qty;
    }
    const wantedList = Object.values(wantedMap);

    // 用交易內讀到的「最新」資料完整檢查一輪，任何一項不夠就整筆中止（rollback），
    // 避免同時有多筆結帳時，先前的 validateCartStock 預檢查結果已經過期
    const problems = [];
    for (const want of wantedList) {
      const data = productDocs[want.productId].data;

      if (data.styles && data.styles.length > 0) {
        const styleIdx = data.styles.findIndex(s => s.name === want.style);
        if (styleIdx === -1) continue;
        const stock = data.styles[styleIdx].stock;
        if (stock !== null && stock !== undefined && want.qty > stock) {
          problems.push(`「${want.name}${want.style ? '（'+want.style+'）' : ''}」庫存剩 ${stock} 件，但訂購了 ${want.qty} 件`);
        }
      } else if (data.stock !== null && data.stock !== undefined && want.qty > data.stock) {
        problems.push(`「${want.name}」庫存剩 ${data.stock} 件，但訂購了 ${want.qty} 件`);
      }
    }
    if (problems.length > 0) {
      throw new StockInsufficientError(problems);
    }

    // 扣庫存也要用同一份「加總後」的清單，跟上面的檢查保持一致。
    // 如果這裡改回逐行扣，就會跟加總後的檢查結果對不起來（同款式兩行會被扣兩次）。
    for (const want of wantedList) {
      const data = productDocs[want.productId].data;

      if (data.styles && data.styles.length > 0) {
        const styleIdx = data.styles.findIndex(s => s.name === want.style);
        if (styleIdx !== -1 && data.styles[styleIdx].stock !== null && data.styles[styleIdx].stock !== undefined) {
          data.styles[styleIdx].stock = data.styles[styleIdx].stock - want.qty;
        }
      } else if (data.stock !== null && data.stock !== undefined) {
        data.stock = data.stock - want.qty;
      }
    }

    for (const pid of productIds) {
      const entry = productDocs[pid];
      if (entry) tx.update(entry.ref, { styles: entry.data.styles || [], stock: entry.data.stock ?? null });
    }
  });
}

// ---- 預購採購清單相關 ----

// 每個「商品+款式」在採購進度表裡的固定 doc id。
// 用固定 id（而不是自動 id + 兩個 where 條件查詢）是為了避免 Firestore 需要額外建立複合索引。
// 斜線在 Firestore 的 doc id 裡有特殊意義（會被當成路徑分隔），所以要換掉。
function purchaseDocId(productId, style) {
  return `${productId}__${(style || '').replace(/\//g, '-')}`;
}

// 判斷訂單裡的某一項當初是不是以「預購」賣出的。
// 一律只看下單當下寫進訂單的 stockType 快照，不去查商品現在的設定——
// 因為商品可能在客人下單之後被改成現貨，那筆訂單的採購需求依然存在，不能因此消失。
// 舊訂單（沒有這個欄位）退回用訂單層的 orderType 判斷：orderType==='line' 代表這張單含預購。
function isPreorderOrderItem(order, item) {
  if (item.stockType === 'preorder') return true;
  if (item.stockType === 'instock') return false;
  return order.orderType === 'line';
}

// 把「還沒出貨的預購訂單」彙總成採購需求清單。
// 只算未出貨的訂單：按下出貨代表貨已經到、也已經寄出，不該再出現在待採購清單裡。
// 回傳 [{ key, productId, style, name, needed, orders:[{orderNo, lineName, qty}] }]，依需求量多的排前面
function buildPurchaseDemand(orders) {
  const map = {};
  for (const order of orders) {
    if (order.shippedAt) continue;
    for (const item of (order.items || [])) {
      if (!isPreorderOrderItem(order, item)) continue;
      const key = purchaseDocId(item.productId, item.style);
      if (!map[key]) {
        map[key] = {
          key,
          productId: item.productId,
          style: item.style || '',
          name: item.name || '',
          needed: 0,
          orders: []
        };
      }
      map[key].needed += (item.qty || 0);
      map[key].orders.push({
        orderNo: order.orderNo || '',
        lineName: order.lineName || '',
        qty: item.qty || 0
      });
    }
  }
  return Object.values(map).sort((a, b) => b.needed - a.needed || a.name.localeCompare(b.name));
}

// 出貨/取消出貨時，同步調整「已採購數量」。
// 為什麼要調整：需求量會因為訂單出貨而自動減少，如果已採購數量不跟著減，
// 帳面就會變成「需求7、已採購10」這種看起來多買了3件的假訊息。
// delta 為負數代表要扣掉（出貨），正數代表要加回來（取消出貨標記）。
// 扣的時候夾在 0 以上，避免出現負數的已採購量。
async function adjustPurchasedForOrder(order, direction) {
  const items = (order.items || []).filter(item => isPreorderOrderItem(order, item));
  if (items.length === 0) return;

  // 同一個款式在訂單裡可能拆成多行，先加總再一次調整，避免同一份文件被重複讀寫
  const merged = {};
  for (const item of items) {
    const key = purchaseDocId(item.productId, item.style);
    if (!merged[key]) merged[key] = { productId: item.productId, style: item.style || '', qty: 0 };
    merged[key].qty += (item.qty || 0);
  }

  for (const [key, info] of Object.entries(merged)) {
    const ref = db.collection(COL.PURCHASES).doc(key);
    try {
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        const current = doc.exists ? (doc.data().purchased || 0) : 0;
        const next = Math.max(0, current + (direction * info.qty));
        tx.set(ref, {
          productId: info.productId,
          style: info.style,
          purchased: next,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    } catch (e) {
      // 採購進度只是輔助帳，調整失敗不該讓出貨動作整個失敗（出貨本身才是重點）
      console.error('調整已採購數量失敗，請至採購清單手動核對:', key, e);
    }
  }
}

// ---- 記錄一筆「結帳失敗」 ----
// 客人明明有下單動作，卻因為庫存不足或系統異常沒能成立訂單時，要把當下的完整資訊留下來。
// 沒有這個紀錄的話，店家完全不會知道有人下單失敗（曾經因此漏掉一筆真實訂單，
// 客人手上有截圖、後台卻查不到任何痕跡，只能靠客人主動反映才發現）。
// 這個函式本身「絕對不能再往外丟錯誤」，否則會蓋掉原本真正的失敗原因。
async function logFailedOrder(info) {
  try {
    await db.collection(COL.FAILED_ORDERS).add({
      reason: info.reason || '未知原因',
      errorName: info.errorName || '',
      errorMessage: info.errorMessage || '',
      stage: info.stage || '',
      // 庫存已經扣掉但訂單沒寫進去的情況，後台需要人工把庫存加回來，所以要特別標記
      stockAlreadyDeducted: !!info.stockAlreadyDeducted,
      orderNo: info.orderNo || '',
      lineName: info.lineName || '',
      cvsName: info.name || '',
      cvsPhone: info.phone || '',
      cvsStore: info.store || '',
      cvsStoreName: info.storeName || '',
      address: info.address || '',
      hasPreorder: !!info.hasPreorder,
      deliveryMethod: info.hasHomeDelivery ? 'homeDelivery' : 'cvs',
      items: (info.cart || []).map(i => ({
        productId: i.productId || '',
        name: i.name || '',
        style: i.style || '',
        price: i.price ?? 0,
        qty: i.qty ?? 0
      })),
      subtotal: info.subtotal ?? 0,
      discountAmount: info.discount ?? 0,
      shippingFee: info.shipping ?? 0,
      total: info.total ?? 0,
      couponCode: info.couponCode || null,
      resolved: false, // 店家處理完可以標記，之後就不會一直佔著待處理清單
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (logErr) {
    // 連失敗紀錄都寫不進去（例如整個 Firestore 連不上），只能印在 console，
    // 但絕對不能因此再丟一個錯誤出去，蓋掉客人真正遇到的問題
    console.error('寫入失敗訂單紀錄時也失敗了:', logErr, info);
  }
}

// ---- 後台編輯訂單時，依「編輯前」跟「編輯後」的商品內容差異調整庫存 ----
// 客人結帳時已經扣過一次庫存了，之後如果小編幫忙加/減商品數量，庫存也要跟著補扣或退回，
// 不然庫存數字會跟實際不符。同一個商品同一個款式只看「數量差」，
// 不管訂單裡是拆成好幾行還是合併成一行，加總後的差異才是真正要調整的量。
async function adjustStockForOrderEdit(oldItems, newItems) {
  function buildQtyMap(items) {
    const map = {};
    for (const item of items) {
      const key = item.productId + '::' + (item.style || '');
      map[key] = (map[key] || 0) + item.qty;
    }
    return map;
  }
  const oldMap = buildQtyMap(oldItems || []);
  const newMap = buildQtyMap(newItems || []);
  const allKeys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);

  // delta > 0 代表訂單裡這個商品款式變多了，要「多扣」庫存；
  // delta < 0 代表變少了（或整項被移除），要把庫存「退回去」
  const deltas = [];
  for (const key of allKeys) {
    const delta = (newMap[key] || 0) - (oldMap[key] || 0);
    if (delta === 0) continue;
    const sepIdx = key.indexOf('::');
    deltas.push({ productId: key.slice(0, sepIdx), style: key.slice(sepIdx + 2), delta });
  }
  if (deltas.length === 0) return;

  const productIds = [...new Set(deltas.map(d => d.productId))];

  await db.runTransaction(async (tx) => {
    const productDocs = {};
    for (const pid of productIds) {
      const ref = db.collection(COL.PRODUCTS).doc(pid);
      const doc = await tx.get(ref);
      if (doc.exists) productDocs[pid] = { ref, data: doc.data() };
    }
    for (const pid of productIds) {
      const entry = productDocs[pid];
      if (entry) entry.data.styles = normalizeStyles(entry.data.styles);
    }

    // 先檢查「需要多扣庫存」的部分，庫存不夠就整批中止，不要扣一半
    const problems = [];
    for (const d of deltas) {
      if (d.delta <= 0) continue; // 退回庫存不用檢查夠不夠
      const entry = productDocs[d.productId];
      if (!entry) continue; // 商品可能已經被刪除，找不到就跳過，不擋整筆編輯
      const data = entry.data;
      const productName = data.name || '商品';
      if (data.styles && data.styles.length > 0) {
        const idx = data.styles.findIndex(s => s.name === d.style);
        if (idx === -1) continue;
        const stock = data.styles[idx].stock;
        if (stock !== null && stock !== undefined && d.delta > stock) {
          problems.push(`「${productName}${d.style ? '（'+d.style+'）' : ''}」庫存只剩 ${stock} 件，不夠多扣 ${d.delta} 件`);
        }
      } else if (data.stock !== null && data.stock !== undefined && d.delta > data.stock) {
        problems.push(`「${productName}」庫存只剩 ${data.stock} 件，不夠多扣 ${d.delta} 件`);
      }
    }
    if (problems.length > 0) throw new StockInsufficientError(problems);

    for (const d of deltas) {
      const entry = productDocs[d.productId];
      if (!entry) continue;
      const data = entry.data;
      if (data.styles && data.styles.length > 0) {
        const idx = data.styles.findIndex(s => s.name === d.style);
        if (idx !== -1 && data.styles[idx].stock !== null && data.styles[idx].stock !== undefined) {
          data.styles[idx].stock = data.styles[idx].stock - d.delta;
        }
      } else if (data.stock !== null && data.stock !== undefined) {
        data.stock = data.stock - d.delta;
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
