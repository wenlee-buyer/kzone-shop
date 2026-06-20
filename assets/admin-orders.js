// ============================================
// K.Zone 後台 - 訂單列表模組
// ============================================

async function renderOrdersPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">訂單列表</div>
        <div class="admin-subtitle">客人送出的訂單紀錄（需自行至 LINE 官方帳號核對截圖確認）</div>
      </div>
    </div>
    <div class="admin-card">
      <div id="ordersListWrap"><div class="loading-wrap"><div class="spin"></div>載入訂單中...</div></div>
    </div>
  `;

  await loadAndRenderOrders();
}

async function loadAndRenderOrders() {
  const wrap = document.getElementById('ordersListWrap');
  try {
    const snap = await db.collection(COL.ORDERS).orderBy('createdAt', 'desc').limit(100).get();
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (orders.length === 0) {
      wrap.innerHTML = `<div class="empty-state">${icon('clipboard-off', 18)}目前還沒有任何訂單</div>`;
      return;
    }

    wrap.innerHTML = orders.map(order => renderOrderCard(order)).join('');

    orders.forEach(order => {
      document.getElementById(`del-order-${order.id}`)?.addEventListener('click', () => deleteOrder(order.id));
      document.getElementById(`toggle-order-${order.id}`)?.addEventListener('click', () => {
        const detail = document.getElementById(`detail-order-${order.id}`);
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      });
    });

  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入訂單失敗</div>`;
  }
}

function renderOrderCard(order) {
  const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date();
  const dateStr = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  const itemCount = (order.items || []).reduce((sum, i) => sum + i.qty, 0);

  return `
    <div style="border:0.5px solid var(--c-blush); border-radius:10px; margin-bottom:10px; overflow:hidden">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; cursor:pointer; background:var(--c-cream)" id="toggle-order-${order.id}">
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee)">${icon('user', 18)}${escapeHtml(order.lineName || '未提供')}</div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:3px">${icon('clock', 18)}${dateStr} ・ 共${itemCount}件 ・ ${formatPrice(order.total)}</div>
        </div>
        <button class="btn-icon danger" id="del-order-${order.id}" title="刪除此訂單" onclick="event.stopPropagation()">${icon('trash', 18)}</button>
      </div>
      <div id="detail-order-${order.id}" style="display:none; padding:12px 14px">
        ${(order.items || []).map(item => `
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:0.5px solid var(--c-blush); font-size:12px">
            <span>${escapeHtml(item.name)}${item.style ? ` (${escapeHtml(item.style)})` : ''} x${item.qty}</span>
            <span style="color:var(--c-orange); font-weight:700">${formatPrice(item.price * item.qty)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function deleteOrder(orderId) {
  if (!confirm('確定要刪除這筆訂單紀錄嗎？此動作無法復原。')) return;
  await db.collection(COL.ORDERS).doc(orderId).delete();
  showToast('訂單已刪除');
  loadAndRenderOrders();
}
