// ============================================
// K.Zone 後台 - 備貨頁
// 給實際在倉庫裡對貨的人看的清單：只列出「含有預購商品」的未出貨訂單，
// 把訂單裡的每一件商品（現貨、預購都列，因為同一單要一起裝箱寄出）拆成一行，
// 備貨時一件一件核對到，勾起來。
//
// 跟「預購採購單」不一樣：採購單是拿來跟賣家對「還要買多少」，這頁是拿來跟「手上的貨」對，
// 所以現貨、預購都要列出來，因為出貨當下兩種都要一起裝箱。
//
// 全部勾完後才會出現「已完成」按鈕，按下去才收合——刻意不要「勾完自動收合」，
// 因為店家可能想在收合前再檢查一次，自己按下去確認的動作比較不會出錯。
// 這頁只負責備貨核對，不負責出貨；出貨還是要回訂單列表按「標記出貨」。
// ============================================

let pickingState = {
  orders: [],
  // 記住哪些訂單是展開的（已完成、被收合的訂單預設收起來）
  collapsed: new Set()
};

// 一張訂單是不是「所有商品都勾了」。沒有商品的訂單（理論上不會出現在備貨頁）視為未完成。
function isOrderFullyPicked(order) {
  const items = order.items || [];
  if (items.length === 0) return false;
  const checked = order.pickingChecked || {};
  return items.every((_, i) => checked[i] === true);
}

// 訂單裡只要有任何一件商品當初是預購買的，這張訂單就算「預購單」——
// 即使裡面同時混了現貨商品，出貨時還是要等預購那件到齊才能一起寄，
// 所以整張單（含現貨商品）都要列出來核對，不能只列預購那幾件
function isPreorderOrder(order) {
  return (order.items || []).some(item => isPreorderOrderItem(order, item));
}

// 備貨頁只列「還沒出貨」的預購訂單（純現貨訂單不會卡預購到貨進度，不用列在這頁）。
// 已經按過「已完成」的排到最下面，讓還沒對完貨的訂單一直留在視線範圍內，不用往下滑才找得到
function getPickingOrders(orders) {
  return orders
    .filter(o => !o.shippedAt && (o.items || []).length > 0 && isPreorderOrder(o))
    .sort((a, b) => {
      const aDone = a.pickingCompleted ? 1 : 0;
      const bDone = b.pickingCompleted ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      // 同樣狀態時，舊的訂單排前面（先來的先備貨）
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return aTime - bTime;
    });
}

async function renderPickingPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">備貨頁</div>
        <div class="admin-subtitle">列出含有預購商品的未出貨訂單，訂單內的每一件商品（現貨＋預購都會列）對貨時一件一件勾起來</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-secondary" id="refreshPickingBtn" style="width:auto">重新整理</button>
      </div>
    </div>

    <div class="admin-card" style="background:var(--c-cream); border-color:var(--c-sand); margin-bottom:16px">
      <p style="font-size:12px; color:var(--c-coffee); line-height:1.8">
        ${icon('info-circle', 14)}
        這頁只負責核對「東西有沒有到齊」，出貨還是要回「訂單列表」按標記出貨。
        全部商品都勾了才會出現「已完成」按鈕，按下去這張訂單就會收合到下面。
      </p>
    </div>

    <div class="admin-card">
      <div id="pickingList"><div class="loading-wrap"><div class="spin"></div>載入中...</div></div>
    </div>
  `;

  document.getElementById('refreshPickingBtn').addEventListener('click', () => {
    invalidateOrdersCache();
    loadAndRenderPicking();
  });

  await loadAndRenderPicking();
}

async function loadAndRenderPicking() {
  const wrap = document.getElementById('pickingList');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>載入中...</div>`;
  try {
    const orders = await getOrdersForAdmin();
    pickingState.orders = getPickingOrders(orders);
    // 已完成的訂單預設收合，其他預設展開
    pickingState.orders.forEach(o => {
      if (o.pickingCompleted) pickingState.collapsed.add(o.id);
    });
    renderPickingList();
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入備貨清單失敗</div>`;
  }
}

function pickingItemRow(order, item, idx) {
  const checked = !!(order.pickingChecked && order.pickingChecked[idx] === true);
  const typeLabel = isPreorderOrderItem(order, item) ? '預購' : '現貨';
  const typeColor = isPreorderOrderItem(order, item) ? 'var(--c-orange)' : '#1a5c2a';
  return `
    <label style="display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:0.5px solid var(--c-blush); cursor:pointer; ${checked ? 'opacity:0.5' : ''}">
      <input type="checkbox" data-pick-item="${order.id}:${idx}" ${checked ? 'checked' : ''} style="width:18px; height:18px; flex-shrink:0">
      <div style="width:40px; height:40px; border-radius:6px; overflow:hidden; background:var(--c-cream); flex-shrink:0">
        ${item.image ? `<img src="${escapeHtml(item.image)}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div style="flex:1; min-width:0">
        <div style="font-size:13px; font-weight:700; color:var(--c-coffee); ${checked ? 'text-decoration:line-through' : ''}">
          ${escapeHtml(item.name)}${item.style ? `<span style="color:var(--c-rose-text); font-weight:400"> (${escapeHtml(item.style)})</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:2px">
          <span style="font-size:11px; color:${typeColor}; font-weight:700">${typeLabel}</span>
          <span style="font-size:11px; color:var(--c-rose-text)">×${item.qty}</span>
        </div>
      </div>
    </label>
  `;
}

function renderPickingList() {
  const wrap = document.getElementById('pickingList');
  const orders = pickingState.orders;

  if (orders.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        ${icon('circle-check', 28)}
        <p style="margin-top:12px">目前沒有需要備貨的訂單</p>
      </div>
    `;
    return;
  }

  const ordersHtml = orders.map(order => {
    const items = order.items || [];
    const fullyPicked = isOrderFullyPicked(order);
    const isCollapsed = pickingState.collapsed.has(order.id);
    const pickedCount = items.filter((_, i) => order.pickingChecked && order.pickingChecked[i] === true).length;

    const headerRight = order.pickingCompleted
      ? `<span style="color:#1a5c2a; font-weight:700; font-size:12px">${icon('check', 13)} 已完成</span>`
      : `<span style="font-size:11px; color:var(--c-rose-text)">${pickedCount} / ${items.length} 已核對</span>`;

    const bodyHtml = isCollapsed ? '' : `
      <div style="padding:4px 8px 0">
        ${items.map((item, idx) => pickingItemRow(order, item, idx)).join('')}
      </div>
      <div style="padding:10px 8px; display:flex; justify-content:flex-end">
        ${fullyPicked && !order.pickingCompleted
          ? `<button class="btn-primary" data-pick-complete="${order.id}" style="width:auto; font-size:12px; padding:8px 16px">${icon('check', 14)} 已完成，收合這張訂單</button>`
          : (order.pickingCompleted
              ? `<button class="btn-secondary" data-pick-reopen="${order.id}" style="width:auto; font-size:12px; padding:8px 16px">重新打開</button>`
              : '')}
      </div>
    `;

    return `
      <div style="margin-bottom:10px; border:1px solid var(--c-blush); border-radius:10px; overflow:hidden; ${order.pickingCompleted ? 'opacity:0.6' : ''}">
        <div data-pick-toggle="${order.id}" style="display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--c-cream); cursor:pointer">
          <span style="flex-shrink:0; color:var(--c-rose)">${icon(isCollapsed ? 'chevron-right' : 'chevron-down', 16)}</span>
          <span style="font-size:14px; font-weight:700; color:var(--c-coffee)">${escapeHtml(order.lineName || '未提供')}</span>
          ${order.orderNo ? `<span style="font-size:11px; color:var(--c-rose-text)">${escapeHtml(order.orderNo)}</span>` : ''}
          <span style="margin-left:auto">${headerRight}</span>
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:12px; font-size:12px; color:var(--c-coffee)">
      <span>待備貨訂單：<strong>${orders.filter(o => !o.pickingCompleted).length}</strong></span>
      <span>已完成：<strong style="color:#1a5c2a">${orders.filter(o => o.pickingCompleted).length}</strong></span>
    </div>
    ${ordersHtml}
  `;

  // 標題整條可點，展開/收合（跟已完成無關，單純看想不想看細項）
  wrap.querySelectorAll('[data-pick-toggle]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('input,button,label')) return;
      const id = el.dataset.pickToggle;
      if (pickingState.collapsed.has(id)) pickingState.collapsed.delete(id);
      else pickingState.collapsed.add(id);
      renderPickingList();
    });
  });

  // 勾選/取消勾選單一商品，即時存到訂單文件裡
  wrap.querySelectorAll('[data-pick-item]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const [orderId, idxStr] = cb.dataset.pickItem.split(':');
      const idx = parseInt(idxStr, 10);
      const order = pickingState.orders.find(o => o.id === orderId);
      if (!order) return;

      const checked = { ...(order.pickingChecked || {}) };
      if (cb.checked) checked[idx] = true;
      else delete checked[idx];
      order.pickingChecked = checked;

      try {
        await db.collection(COL.ORDERS).doc(orderId).update({ pickingChecked: checked });
        renderPickingList();
      } catch (err) {
        console.error(err);
        showToast('儲存失敗，請稍後再試');
      }
    });
  });

  // 按「已完成」：把這張訂單標記完成並收合，出貨仍要回訂單列表操作
  wrap.querySelectorAll('[data-pick-complete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.pickComplete;
      const order = pickingState.orders.find(o => o.id === orderId);
      if (!order) return;
      try {
        await db.collection(COL.ORDERS).doc(orderId).update({ pickingCompleted: true });
        order.pickingCompleted = true;
        pickingState.collapsed.add(orderId);
        renderPickingList();
        showToast('已標記完成，可以回訂單列表出貨了');
      } catch (err) {
        console.error(err);
        showToast('儲存失敗，請稍後再試');
      }
    });
  });

  // 重新打開：客人東西還沒真的裝箱、或勾錯了，可以退回去繼續核對
  wrap.querySelectorAll('[data-pick-reopen]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.pickReopen;
      const order = pickingState.orders.find(o => o.id === orderId);
      if (!order) return;
      try {
        await db.collection(COL.ORDERS).doc(orderId).update({ pickingCompleted: false });
        order.pickingCompleted = false;
        pickingState.collapsed.delete(orderId);
        renderPickingList();
      } catch (err) {
        console.error(err);
        showToast('操作失敗，請稍後再試');
      }
    });
  });
}
