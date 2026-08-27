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

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
      <div class="admin-card" style="margin-bottom:0">
        <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:4px; display:flex; align-items:center; gap:8px">
          <span class="pill pill-instock">超商取貨</span> 現貨訂單
        </h3>
        <p style="font-size:11px; color:var(--c-rose-text); margin-bottom:12px">貨到付款・可匯出賣貨便格式</p>
        <div id="ordersListCvs"><div class="loading-wrap"><div class="spin"></div>載入中...</div></div>
      </div>
      <div class="admin-card" style="margin-bottom:0">
        <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:4px; display:flex; align-items:center; gap:8px">
          <span class="pill pill-preorder">LINE</span> 含預購／宅配訂單
        </h3>
        <p style="font-size:11px; color:var(--c-rose-text); margin-bottom:12px">需透過 LINE 官方帳號確認（含需匯款的宅配訂單）</p>
        <div id="ordersListLine"><div class="loading-wrap"><div class="spin"></div>載入中...</div></div>
      </div>
    </div>

    <div class="admin-card" style="margin-top:16px; margin-bottom:0">
      <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:4px; display:flex; align-items:center; gap:8px">
        <span class="pill" style="background:#fbe1e1; color:#a33">下單失敗</span> 結帳失敗紀錄
      </h3>
      <p style="font-size:11px; color:var(--c-rose-text); margin-bottom:12px">
        客人有按送出但訂單沒有成立的紀錄（例如庫存不足）。請確認庫存或聯繫客人補單，處理完可標記已處理。
      </p>
      <div id="failedOrdersList"><div class="loading-wrap"><div class="spin"></div>載入中...</div></div>
    </div>

    <style>
      @media (max-width: 860px) {
        #ordersListCvs, #ordersListLine { }
        #ordersListCvs { margin-bottom: 0; }
      }
      @media (max-width: 860px) {
        .orders-two-col { grid-template-columns: 1fr !important; }
      }
    </style>
  `;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('exportStartDate').value = today;
  document.getElementById('exportEndDate').value = today;
  document.getElementById('exportOrdersBtn').addEventListener('click', exportOrdersToExcel);

  await loadAndRenderOrders();
  await loadAndRenderFailedOrders();
}

// 結帳失敗紀錄：客人按了送出卻沒能成立訂單的情況，一定要讓店家看得到
async function loadAndRenderFailedOrders() {
  const wrap = document.getElementById('failedOrdersList');
  if (!wrap) return;
  try {
    // 這裡不加 where('resolved','==',false)，因為要連已處理的也一起顯示（已處理的收起來放後面），
    // 而且單一 orderBy 不需要額外建立複合索引
    const snap = await db.collection(COL.FAILED_ORDERS).orderBy('createdAt', 'desc').limit(100).get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const pending = all.filter(f => !f.resolved);
    const resolved = all.filter(f => !!f.resolved);

    if (all.length === 0) {
      wrap.innerHTML = `<div class="empty-state" style="padding:20px 10px">${icon('circle-check', 18)}<p style="margin-top:8px">目前沒有失敗紀錄</p></div>`;
      return;
    }

    let html = pending.map(f => renderFailedOrderCard(f)).join('');
    if (resolved.length > 0) {
      html += `<div style="border-top:1.5px dashed var(--c-blush); margin:12px 0 10px; padding-top:10px">
        <div style="font-size:11px; color:var(--c-rose-text); margin-bottom:8px">
          ${icon('check', 12)} 已處理（${resolved.length} 筆）
        </div>
        ${resolved.map(f => renderFailedOrderCard(f)).join('')}
      </div>`;
    }
    wrap.innerHTML = html;

    all.forEach(f => {
      document.getElementById(`resolve-failed-${f.id}`)?.addEventListener('click', async () => {
        await db.collection(COL.FAILED_ORDERS).doc(f.id).update({ resolved: !f.resolved });
        showToast(f.resolved ? '已改回未處理' : '已標記為已處理');
        loadAndRenderFailedOrders();
      });
      document.getElementById(`del-failed-${f.id}`)?.addEventListener('click', async () => {
        if (!confirm('確定要刪除這筆失敗紀錄嗎？')) return;
        await db.collection(COL.FAILED_ORDERS).doc(f.id).delete();
        showToast('已刪除');
        loadAndRenderFailedOrders();
      });
    });
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入失敗紀錄失敗</div>`;
  }
}

function renderFailedOrderCard(f) {
  const date = f.createdAt?.toDate ? f.createdAt.toDate() : null;
  const dateStr = date
    ? `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
    : '時間不明';
  const isResolved = !!f.resolved;
  const itemCount = (f.items || []).reduce((s, i) => s + (i.qty || 0), 0);

  return `
    <div style="border:1.5px solid ${isResolved ? '#b2dfdb' : '#f0c9c9'}; border-radius:10px; margin-bottom:10px; overflow:hidden; background:${isResolved ? '#f9fffe' : '#fffafa'}">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; padding:12px 14px; gap:8px">
        <div style="flex:1; min-width:0">
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee); display:flex; align-items:center; flex-wrap:wrap; gap:4px">
            ${icon('user', 14)} ${escapeHtml(f.lineName || '未提供')}
            <span class="pill" style="background:${isResolved ? '#d4edda' : '#fbe1e1'}; color:${isResolved ? '#1a5c2a' : '#a33'}">${isResolved ? '已處理' : escapeHtml(f.reason || '失敗')}</span>
            ${f.stockAlreadyDeducted ? `<span class="pill" style="background:#fff3cd; color:#856404">庫存已扣・需人工加回</span>` : ''}
          </div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:3px">
            ${icon('clock', 14)} ${dateStr} ・ 共${itemCount}件 ・ ${formatPrice(f.total || 0)}${f.orderNo ? ` ・ 編號：${escapeHtml(f.orderNo)}` : ''}
          </div>
          <div style="background:var(--c-cream); border-radius:8px; padding:8px 10px; margin-top:8px; font-size:12px; color:var(--c-coffee); line-height:1.8">
            ${(f.items || []).map(i => `${escapeHtml(i.name)}${i.style ? `（${escapeHtml(i.style)}）` : ''} x${i.qty}`).join('<br>') || '（無商品資料）'}
            <br>聯絡：${escapeHtml(f.cvsName || '-')} ・ ${escapeHtml(f.cvsPhone || '-')}
            ${f.address ? `<br>地址：${escapeHtml(f.address)}` : ''}
            ${f.cvsStore || f.cvsStoreName ? `<br>門市：${escapeHtml(f.cvsStoreName || '')} ${escapeHtml(f.cvsStore || '')}` : ''}
            ${f.errorMessage ? `<br><span style="color:#a33">原因：${escapeHtml(f.errorMessage)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0">
          <button class="btn-icon ${isResolved ? '' : 'active-accent'}" id="resolve-failed-${f.id}" style="font-size:11px; padding:6px 8px">${isResolved ? '改回未處理' : '標記已處理'}</button>
          <button class="btn-icon danger" id="del-failed-${f.id}" title="刪除此紀錄">${icon('trash', 14)}</button>
        </div>
      </div>
    </div>
  `;
}

async function loadAndRenderOrders() {
  const cvs = document.getElementById('ordersListCvs');
  const line = document.getElementById('ordersListLine');
  try {
    const snap = await db.collection(COL.ORDERS).orderBy('createdAt', 'desc').limit(200).get();
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    console.log(`[訂單診斷] 加載總數：${orders.length} 筆訂單`);

    // 按 orderType 分類，方便診斷
    const orderTypeCounts = {};
    orders.forEach(o => {
      const ot = o.orderType || 'undefined';
      const dm = o.deliveryMethod || 'undefined';
      const key = `orderType=${ot}, deliveryMethod=${dm}`;
      orderTypeCounts[key] = (orderTypeCounts[key] || 0) + 1;
    });
    console.log('[訂單診斷] 訂單類型分布：', orderTypeCounts);

    // 宅配訂單雖然 orderType 可能是 'cvs'（現貨、不用等小編確認），但取貨方式不是超商取貨，
    // 賣貨便匯出格式也不適用，所以歸到右邊「需透過 LINE 確認」欄位一起處理（因為也需要私訊小編拿匯款帳號）
    // 注意：舊訂單的 deliveryMethod 可能是 undefined（在新增此欄位之前的訂單），應該當作 'cvs' 對待
    const cvsOrders = orders.filter(o => o.orderType === 'cvs' && o.deliveryMethod !== 'homeDelivery');
    const lineOrders = orders.filter(o => o.orderType !== 'cvs' || o.deliveryMethod === 'homeDelivery');

    console.log(`[訂單診斷] 超商現貨：${cvsOrders.length} 筆 / LINE含預購+宅配：${lineOrders.length} 筆`);

    renderOrderColumn(cvs, cvsOrders, 'cvs');
    renderOrderColumn(line, lineOrders, 'line');

  } catch (err) {
    console.error(err);
    const errMsg = `<div class="empty-state">${icon('alert-circle', 18)}載入訂單失敗</div>`;
    if (cvs) cvs.innerHTML = errMsg;
    if (line) line.innerHTML = errMsg;
  }
}

function renderOrderColumn(container, orders, colType) {
  if (orders.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:30px 10px">${icon('clipboard-off', 18)}<p style="margin-top:8px">目前沒有訂單</p></div>`;
    return;
  }

  // 分成待處理（未出貨）和已出貨兩組
  const pending = orders.filter(o => !o.shippedAt);
  const shipped = orders.filter(o => !!o.shippedAt);
  const shippedVisible = shipped.slice(0, 10);
  const shippedHidden = shipped.slice(10);

  let html = '';

  // 待處理訂單（全部顯示）
  if (pending.length > 0) {
    html += pending.map(order => renderOrderCard(order)).join('');
  }

  // 已出貨訂單（只顯示10筆，超過的摺疊）
  if (shipped.length > 0) {
    html += `<div style="border-top:1.5px dashed var(--c-blush); margin:12px 0 10px; padding-top:10px">
      <div style="font-size:11px; color:var(--c-rose-text); margin-bottom:8px; display:flex; align-items:center; gap:6px">
        ${icon('check', 12)} 已出貨（${shipped.length} 筆）
      </div>
      ${shippedVisible.map(order => renderOrderCard(order)).join('')}
      ${shippedHidden.length > 0 ? `
        <div id="shipped-more-${colType}" style="display:none">
          ${shippedHidden.map(order => renderOrderCard(order)).join('')}
        </div>
        <button onclick="toggleShippedMore('${colType}')" id="shipped-toggle-${colType}"
          style="width:100%; background:var(--c-cream); border:0.5px dashed var(--c-rose); color:var(--c-rose-text); border-radius:8px; padding:8px; font-size:12px; cursor:pointer; margin-top:4px">
          查看更多已出貨訂單（還有 ${shippedHidden.length} 筆）
        </button>
      ` : ''}
    </div>`;
  }

  container.innerHTML = html;

  // 綁定所有訂單事件
  orders.forEach(order => {
    document.getElementById(`del-order-${order.id}`)?.addEventListener('click', () => deleteOrder(order.id));
    document.getElementById(`ship-order-${order.id}`)?.addEventListener('click', () => openShipModal(order));
    document.getElementById(`edit-order-${order.id}`)?.addEventListener('click', () => openEditOrderModal(order));
    document.getElementById(`payment-order-${order.id}`)?.addEventListener('click', () => togglePaymentConfirmed(order));
    document.getElementById(`toggle-order-${order.id}`)?.addEventListener('click', () => {
      const detail = document.getElementById(`detail-order-${order.id}`);
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
  });
}

function toggleShippedMore(colType) {
  const moreEl = document.getElementById(`shipped-more-${colType}`);
  const btn = document.getElementById(`shipped-toggle-${colType}`);
  const isHidden = moreEl.style.display === 'none';
  moreEl.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '收起已出貨訂單' : `查看更多已出貨訂單（還有 ${moreEl.querySelectorAll('[id^="toggle-order-"]').length} 筆）`;
}

function renderOrderCard(order) {
  const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date();
  const dateStr = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  const itemCount = (order.items || []).reduce((sum, i) => sum + i.qty, 0);
  const isCvs = order.orderType === 'cvs';
  const isHomeDelivery = order.deliveryMethod === 'homeDelivery';
  const isShipped = !!order.shippedAt;
  const isPaymentConfirmed = !!order.paymentConfirmed;

  const typePill = isHomeDelivery
    ? `<span class="pill" style="background:#e6e0f7; color:#5a4a9c">宅配</span>`
    : (isCvs
        ? `<span class="pill pill-instock">超商取貨</span>`
        : `<span class="pill pill-preorder">LINE／含預購</span>`);

  const paymentPill = isHomeDelivery
    ? (isPaymentConfirmed
        ? `<span class="pill" style="background:#d4edda; color:#1a5c2a; margin-left:4px">${icon('check', 14)} 已匯款</span>`
        : `<span class="pill" style="background:#fbe1e1; color:#a33; margin-left:4px">待轉帳</span>`)
    : '';

  const shippedPill = isShipped
    ? `<span class="pill" style="background:#d4edda; color:#1a5c2a; margin-left:4px">${icon('check', 14)} 已出貨</span>`
    : `<span class="pill" style="background:#fff3cd; color:#856404; margin-left:4px">待處理</span>`;

  // 訂金主要是預購訂單在用（尾款要等出貨前才收），不是超商取貨/貨到付款訂單，所以只在非cvs訂單顯示
  const depositReceivedNum = order.depositReceived || 0;
  const balanceAmount = Math.max(0, (order.total || 0) - depositReceivedNum);
  const depositPill = !isCvs
    ? (depositReceivedNum > 0
        ? `<span class="pill" style="background:#d4edda; color:#1a5c2a; margin-left:4px">${icon('check', 14)} 已付訂金 ${formatPrice(depositReceivedNum)}</span>`
        : `<span class="pill" style="background:#f1efe8; color:#8a8378; margin-left:4px">未付訂金</span>`)
    : '';

  const shippedInfo = isShipped ? `
    <div style="background:#f0fff4; border:0.5px solid #b2dfdb; border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12px; color:#1a5c2a; line-height:1.8">
      ${icon('check', 14)} 已出貨・出貨日期：${escapeHtml(order.shippedAt || '')}
      ${order.trackingNo ? `・ 超商單號：<strong>${escapeHtml(order.trackingNo)}</strong>` : ''}
    </div>
  ` : '';

  const couponLine = (order.discountAmount && order.discountAmount > 0)
    ? ` ・ 優惠碼「${escapeHtml(order.couponCode || '')}」折抵：-${formatPrice(order.discountAmount)}`
    : '';
  const manualDiscountLine = (order.manualDiscount && order.manualDiscount > 0)
    ? ` ・ 額外折抵：-${formatPrice(order.manualDiscount)}`
    : '';
  const depositLine = (order.depositReceived && order.depositReceived > 0)
    ? `<br>已收訂金：${formatPrice(order.depositReceived)}`
    : '';

  const recipientLine = isHomeDelivery
    ? `收件人：${escapeHtml(order.cvsName || '-')} ・ 手機：${escapeHtml(order.cvsPhone || '-')}<br>收件地址：${escapeHtml(order.address || '-')}`
    : `取件人：${escapeHtml(order.cvsName || '-')} ・ 手機：${escapeHtml(order.cvsPhone || '-')} ・ 門市店號：${escapeHtml(order.cvsStore || '-')}${order.cvsStoreName ? ` (${escapeHtml(order.cvsStoreName)})` : ''}`;

  const cvsInfo = isCvs ? `
    <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12px; color:var(--c-coffee); line-height:1.8">
      ${recipientLine}<br>
      商品小計：${formatPrice(order.subtotal)}${couponLine}${manualDiscountLine} ・ 運費：${order.shippingFee === 0 ? '免運' : formatPrice(order.shippingFee)} ・ 應付總額：${formatPrice(order.total)}${depositLine}
      ${isHomeDelivery ? `<br>轉帳狀態：${isPaymentConfirmed ? '✅ 已匯款' : '⏳ 待轉帳（客人需私訊取得匯款帳號）'}` : ''}
    </div>
  ` : (order.cvsName ? `
    <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12px; color:var(--c-coffee); line-height:1.8">
      （預購客人已預填取貨資訊，供小編確認參考，最終以 LINE 溝通為準）<br>
      ${recipientLine}<br>
      商品小計：${formatPrice(order.subtotal)}${couponLine}${manualDiscountLine} ・ 預估運費：${order.shippingFee === 0 ? '免運' : formatPrice(order.shippingFee)} ・ 預估總額：${formatPrice(order.total)}${depositLine}
      ${isHomeDelivery ? `<br>轉帳狀態：${isPaymentConfirmed ? '✅ 已匯款' : '⏳ 待轉帳（客人需私訊取得匯款帳號）'}` : ''}
    </div>
  ` : '');

  return `
    <div style="border:1.5px solid ${isShipped ? '#b2dfdb' : 'var(--c-blush)'}; border-radius:10px; margin-bottom:10px; overflow:hidden; background:${isShipped ? '#f9fffe' : '#fff'}">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; cursor:pointer; background:${isShipped ? '#edfaf6' : 'var(--c-cream)'}" id="toggle-order-${order.id}">
        <div style="flex:1; min-width:0">
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee); display:flex; align-items:center; flex-wrap:wrap; gap:4px">
            ${icon('user', 14)} ${escapeHtml(order.lineName || '未提供')} ${typePill} ${paymentPill} ${depositPill} ${shippedPill}
          </div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:3px">
            ${icon('clock', 14)} ${dateStr} ・ 共${itemCount}件 ・ 總額${formatPrice(order.total)}${!isCvs && depositReceivedNum > 0 ? ` ・ 尾款${formatPrice(balanceAmount)}` : ''}${order.orderNo ? ` ・ 編號：${escapeHtml(order.orderNo)}` : ''}
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0; margin-left:8px" onclick="event.stopPropagation()">
          ${isHomeDelivery ? `<button class="btn-icon ${isPaymentConfirmed ? '' : 'active-accent'}" id="payment-order-${order.id}" title="${isPaymentConfirmed ? '取消已匯款標記' : '標記已匯款'}" style="font-size:11px; padding:6px 8px">${isPaymentConfirmed ? '取消已匯款' : '標記已匯款'}</button>` : ''}
          ${!isShipped ? `<button class="btn-icon" id="edit-order-${order.id}" title="編輯商品/金額" style="font-size:11px; padding:6px 8px">編輯</button>` : ''}
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

// 宅配訂單：因為帳號不公開在網站上，客人要私訊小編才能拿到，匯款完成與否只能由小編這邊手動標記
async function togglePaymentConfirmed(order) {
  const newValue = !order.paymentConfirmed;
  if (newValue && !confirm(`確定要標記「${order.lineName || '此訂單'}」已完成匯款嗎？`)) return;
  await db.collection(COL.ORDERS).doc(order.id).update({ paymentConfirmed: newValue });
  showToast(newValue ? '已標記為已匯款' : '已取消已匯款標記');
  loadAndRenderOrders();
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
// 編輯訂單（商品內容 + 金額）：只有「未出貨」訂單能編輯
// 增減商品/數量時會自動調整對應商品的庫存，額外折抵金額跟已收訂金只是記錄用，不影響庫存
// ============================================
let editOrderState = {
  order: null,
  items: [], // 編輯中的商品清單（複製自 order.items，深複製避免直接改到原始資料）
  allProducts: null // 快取一次「+新增商品」用的商品清單，避免每次開啟都重新打 Firestore
};

function openEditOrderModal(order) {
  editOrderState.order = order;
  editOrderState.items = (order.items || []).map(item => ({ ...item }));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'editOrderModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:520px">
      <div class="modal-header">
        <span class="modal-title">編輯訂單${order.orderNo ? `（${escapeHtml(order.orderNo)}）` : ''}</span>
        <button class="modal-close" id="closeEditOrderModal">×</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:12px; color:var(--c-coffee)">
          客人：${escapeHtml(order.lineName || '未提供')}${order.cvsName ? ` ・ 取件人：${escapeHtml(order.cvsName)}` : ''}
        </div>

        <div class="field">
          <label class="field-label">
            ${order.deliveryMethod === 'homeDelivery' ? '收件資訊（宅配）' : '取貨資訊（超商）'}
            <span style="font-weight:400; color:var(--c-rose-text)">・客人下單後改地址/電話時直接在這裡改</span>
          </label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input type="text" id="eo_cvsName" value="${escapeHtml(order.cvsName || '')}" placeholder="${order.deliveryMethod === 'homeDelivery' ? '收件人姓名' : '取件人姓名'}">
            <input type="text" id="eo_cvsPhone" value="${escapeHtml(order.cvsPhone || '')}" placeholder="手機號碼">
          </div>
          ${order.deliveryMethod === 'homeDelivery' ? `
            <input type="text" id="eo_address" value="${escapeHtml(order.address || '')}" placeholder="收件地址" style="margin-top:8px">
          ` : `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px">
              <input type="text" id="eo_cvsStoreName" value="${escapeHtml(order.cvsStoreName || '')}" placeholder="取件門市名稱">
              <input type="text" id="eo_cvsStore" value="${escapeHtml(order.cvsStore || '')}" placeholder="門市店號">
            </div>
          `}
          <input type="text" id="eo_lineName" value="${escapeHtml(order.lineName || '')}" placeholder="客人 LINE 名稱" style="margin-top:8px">
        </div>

        <div class="field">
          <label class="field-label">訂單商品</label>
          <div id="editOrderItemsList"></div>
          <button class="btn-secondary" id="addOrderItemBtn" style="margin-top:6px">+ 新增商品</button>
        </div>

        <div class="field">
          <label class="field-label">額外折抵金額（選填，跟優惠碼折抵分開計算，例如客訴補償或人情折扣）</label>
          <input type="number" id="eo_manualDiscount" value="${order.manualDiscount ?? 0}" min="0">
        </div>
        <div class="field">
          <label class="field-label">運費</label>
          <input type="number" id="eo_shippingFee" value="${order.shippingFee ?? 0}" min="0">
        </div>
        <div class="field">
          <label class="field-label">已收訂金（選填，僅記錄用，不會影響應付總額計算）</label>
          <input type="number" id="eo_depositReceived" value="${order.depositReceived ?? 0}" min="0">
        </div>

        <div class="field" style="background:var(--c-cream); border-radius:8px; padding:12px">
          <div id="editOrderSummary"></div>
        </div>

        <button class="btn-primary" id="saveEditOrderBtn" style="margin-top:6px">儲存變更</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  renderEditOrderItems();
  updateEditOrderSummary();

  document.getElementById('closeEditOrderModal').addEventListener('click', closeEditOrderModal);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeEditOrderModal(); });
  document.getElementById('addOrderItemBtn').addEventListener('click', openAddOrderItemPicker);
  document.getElementById('eo_manualDiscount').addEventListener('input', updateEditOrderSummary);
  document.getElementById('eo_shippingFee').addEventListener('input', updateEditOrderSummary);
  document.getElementById('saveEditOrderBtn').addEventListener('click', saveEditedOrder);
}

function closeEditOrderModal() {
  document.getElementById('editOrderModalOverlay')?.remove();
  editOrderState.order = null;
  editOrderState.items = [];
}

function renderEditOrderItems() {
  const list = document.getElementById('editOrderItemsList');
  if (editOrderState.items.length === 0) {
    list.innerHTML = `<div style="font-size:12px; color:var(--c-rose-text); padding:8px 0">目前沒有商品，請按下方「+ 新增商品」加入</div>`;
    return;
  }
  list.innerHTML = editOrderState.items.map((item, i) => `
    <div style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:0.5px solid var(--c-blush)">
      <div style="width:36px; height:36px; border-radius:6px; overflow:hidden; background:var(--c-cream); flex-shrink:0">
        ${item.image ? `<img src="${escapeHtml(item.image)}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div style="flex:1; min-width:0">
        <div style="font-size:12px; font-weight:700; color:var(--c-coffee)">${escapeHtml(item.name)}${item.style ? `<span style="color:var(--c-rose-text); font-weight:400"> (${escapeHtml(item.style)})</span>` : ''}</div>
        <div style="font-size:11px; color:var(--c-rose-text)">${formatPrice(item.price)} / 件</div>
      </div>
      <div style="display:flex; align-items:center; gap:6px">
        <button class="ci-qbtn" data-eo-qty-minus="${i}" type="button">−</button>
        <span style="font-size:12px; font-weight:700; min-width:18px; text-align:center">${item.qty}</span>
        <button class="ci-qbtn" data-eo-qty-plus="${i}" type="button">+</button>
      </div>
      <div style="font-size:12px; font-weight:700; color:var(--c-orange); width:60px; text-align:right">${formatPrice(item.price * item.qty)}</div>
      <button class="btn-icon danger" data-eo-remove="${i}" type="button" style="padding:4px 6px">${icon('trash', 14)}</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-eo-qty-minus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.eoQtyMinus);
      if (editOrderState.items[i].qty > 1) editOrderState.items[i].qty--;
      renderEditOrderItems();
      updateEditOrderSummary();
    });
  });
  list.querySelectorAll('[data-eo-qty-plus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.eoQtyPlus);
      editOrderState.items[i].qty++;
      renderEditOrderItems();
      updateEditOrderSummary();
    });
  });
  list.querySelectorAll('[data-eo-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.eoRemove);
      editOrderState.items.splice(i, 1);
      renderEditOrderItems();
      updateEditOrderSummary();
    });
  });
}

function updateEditOrderSummary() {
  const summary = document.getElementById('editOrderSummary');
  if (!summary) return;
  const order = editOrderState.order;

  const subtotal = editOrderState.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const couponDiscount = order.discountAmount || 0;
  const manualDiscountVal = parseFloat(document.getElementById('eo_manualDiscount')?.value) || 0;
  const shippingVal = parseFloat(document.getElementById('eo_shippingFee')?.value) || 0;
  const total = Math.max(0, subtotal - couponDiscount - manualDiscountVal) + shippingVal;

  summary.innerHTML = `
    <div style="font-size:12px; color:var(--c-coffee); display:flex; justify-content:space-between; margin-bottom:4px"><span>商品小計</span><span>${formatPrice(subtotal)}</span></div>
    ${couponDiscount > 0 ? `<div style="font-size:12px; color:var(--c-orange); display:flex; justify-content:space-between; margin-bottom:4px"><span>優惠碼折抵（${escapeHtml(order.couponCode || '')}）</span><span>-${formatPrice(couponDiscount)}</span></div>` : ''}
    ${manualDiscountVal > 0 ? `<div style="font-size:12px; color:var(--c-orange); display:flex; justify-content:space-between; margin-bottom:4px"><span>額外折抵</span><span>-${formatPrice(manualDiscountVal)}</span></div>` : ''}
    <div style="font-size:12px; color:var(--c-coffee); display:flex; justify-content:space-between; margin-bottom:4px"><span>運費</span><span>${formatPrice(shippingVal)}</span></div>
    <div style="font-size:14px; font-weight:700; color:var(--c-coffee); display:flex; justify-content:space-between; border-top:0.5px solid var(--c-blush); padding-top:6px; margin-top:4px"><span>應付總額</span><span style="color:var(--c-orange)">${formatPrice(total)}</span></div>
  `;
}

// ---- 「+ 新增商品」選擇器：從商品目錄挑一個商品加進訂單 ----
async function openAddOrderItemPicker() {
  if (!editOrderState.allProducts) {
    try {
      const snap = await db.collection(COL.PRODUCTS).where('archived', '==', false).get();
      editOrderState.allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error(err);
      showToast('載入商品清單失敗，請稍後再試');
      return;
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'addOrderItemOverlay';
  overlay.style.zIndex = '250';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px">
      <div class="modal-header">
        <span class="modal-title">新增商品到訂單</span>
        <button class="modal-close" id="closeAddOrderItemModal">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <input type="text" id="addItemSearchInput" placeholder="搜尋商品名稱">
        </div>
        <div id="addItemProductList" style="max-height:320px; overflow-y:auto"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderList(keyword) {
    const kw = (keyword || '').trim().toLowerCase();
    const filtered = editOrderState.allProducts.filter(p => !kw || (p.name || '').toLowerCase().includes(kw));
    const listEl = document.getElementById('addItemProductList');
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px; color:var(--c-rose-text); padding:10px 0">找不到符合的商品</div>`;
      return;
    }
    listEl.innerHTML = filtered.map(p => `
      <div class="add-item-row" data-pick-product="${p.id}" style="display:flex; align-items:center; gap:8px; padding:8px 4px; border-bottom:0.5px solid var(--c-blush); cursor:pointer">
        <div style="width:36px; height:36px; border-radius:6px; overflow:hidden; background:var(--c-cream); flex-shrink:0">
          ${p.images && p.images[0] ? `<img src="${escapeHtml(p.images[0])}" style="width:100%;height:100%;object-fit:cover">` : ''}
        </div>
        <div style="flex:1; min-width:0; font-size:12px; color:var(--c-coffee)">${escapeHtml(p.name)}</div>
      </div>
    `).join('');
    listEl.querySelectorAll('[data-pick-product]').forEach(row => {
      row.addEventListener('click', () => {
        const product = editOrderState.allProducts.find(p => p.id === row.dataset.pickProduct);
        pickProductForOrderItem(product, overlay);
      });
    });
  }
  renderList('');

  document.getElementById('addItemSearchInput').addEventListener('input', (e) => renderList(e.target.value));
  document.getElementById('closeAddOrderItemModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
}

// 選定商品後，如果有款式要再選款式，沒有款式就直接加進訂單
function pickProductForOrderItem(product, pickerOverlay) {
  const styles = normalizeStyles(product.styles);
  if (styles.length === 0) {
    addItemToEditOrder(product, '');
    pickerOverlay.remove();
    return;
  }

  pickerOverlay.innerHTML = `
    <div class="modal-box" style="max-width:360px">
      <div class="modal-header">
        <span class="modal-title">選擇款式</span>
        <button class="modal-close" id="closeStylePickModal">×</button>
      </div>
      <div class="modal-body">
        <div class="tag-chip-list">
          ${styles.map(s => `<div class="tag-chip" data-pick-style="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`).join('')}
        </div>
      </div>
    </div>
  `;
  pickerOverlay.querySelectorAll('[data-pick-style]').forEach(chip => {
    chip.addEventListener('click', () => {
      addItemToEditOrder(product, chip.dataset.pickStyle);
      pickerOverlay.remove();
    });
  });
  document.getElementById('closeStylePickModal').addEventListener('click', () => pickerOverlay.remove());
}

function addItemToEditOrder(product, style) {
  const existing = editOrderState.items.find(i => i.productId === product.id && (i.style || '') === (style || ''));
  if (existing) {
    existing.qty += 1;
  } else {
    editOrderState.items.push({
      productId: product.id,
      name: product.name,
      style: style || '',
      qty: 1,
      price: getStylePrice(product, style),
      image: (product.images && product.images[0]) || '',
      stockType: getStyleStockType(product, style),
      deliveryMethod: product.deliveryMethod === 'homeDelivery' ? 'homeDelivery' : 'cvs'
    });
  }
  renderEditOrderItems();
  updateEditOrderSummary();
}

async function saveEditedOrder() {
  const order = editOrderState.order;
  if (editOrderState.items.length === 0) {
    showToast('訂單至少要有一項商品，如果整筆都不要了請直接刪除訂單');
    return;
  }

  const manualDiscount = parseFloat(document.getElementById('eo_manualDiscount').value) || 0;
  const shippingFee = parseFloat(document.getElementById('eo_shippingFee').value) || 0;
  const depositReceived = parseFloat(document.getElementById('eo_depositReceived').value) || 0;

  if (manualDiscount < 0 || shippingFee < 0 || depositReceived < 0) {
    showToast('金額不能是負數');
    return;
  }

  // 收件/取貨資訊：客人下單後常常會改地址或電話，這裡要能直接改。
  // 宅配訂單有地址、沒有門市；超商訂單有門市、沒有地址，所以對應的輸入框只會出現一種，
  // 讀取時用 ?. 保護，抓不到的那一邊就沿用原本的值，不要不小心把它清成空字串
  const isHomeDeliveryOrder = order.deliveryMethod === 'homeDelivery';
  const newCvsName = document.getElementById('eo_cvsName').value.trim();
  const newCvsPhone = document.getElementById('eo_cvsPhone').value.trim();
  const newLineName = document.getElementById('eo_lineName').value.trim();
  const newAddress = isHomeDeliveryOrder
    ? (document.getElementById('eo_address')?.value.trim() ?? '')
    : (order.address || '');
  const newCvsStoreName = isHomeDeliveryOrder
    ? (order.cvsStoreName || '')
    : (document.getElementById('eo_cvsStoreName')?.value.trim() ?? '');
  const newCvsStore = isHomeDeliveryOrder
    ? (order.cvsStore || '')
    : (document.getElementById('eo_cvsStore')?.value.trim() ?? '');

  if (!newCvsName) { showToast(isHomeDeliveryOrder ? '請填寫收件人姓名' : '請填寫取件人姓名'); return; }
  if (!newCvsPhone) { showToast('請填寫手機號碼'); return; }
  if (isHomeDeliveryOrder && !newAddress) { showToast('宅配訂單請填寫收件地址'); return; }

  const btn = document.getElementById('saveEditOrderBtn');
  btn.disabled = true;
  btn.textContent = '調整庫存中...';

  try {
    // 先依商品內容差異調整庫存（交易內會檢查夠不夠扣，不夠會 throw 並整批 rollback，不會扣一半）
    await adjustStockForOrderEdit(order.items || [], editOrderState.items);

    const subtotal = editOrderState.items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const couponDiscount = order.discountAmount || 0;
    const total = Math.max(0, subtotal - couponDiscount - manualDiscount) + shippingFee;

    btn.textContent = '儲存中...';
    await db.collection(COL.ORDERS).doc(order.id).update({
      items: editOrderState.items,
      subtotal,
      manualDiscount,
      shippingFee,
      depositReceived,
      total,
      lineName: newLineName,
      cvsName: newCvsName,
      cvsPhone: newCvsPhone,
      cvsStoreName: newCvsStoreName,
      cvsStore: newCvsStore,
      address: newAddress,
      lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('訂單已更新');
    closeEditOrderModal();
    loadAndRenderOrders();
  } catch (err) {
    console.error('編輯訂單失敗:', err);
    if (err.name === 'StockInsufficientError') {
      showToast(`庫存不足，無法儲存：${err.problems[0]}`);
    } else {
      showToast('儲存失敗，請稍後再試');
    }
    btn.disabled = false;
    btn.textContent = '儲存變更';
  }
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
      .filter(o => o.deliveryMethod !== 'homeDelivery') // 宅配訂單不是超商取貨，賣貨便格式不適用，排除掉
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
