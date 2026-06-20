// ============================================
// K.Zone 後台 - 商品管理模組
// ============================================

let productsPageState = {
  filterArchived: false,
  filterCat: 'all',
  editingProduct: null,
  pendingImages: [] // { blob, dataUrl, url(已上傳後) }
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
        <button class="btn-secondary" id="toggleArchivedBtn" style="width:auto">查看已封存商品</button>
        <button class="btn-primary" id="addProductBtn" style="width:auto"><i class="ti ti-plus"></i> 新增商品</button>
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
    e.target.textContent = productsPageState.filterArchived ? '查看上架中商品' : '查看已封存商品';
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
      products = products.filter(p => p.categoryId === productsPageState.filterCat);
    }

    if (products.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><i class="ti ti-package-off"></i>目前沒有商品</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>圖片</th><th>名稱</th><th>來源</th><th>狀態</th><th>價格</th><th>款式</th><th>操作</th>
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
    wrap.innerHTML = `<div class="empty-state"><i class="ti ti-alert-circle"></i>載入失敗</div>`;
  }
}

function renderProductRow(p) {
  const cat = appState.categories.find(c => c.id === p.categoryId);
  const stockPill = p.stockType === 'preorder'
    ? `<span class="pill pill-preorder">預購</span>`
    : `<span class="pill pill-instock">現貨</span>`;
  const archivedPill = p.archived ? `<span class="pill pill-archived" style="margin-left:4px">已封存</span>` : '';
  const img = (p.images && p.images[0]) || '';

  return `
    <tr>
      <td><div style="width:44px;height:44px;border-radius:8px;overflow:hidden;background:var(--c-cream)">${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}</div></td>
      <td style="max-width:160px; white-space:normal">${escapeHtml(p.name)}</td>
      <td>${cat ? escapeHtml(cat.name) : '-'}</td>
      <td>${stockPill}${archivedPill}</td>
      <td>${formatPrice(p.price)}</td>
      <td>${p.styles && p.styles.length ? p.styles.length + ' 款' : '無'}</td>
      <td>
        <div style="display:flex; gap:6px">
          <button class="btn-icon" id="edit-${p.id}" title="編輯"><i class="ti ti-edit"></i></button>
          <button class="btn-icon ${p.archived ? 'active-accent' : ''}" id="archive-${p.id}" title="${p.archived ? '取消封存' : '封存'}"><i class="ti ti-archive"></i></button>
          <button class="btn-icon danger" id="delete-${p.id}" title="永久刪除"><i class="ti ti-trash"></i></button>
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

  const isEdit = !!product;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'productModalOverlay';

  const catOptions = appState.categories.map(c =>
    `<option value="${c.id}" ${product?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

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

        <div class="field">
          <label class="field-label">商品圖片（最多6張，可上傳檔案或直接 Ctrl+V 貼上截圖，會自動加上浮水印）</label>
          <div class="img-upload-zone" id="pasteZone" tabindex="0">
            <i class="ti ti-photo-plus" style="font-size:26px; display:block; margin-bottom:6px"></i>
            點此區塊後按 Ctrl+V 貼上截圖，或點擊下方按鈕選擇檔案
          </div>
          <input type="file" id="pf_fileInput" accept="image/*" multiple style="display:none">
          <button class="btn-secondary" id="pf_chooseFileBtn" style="margin-top:8px">選擇圖片檔案上傳</button>
          <div class="img-thumb-grid" id="imgThumbGrid"></div>
        </div>

        <div class="field">
          <label class="field-label">來源分類 *</label>
          <select id="pf_category">${catOptions}</select>
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

        <div class="field">
          <label class="field-label">數量／庫存（選填，目前不影響前台購買）</label>
          <input type="number" id="pf_stock" value="${product?.stock ?? ''}" placeholder="例：10">
        </div>

        <div class="field">
          <label class="field-label">款式（純文字，不同款式同價，可新增多個）</label>
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

  // 款式列表渲染
  const stylesListEl = document.getElementById('pf_stylesList');
  let styles = product?.styles ? [...product.styles] : [];

  function renderStylesList() {
    stylesListEl.innerHTML = styles.map((s, i) => `
      <div class="style-input-row">
        <input type="text" value="${escapeHtml(s)}" data-style-idx="${i}">
        <button class="btn-icon danger" data-remove-style="${i}"><i class="ti ti-x"></i></button>
      </div>
    `).join('');
    stylesListEl.querySelectorAll('[data-style-idx]').forEach(input => {
      input.addEventListener('input', (e) => {
        styles[parseInt(e.target.dataset.styleIdx)] = e.target.value;
      });
    });
    stylesListEl.querySelectorAll('[data-remove-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        styles.splice(parseInt(btn.dataset.removeStyle), 1);
        renderStylesList();
      });
    });
  }
  renderStylesList();

  document.getElementById('pf_addStyleBtn').addEventListener('click', () => {
    styles.push('');
    renderStylesList();
  });

  // 標籤複選
  document.getElementById('pf_tagChips').querySelectorAll('.tag-chip').forEach(chip => {
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

  document.getElementById('closeProductModal').addEventListener('click', closeProductEditor);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProductEditor(); });
  document.getElementById('pf_saveBtn').addEventListener('click', () => saveProduct(styles));
}

function closeProductEditor() {
  document.getElementById('productModalOverlay')?.remove();
  productsPageState.pendingImages = [];
}

async function handleNewImageFile(file) {
  if (productsPageState.pendingImages.length >= 6) {
    showToast('最多只能上傳6張圖片');
    return;
  }
  try {
    const settings = appState.settings;
    const blob = await applyWatermark(file, settings.watermarkText || 'k.zone.buying');
    const dataUrl = await blobToDataURL(blob);
    productsPageState.pendingImages.push({ blob, dataUrl, uploaded: false });
    renderImgThumbGrid();
  } catch (err) {
    console.error(err);
    showToast('圖片處理失敗，請再試一次');
  }
}

function renderImgThumbGrid() {
  const grid = document.getElementById('imgThumbGrid');
  if (!grid) return;
  grid.innerHTML = productsPageState.pendingImages.map((img, i) => `
    <div class="img-thumb">
      <img src="${img.dataUrl}">
      <button class="img-thumb-remove" data-remove-img="${i}">×</button>
    </div>
  `).join('');
  grid.querySelectorAll('[data-remove-img]').forEach(btn => {
    btn.addEventListener('click', () => {
      productsPageState.pendingImages.splice(parseInt(btn.dataset.removeImg), 1);
      renderImgThumbGrid();
    });
  });
}

async function saveProduct(styles) {
  const name = document.getElementById('pf_name').value.trim();
  const categoryId = document.getElementById('pf_category').value;
  const price = parseFloat(document.getElementById('pf_price').value);
  const stockVal = document.getElementById('pf_stock').value;
  const stock = stockVal === '' ? null : parseInt(stockVal);
  const recommendation = document.getElementById('pf_recommendation').value.trim();
  const stockType = document.querySelector('[data-stock].selected')?.dataset.stock || 'instock';
  const tagIds = Array.from(document.getElementById('pf_tagChips').querySelectorAll('.selected')).map(el => el.dataset.tag);
  const cleanStyles = styles.map(s => s.trim()).filter(s => s);

  if (!name) { showToast('請輸入商品名稱'); return; }
  if (!categoryId) { showToast('請選擇來源分類'); return; }
  if (isNaN(price) || price < 0) { showToast('請輸入正確的價格'); return; }
  if (productsPageState.pendingImages.length === 0) { showToast('請至少上傳一張商品圖片'); return; }

  const saveBtn = document.getElementById('pf_saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '儲存中...';

  try {
    // 上傳尚未上傳過的圖片
    const imageUrls = [];
    for (const img of productsPageState.pendingImages) {
      if (img.uploaded && img.url) {
        imageUrls.push(img.url);
      } else {
        const url = await uploadImageToStorage(img.blob, 'products');
        imageUrls.push(url);
      }
    }

    const productData = {
      name, categoryId, price, stock, recommendation, stockType, tagIds,
      styles: cleanStyles,
      images: imageUrls,
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
