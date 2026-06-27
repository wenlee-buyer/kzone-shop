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
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:10px">匯出訂單匯入格式（賣貨便）</h3>
      <p style="font-size:12px; color:var(--c-rose-text); margin-bottom:12px; line-height:1.7">
        選擇日期區間後下載，僅會匯出「超商取貨」類型的訂單（含取件人/手機/門市等完整資料）。<br>
        下載後請另存或貼入賣貨便原始 .xlsm 範本中執行「驗證」。為避免重複匯入，請每次匯出後記下匯出區間。
      </p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div class="field" style="margin-bottom:0; flex:1; min-width:140px">
          <label class="field-label">起始日期</label>
          <input type="date" id="exportStartDate">
        </div>
        <div class="field" style="margin-bottom:0; flex:1; min-width:140px">
          <label class="field-label">結束日期</label>
          <input type="date" id="exportEndDate">
        </div>
        <button class="btn-primary" id="exportOrdersBtn" style="width:auto; padding:9px 20px">下載匯入檔（.xlsx）</button>
      </div>
    </div>

    <div class="admin-card">
      <div id="ordersListWrap"><div class="loading-wrap"><div class="spin"></div>載入訂單中...</div></div>
    </div>
  `;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('exportStartDate').value = today;
  document.getElementById('exportEndDate').value = today;
  document.getElementById('exportOrdersBtn').addEventListener('click', exportOrdersToExcel);

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
      document.getElementById(`ship-order-${order.id}`)?.addEventListener('click', () => openShipModal(order));
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
  const isCvs = order.orderType === 'cvs';
  const isShipped = !!order.shippedAt;

  const typePill = isCvs
    ? `<span class="pill pill-instock">超商取貨</span>`
    : `<span class="pill pill-preorder">LINE／含預購</span>`;

  const shippedPill = isShipped
    ? `<span class="pill" style="background:#d4edda; color:#1a5c2a; margin-left:4px">${icon('check', 14)} 已出貨</span>`
    : `<span class="pill" style="background:#fff3cd; color:#856404; margin-left:4px">待處理</span>`;

  const shippedInfo = isShipped ? `
    <div style="background:#f0fff4; border:0.5px solid #b2dfdb; border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12px; color:#1a5c2a; line-height:1.8">
      ${icon('check', 14)} 已出貨・出貨日期：${escapeHtml(order.shippedAt || '')}
      ${order.trackingNo ? `・ 超商單號：<strong>${escapeHtml(order.trackingNo)}</strong>` : ''}
    </div>
  ` : '';

  const cvsInfo = isCvs ? `
    <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12px; color:var(--c-coffee); line-height:1.8">
      取件人：${escapeHtml(order.cvsName || '-')} ・ 手機：${escapeHtml(order.cvsPhone || '-')} ・ 門市店號：${escapeHtml(order.cvsStore || '-')}${order.cvsStoreName ? ` (${escapeHtml(order.cvsStoreName)})` : ''}<br>
      商品小計：${formatPrice(order.subtotal)} ・ 運費：${order.shippingFee === 0 ? '免運' : formatPrice(order.shippingFee)} ・ 應付總額：${formatPrice(order.total)}
    </div>
  ` : '';

  return `
    <div style="border:1.5px solid ${isShipped ? '#b2dfdb' : 'var(--c-blush)'}; border-radius:10px; margin-bottom:10px; overflow:hidden; background:${isShipped ? '#f9fffe' : '#fff'}">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; cursor:pointer; background:${isShipped ? '#edfaf6' : 'var(--c-cream)'}" id="toggle-order-${order.id}">
        <div style="flex:1; min-width:0">
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee); display:flex; align-items:center; flex-wrap:wrap; gap:4px">
            ${icon('user', 14)} ${escapeHtml(order.lineName || '未提供')} ${typePill} ${shippedPill}
          </div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:3px">
            ${icon('clock', 14)} ${dateStr} ・ 共${itemCount}件 ・ ${formatPrice(order.total)}
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0; margin-left:8px" onclick="event.stopPropagation()">
          <button class="btn-icon ${isShipped ? '' : 'active-accent'}" id="ship-order-${order.id}" title="${isShipped ? '修改出貨資訊' : '標記出貨'}" style="font-size:11px; padding:6px 8px">
            ${isShipped ? '修改出貨' : '標記出貨'}
          </button>
          <button class="btn-icon danger" id="del-order-${order.id}" title="刪除此訂單">${icon('trash', 14)}</button>
        </div>
      </div>
      <div id="detail-order-${order.id}" style="display:none; padding:12px 14px">
        ${shippedInfo}
        ${cvsInfo}
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

// ============================================
// 標記出貨 Modal
// ============================================
function openShipModal(order) {
  const today = new Date().toISOString().slice(0, 10);
  const isShipped = !!order.shippedAt;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'shipModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <span class="modal-title">${isShipped ? '修改出貨資訊' : '標記出貨'}</span>
        <button class="modal-close" id="closeShipModal">×</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:12px; color:var(--c-coffee)">
          訂單：${escapeHtml(order.lineName || '未提供')} ・ ${formatPrice(order.total)}
        </div>
        <div class="field">
          <label class="field-label">出貨日期 *</label>
          <input type="date" id="ship_date" value="${order.shippedAt || today}">
        </div>
        <div class="field">
          <label class="field-label">超商單號（選填）</label>
          <input type="text" id="ship_tracking" value="${order.trackingNo || ''}" placeholder="例：7110123456789">
        </div>
        ${isShipped ? `
          <button class="btn-danger" id="cancelShipBtn" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px">取消出貨標記</button>
        ` : ''}
        <button class="btn-primary" id="confirmShipBtn">${isShipped ? '更新出貨資訊' : '確認標記出貨'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('closeShipModal').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  // 取消出貨標記
  document.getElementById('cancelShipBtn')?.addEventListener('click', async () => {
    if (!confirm('確定要取消這筆訂單的出貨標記嗎？')) return;
    await db.collection(COL.ORDERS).doc(order.id).update({
      shippedAt: firebase.firestore.FieldValue.delete(),
      trackingNo: firebase.firestore.FieldValue.delete()
    });
    close();
    showToast('已取消出貨標記');
    loadAndRenderOrders();
  });

  // 確認出貨
  document.getElementById('confirmShipBtn').addEventListener('click', async () => {
    const shippedAt = document.getElementById('ship_date').value;
    const trackingNo = document.getElementById('ship_tracking').value.trim();

    if (!shippedAt) { showToast('請選擇出貨日期'); return; }

    const btn = document.getElementById('confirmShipBtn');
    btn.disabled = true;
    btn.textContent = '儲存中...';

    try {
      const updateData = { shippedAt };
      if (trackingNo) updateData.trackingNo = trackingNo;
      else updateData.trackingNo = firebase.firestore.FieldValue.delete();

      await db.collection(COL.ORDERS).doc(order.id).update(updateData);
      close();
      showToast('出貨資訊已儲存');
      loadAndRenderOrders();
    } catch (err) {
      console.error(err);
      showToast('儲存失敗，請稍後再試');
      btn.disabled = false;
      btn.textContent = isShipped ? '更新出貨資訊' : '確認標記出貨';
    }
  });
}

// ============================================
// 匯出訂單為賣貨便「訂單匯入」格式 (.xlsx)
// 欄位：取件人姓名/取件人手機/取件門市/溫層/商品/訂單金額/運費金額/買家下訂日期/商品備註/其他資訊
// ============================================
async function exportOrdersToExcel() {
  const startDateStr = document.getElementById('exportStartDate').value;
  const endDateStr = document.getElementById('exportEndDate').value;

  if (!startDateStr || !endDateStr) {
    showToast('請選擇起訖日期');
    return;
  }

  const btn = document.getElementById('exportOrdersBtn');
  btn.disabled = true;
  btn.textContent = '匯出中...';

  try {
    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59');

    // 注意：這裡刻意只用單一 where 條件，不搭配 orderBy，
    // 因為 where+orderBy 不同欄位的組合查詢在 Firestore 需要額外手動建立複合索引，
    // 否則查詢會直接失敗。排序改在前端做，避免這個問題。
    const snap = await db.collection(COL.ORDERS)
      .where('orderType', '==', 'cvs')
      .get();

    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => {
        const t = o.createdAt?.toDate ? o.createdAt.toDate() : null;
        return t && t >= startDate && t <= endDate;
      })
      .sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return ta - tb;
      });

    if (orders.length === 0) {
      showToast('選擇的日期區間內沒有超商取貨訂單');
      return;
    }

    const header = ['＊取件人姓名', '＊取件人手機', '＊取件門市', '* 溫層', '＊商品', '＊訂單金額', '＊運費金額', '買家下訂日期', '商品備註', '其他資訊  (FB/LINE/IG帳號)'];

    const rows = orders.map(o => {
      const date = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
      const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
      return [
        o.cvsName || '',
        o.cvsPhone || '',
        o.cvsStore || '',
        '常溫',
        '楓之谷周邊',
        o.subtotal ?? o.total ?? 0,
        o.shippingFee ?? calcShippingFee(o.subtotal ?? o.total ?? 0),
        dateStr,
        o.cvsStoreName || '',
        `LINE：${o.lineName || ''}`
      ];
    });

    const wsData = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:12},{wch:14},{wch:12},{wch:8},{wch:14},{wch:10},{wch:10},{wch:12},{wch:30},{wch:18}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '訂單匯入');

    XLSX.writeFile(wb, `K.Zone訂單匯入_${startDateStr}_${endDateStr}.xlsx`);
    showToast(`已匯出 ${orders.length} 筆訂單`);

  } catch (err) {
    console.error(err);
    showToast('匯出失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '下載匯入檔（.xlsx）';
  }
}
