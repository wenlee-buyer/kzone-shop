// ============================================
// K.Zone 後台 - 首頁排序模組
// 拖拉調整精選商品的顯示順序，儲存後前台即時套用
// ============================================

let sortPageProducts = [];

async function renderSortPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">首頁排序</div>
        <div class="admin-subtitle">拖拉調整商品順序・只有「精選顯示在首頁」的商品才會出現在這裡</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-primary" id="saveSortBtn" style="width:auto">儲存順序</button>
      </div>
    </div>

    <div class="admin-card" style="background:var(--c-cream); border-color:var(--c-sand); margin-bottom:16px">
      <p style="font-size:12px; color:var(--c-coffee); line-height:1.8">
        ${icon('info-circle', 14)}
        上下拖拉卡片即可調整順序。儲存後前台商品會依此順序排列（缺貨商品仍會自動排到最後）。<br>
        若要新增或移除首頁精選商品，請到「商品管理」頁面編輯商品的「精選顯示在首頁」勾選框。
      </p>
    </div>

    <div class="admin-card" style="padding:12px">
      <div id="sortableList" style="min-height:80px">
        <div class="loading-wrap"><div class="spin"></div>載入商品中...</div>
      </div>
    </div>
  `;

  document.getElementById('saveSortBtn').addEventListener('click', saveSortOrder);
  await loadSortableProducts();
}

async function loadSortableProducts() {
  try {
    // 這裡疊加兩個 .where() 但沒有搭配 .orderBy()，Firestore 不需要額外複合索引，
    // 所以不違反專案「where+orderBy 不同欄位需要建立索引」的限制，排序仍統一在下面用 JS 處理
    const snap = await db.collection(COL.PRODUCTS)
      .where('featured', '==', true)
      .where('archived', '==', false)
      .get();

    sortPageProducts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

    renderSortableList();

  } catch (err) {
    console.error(err);
    document.getElementById('sortableList').innerHTML =
      `<div class="empty-state">${icon('alert-circle', 18)}<p style="margin-top:8px">載入失敗，請稍後再試</p></div>`;
  }
}

function renderSortableList() {
  const list = document.getElementById('sortableList');

  if (sortPageProducts.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        ${icon('package-off', 28)}
        <p style="margin-top:12px">目前沒有精選商品</p>
        <p style="font-size:11px; color:var(--c-rose-text); margin-top:6px">請到「商品管理」頁面，編輯商品並勾選「精選顯示在首頁」</p>
      </div>
    `;
    return;
  }

  list.innerHTML = sortPageProducts.map((p, idx) => {
    const img = (p.images && p.images[0]) || '';
    const isSoldOut = isProductSoldOut(p);
    return `
      <div class="sort-item" data-id="${p.id}" draggable="true">
        <div class="sort-handle">${icon('menu', 18)}</div>
        <div class="sort-thumb">
          ${img ? `<img src="${escapeHtml(img)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px">` : `<div style="width:100%;height:100%;background:var(--c-blush);border-radius:6px"></div>`}
        </div>
        <div class="sort-info">
          <div style="font-size:13px; font-weight:500; color:var(--c-coffee)">${escapeHtml(p.name)}</div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:2px">
            ${formatPrice(p.price)}
            ${isSoldOut ? `<span style="color:#a33; margin-left:6px">・ 已售完（會自動排到最後）</span>` : ''}
          </div>
        </div>
        <div class="sort-order-num">${idx + 1}</div>
      </div>
    `;
  }).join('');

  initDragAndDrop();
}

function initDragAndDrop() {
  const list = document.getElementById('sortableList');
  let dragItem = null;
  let dragOverItem = null;

  list.querySelectorAll('.sort-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragItem = item;
      item.classList.add('sort-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('sort-dragging');
      list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('sort-over'));
      dragItem = null;
      dragOverItem = null;
      // 更新序號顯示
      list.querySelectorAll('.sort-item').forEach((i, idx) => {
        i.querySelector('.sort-order-num').textContent = idx + 1;
      });
      // 同步更新 sortPageProducts 陣列的順序
      const newOrder = Array.from(list.querySelectorAll('.sort-item')).map(i => i.dataset.id);
      sortPageProducts.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (item !== dragItem) {
        list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('sort-over'));
        item.classList.add('sort-over');
        dragOverItem = item;
      }
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragItem && dragOverItem && dragItem !== dragOverItem) {
        const allItems = Array.from(list.querySelectorAll('.sort-item'));
        const fromIdx = allItems.indexOf(dragItem);
        const toIdx = allItems.indexOf(dragOverItem);
        if (fromIdx < toIdx) {
          dragOverItem.after(dragItem);
        } else {
          dragOverItem.before(dragItem);
        }
      }
    });

    // 手機觸控支援
    let touchStartY = 0;
    let touchItem = null;

    item.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
      touchItem = item;
      item.classList.add('sort-dragging');
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touchY = e.touches[0].clientY;
      const allItems = Array.from(list.querySelectorAll('.sort-item'));
      let target = null;
      for (const i of allItems) {
        if (i === touchItem) continue;
        const rect = i.getBoundingClientRect();
        if (touchY >= rect.top && touchY <= rect.bottom) {
          target = i;
          break;
        }
      }
      if (target) {
        list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('sort-over'));
        target.classList.add('sort-over');
        dragOverItem = target;
      }
    }, { passive: false });

    item.addEventListener('touchend', () => {
      if (touchItem && dragOverItem && touchItem !== dragOverItem) {
        const allItems = Array.from(list.querySelectorAll('.sort-item'));
        const fromIdx = allItems.indexOf(touchItem);
        const toIdx = allItems.indexOf(dragOverItem);
        if (fromIdx < toIdx) {
          dragOverItem.after(touchItem);
        } else {
          dragOverItem.before(touchItem);
        }
      }
      touchItem?.classList.remove('sort-dragging');
      list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('sort-over'));
      list.querySelectorAll('.sort-item').forEach((i, idx) => {
        i.querySelector('.sort-order-num').textContent = idx + 1;
      });
      const newOrder = Array.from(list.querySelectorAll('.sort-item')).map(i => i.dataset.id);
      sortPageProducts.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
      touchItem = null;
      dragOverItem = null;
    });
  });
}

async function saveSortOrder() {
  const btn = document.getElementById('saveSortBtn');
  btn.disabled = true;
  btn.textContent = '儲存中...';

  try {
    // 取得目前畫面上的排序
    const list = document.getElementById('sortableList');
    const orderedIds = Array.from(list.querySelectorAll('.sort-item')).map(i => i.dataset.id);

    // 批次寫入每個商品的 sortOrder
    const batch = db.batch();
    orderedIds.forEach((id, idx) => {
      batch.update(db.collection(COL.PRODUCTS).doc(id), { sortOrder: idx + 1 });
    });
    await batch.commit();

    showToast('順序已儲存，前台商品將依此排序顯示');

    // 更新本地資料
    orderedIds.forEach((id, idx) => {
      const p = sortPageProducts.find(p => p.id === id);
      if (p) p.sortOrder = idx + 1;
    });

  } catch (err) {
    console.error(err);
    showToast('儲存失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存順序';
  }
}
