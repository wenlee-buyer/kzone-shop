// ============================================
// K.Zone 後台 - 商品同步匯入模組
// 從原本訂單網站 (proxy/data/products) 讀取商品，
// 比對已匯入的 id 避免重複，匯入時補填楓谷專屬欄位
// ============================================

let importPageState = {
  sourceProducts: [],
  importedIds: new Set(),
  selectedIds: new Set(),
  priceHistory: {} // pid -> 最近一次該商品的台幣 price（從 items 陣列推算，僅供參考）
};

async function renderImportPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">商品同步匯入</div>
        <div class="admin-subtitle">從原本的訂單管理網站匯入商品，已匯入過的商品不會重複出現</div>
      </div>
      <button class="btn-primary" id="refreshImportBtn" style="width:auto">${icon('refresh', 18)} 重新讀取來源商品</button>
    </div>

    <div class="admin-card" style="background:var(--c-cream); border-color:var(--c-sand)">
      <p style="font-size:12px; color:var(--c-coffee); line-height:1.8">
        ${icon('info-circle', 18)}
        系統會讀取你原本訂單網站（proxy-tool）裡的商品主檔，圖片網址會直接共用引用、台幣價格會嘗試從歷史訂單紀錄帶入參考值。
        匯入後請務必補填「來源分類」「角色標籤」「小編推薦」等楓谷網站專屬欄位，並確認價格無誤後再儲存。
      </p>
    </div>

    <div class="admin-card">
      <div id="importListWrap"><div class="loading-wrap"><div class="spin"></div>請點擊上方「重新讀取來源商品」開始</div></div>
    </div>
  `;

  document.getElementById('refreshImportBtn').addEventListener('click', loadSourceProducts);
}

async function loadSourceProducts() {
  const wrap = document.getElementById('importListWrap');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>讀取原訂單網站商品中...</div>`;

  try {
    const importedSnap = await db.collection(COL.IMPORTED_IDS).get();
    importPageState.importedIds = new Set(importedSnap.docs.map(d => d.id));

    const proxyDataDoc = await db.collection('proxy').doc('data').get();
    if (!proxyDataDoc.exists) {
      wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}找不到原訂單網站的資料，請確認資料結構是否變更</div>`;
      return;
    }

    const data = proxyDataDoc.data();
    const sourceProducts = data.products || [];

    importPageState.priceHistory = buildPriceHistory(data);
    importPageState.sourceProducts = sourceProducts.filter(p => !importPageState.importedIds.has(p.id));
    importPageState.selectedIds = new Set();

    renderImportList();

  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}讀取失敗，請確認網路連線或 Firebase 權限設定</div>`;
  }
}

function buildPriceHistory(data) {
  const history = {};
  const tryArrays = [];
  if (Array.isArray(data.orders)) tryArrays.push(...data.orders);
  if (Array.isArray(data.items)) tryArrays.push({ items: data.items });

  tryArrays.forEach(order => {
    (order.items || []).forEach(item => {
      if (item.pid && typeof item.price === 'number') {
        history[item.pid] = item.price;
      }
    });
  });
  return history;
}

function renderImportList() {
  const wrap = document.getElementById('importListWrap');
  const products = importPageState.sourceProducts;

  if (products.length === 0) {
    wrap.innerHTML = `<div class="empty-state">${icon('circle-check', 18)}沒有新商品可匯入，所有商品都已經同步過了</div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px">
      <span style="font-size:12px; color:var(--c-rose-text)">共找到 ${products.length} 項尚未匯入的商品</span>
      <button class="btn-secondary" id="selectAllImportBtn" style="width:auto">全選</button>
    </div>
    <div id="importCheckList">
      ${products.map(p => renderImportRow(p)).join('')}
    </div>
    <button class="btn-primary" id="proceedImportBtn" style="margin-top:16px">匯入已勾選的商品（<span id="selectedCount">0</span> 項）</button>
  `;

  products.forEach(p => {
    document.getElementById(`import-check-${p.id}`)?.addEventListener('change', (e) => {
      if (e.target.checked) importPageState.selectedIds.add(p.id);
      else importPageState.selectedIds.delete(p.id);
      updateSelectedCount();
    });
  });

  document.getElementById('selectAllImportBtn').addEventListener('click', () => {
    const allSelected = importPageState.selectedIds.size === products.length;
    document.querySelectorAll('#importCheckList input[type="checkbox"]').forEach(cb => {
      cb.checked = !allSelected;
    });
    importPageState.selectedIds = allSelected ? new Set() : new Set(products.map(p => p.id));
    updateSelectedCount();
  });

  document.getElementById('proceedImportBtn').addEventListener('click', openImportEditorBatch);
}

function updateSelectedCount() {
  const el = document.getElementById('selectedCount');
  if (el) el.textContent = importPageState.selectedIds.size;
}

function renderImportRow(p) {
  const referencePrice = importPageState.priceHistory[p.id];
  return `
    <label style="display:flex; align-items:center; gap:12px; padding:10px; border:0.5px solid var(--c-blush); border-radius:10px; margin-bottom:8px; cursor:pointer">
      <input type="checkbox" id="import-check-${p.id}" style="width:18px; height:18px; flex-shrink:0">
      <div style="width:44px; height:44px; border-radius:8px; overflow:hidden; background:var(--c-cream); flex-shrink:0">
        ${p.img ? `<img src="${escapeHtml(p.img)}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div style="flex:1; min-width:0">
        <div style="font-size:13px; font-weight:700; color:var(--c-coffee)">${escapeHtml(p.name || '未命名商品')}</div>
        <div style="font-size:11px; color:var(--c-rose-text); margin-top:2px">
          原分類：${escapeHtml(p.cat || '無')} ・ 韓幣：₩${(p.krw || 0).toLocaleString()}
          ${referencePrice ? ` ・ 參考台幣價：${formatPrice(referencePrice)}` : ' ・ 無歷史台幣價格紀錄'}
        </div>
      </div>
    </label>
  `;
}

function openImportEditorBatch() {
  const selected = importPageState.sourceProducts.filter(p => importPageState.selectedIds.has(p.id));
  if (selected.length === 0) {
    showToast('請至少勾選一項商品');
    return;
  }
  showImportEditorForIndex(selected, 0, []);
}

function showImportEditorForIndex(queue, index, results) {
  if (index >= queue.length) {
    finalizeImport(results);
    return;
  }

  const p = queue[index];
  const referencePrice = importPageState.priceHistory[p.id] || '';

  document.getElementById('productModalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'productModalOverlay';

  const catOptions = appState.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  overlay.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">補填商品資料（${index + 1} / ${queue.length}）</span>
        <button class="modal-close" id="closeImportEditor">×</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:14px; padding:10px; background:var(--c-cream); border-radius:10px">
          <div style="width:50px; height:50px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#fff">
            ${p.img ? `<img src="${escapeHtml(p.img)}" style="width:100%;height:100%;object-fit:cover">` : ''}
          </div>
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee)">${escapeHtml(p.name || '未命名商品')}</div>
        </div>

        <div class="field">
          <label class="field-label">商品名稱</label>
          <input type="text" id="im_name" value="${escapeHtml(p.name || '')}">
        </div>

        <div class="field">
          <label class="field-label">台幣售價 *（${referencePrice ? '已帶入參考歷史價格，僅供參考，請確認後可編輯' : '無歷史紀錄，請手動填寫'}）</label>
          <input type="number" id="im_price" value="${referencePrice}" placeholder="請輸入台幣售價">
        </div>

        <div class="field">
          <label class="field-label">來源分類 *</label>
          <select id="im_category"><option value="">請選擇</option>${catOptions}</select>
        </div>

        <div class="field">
          <label class="field-label">現貨／預購</label>
          <div class="tag-chip-list">
            <div class="tag-chip selected" data-stock="instock">現貨</div>
            <div class="tag-chip" data-stock="preorder">預購</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label">角色標籤（可複選）</label>
          <div class="tag-chip-list" id="im_tagChips">
            ${appState.tags.map(t => `<div class="tag-chip" data-tag="${t.id}">${escapeHtml(t.name)}</div>`).join('')}
          </div>
        </div>

        <div class="field">
          <label class="field-label">小編推薦</label>
          <textarea id="im_recommendation" placeholder="補上一句吸引人的推薦文吧！"></textarea>
        </div>

        <div style="display:flex; gap:8px; margin-top:8px">
          <button class="btn-secondary" id="im_skipBtn">跳過此商品</button>
          <button class="btn-primary" id="im_nextBtn">${index === queue.length - 1 ? '完成匯入' : '儲存並下一項'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('[data-stock]').forEach(chip => {
    chip.addEventListener('click', () => {
      overlay.querySelectorAll('[data-stock]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });
  document.getElementById('im_tagChips').querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });

  document.getElementById('closeImportEditor').addEventListener('click', () => {
    overlay.remove();
    if (results.length > 0) finalizeImport(results);
  });

  document.getElementById('im_skipBtn').addEventListener('click', () => {
    overlay.remove();
    showImportEditorForIndex(queue, index + 1, results);
  });

  document.getElementById('im_nextBtn').addEventListener('click', () => {
    const name = document.getElementById('im_name').value.trim();
    const price = parseFloat(document.getElementById('im_price').value);
    const categoryId = document.getElementById('im_category').value;
    const categoryIds = categoryId ? [categoryId] : [];

    if (!name) { showToast('請輸入商品名稱'); return; }
    if (isNaN(price) || price < 0) { showToast('請輸入正確的台幣售價'); return; }
    if (categoryIds.length === 0) { showToast('請選擇來源分類'); return; }

    const stockType = overlay.querySelector('[data-stock].selected')?.dataset.stock || 'instock';
    const tagIds = Array.from(document.getElementById('im_tagChips').querySelectorAll('.selected')).map(el => el.dataset.tag);
    const recommendation = document.getElementById('im_recommendation').value.trim();

    results.push({
      sourceId: p.id,
      name, price, categoryIds, stockType, tagIds, recommendation,
      images: p.img ? [p.img] : [],
      styles: [],
      stock: null,
      archived: false
    });

    overlay.remove();
    showImportEditorForIndex(queue, index + 1, results);
  });
}

async function finalizeImport(results) {
  if (results.length === 0) {
    showToast('沒有商品被匯入');
    return;
  }

  showToast(`正在匯入 ${results.length} 項商品...`);

  try {
    const batch = db.batch();
    results.forEach(item => {
      const { sourceId, ...productData } = item;
      const newDocRef = db.collection(COL.PRODUCTS).doc();
      batch.set(newDocRef, { ...productData, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      batch.set(db.collection(COL.IMPORTED_IDS).doc(sourceId), { importedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();

    showToast(`成功匯入 ${results.length} 項商品！`);
    loadSourceProducts();

  } catch (err) {
    console.error(err);
    showToast('匯入過程發生錯誤，請稍後再試');
  }
}
