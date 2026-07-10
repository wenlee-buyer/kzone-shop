// ============================================
// K.Zone 後台 - 商品管理模組
// ============================================

let productsPageState = {
  filterArchived: false,
  filterSoldOut: false,
  filterCat: 'all',
  editingProduct: null,
  pendingImages: [], // { blob, dataUrl, url(已上傳後) }，陣列順序 = 前台顯示順序（第一張是封面）
  pendingVideo: null // { file, previewUrl, uploaded, url(已上傳後) } 或 null（沒有影片）
};

async function renderProductsPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">商品管理</div>
        <div class="admin-subtitle">新增、編輯、封存你的商品</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-secondary" id="toggleSoldOutBtn" style="width:auto">查看已售完商品</button>
        <button class="btn-secondary" id="toggleArchivedBtn" style="width:auto">查看已封存商品</button>
        <button class="btn-primary" id="addProductBtn" style="width:auto">+ 新增商品</button>
      </div>
    </div>

    <div class="admin-card">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px">
        <select id="catFilterSelect" style="border:0.5px solid var(--c-rose); border-radius:8px; padding:8px 10px; font-size:13px; color:var(--c-coffee)">
          <option value="all">全部來源分類</option>
        </select>
      </div>
      <div id="productsTableWrap">
        <div class="loading-wrap"><div class="spin"></div>載入商品中...</div>
      </div>
    </div>
  `;

  const catSelect = document.getElementById('catFilterSelect');
  appState.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    catSelect.appendChild(opt);
  });
  catSelect.addEventListener('change', () => {
    productsPageState.filterCat = catSelect.value;
    loadAndRenderProductsTable();
  });

  document.getElementById('addProductBtn').addEventListener('click', () => openProductEditor(null));
  document.getElementById('toggleArchivedBtn').addEventListener('click', (e) => {
    productsPageState.filterArchived = !productsPageState.filterArchived;
    productsPageState.filterSoldOut = false;
    document.getElementById('toggleSoldOutBtn').textContent = '查看已售完商品';
    e.target.textContent = productsPageState.filterArchived ? '查看上架中商品' : '查看已封存商品';
    loadAndRenderProductsTable();
  });
  document.getElementById('toggleSoldOutBtn').addEventListener('click', (e) => {
    productsPageState.filterSoldOut = !productsPageState.filterSoldOut;
    e.target.textContent = productsPageState.filterSoldOut ? '查看全部商品' : '查看已售完商品';
    loadAndRenderProductsTable();
  });

  await loadAndRenderProductsTable();
}

async function loadAndRenderProductsTable() {
  const wrap = document.getElementById('productsTableWrap');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>載入中...</div>`;

  try {
    let query = db.collection(COL.PRODUCTS).where('archived', '==', productsPageState.filterArchived);
    const snap = await query.get();
    let products = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (productsPageState.filterCat !== 'all') {
      products = products.filter(p => {
        if (p.categoryIds && Array.isArray(p.categoryIds)) {
          return p.categoryIds.includes(productsPageState.filterCat);
        }
        return p.categoryId === productsPageState.filterCat; // 相容舊格式
      });
    }
    if (productsPageState.filterSoldOut) {
      products = products.filter(p => isProductSoldOut(p));
    }

    if (products.length === 0) {
      wrap.innerHTML = `<div class="empty-state">${icon('package-off', 18)}目前沒有商品</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>圖片</th><th>名稱</th><th>來源</th><th>狀態</th><th>價格</th><th>款式／庫存</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(p => renderProductRow(p)).join('')}
        </tbody>
      </table>
    `;

    products.forEach(p => {
      document.getElementById(`edit-${p.id}`)?.addEventListener('click', () => openProductEditor(p));
      document.getElementById(`archive-${p.id}`)?.addEventListener('click', () => toggleArchiveProduct(p));
      document.getElementById(`delete-${p.id}`)?.addEventListener('click', () => deleteProductPermanently(p));
    });

  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入失敗</div>`;
  }
}

function renderProductRow(p) {
  const styles = normalizeStyles(p.styles);
  // 同時相容新格式(categoryIds陣列)和舊格式(categoryId字串)
  const catIds = p.categoryIds && Array.isArray(p.categoryIds) ? p.categoryIds : (p.categoryId ? [p.categoryId] : []);
  const catNames = catIds.map(id => appState.categories.find(c => c.id === id)?.name).filter(Boolean);
  const stockPill = p.stockType === 'preorder'
    ? `<span class="pill pill-preorder">預購</span>`
    : `<span class="pill pill-instock">現貨</span>`;
  const archivedPill = p.archived ? `<span class="pill pill-archived" style="margin-left:4px">已封存</span>` : '';
  const soldOutPill = isProductSoldOut(p) ? `<span class="pill" style="background:#fbe1e1;color:#a33;margin-left:4px">已售完</span>` : '';
  const img = (p.images && p.images[0]) || '';

  let stockInfo = '不限制';
  if (styles.length > 0) {
    stockInfo = styles.map(s => {
      const soldOut = s.stock !== null && s.stock !== undefined && s.stock <= 0;
      const stockText = s.stock === null || s.stock === undefined ? '不限' : s.stock;
      return `${escapeHtml(s.name)}${soldOut ? '(已售完)' : `：${stockText}`}`;
    }).join('<br>');
  } else if (p.stock !== null && p.stock !== undefined) {
    stockInfo = `庫存：${p.stock}`;
  }

  return `
    <tr>
      <td><div style="width:44px;height:44px;border-radius:8px;overflow:hidden;background:var(--c-cream)">${img ? `<img src="${escapeHtml(img)}" style="width:100%;height:100%;object-fit:cover">` : ''}</div></td>
      <td style="max-width:160px; white-space:normal">${escapeHtml(p.name)}</td>
      <td style="white-space:normal">${catNames.length > 0 ? catNames.map(n => `<span class="pill pill-instock" style="margin:1px 2px; display:inline-block">${escapeHtml(n)}</span>`).join('') : '-'}</td>
      <td>${stockPill}${archivedPill}${soldOutPill}</td>
      <td>${formatPrice(p.price)}</td>
      <td style="font-size:11px">${stockInfo}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap">
          <button class="btn-icon" id="edit-${p.id}" title="編輯">編輯</button>
          <button class="btn-icon ${p.archived ? 'active-accent' : ''}" id="archive-${p.id}" title="${p.archived ? '取消封存' : '封存'}">${p.archived ? '取消封存' : '封存'}</button>
          <button class="btn-icon danger" id="delete-${p.id}" title="永久刪除">刪除</button>
        </div>
      </td>
    </tr>
  `;
}

async function toggleArchiveProduct(p) {
  await db.collection(COL.PRODUCTS).doc(p.id).update({ archived: !p.archived });
  showToast(p.archived ? '已取消封存' : '商品已封存，前台將不再顯示');
  loadAndRenderProductsTable();
}

async function deleteProductPermanently(p) {
  if (!confirm(`確定要永久刪除「${p.name}」嗎？此動作無法復原。`)) return;
  await db.collection(COL.PRODUCTS).doc(p.id).delete();
  showToast('商品已永久刪除');
  loadAndRenderProductsTable();
}

// ============================================
// 新增／編輯商品 Modal
// ============================================

function openProductEditor(product) {
  productsPageState.editingProduct = product;
  productsPageState.pendingImages = (product?.images || []).map(url => ({ url, dataUrl: url, uploaded: true }));
  productsPageState.pendingVideo = product?.video ? { url: product.video, previewUrl: product.video, uploaded: true } : null;

  const isEdit = !!product;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'productModalOverlay';

  overlay.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? '編輯商品' : '新增商品'}</span>
        <button class="modal-close" id="closeProductModal">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">商品名稱 *</label>
          <input type="text" id="pf_name" value="${product ? escapeHtml(product.name) : ''}" placeholder="例：菇菇寶貝毛絨玩偶">
        </div>

        <div class="field" style="background:var(--c-cream); border-radius:8px; padding:12px">
          <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--c-coffee); cursor:pointer">
            <input type="checkbox" id="pf_featured" ${product?.featured ? 'checked' : ''} style="width:16px; height:16px">
            精選顯示在首頁「所有商品」區塊
          </label>
          <div style="margin-top:10px">
            <label class="field-label">排序值（數字越小越排前面，同時影響首頁精選排序與分類列表排序，留空則排最後）</label>
            <input type="number" id="pf_sortOrder" value="${product?.sortOrder ?? ''}" placeholder="例：1">
          </div>
        </div>

        <div class="field">
          <label class="field-label">商品圖片（最多6張，建議1080x1080正方形圖。非正方形圖片會自動跳出裁切視窗，可上傳檔案或直接 Ctrl+V 貼上截圖，會自動加上浮水印。拖曳縮圖可調整順序，第一張會是封面圖）</label>
          <div class="img-upload-zone" id="pasteZone" tabindex="0">
            ${icon('photo-plus', 26)}
            點此區塊後按 Ctrl+V 貼上截圖，或點擊下方按鈕選擇檔案
          </div>
          <input type="file" id="pf_fileInput" accept="image/*" multiple style="display:none">
          <button class="btn-secondary" id="pf_chooseFileBtn" style="margin-top:8px">選擇圖片檔案上傳</button>
          <div class="img-thumb-grid" id="imgThumbGrid"></div>
        </div>

        <div class="field">
          <label class="field-label">商品短影片（選填，最多1支，建議20MB以內、直式或方形短影片，不會加浮水印）</label>
          <div id="videoUploadWrap"></div>
          <input type="file" id="pf_videoInput" accept="video/*" style="display:none">
          <button class="btn-secondary" id="pf_chooseVideoBtn" style="margin-top:8px">選擇影片檔案上傳</button>
        </div>

        <div class="field">
          <label class="field-label">來源分類（可複選）*</label>
          <div class="tag-chip-list" id="pf_categoryChips">
            ${appState.categories.map(c => {
              const isSelected = product?.categoryIds
                ? product.categoryIds.includes(c.id)
                : (product?.categoryId === c.id); // 相容舊格式單一categoryId
              return `<div class="tag-chip ${isSelected ? 'selected' : ''}" data-cat="${c.id}">${escapeHtml(c.name)}</div>`;
            }).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">現貨／預購 *</label>
          <div class="tag-chip-list">
            <div class="tag-chip ${(!product || product.stockType === 'instock') ? 'selected' : ''}" data-stock="instock">現貨</div>
            <div class="tag-chip ${product?.stockType === 'preorder' ? 'selected' : ''}" data-stock="preorder">預購</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">角色標籤（可複選）</label>
          <div class="tag-chip-list" id="pf_tagChips">
            ${appState.tags.map(t => `<div class="tag-chip ${product?.tagIds?.includes(t.id) ? 'selected' : ''}" data-tag="${t.id}">${escapeHtml(t.name)}</div>`).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">價格（NT$）*</label>
          <input type="number" id="pf_price" value="${product?.price || ''}" placeholder="0">
        </div>

        <div class="field" id="pf_simpleStockField">
          <label class="field-label">數量／庫存（選填，留空表示不限制。賣完會自動顯示「已售完」）</label>
          <input type="number" id="pf_stock" value="${product?.stock ?? ''}" placeholder="例：10">
        </div>

        <div class="field">
          <label class="field-label">款式（純文字，不同款式同價，可新增多個。新增款式後，庫存會改成各款式分開計算）</label>
          <div id="pf_stylesList"></div>
          <button class="btn-secondary" id="pf_addStyleBtn" style="margin-top:4px">+ 新增款式</button>
        </div>

        <div class="field">
          <label class="field-label">小編推薦</label>
          <textarea id="pf_recommendation" placeholder="例：超療癒韓國限定款！數量非常有限～">${product?.recommendation ? escapeHtml(product.recommendation) : ''}</textarea>
        </div>

        <button class="btn-primary" id="pf_saveBtn" style="margin-top:6px">${isEdit ? '儲存變更' : '新增商品'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 款式列表渲染（每個款式可各自設定庫存；相容舊資料：舊版 styles 是純字串陣列）
  const stylesListEl = document.getElementById('pf_stylesList');
  let styles = (product?.styles || []).map(s => {
    if (typeof s === 'string') return { name: s, stock: '' };
    return { name: s.name || '', stock: s.stock ?? '' };
  });

  function toggleSimpleStockVisibility() {
    document.getElementById('pf_simpleStockField').style.display = styles.length > 0 ? 'none' : 'block';
  }

  function renderStylesList() {
    stylesListEl.innerHTML = styles.map((s, i) => `
      <div class="style-input-row">
        <input type="text" value="${escapeHtml(s.name)}" placeholder="款式名稱" data-style-name-idx="${i}" style="flex:2">
        <input type="number" value="${escapeHtml(String(s.stock))}" placeholder="庫存(留空不限)" data-style-stock-idx="${i}" style="flex:1; min-width:0">
        <button class="btn-icon danger" data-remove-style="${i}">移除</button>
      </div>
    `).join('');
    stylesListEl.querySelectorAll('[data-style-name-idx]').forEach(input => {
      input.addEventListener('input', (e) => {
        styles[parseInt(e.target.dataset.styleNameIdx)].name = e.target.value;
      });
    });
    stylesListEl.querySelectorAll('[data-style-stock-idx]').forEach(input => {
      input.addEventListener('input', (e) => {
        styles[parseInt(e.target.dataset.styleStockIdx)].stock = e.target.value;
      });
    });
    stylesListEl.querySelectorAll('[data-remove-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        styles.splice(parseInt(btn.dataset.removeStyle), 1);
        renderStylesList();
        toggleSimpleStockVisibility();
      });
    });
  }
  renderStylesList();
  toggleSimpleStockVisibility();

  document.getElementById('pf_addStyleBtn').addEventListener('click', () => {
    styles.push({ name: '', stock: '' });
    renderStylesList();
    toggleSimpleStockVisibility();
  });

  // 標籤複選
  document.getElementById('pf_tagChips').querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  // 來源分類複選
  document.getElementById('pf_categoryChips').querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  // 現貨/預購單選
  overlay.querySelectorAll('[data-stock]').forEach(chip => {
    chip.addEventListener('click', () => {
      overlay.querySelectorAll('[data-stock]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });

  // 圖片上傳相關（監聽整個 Modal 範圍，不需要刻意點擊小方框才能貼上）
  renderImgThumbGrid();
  const pasteZone = document.getElementById('pasteZone');
  setupPasteListener(overlay, handleNewImageFile);
  pasteZone.addEventListener('click', () => pasteZone.focus());

  document.getElementById('pf_chooseFileBtn').addEventListener('click', () => {
    document.getElementById('pf_fileInput').click();
  });
  document.getElementById('pf_fileInput').addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => handleNewImageFile(file));
    e.target.value = '';
  });

  // 短影片上傳
  renderVideoUploadArea();
  document.getElementById('pf_chooseVideoBtn').addEventListener('click', () => {
    document.getElementById('pf_videoInput').click();
  });
  document.getElementById('pf_videoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    productsPageState.pendingVideo = { file, previewUrl: URL.createObjectURL(file), uploaded: false };
    renderVideoUploadArea();
  });

  document.getElementById('closeProductModal').addEventListener('click', closeProductEditor);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeProductEditor(); });
  document.getElementById('pf_saveBtn').addEventListener('click', () => saveProduct(styles));
}

function closeProductEditor() {
  document.getElementById('productModalOverlay')?.remove();
  if (productsPageState.pendingVideo && !productsPageState.pendingVideo.uploaded) {
    URL.revokeObjectURL(productsPageState.pendingVideo.previewUrl);
  }
  productsPageState.pendingImages = [];
  productsPageState.pendingVideo = null;
}

async function handleNewImageFile(file) {
  if (productsPageState.pendingImages.length >= 6) {
    showToast('最多只能上傳6張圖片');
    return;
  }
  try {
    const needsCrop = await checkNeedsCrop(file);
    if (needsCrop) {
      openCropModal(file);
    } else {
      await processAndAddImage(file);
    }
  } catch (err) {
    console.error(err);
    showToast('圖片處理失敗，請再試一次');
  }
}

// 檢查圖片是否已經接近正方形（容許 3% 誤差），不是才需要裁切
function checkNeedsCrop(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.width / img.height;
      resolve(Math.abs(ratio - 1) > 0.03);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

// 圖片裁切完成（或不需要裁切）後，統一走這裡：加浮水印 → 加進待上傳清單
async function processAndAddImage(fileOrBlob) {
  const settings = appState.settings;
  const blob = await applyWatermark(fileOrBlob, settings.watermarkText || 'k.zone.buying');
  const dataUrl = await blobToDataURL(blob);
  productsPageState.pendingImages.push({ blob, dataUrl, uploaded: false });
  renderImgThumbGrid();
}

let activeCropper = null;

function openCropModal(file) {
  const url = URL.createObjectURL(file);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'cropModalOverlay';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <span class="modal-title">裁切圖片為正方形</span>
        <button class="modal-close" id="closeCropModal">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px; color:var(--c-rose-text); margin-bottom:10px">這張圖片不是正方形，拖曳調整框選範圍，確認後會裁切成 1:1 比例</p>
        <div id="cropContainer" style="height:300px; overflow:hidden; background:#000; border-radius:8px; touch-action:none;">
          <img id="cropTargetImg" src="${url}" style="display:block; max-width:100%; max-height:300px;">
        </div>
        <div style="display:flex; gap:8px; margin-top:14px">
          <button class="btn-secondary" id="cancelCropBtn">取消這張圖片</button>
          <button class="btn-primary" id="confirmCropBtn">確認裁切</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 手機修正1：阻止裁切容器內的所有觸控滾動事件傳遞到背景，避免頁面閃動
  const cropContainer = document.getElementById('cropContainer');
  cropContainer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  cropContainer.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

  // 手機修正2：阻止 Modal 本身的滾動造成背景頁面跳動
  overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  const imgEl = document.getElementById('cropTargetImg');
  imgEl.onload = () => {
    activeCropper = new Cropper(imgEl, {
      aspectRatio: 1,
      viewMode: 1,
      autoCropArea: 0.9,
      background: false,
      movable: true,
      zoomable: true,
      rotatable: false,
      scalable: false,
      // 手機修正3：使用 CSS transform 而非 transition，減少重排
      transition: false,
      // 手機修正4：明確指定容器大小，避免 Cropper 自行計算時造成重排
      minContainerWidth: cropContainer.offsetWidth,
      minContainerHeight: 300,
      ready() {
        // 初始化完成後再顯示，避免初始計算時的閃動
        cropContainer.style.opacity = '1';
      }
    });
  };

  // 初始化時先隱藏，等 Cropper ready 再顯示
  cropContainer.style.opacity = '0';
  cropContainer.style.transition = 'opacity 0.15s ease';

  const cleanup = () => {
    if (activeCropper) { activeCropper.destroy(); activeCropper = null; }
    URL.revokeObjectURL(url);
    overlay.remove();
  };

  document.getElementById('closeCropModal').addEventListener('click', cleanup);
  document.getElementById('cancelCropBtn').addEventListener('click', cleanup);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cleanup(); });

  document.getElementById('confirmCropBtn').addEventListener('click', () => {
    if (!activeCropper) return;
    const canvas = activeCropper.getCroppedCanvas({ width: 1080, height: 1080 });
    canvas.toBlob(async (blob) => {
      cleanup();
      await processAndAddImage(blob);
    }, 'image/jpeg', 0.92);
  });
}

function renderImgThumbGrid() {
  const grid = document.getElementById('imgThumbGrid');
  if (!grid) return;
  grid.innerHTML = productsPageState.pendingImages.map((img, i) => `
    <div class="img-thumb" draggable="true" data-img-idx="${i}" style="position:relative; cursor:grab">
      <img src="${img.dataUrl}" style="pointer-events:none">
      ${i === 0 ? `<span style="position:absolute; bottom:2px; left:2px; background:var(--c-orange); color:#fff; font-size:9px; padding:1px 5px; border-radius:5px; font-weight:700">封面</span>` : ''}
      <button class="img-thumb-remove" data-remove-img="${i}">×</button>
    </div>
  `).join('');
  grid.querySelectorAll('[data-remove-img]').forEach(btn => {
    btn.addEventListener('click', () => {
      productsPageState.pendingImages.splice(parseInt(btn.dataset.removeImg), 1);
      renderImgThumbGrid();
    });
  });
  initImgThumbDragReorder(grid);
}

// 拖曳圖片縮圖調整順序（第一張＝封面圖，前台商品卡與詳情頁主圖都用第一張）
function initImgThumbDragReorder(grid) {
  let dragIdx = null;
  grid.querySelectorAll('[data-img-idx]').forEach(thumb => {
    thumb.addEventListener('dragstart', (e) => {
      dragIdx = parseInt(thumb.dataset.imgIdx);
      e.dataTransfer.effectAllowed = 'move';
      thumb.style.opacity = '0.4';
    });
    thumb.addEventListener('dragend', () => {
      thumb.style.opacity = '1';
    });
    thumb.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    thumb.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIdx = parseInt(thumb.dataset.imgIdx);
      if (dragIdx === null || dragIdx === dropIdx) return;
      const moved = productsPageState.pendingImages.splice(dragIdx, 1)[0];
      productsPageState.pendingImages.splice(dropIdx, 0, moved);
      dragIdx = null;
      renderImgThumbGrid();
    });
  });
}

// ---- 商品短影片上傳區塊 ----
function renderVideoUploadArea() {
  const wrap = document.getElementById('videoUploadWrap');
  if (!wrap) return;
  const v = productsPageState.pendingVideo;
  if (!v) {
    wrap.innerHTML = `<div style="font-size:12px; color:var(--c-rose-text)">目前沒有上傳影片</div>`;
    return;
  }
  wrap.innerHTML = `
    <div style="position:relative; width:140px; margin-top:6px">
      <video src="${escapeHtml(v.previewUrl)}" muted playsinline style="width:100%; border-radius:8px; background:#000; display:block"></video>
      <button class="img-thumb-remove" id="removeVideoBtn" style="position:absolute; top:-6px; right:-6px">×</button>
    </div>
  `;
  document.getElementById('removeVideoBtn').addEventListener('click', () => {
    productsPageState.pendingVideo = null;
    renderVideoUploadArea();
  });
}

async function saveProduct(styles) {
  const name = document.getElementById('pf_name').value.trim();
  const categoryIds = Array.from(document.getElementById('pf_categoryChips').querySelectorAll('.selected')).map(el => el.dataset.cat);
  const price = parseFloat(document.getElementById('pf_price').value);
  const stockVal = document.getElementById('pf_stock').value;
  const stock = stockVal === '' ? null : parseInt(stockVal);
  const recommendation = document.getElementById('pf_recommendation').value.trim();
  const stockType = document.querySelector('[data-stock].selected')?.dataset.stock || 'instock';
  const tagIds = Array.from(document.getElementById('pf_tagChips').querySelectorAll('.selected')).map(el => el.dataset.tag);
  const featured = document.getElementById('pf_featured').checked;
  const sortOrderVal = document.getElementById('pf_sortOrder').value;
  const sortOrder = sortOrderVal === '' ? 9999 : parseInt(sortOrderVal);
  const cleanStyles = styles
    .filter(s => s.name.trim())
    .map(s => ({ name: s.name.trim(), stock: s.stock === '' || s.stock === null ? null : parseInt(s.stock) }));

  if (!name) { showToast('請輸入商品名稱'); return; }
  if (categoryIds.length === 0) { showToast('請至少選擇一個來源分類'); return; }
  if (isNaN(price) || price < 0) { showToast('請輸入正確的價格'); return; }
  if (productsPageState.pendingImages.length === 0) { showToast('請至少上傳一張商品圖片'); return; }

  const saveBtn = document.getElementById('pf_saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '儲存中...';

  try {
    // 上傳尚未上傳過的圖片（陣列順序就是前台顯示順序，第一張是封面）
    const imageUrls = [];
    for (const img of productsPageState.pendingImages) {
      if (img.uploaded && img.url) {
        imageUrls.push(img.url);
      } else {
        const url = await uploadImageToStorage(img.blob, 'products');
        imageUrls.push(url);
      }
    }

    // 上傳短影片（如果有新的、尚未上傳過的影片）
    let videoUrl = null;
    const pendingVideo = productsPageState.pendingVideo;
    if (pendingVideo) {
      videoUrl = (pendingVideo.uploaded && pendingVideo.url)
        ? pendingVideo.url
        : await uploadVideoToStorage(pendingVideo.file, 'products');
    }

    const productData = {
      name, categoryIds, price, recommendation, stockType, tagIds,
      featured, sortOrder,
      stock: cleanStyles.length > 0 ? null : stock,
      styles: cleanStyles,
      images: imageUrls,
      video: videoUrl,
      archived: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (productsPageState.editingProduct) {
      await db.collection(COL.PRODUCTS).doc(productsPageState.editingProduct.id).update(productData);
      showToast('商品已更新');
    } else {
      productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(COL.PRODUCTS).add(productData);
      showToast('商品已新增');
    }

    closeProductEditor();
    loadAndRenderProductsTable();

  } catch (err) {
    console.error(err);
    showToast('儲存失敗，請檢查網路連線後再試');
    saveBtn.disabled = false;
    saveBtn.textContent = productsPageState.editingProduct ? '儲存變更' : '新增商品';
  }
}
