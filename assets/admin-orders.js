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
  const typePill = isCvs
    ? `<span class="pill pill-instock">超商取貨</span>`
    : `<span class="pill pill-preorder">LINE／含預購</span>`;

  const cvsInfo = isCvs ? `
    <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:10px; font-size:12px; color:var(--c-coffee); line-height:1.8">
      取件人：${escapeHtml(order.cvsName || '-')} ・ 手機：${escapeHtml(order.cvsPhone || '-')} ・ 門市店號：${escapeHtml(order.cvsStore || '-')}<br>
      商品小計：${formatPrice(order.subtotal)} ・ 運費：${order.shippingFee === 0 ? '免運' : formatPrice(order.shippingFee)} ・ 應付總額：${formatPrice(order.total)}
    </div>
  ` : '';

  return `
    <div style="border:0.5px solid var(--c-blush); border-radius:10px; margin-bottom:10px; overflow:hidden">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; cursor:pointer; background:var(--c-cream)" id="toggle-order-${order.id}">
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee)">${icon('user', 18)}${escapeHtml(order.lineName || '未提供')} ${typePill}</div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:3px">${icon('clock', 18)}${dateStr} ・ 共${itemCount}件 ・ ${formatPrice(order.total)}</div>
        </div>
        <button class="btn-icon danger" id="del-order-${order.id}" title="刪除此訂單" onclick="event.stopPropagation()">${icon('trash', 18)}</button>
      </div>
      <div id="detail-order-${order.id}" style="display:none; padding:12px 14px">
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

    const snap = await db.collection(COL.ORDERS)
      .where('orderType', '==', 'cvs')
      .orderBy('createdAt', 'asc')
      .get();

    const orders = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => {
        const t = o.createdAt?.toDate ? o.createdAt.toDate() : null;
        return t && t >= startDate && t <= endDate;
      });

    if (orders.length === 0) {
      showToast('選擇的日期區間內沒有超商取貨訂單');
      return;
    }

    const header = ['＊取件人姓名', '＊取件人手機', '＊取件門市', '* 溫層', '＊商品', '＊訂單金額', '＊運費金額', '買家下訂日期', '商品備註', '其他資訊  (FB/LINE/IG帳號)'];

    const rows = orders.map(o => {
      const date = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
      const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
      const itemSummary = (o.items || []).map(i => `${i.name}${i.style ? '('+i.style+')' : ''}x${i.qty}`).join('、');
      return [
        o.cvsName || '',
        o.cvsPhone || '',
        o.cvsStore || '',
        '常溫',
        '楓之谷周邊',
        o.subtotal ?? o.total ?? 0,
        o.shippingFee ?? calcShippingFee(o.subtotal ?? o.total ?? 0),
        dateStr,
        itemSummary,
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
