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
      <div class="admin-btn-row">
        <button class="btn-icon" id="refreshOrdersBtn" style="width:auto" title="重新讀取最新訂單（平常會沿用快取，省 Firestore 讀取額度）">重新整理</button>
        <button class="btn-primary" id="addManualOrderBtn" style="width:auto">+ 手動新增訂單</button>
      </div>
    </div>

    <div id="ordersMigrationNotice"></div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:10px">匯出訂單匯入格式（賣貨便）</h3>
      <p style="font-size:12px; color:var(--c-rose-text); margin-bottom:12px; line-height:1.7">
        只會匯出「超商取貨」的訂單（宅配訂單不適用賣貨便格式，會自動排除）。<br>
        訂單金額已扣除優惠折抵與已收訂金，也就是超商實際要向客人收的貨款。<br>
        現貨訂單依日期區間匯出；<strong>預購訂單改成到右邊「含預購訂單」清單裡勾選要匯出哪幾張</strong>（到貨與否跟下單日期無關，用勾的比較準，已在「備貨頁」核對完的訂單會幫你預先勾好）。<br>
        下載後請另存或貼入賣貨便原始 .xlsm 範本中執行「驗證」。為避免重複匯入，請每次匯出後記下匯出區間。
      </p>
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px; font-size:13px; color:var(--c-coffee)">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
          <input type="checkbox" id="exportInstock"> 現貨訂單（依日期區間）
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
          <input type="checkbox" id="exportPreorder"> 預購訂單（依右邊清單勾選）
        </label>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div class="field" style="margin-bottom:0; flex:1; min-width:140px">
          <label class="field-label">起始日期（僅現貨訂單用）</label>
          <input type="date" id="exportStartDate">
        </div>
        <div class="field" style="margin-bottom:0; flex:1; min-width:140px">
          <label class="field-label">結束日期（僅現貨訂單用）</label>
          <input type="date" id="exportEndDate">
        </div>
        <button class="btn-primary" id="exportOrdersBtn" style="width:auto; padding:9px 20px">下載匯入檔（.xlsx）</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
      <div class="admin-card" style="margin-bottom:0">
        <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:4px; display:flex; align-items:center; gap:8px">
          <span class="pill pill-instock">現貨</span> 現貨訂單
        </h3>
        <p style="font-size:11px; color:var(--c-rose-text); margin-bottom:12px">超商取貨可匯出賣貨便・紫色「宅配」標籤者需等客人匯款</p>
        <div id="ordersListCvs"><div class="loading-wrap"><div class="spin"></div>載入中...</div></div>
      </div>
      <div class="admin-card" style="margin-bottom:0">
        <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:4px; display:flex; align-items:center; gap:8px">
          <span class="pill pill-preorder">預購</span> 含預購訂單
        </h3>
        <p style="font-size:11px; color:var(--c-rose-text); margin-bottom:12px">需透過 LINE 官方帳號確認・到貨後標記出貨會從採購單扣除</p>
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
  document.getElementById('addManualOrderBtn').addEventListener('click', createManualOrder);
  // 平常沿用快取（自己做的異動都會即時同步到快取），要看有沒有新進來的客人訂單時按這顆
  document.getElementById('refreshOrdersBtn').addEventListener('click', async () => {
    invalidateOrdersCache();
    invalidateFailedOrdersCache();
    resetShippedHistory(); // 已出貨那區也回到「尚未載入」，要看再點開，不會偷偷多讀
    await loadAndRenderOrders(true);
    await loadAndRenderFailedOrders(true);
    showToast('已重新讀取最新訂單');
  });

  await loadAndRenderOrders();
  await loadAndRenderFailedOrders();
}

// 失敗紀錄的快取，跟訂單快取同一套作法：這份清單每次重畫都要讀 100 筆，
// 但它其實很少變動（只有客人結帳失敗時才會多一筆），沒必要每次重畫都重讀
let failedOrdersCache = { data: null, at: 0 };
const FAILED_ORDERS_CACHE_KEY = 'kzone_admin_failed_orders_cache';

function persistFailedOrdersCache() {
  try {
    sessionStorage.setItem(FAILED_ORDERS_CACHE_KEY, JSON.stringify(failedOrdersCache));
  } catch (e) {}
}

function invalidateFailedOrdersCache() {
  failedOrdersCache = { data: null, at: 0 };
  try { sessionStorage.removeItem(FAILED_ORDERS_CACHE_KEY); } catch (e) {}
}

function patchFailedOrderInCache(id, changes) {
  if (!failedOrdersCache.data) return;
  const target = failedOrdersCache.data.find(f => f.id === id);
  if (target) Object.assign(target, changes);
  persistFailedOrdersCache();
}

function removeFailedOrderFromCache(id) {
  if (!failedOrdersCache.data) return;
  failedOrdersCache.data = failedOrdersCache.data.filter(f => f.id !== id);
  persistFailedOrdersCache();
}

async function getFailedOrdersForAdmin(forceRefresh) {
  if (!forceRefresh) {
    if (!failedOrdersCache.data) {
      try {
        const raw = sessionStorage.getItem(FAILED_ORDERS_CACHE_KEY);
        const cached = raw ? JSON.parse(raw) : null;
        if (cached && Array.isArray(cached.data) && Date.now() - cached.at < ORDERS_CACHE_TTL) {
          failedOrdersCache = { data: cached.data.map(reviveOrderTimestamps), at: cached.at };
        }
      } catch (e) {}
    }
    if (failedOrdersCache.data && (Date.now() - failedOrdersCache.at < ORDERS_CACHE_TTL)) {
      return failedOrdersCache.data;
    }
  }
  // 這裡不加 where('resolved','==',false)，因為要連已處理的也一起顯示（已處理的收起來放後面），
  // 而且單一 orderBy 不需要額外建立複合索引
  const snap = await db.collection(COL.FAILED_ORDERS).orderBy('createdAt', 'desc').limit(100).get();
  failedOrdersCache = { data: snap.docs.map(d => ({ id: d.id, ...d.data() })), at: Date.now() };
  persistFailedOrdersCache();
  return failedOrdersCache.data;
}

// 結帳失敗紀錄：客人按了送出卻沒能成立訂單的情況，一定要讓店家看得到
async function loadAndRenderFailedOrders(forceRefresh) {
  const wrap = document.getElementById('failedOrdersList');
  if (!wrap) return;
  try {
    const all = await getFailedOrdersForAdmin(forceRefresh);
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
        const newResolved = !f.resolved;
        await db.collection(COL.FAILED_ORDERS).doc(f.id).update({ resolved: newResolved });
        showToast(f.resolved ? '已改回未處理' : '已標記為已處理');
        f.resolved = newResolved;
        patchFailedOrderInCache(f.id, { resolved: newResolved });
        loadAndRenderFailedOrders();
      });
      document.getElementById(`restore-failed-${f.id}`)?.addEventListener('click', () => restoreFailedOrder(f));
      document.getElementById(`del-failed-${f.id}`)?.addEventListener('click', async () => {
        if (!confirm('確定要刪除這筆失敗紀錄嗎？')) return;
        await db.collection(COL.FAILED_ORDERS).doc(f.id).delete();
        showToast('已刪除');
        removeFailedOrderFromCache(f.id);
        loadAndRenderFailedOrders();
      });
    });
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入失敗紀錄失敗</div>`;
  }
}

// 手動新增一張空白訂單，建立後直接打開編輯視窗讓你填內容。
// 用途：客人把購物車截圖傳給你（例如網站額度用盡下不了單、或客人手機出問題），
// 你照著截圖把品項和收件資料 key 進去，存檔後再把後台訂單畫面截圖回傳給客人確認。
//
// 為什麼是「先建立空白單再用既有編輯視窗」而不是做一個全新的表單：
// 編輯訂單的視窗已經有完整功能（挑商品、改單價與數量、現貨/預購、收件資料、金額試算），
// 重做一份不但費工，兩邊的金額計算邏輯還可能不一致而算出不同的總額。
async function createManualOrder() {
  const lineName = prompt('客人的 LINE 名稱（可留空，之後在編輯視窗補）：');
  if (lineName === null) return; // 按了取消

  const btn = document.getElementById('addManualOrderBtn');
  btn.disabled = true;
  btn.textContent = '建立中...';

  try {
    const today = new Date();
    const orderDateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

    const docRef = await db.collection(COL.ORDERS).add({
      orderType: 'cvs',
      deliveryMethod: 'cvs',
      orderNo: genOrderNo(),
      lineName: (lineName || '').trim(),
      cvsName: '',
      cvsPhone: '',
      cvsStore: '',
      cvsStoreName: '',
      address: '',
      paymentConfirmed: null,
      items: [],
      subtotal: 0,
      couponCode: null,
      discountAmount: 0,
      manualDiscount: 0,
      depositReceived: 0,
      shippingFee: 0,
      total: 0,
      orderDate: orderDateStr,
      // 後台平常只查 shipped=false 的訂單，所以每張新訂單都一定要帶這個欄位，否則會查不到
      shipped: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      // 標記是手動建立的，日後對帳時分得出來哪些不是客人自己下的
      manuallyCreated: true
    });

    // 重新讀一次是為了拿到伺服器寫好的 createdAt，編輯視窗和訂單卡片都會用到
    const doc = await db.collection(COL.ORDERS).doc(docRef.id).get();
    const order = { id: doc.id, ...doc.data() };

    // 剛剛已經把這筆新訂單讀回來了，直接塞進快取就好，不用為了它整份重讀
    addOrderToCache(order);
    await loadAndRenderOrders();
    showToast('已建立空白訂單，請填入商品與收件資料');
    openEditOrderModal(order);
  } catch (err) {
    console.error('手動新增訂單失敗:', err);
    showToast('建立失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '+ 手動新增訂單';
  }
}

// 把失敗紀錄裡每一項的現貨/預購狀態，換成「現在」商品實際的設定。
// 為什麼要這樣做：失敗紀錄存的是「客人當初加入購物車那一刻」的狀態，
// 如果那之後你把商品改成現貨（或改成預購），舊快照不會自動跟著更新，
// 補單時如果照舊快照建立，就會出現「明明已經是現貨了，卻還被當預購」的錯帳。
// 商品被刪除、查不到現在資料時，才退回用舊快照的值（沒有更準的資料可用）
function deriveStockTypeFromProducts(items, productMap) {
  return items.map(item => {
    const product = productMap[item.productId];
    if (!product) return item; // 商品已刪除，沿用舊快照
    return { ...item, stockType: getStyleStockType(product, item.style) };
  });
}

// 把一筆結帳失敗紀錄補成正式訂單。
// 客人當初確實下過單、資料也都留著了，只是因為額度用盡或連線問題沒寫進資料庫，
// 所以這裡直接用同一份資料重建訂單，不用請客人重新下單一次。
async function restoreFailedOrder(f) {
  const itemCount = (f.items || []).reduce((s, i) => s + (i.qty || 0), 0);
  if (!confirm(`要用這筆紀錄建立正式訂單嗎？\n\n客人：${f.lineName || '未提供'}\n商品：共 ${itemCount} 件\n金額：${formatPrice(f.total || 0)}\n\n訂單建立後，這筆失敗紀錄會自動移除（訂單會出現在上方列表）。`)) return;

  try {
    // 補回來的商品項目先照失敗紀錄的快照組出來（現貨/預購狀態等一下會用「現在」的商品資料重新對過一次）
    const rawItems = (f.items || []).map(i => ({
      productId: i.productId || '',
      name: i.name || '',
      style: i.style || '',
      price: i.price ?? 0,
      qty: i.qty ?? 0,
      image: i.image || '',
      stockType: i.stockType || (f.hasPreorder ? 'preorder' : 'instock'),
      deliveryMethod: i.deliveryMethod || (f.deliveryMethod === 'homeDelivery' ? 'homeDelivery' : 'cvs')
    }));

    // 跟客人結帳時一樣，補單這一刻也重新讀一次商品現況：
    // 1. 現貨/預購狀態改用現在的設定，不再照失敗當下的舊快照
    // 2. 庫存不足或已售完要先讓你知道，你可以自己決定要不要照樣建立訂單
    const productIds = [...new Set(rawItems.map(i => i.productId).filter(Boolean))];
    const productDocs = await Promise.all(productIds.map(pid => db.collection(COL.PRODUCTS).doc(pid).get().catch(() => null)));
    const productMap = {};
    productDocs.forEach((doc, idx) => {
      if (doc && doc.exists) productMap[productIds[idx]] = { id: doc.id, ...doc.data() };
    });

    const items = deriveStockTypeFromProducts(rawItems, productMap);

    const stockProblems = await validateCartStock(items);
    if (stockProblems) {
      const proceed = confirm(
        `重新核對庫存後發現問題：\n\n${stockProblems.join('\n')}\n\n仍要照樣建立這張訂單嗎？\n（建議先確認貨源，或取消後到商品管理調整庫存/現貨預購設定再重試）`
      );
      if (!proceed) return;
    }

    const anyPreorder = items.some(i => i.stockType === 'preorder');

    const createdAt = f.createdAt?.toDate ? f.createdAt.toDate() : new Date();
    const orderDateStr = `${createdAt.getFullYear()}/${createdAt.getMonth() + 1}/${createdAt.getDate()}`;

    await db.collection(COL.ORDERS).add({
      orderType: anyPreorder ? 'line' : 'cvs',
      deliveryMethod: f.deliveryMethod === 'homeDelivery' ? 'homeDelivery' : 'cvs',
      orderNo: f.orderNo || genOrderNo(),
      lineName: f.lineName || '',
      cvsName: f.cvsName || '',
      cvsPhone: f.cvsPhone || '',
      cvsStore: f.cvsStore || '',
      cvsStoreName: f.cvsStoreName || '',
      address: f.address || '',
      paymentConfirmed: f.deliveryMethod === 'homeDelivery' ? false : null,
      items,
      subtotal: f.subtotal ?? 0,
      couponCode: f.couponCode || null,
      discountAmount: f.discountAmount ?? 0,
      shippingFee: f.shippingFee ?? 0,
      total: f.total ?? 0,
      orderDate: orderDateStr,
      // 後台平常只查 shipped=false 的訂單，補成的訂單當然是還沒出貨
      shipped: false,
      // 保留原本下單時間，訂單才會排在正確的時序位置，不會跑到最上面看起來像新單
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      restoredFromFailure: true,
      originalFailedAt: f.createdAt || null
    });

    // 訂單建立成功後才處理庫存。當初失敗多半就是卡在扣庫存這一步，所以庫存很可能沒扣到，
    // 這裡補扣一次；萬一庫存不足也不能讓訂單消失（訂單已經建好了），只提醒你去人工確認
    let stockWarning = '';
    if (!f.stockAlreadyDeducted) {
      try {
        await deductStockForOrder(items);
      } catch (stockErr) {
        console.error('補單成功，但扣庫存失敗:', stockErr);
        stockWarning = '（庫存未扣，請自行確認）';
      }
    }

    // 訂單已經建立成功了，這筆失敗紀錄就完成任務了，直接刪掉。
    // 不留成「已處理」的原因：那張單已經在訂單列表裡，紀錄再留著等於同一張單出現兩次，
    // 對帳時會分不清哪個才是真的。刪除排在訂單建立成功之後，所以不會有資料遺失的風險
    await db.collection(COL.FAILED_ORDERS).doc(f.id).delete();

    // 新訂單是剛建立的（手上沒有寫好 createdAt 的完整資料），這裡只好讓訂單清單重讀一次；
    // 失敗紀錄那邊我們很清楚就是刪掉這一筆，直接從快取移除即可
    invalidateOrdersCache();
    removeFailedOrderFromCache(f.id);
    showToast(`已補成訂單 ${f.orderNo || ''}${stockWarning}`);
    loadAndRenderOrders();
    loadAndRenderFailedOrders();
  } catch (err) {
    console.error('補單失敗:', err);
    showToast('補單失敗，請稍後再試（失敗紀錄仍保留）');
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
          ${!isResolved ? `<button class="btn-icon active-accent" id="restore-failed-${f.id}" title="用這筆紀錄的資料建立正式訂單" style="font-size:11px; padding:6px 8px">補成訂單</button>` : ''}
          <button class="btn-icon" id="resolve-failed-${f.id}" style="font-size:11px; padding:6px 8px">${isResolved ? '改回未處理' : '標記已處理'}</button>
          <button class="btn-icon danger" id="del-failed-${f.id}" title="刪除此紀錄">${icon('trash', 14)}</button>
        </div>
      </div>
    </div>
  `;
}

// 後台這一輪撈回來的訂單，暫存起來給併單視窗、採購單共用。
// 原本每個地方都各自重打一次 Firestore（訂單列表 200 筆、併單視窗 200 筆、採購單 300 筆），
// 光是點開幾個功能就是上百次讀取，很容易把免費方案每天 5 萬次的額度燒完，
// 額度一爆連客人結帳都會失敗（會收到 Quota exceeded）。
let ordersCache = { data: null, at: 0 };
const ORDERS_CACHE_TTL = 3 * 60 * 1000; // 3 分鐘內重複使用，超過就重新讀
// 結尾的版本號：改過讀取邏輯時就把它加一，讓瀏覽器裡舊版留下來的快取直接作廢。
// （之前那版有問題的邏輯可能在你的瀏覽器裡留下一份「空的訂單清單」快取，不換 key 的話會繼續看到空畫面）
const ORDERS_CACHE_KEY = 'kzone_admin_orders_cache_v2';

// Firestore 的時間欄位存進 sessionStorage 會被 JSON 轉成純物件，.toDate() 會不見。
// 訂單卡片的日期、併單要挑「最早那一筆」都靠它，所以讀回來時要還原成真正的 Timestamp，
// 不還原的話日期會顯示錯誤、併單也會挑錯要保留的訂單
const ORDER_TIME_FIELDS = ['createdAt', 'shippedAt', 'lastEditedAt', 'mergedAt'];
function reviveOrderTimestamps(order) {
  for (const key of ORDER_TIME_FIELDS) {
    const v = order[key];
    if (v && typeof v === 'object' && typeof v.seconds === 'number' && typeof v.toDate !== 'function') {
      order[key] = new firebase.firestore.Timestamp(v.seconds, v.nanoseconds || 0);
    }
  }
  return order;
}

// 把快取存進 sessionStorage：後台重新整理(F5)、或在分頁之間來回切換時，
// 只要還在 TTL 內就不用再把整份訂單重讀一次（一次就是上百筆讀取）
function persistOrdersCache() {
  try {
    sessionStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(ordersCache));
  } catch (e) {
    // 存不進去（容量滿或隱私模式）就算了，只是少一層省讀取的效果，不影響功能
  }
}

function restoreOrdersCache() {
  if (ordersCache.data) return;
  try {
    const raw = sessionStorage.getItem(ORDERS_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.data)) return;
    if (Date.now() - cached.at >= ORDERS_CACHE_TTL) return;
    ordersCache = { data: cached.data.map(reviveOrderTimestamps), at: cached.at };
  } catch (e) {
    // 壞掉就當作沒有快取，重新讀一次就好
  }
}

// ---- 只載入「未出貨」訂單 ----
// 已出貨的訂單是歷史資料，幾乎不會再變動，卻會一直累積下去。
// 如果每次開後台都連已出貨的一起讀回來，訂單越多就讀越兇，最後就是 Firestore 免費額度被榨乾、
// 客人結帳收到「Quota exceeded」。所以平常只讀未出貨的，已出貨的要看時才另外分批載入。
//
// 查詢只用單一欄位的等於條件（不加 orderBy），這樣 Firestore 用內建索引就能跑，
// 不需要另外去主控台建立複合索引；排序改在前端做，反正未出貨的筆數本來就不多。
const orderSortNewestFirst = (a, b) => {
  const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
  const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
  return tb - ta;
};

async function getOrdersForAdmin(forceRefresh) {
  if (!forceRefresh) {
    restoreOrdersCache();
    if (ordersCache.data && (Date.now() - ordersCache.at < ORDERS_CACHE_TTL)) {
      return ordersCache.data;
    }
  }

  let orders;
  if (await needsShippedFieldMigration()) {
    // 舊資料還沒補上 shipped 欄位時，用舊的方式整份撈回來，
    // 確保畫面不會一片空白（補完資料之後就不會再走這條路）
    const snap = await db.collection(COL.ORDERS).orderBy('createdAt', 'desc').limit(200).get();
    orders = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => !o.shippedAt);
  } else {
    const snap = await db.collection(COL.ORDERS).where('shipped', '==', false).get();
    orders = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(orderSortNewestFirst);
  }

  ordersCache = { data: orders, at: Date.now() };
  persistOrdersCache();
  return ordersCache.data;
}

// ---- 舊訂單沒有 shipped 這個欄位，要一次補齊，之後才能只查未出貨的 ----
// 判斷方式：只認「資料升級真的跑完之後寫在網站設定裡的那個記號」，不做任何聰明的猜測。
//
// ⚠ 這裡踩過一次很痛的坑，千萬不要改回去猜：
// 原本是「讀最新一筆訂單，看它有沒有 shipped 欄位」來判斷。結果只要在升級前有客人下了新訂單
// （新訂單本來就自帶 shipped 欄位），系統就會誤判成「已經升級過了」，接著改用只查 shipped=false 的方式，
// 那些還沒補欄位的舊訂單就通通查不到 —— 後台看起來像是所有訂單都不見了（資料其實好好的，只是查不到）。
// 所以判斷一定要用「確定跑完才會寫入」的記號，而不是從資料長相去推測。
let shippedMigrationNeeded = null;

async function needsShippedFieldMigration() {
  if (shippedMigrationNeeded !== null) return shippedMigrationNeeded;
  try {
    const doc = await db.collection(COL.SETTINGS).doc('main').get();
    shippedMigrationNeeded = !(doc.exists && doc.data().ordersShippedMigrated === true);
  } catch (err) {
    console.error('確認訂單資料格式失敗:', err);
    shippedMigrationNeeded = true; // 判斷不出來時走保守路線（用舊方式讀），寧可多讀也不要漏訂單
  }
  return shippedMigrationNeeded;
}

// 一次把所有舊訂單補上 shipped 欄位（shipped = 有沒有出貨日期）。
// 用批次寫入，500 筆一批（Firestore 單批上限）
async function migrateOrdersShippedField() {
  const snap = await db.collection(COL.ORDERS).get();
  const targets = snap.docs.filter(d => d.data().shipped === undefined);

  for (let i = 0; i < targets.length; i += 500) {
    const batch = db.batch();
    targets.slice(i, i + 500).forEach(d => {
      batch.update(d.ref, { shipped: !!d.data().shippedAt });
    });
    await batch.commit();
  }

  // 一定要等所有訂單都補完了，才寫下「已完成升級」這個記號。
  // 順序不能顛倒：記號一旦寫下去，系統就會改用只查未出貨的方式，
  // 這時候若還有訂單沒補到欄位，那些訂單就會從後台清單消失
  await db.collection(COL.SETTINGS).doc('main').set({ ordersShippedMigrated: true }, { merge: true });
  clearStorefrontCache(); // 網站設定被改過了，順手清掉前台的設定快取

  shippedMigrationNeeded = false;
  return targets.length;
}

// 改到訂單資料時呼叫，讓下一次讀取一定拿到最新的。
// ⚠ 這個會讓下次讀取重新抓回全部訂單（上百筆讀取），所以只在「不知道改了什麼」時才用，
// 例如手動按重新整理。單筆訂單的異動請改用下面的 patch / remove / add，不要整份丟掉重讀
function invalidateOrdersCache() {
  ordersCache = { data: null, at: 0 };
  try { sessionStorage.removeItem(ORDERS_CACHE_KEY); } catch (e) {}
}

// ---- 以下三個是「只動快取裡的那一筆」，避免每做一個小動作就整份訂單重讀 ----
// 後台每天最花讀取額度的就是這件事：改一個小地方 → 整份 200 筆重讀一次。
// 我們寫進資料庫的內容自己最清楚，直接同步到快取即可，資料不會不一致
function patchOrderInCache(orderId, changes) {
  if (!ordersCache.data) return;
  const target = ordersCache.data.find(o => o.id === orderId);
  if (!target) return;
  Object.assign(target, changes);
  persistOrdersCache();
}

function removeOrderFromCache(orderId) {
  if (!ordersCache.data) return;
  ordersCache.data = ordersCache.data.filter(o => o.id !== orderId);
  persistOrdersCache();
}

function addOrderToCache(order) {
  if (!ordersCache.data) return;
  // 列表是依建立時間新到舊排序，新訂單直接放最前面
  ordersCache.data = [order, ...ordersCache.data.filter(o => o.id !== order.id)];
  persistOrdersCache();
}

async function loadAndRenderOrders(forceRefresh) {
  const cvs = document.getElementById('ordersListCvs');
  const line = document.getElementById('ordersListLine');
  try {
    const orders = await getOrdersForAdmin(forceRefresh);
    renderMigrationNoticeIfNeeded();

    // 左右兩欄只依「現貨 / 含預購」區分，不再把宅配訂單另外挑到右邊。
    // （原本宅配單被歸到右欄，結果全是現貨商品的宅配單出現在「含預購」欄位，看起來像跑錯地方。）
    // 宅配單靠卡片上的紫色「宅配」標籤和「待轉帳／已匯款」標籤區分即可；
    // 賣貨便匯出那邊本來就會自動排除宅配單，不會因為放在左欄而匯錯。
    // 注意：舊訂單的 deliveryMethod 可能是 undefined（在新增此欄位之前的訂單），一律當作超商處理
    // 保險起見再濾一次未出貨（舊資料還沒補欄位時是用舊方式撈回來的）
    const pending = orders.filter(o => !o.shippedAt);
    seedExportPreorderSelection(pending);

    renderOrderColumn(cvs, pending.filter(o => o.orderType === 'cvs'), 'cvs');
    renderOrderColumn(line, pending.filter(o => o.orderType !== 'cvs'), 'line');

  } catch (err) {
    console.error(err);
    const errMsg = `<div class="empty-state">${icon('alert-circle', 18)}載入訂單失敗</div>`;
    if (cvs) cvs.innerHTML = errMsg;
    if (line) line.innerHTML = errMsg;
  }
}

// 舊訂單還沒補上 shipped 欄位時，在訂單頁最上面顯示一塊提醒＋一鍵補資料的按鈕。
// 沒補之前系統會自動用舊方式讀取，功能一切正常，只是省不到讀取額度
function renderMigrationNoticeIfNeeded() {
  const wrap = document.getElementById('ordersMigrationNotice');
  if (!wrap) return;
  if (!shippedMigrationNeeded) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div class="admin-card" style="background:#fff8f5; border:1px solid var(--c-orange); margin-bottom:16px">
      <div style="font-size:13px; font-weight:700; color:var(--c-coffee); margin-bottom:6px">
        ${icon('alert-circle', 15)} 建議執行一次資料升級（只需要按一次）
      </div>
      <p style="font-size:12px; color:var(--c-rose-text); line-height:1.8; margin-bottom:10px">
        為了讓後台平常只載入「待出貨」的訂單、不要每次都把已出貨的歷史訂單一起讀回來（這是之前 Firestore 額度被用完、
        客人結帳失敗的主因），需要幫現有訂單補上一個標記欄位。<br>
        這個動作只是幫每張舊訂單補上「有沒有出貨」的標記，<strong>不會改到金額、商品或任何訂單內容</strong>，按一次就好。
      </p>
      <button class="btn-primary" id="runOrdersMigrationBtn" style="width:auto; padding:9px 20px">立即執行資料升級</button>
    </div>
  `;

  document.getElementById('runOrdersMigrationBtn').addEventListener('click', async () => {
    const btn = document.getElementById('runOrdersMigrationBtn');
    btn.disabled = true;
    btn.textContent = '升級中，請不要關閉頁面...';
    try {
      const count = await migrateOrdersShippedField();
      showToast(`資料升級完成，共處理 ${count} 筆訂單`);
      invalidateOrdersCache();
      resetShippedHistory();
      await loadAndRenderOrders(true);
    } catch (err) {
      console.error('訂單資料升級失敗:', err);
      showToast('資料升級失敗，請稍後再試（訂單資料沒有受到影響）');
      btn.disabled = false;
      btn.textContent = '立即執行資料升級';
    }
  });
}

// 記住「已出貨」區塊是不是展開的。存在畫面重繪之外的地方，
// 這樣標記出貨、編輯訂單之後重畫列表時，展開狀態不會被重設回收起
const shippedExpanded = new Set();

// ---- 已出貨（歷史）訂單：點開才載入，而且一次只拿 50 筆 ----
// 這份資料只放在記憶體，不寫進 sessionStorage：歷史訂單資料量會越長越大，
// 存進瀏覽器容易爆掉，而且它本來就不是每天要看的東西
const SHIPPED_PAGE_SIZE = 50;
const shippedHistory = { orders: [], cursor: null, loaded: false, loading: false, done: false };

function resetShippedHistory() {
  shippedHistory.orders = [];
  shippedHistory.cursor = null;
  shippedHistory.loaded = false;
  shippedHistory.loading = false;
  shippedHistory.done = false;
}

// 依建立時間新到舊分批拿，拿回來之後只留已出貨的（未出貨的平常那份已經有了，不重複顯示）。
// 只用單一欄位的 orderBy，不需要額外建立複合索引
async function loadMoreShippedHistory() {
  let q = db.collection(COL.ORDERS).orderBy('createdAt', 'desc').limit(SHIPPED_PAGE_SIZE);
  if (shippedHistory.cursor) q = q.startAfter(shippedHistory.cursor);

  const snap = await q.get();
  shippedHistory.loaded = true;

  if (snap.empty) {
    shippedHistory.done = true;
    return;
  }

  shippedHistory.cursor = snap.docs[snap.docs.length - 1];
  const page = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => !!o.shippedAt);
  const seen = new Set(shippedHistory.orders.map(o => o.id));
  shippedHistory.orders = [...shippedHistory.orders, ...page.filter(o => !seen.has(o.id))];

  // 拿回來的筆數不足一頁，代表已經翻到最底了
  if (snap.docs.length < SHIPPED_PAGE_SIZE) shippedHistory.done = true;
}

// 只重畫兩欄訂單，不重新去資料庫拿資料
function refreshOrderColumns() {
  const cvs = document.getElementById('ordersListCvs');
  const line = document.getElementById('ordersListLine');
  if (!cvs || !line) return;
  const pending = (ordersCache.data || []).filter(o => !o.shippedAt);
  renderOrderColumn(cvs, pending.filter(o => o.orderType === 'cvs'), 'cvs');
  renderOrderColumn(line, pending.filter(o => o.orderType !== 'cvs'), 'line');
}

// ---- 匯出賣貨便：預購訂單改成手動勾選要匯出哪幾張，不再靠日期區間一次全撈 ----
// 因為預購訂單是不是「真的到貨、可以出貨」跟下單日期沒有關係（可能等了一個月才到貨），
// 用日期篩選常常會漏掉還沒出貨的舊單，或誤匯到還在等貨的新單，所以改成手動勾選最準確
let exportPreorderSelection = new Set(); // 目前勾選要匯出的訂單 id
let exportPreorderSeeded = new Set();    // 記錄哪些訂單已經套用過「預設勾選」，避免每次重繪都把使用者手動取消的勾選打回來

// 一張訂單夠不夠格出現在「勾選匯出」清單裡：要含預購商品、不是宅配（賣貨便格式不支援宅配）、還沒出貨
function isEligibleForPreorderExport(order) {
  const hasAnyPreorderItem = (order.items || []).some(item => isPreorderOrderItem(order, item));
  return hasAnyPreorderItem && order.deliveryMethod !== 'homeDelivery' && !order.shippedAt;
}

// 第一次看到這張訂單時套用預設值：跟訂單列表的綠色「備貨完成」標記連動，
// 備貨頁核對過都到齊的訂單，直接幫你先勾起來；其餘的預設不勾，避免東西還沒到貨就被匯出
function seedExportPreorderSelection(orders) {
  orders.forEach(o => {
    if (!isEligibleForPreorderExport(o) || exportPreorderSeeded.has(o.id)) return;
    exportPreorderSeeded.add(o.id);
    if (o.pickingCompleted) exportPreorderSelection.add(o.id);
  });
}

function renderOrderColumn(container, pending, colType) {
  // 已出貨的訂單不會跟著平常的訂單一起載入（那是每天都在累積的歷史資料，
  // 每次都讀回來就是白白消耗 Firestore 額度），要看的時候才分批去拿
  const shipped = shippedHistory.orders.filter(o =>
    colType === 'cvs' ? o.orderType === 'cvs' : o.orderType !== 'cvs'
  );
  const isOpen = shippedExpanded.has(colType);

  let html = '';

  if (pending.length === 0) {
    html += `<div class="empty-state" style="padding:30px 10px">${icon('clipboard-off', 18)}<p style="margin-top:8px">目前沒有待出貨的訂單</p></div>`;
  } else {
    // 待處理訂單（全部顯示）——這才是每天要處理的東西
    html += pending.map(order => renderOrderCard(order)).join('');
  }

  // 已出貨訂單預設不載入也不展開，只留一行可以點開的標題。
  // 點開才會去資料庫分批拿（一次 50 筆），不點就完全不花讀取額度
  html += `<div style="border-top:1.5px dashed var(--c-blush); margin:12px 0 10px; padding-top:10px">
    <button id="shipped-toggle-${colType}"
      style="width:100%; display:flex; align-items:center; gap:6px; background:var(--c-cream); border:0.5px dashed var(--c-rose); color:var(--c-rose-text); border-radius:8px; padding:9px 12px; font-size:12px; cursor:pointer">
      <span>${icon(isOpen ? 'chevron-down' : 'chevron-right', 14)}</span>
      <span>${icon('check', 13)} 已出貨訂單${shippedHistory.loaded ? `（已載入 ${shipped.length} 筆）` : '（點此載入）'}</span>
      <span style="margin-left:auto">${isOpen ? '點此收起' : (shippedHistory.loaded ? '點此展開' : '尚未載入')}</span>
    </button>
    <div id="shipped-list-${colType}" style="display:${isOpen ? 'block' : 'none'}; margin-top:8px">
      ${shippedHistory.loading
        ? `<div class="loading-wrap"><div class="spin"></div>載入中...</div>`
        : (shipped.length === 0
            ? `<div class="empty-state" style="padding:16px 10px">這一欄目前沒有已出貨的訂單</div>`
            : shipped.map(order => renderOrderCard(order)).join(''))}
      ${(isOpen && shippedHistory.loaded && !shippedHistory.done && !shippedHistory.loading)
        ? `<button id="shipped-more-${colType}" class="btn-icon" style="width:100%; margin-top:8px">再載入更早的訂單</button>`
        : ''}
    </div>
  </div>`;

  container.innerHTML = html;

  document.getElementById(`shipped-toggle-${colType}`)?.addEventListener('click', async () => {
    if (shippedExpanded.has(colType)) {
      shippedExpanded.delete(colType);
      renderOrderColumn(container, pending, colType);
      return;
    }
    shippedExpanded.add(colType);
    // 第一次展開才去資料庫拿，之後切換展開/收起都用已經拿到的資料
    if (!shippedHistory.loaded) {
      shippedHistory.loading = true;
      renderOrderColumn(container, pending, colType);
      try {
        await loadMoreShippedHistory();
      } catch (err) {
        console.error('載入已出貨訂單失敗:', err);
        showToast('載入已出貨訂單失敗，請稍後再試');
      }
      shippedHistory.loading = false;
    }
    refreshOrderColumns();
  });

  document.getElementById(`shipped-more-${colType}`)?.addEventListener('click', async () => {
    shippedHistory.loading = true;
    renderOrderColumn(container, pending, colType);
    try {
      await loadMoreShippedHistory();
    } catch (err) {
      console.error('載入已出貨訂單失敗:', err);
      showToast('載入已出貨訂單失敗，請稍後再試');
    }
    shippedHistory.loading = false;
    refreshOrderColumns();
  });

  // 綁定所有訂單事件（待出貨 + 已載入的已出貨都要綁）
  [...pending, ...(isOpen ? shipped : [])].forEach(order => {
    document.getElementById(`del-order-${order.id}`)?.addEventListener('click', () => deleteOrder(order.id));
    document.getElementById(`ship-order-${order.id}`)?.addEventListener('click', () => openShipModal(order));
    document.getElementById(`edit-order-${order.id}`)?.addEventListener('click', () => openEditOrderModal(order));
    document.getElementById(`payment-order-${order.id}`)?.addEventListener('click', () => togglePaymentConfirmed(order));
    document.getElementById(`merge-order-${order.id}`)?.addEventListener('click', () => openMergeOrderModal(order));
    document.getElementById(`toggle-order-${order.id}`)?.addEventListener('click', () => {
      const detail = document.getElementById(`detail-order-${order.id}`);
      detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
    // 備註離開欄位（blur）就自動存檔，不用另外按儲存按鈕，才符合「客人講的當下隨手記」的使用情境
    document.getElementById(`note-order-${order.id}`)?.addEventListener('change', async (e) => {
      const value = e.target.value.trim();
      try {
        await db.collection(COL.ORDERS).doc(order.id).update({ note: value });
        order.note = value;
        e.target.style.background = value ? '#fff9e6' : '#fff';
      } catch (err) {
        console.error(err);
        showToast('備註儲存失敗，請稍後再試');
      }
    });
    // 勾選/取消勾選只是改記憶體裡的清單，不用存資料庫，按「下載匯入檔」時才會讀這個清單
    document.getElementById(`export-pick-${order.id}`)?.addEventListener('change', (e) => {
      if (e.target.checked) exportPreorderSelection.add(order.id);
      else exportPreorderSelection.delete(order.id);
    });
  });
}

function renderOrderCard(order) {
  const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date();
  const dateStr = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  const itemCount = (order.items || []).reduce((sum, i) => sum + i.qty, 0);
  const isCvs = order.orderType === 'cvs';
  const isHomeDelivery = order.deliveryMethod === 'homeDelivery';
  const isShipped = !!order.shippedAt;
  const isPaymentConfirmed = !!order.paymentConfirmed;
  // 備貨頁把這張訂單的商品全部核對完、按了「已完成」時會寫 pickingCompleted。
  // 出貨前這張單在訂單列表要特別標出來，讓你一眼看出「這張可以出貨了」，不用再切去備貨頁確認。
  // 出貨後這個狀態就沒有意義了（已經出貨），不用再顯示，避免跟已出貨的顏色搶視覺
  const isPickingCompleted = !!order.pickingCompleted && !isShipped;

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
    : (isPickingCompleted
        ? `<span class="pill" style="background:#d4edda; color:#1a5c2a; margin-left:4px">${icon('check', 14)} 備貨完成</span>`
        : `<span class="pill" style="background:#fff3cd; color:#856404; margin-left:4px">待出貨</span>`);

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
      ${recipientLine}<br>
      商品小計：${formatPrice(order.subtotal)}${couponLine}${manualDiscountLine} ・ 預估運費：${order.shippingFee === 0 ? '免運' : formatPrice(order.shippingFee)} ・ 預估總額：${formatPrice(order.total)}${depositLine}
      ${isHomeDelivery ? `<br>轉帳狀態：${isPaymentConfirmed ? '✅ 已匯款' : '⏳ 待轉帳（客人需私訊取得匯款帳號）'}` : ''}
    </div>
  ` : '');

  const cardBorderColor = isShipped ? '#b2dfdb' : (isPickingCompleted ? '#7bc98e' : 'var(--c-blush)');
  const cardBg = isShipped ? '#f9fffe' : (isPickingCompleted ? '#f6fdf7' : '#fff');
  const headerBg = isShipped ? '#edfaf6' : (isPickingCompleted ? '#e9f9ec' : 'var(--c-cream)');

  // 含預購商品、還沒出貨、也不是宅配單的訂單，才需要出現在「匯出賣貨便」的勾選清單裡
  const eligibleForPreorderExport = isEligibleForPreorderExport(order);
  const exportCheckboxHtml = eligibleForPreorderExport ? `
    <label style="display:flex; align-items:center; gap:5px; margin-top:6px; font-size:11px; color:var(--c-coffee); cursor:pointer; width:fit-content" onclick="event.stopPropagation()">
      <input type="checkbox" id="export-pick-${order.id}" ${exportPreorderSelection.has(order.id) ? 'checked' : ''}>
      匯出賣貨便時包含這張
    </label>
  ` : '';

  return `
    <div style="border:1.5px solid ${cardBorderColor}; border-radius:10px; margin-bottom:10px; overflow:hidden; background:${cardBg}">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; cursor:pointer; background:${headerBg}" id="toggle-order-${order.id}">
        <div style="flex:1; min-width:0">
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee); display:flex; align-items:center; flex-wrap:wrap; gap:4px">
            ${icon('user', 14)} ${escapeHtml(order.lineName || '未提供')} ${typePill} ${paymentPill} ${depositPill} ${shippedPill}
          </div>
          <div style="font-size:11px; color:var(--c-rose-text); margin-top:3px">
            ${icon('clock', 14)} ${dateStr} ・ 共${itemCount}件 ・ 總額${formatPrice(order.total)}${!isCvs && depositReceivedNum > 0 ? ` ・ 尾款${formatPrice(balanceAmount)}` : ''}${order.orderNo ? ` ・ 編號：${escapeHtml(order.orderNo)}` : ''}
          </div>
          <div style="margin-top:6px" onclick="event.stopPropagation()">
            <textarea id="note-order-${order.id}" placeholder="備註（例如客人許願的款式/顏色，離開欄位自動存檔）" rows="1"
              style="width:100%; resize:vertical; border:0.5px solid var(--c-rose); border-radius:6px; padding:5px 8px; font-size:12px; color:var(--c-coffee); background:${order.note ? '#fff9e6' : '#fff'}; font-family:inherit">${escapeHtml(order.note || '')}</textarea>
          </div>
          ${exportCheckboxHtml}
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0; margin-left:8px" onclick="event.stopPropagation()">
          ${isHomeDelivery ? `<button class="btn-icon ${isPaymentConfirmed ? '' : 'active-accent'}" id="payment-order-${order.id}" title="${isPaymentConfirmed ? '取消已匯款標記' : '標記已匯款'}" style="font-size:11px; padding:6px 8px">${isPaymentConfirmed ? '取消已匯款' : '標記已匯款'}</button>` : ''}
          ${!isShipped ? `<button class="btn-icon" id="merge-order-${order.id}" title="把其他訂單併進這張（這張的編號會保留）" style="font-size:11px; padding:6px 8px">併單</button>` : ''}
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
        ${(order.items || []).map(item => {
          // 每一項都標出現貨/預購，混合訂單才看得出哪些還在等貨
          const isPre = isPreorderOrderItem(order, item);
          return `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-bottom:0.5px solid var(--c-blush); font-size:12px">
            <span style="flex:1; min-width:0">
              <span class="pill ${isPre ? 'pill-preorder' : 'pill-instock'}" style="font-size:10px; margin-right:4px">${isPre ? '預購' : '現貨'}</span>
              ${escapeHtml(item.name)}${item.style ? ` (${escapeHtml(item.style)})` : ''} x${item.qty}
            </span>
            <span style="color:var(--c-orange); font-weight:700; flex-shrink:0">${formatPrice(item.price * item.qty)}</span>
          </div>
          `;
        }).join('')}
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
  order.paymentConfirmed = newValue;
  patchOrderInCache(order.id, { paymentConfirmed: newValue });
  loadAndRenderOrders();
}

async function deleteOrder(orderId) {
  if (!confirm('確定要刪除這筆訂單紀錄嗎？此動作無法復原。')) return;
  await db.collection(COL.ORDERS).doc(orderId).delete();
  showToast('訂單已刪除');
  removeOrderFromCache(orderId);
  // 已出貨的歷史清單裡也可能有這一筆（從展開的已出貨區塊刪的），一併移除
  shippedHistory.orders = shippedHistory.orders.filter(o => o.id !== orderId);
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
      trackingNo: firebase.firestore.FieldValue.delete(),
      // shipped 一定要跟著改回 false，否則這張單會從「待出貨」查詢裡消失（後台就看不到它了）
      shipped: false
    });
    // 取消出貨代表這筆訂單重新回到待處理，採購需求也會跟著回來，
    // 所以先前出貨時扣掉的已採購數量要加回去，帳面才不會變成「需求10、已採購0」
    await adjustPurchasedForOrder(order, +1);
    close();
    showToast('已取消出貨標記');
    // 出貨欄位被清掉了，快取裡也同步清成 null（判斷有沒有出貨都是看 !order.shippedAt，null 就等於未出貨）
    order.shippedAt = null;
    order.trackingNo = null;
    order.shipped = false;
    // 這張單重新變成「待出貨」，要放回平常的清單、並從已載入的歷史清單移掉
    shippedHistory.orders = shippedHistory.orders.filter(o => o.id !== order.id);
    addOrderToCache(order);
    loadAndRenderOrders();
    loadAndRenderFailedOrders();
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
      // shipped 這個布林欄位是給「平常只載入未出貨訂單」的查詢用的，跟 shippedAt 一定要同進同退
      const updateData = { shippedAt, shipped: true };
      if (trackingNo) updateData.trackingNo = trackingNo;
      else updateData.trackingNo = firebase.firestore.FieldValue.delete();

      await db.collection(COL.ORDERS).doc(order.id).update(updateData);
      // 第一次標記出貨時，把這筆訂單的預購商品從採購清單扣掉（需求量會因為 shippedAt 自動消失，
      // 已採購數量要在這裡主動扣）。如果本來就已經是出貨狀態（只是改日期或單號），不能重複扣。
      if (!isShipped) {
        await adjustPurchasedForOrder(order, -1);
      }
      close();
      showToast('出貨資訊已儲存');
      // 出貨後這張單就從「待出貨」清單移出去了（平常的清單只放未出貨的）。
      // 如果歷史清單已經載入過，就順手把它加進去，這樣展開已出貨也看得到它
      order.shippedAt = shippedAt;
      order.trackingNo = trackingNo || null;
      order.shipped = true;
      removeOrderFromCache(order.id);
      if (shippedHistory.loaded && !shippedHistory.orders.some(o => o.id === order.id)) {
        shippedHistory.orders = [order, ...shippedHistory.orders];
      }
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
  allProducts: null, // 快取「+新增商品」用的商品清單，避免每次開啟都重新打 Firestore
  allProductsAt: 0   // 上面那份清單是什麼時候讀的（超過時效或商品有異動就重讀）
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
  const order = editOrderState.order;

  document.getElementById('editOrderModalOverlay')?.remove();
  editOrderState.order = null;
  editOrderState.items = [];

  // 手動新增的空白訂單如果沒填任何商品就被關掉，代表是按錯或改變主意了，
  // 直接清掉，不然訂單列表會慢慢累積一堆金額 0、沒有內容的空單
  if (order && order.manuallyCreated && (order.items || []).length === 0) {
    db.collection(COL.ORDERS).doc(order.id).delete()
      .then(() => {
        removeOrderFromCache(order.id);
        loadAndRenderOrders();
      })
      .catch(err => console.error('清除空白訂單失敗:', err));
  }
}

function renderEditOrderItems() {
  const list = document.getElementById('editOrderItemsList');
  if (editOrderState.items.length === 0) {
    list.innerHTML = `<div style="font-size:12px; color:var(--c-rose-text); padding:8px 0">目前沒有商品，請按下方「+ 新增商品」加入</div>`;
    return;
  }
  list.innerHTML = editOrderState.items.map((item, i) => `
    <div data-eo-row="${i}" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:0.5px solid var(--c-blush)">
      <div style="width:36px; height:36px; border-radius:6px; overflow:hidden; background:var(--c-cream); flex-shrink:0">
        ${item.image ? `<img src="${escapeHtml(item.image)}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div style="flex:1; min-width:0">
        <div style="font-size:12px; font-weight:700; color:var(--c-coffee)">${escapeHtml(item.name)}${item.style ? `<span style="color:var(--c-rose-text); font-weight:400"> (${escapeHtml(item.style)})</span>` : ''}</div>
        <div style="display:flex; align-items:center; gap:4px; margin-top:2px">
          <span style="font-size:11px; color:var(--c-rose-text)">單價</span>
          <input type="number" min="0" value="${item.price ?? 0}" data-eo-price="${i}"
            style="width:74px; font-size:12px; text-align:right; border:0.5px solid var(--c-rose); border-radius:6px; padding:3px 6px">
          <span style="font-size:11px; color:var(--c-rose-text)">/ 件</span>
        </div>
        <div style="display:flex; gap:4px; margin-top:4px">
          <div class="tag-chip ${isPreorderOrderItem(editOrderState.order, item) ? '' : 'selected'}" data-eo-type="${i}" data-type="instock" style="font-size:11px; padding:3px 10px">現貨</div>
          <div class="tag-chip ${isPreorderOrderItem(editOrderState.order, item) ? 'selected' : ''}" data-eo-type="${i}" data-type="preorder" style="font-size:11px; padding:3px 10px">預購</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px">
        <button class="ci-qbtn" data-eo-qty-minus="${i}" type="button">−</button>
        <span style="font-size:12px; font-weight:700; min-width:18px; text-align:center">${item.qty}</span>
        <button class="ci-qbtn" data-eo-qty-plus="${i}" type="button">+</button>
      </div>
      <div data-eo-linetotal style="font-size:12px; font-weight:700; color:var(--c-orange); width:60px; text-align:right">${formatPrice(item.price * item.qty)}</div>
      <button class="btn-icon danger" data-eo-remove="${i}" type="button" style="padding:4px 6px">${icon('trash', 14)}</button>
    </div>
  `).join('');

  // 現貨/預購切換：客人下單時是現貨，但你發現其實要跟賣家調貨時可以改成預購，
  // 改完這一項就會出現在「預購採購單」裡。這裡只改狀態，不會動到庫存
  //（扣庫存看的是「該款式有沒有設庫存上限」，跟現貨/預購無關）
  list.querySelectorAll('[data-eo-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.eoType);
      editOrderState.items[i].stockType = btn.dataset.type;
      renderEditOrderItems();
      updateEditOrderSummary();
    });
  });
  // 單價可以直接改：連線時常常臨時調整某個商品的價格，或跟客人談好單張訂單的特價。
  // 用 input 事件即時反映到小計，但不重畫整份清單——重畫會讓輸入框失去焦點，
  // 打到一半游標就跑掉，數字會輸入不完整
  list.querySelectorAll('[data-eo-price]').forEach(input => {
    input.addEventListener('input', () => {
      const i = parseInt(input.dataset.eoPrice);
      const value = parseFloat(input.value);
      // 清空或亂輸入時先當作 0，避免小計變成 NaN；離開欄位時再修正顯示
      editOrderState.items[i].price = (isNaN(value) || value < 0) ? 0 : value;
      const lineTotal = input.closest('[data-eo-row]')?.querySelector('[data-eo-linetotal]');
      if (lineTotal) lineTotal.textContent = formatPrice(editOrderState.items[i].price * editOrderState.items[i].qty);
      updateEditOrderSummary();
    });
    input.addEventListener('blur', () => {
      const i = parseInt(input.dataset.eoPrice);
      input.value = editOrderState.items[i].price;
    });
  });
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
// 商品清單會暫存起來（避免每次開啟都重讀一次全部商品），但暫存不能是永久的：
// 你在「商品管理」新增了款式之後回來加訂單，如果還在用舊的暫存，新款式會選不到。
// 所以這裡有兩道保險：存商品時會主動清掉暫存（見 admin-products.js 的 saveProduct），
// 加上 2 分鐘後自動失效，就算哪天漏了主動清除也會自己恢復正常
const ADMIN_PRODUCTS_CACHE_TTL = 2 * 60 * 1000;

function invalidateAdminProductsCache() {
  editOrderState.allProducts = null;
  editOrderState.allProductsAt = 0;
}

async function openAddOrderItemPicker() {
  const cacheExpired = !editOrderState.allProductsAt ||
    (Date.now() - editOrderState.allProductsAt >= ADMIN_PRODUCTS_CACHE_TTL);
  if (!editOrderState.allProducts || cacheExpired) {
    try {
      const snap = await db.collection(COL.PRODUCTS).where('archived', '==', false).get();
      editOrderState.allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      editOrderState.allProductsAt = Date.now();
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
      price: getEffectivePrice(product, style).price, // 商品目前有特價的話，手動加入訂單也預設用特價
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

  // 單價可以在這個視窗直接改，存檔前要確認每一項都是合法數字。
  // 少了這一步，欄位被清空時會存進 NaN，訂單總額會整個變成 NaN 而且救不回來
  const badPrice = editOrderState.items.find(i => typeof i.price !== 'number' || isNaN(i.price) || i.price < 0);
  if (badPrice) {
    showToast(`「${badPrice.name}」的單價不正確，請重新輸入`);
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

    // 存檔前先把每一項的現貨/預購狀態「明確寫死」，不能留空讓它之後去看訂單層的 orderType。
    // 這一步非常重要，少了會造成實際的採購錯誤：
    // 舊訂單的商品項可能沒有 stockType 欄位，判斷時會退回看訂單層 orderType。
    // 假設一張舊訂單有兩項，你只把其中一項改成預購 → 整張單變成 line →
    // 另一項沒被改的現貨商品因為自己沒有 stockType，也會被當成預購，
    // 於是採購單上會多出一筆你根本不需要採買的商品，害你多買貨。
    const normalizedItems = editOrderState.items.map(item => ({
      ...item,
      stockType: isPreorderOrderItem(order, item) ? 'preorder' : 'instock'
    }));

    // 訂單裡只要有任何一項是預購，整張單就算「含預購」，會搬到右邊欄位、
    // 也不會被匯出到賣貨便檔案（避免把還在等貨的單當成現貨去出貨）。
    // 全部都改成現貨時，訂單會搬回左邊的超商現貨欄位
    const anyPreorder = normalizedItems.some(item => item.stockType === 'preorder');
    const newOrderType = anyPreorder ? 'line' : 'cvs';

    btn.textContent = '儲存中...';
    await db.collection(COL.ORDERS).doc(order.id).update({
      items: normalizedItems,
      orderType: newOrderType,
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

    // 把存檔後的內容同步回這份快照。這一行很重要：
    // closeEditOrderModal() 會把「手動新增但沒有商品」的空白單清掉，
    // 如果這裡不更新，剛剛才填好商品存檔的訂單會因為快照還是空的而被誤刪
    order.items = normalizedItems;

    // 剛剛寫進資料庫的內容自己最清楚，直接同步到快取那一筆，不用整份訂單重讀一次
    const savedChanges = {
      items: normalizedItems,
      orderType: newOrderType,
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
      address: newAddress
    };
    Object.assign(order, savedChanges);
    patchOrderInCache(order.id, savedChanges);

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
// 併單：連線時客人常常分次下單，事後要合併成一張出貨
// 規則：被點到「併單」的那張是主訂單（保留它的編號與收件資料），其他被選到的訂單併進來後刪除。
// 運費會依合併後的總額重新計算（客人只付一次運費，這也是併單的意義）。
// 庫存不需要調整：商品只是從一張訂單移到另一張，兩邊結帳時都已經各自扣過庫存了。
// ============================================

// 把多張訂單的商品合併成一份清單。
// 同一個「商品+款式+單價」會被加總成一行，避免出貨時看到同一款東西分散在好幾行。
// 單價也要當成分組條件之一：同款商品若在不同時間下單、價格被改過，合併後仍要分開計價，
// 不然總金額會算錯（少收或多收客人的錢）。
function mergeOrderItems(orderList) {
  const map = {};
  const result = [];
  for (const order of orderList) {
    for (const item of (order.items || [])) {
      const isPre = isPreorderOrderItem(order, item);
      const key = [item.productId, item.style || '', item.price].join('::');
      if (map[key]) {
        map[key].qty += (item.qty || 0);
        // 同款商品其中一筆是預購時，合併後整項都要當預購處理（比較保守，避免還沒到貨就被出貨）
        if (isPre) map[key].stockType = 'preorder';
      } else {
        map[key] = {
          ...item,
          qty: item.qty || 0,
          // 把當下判斷出來的預購狀態固定寫進去，之後就不會再受訂單層 orderType 影響
          stockType: isPre ? 'preorder' : 'instock'
        };
        result.push(map[key]);
      }
    }
  }
  return result;
}

// 決定併單後要保留哪一張：一律留「最早建立」的那張，不管是從哪張卡片按下「併單」、
// 也不管勾選了哪幾張一起併。因為預購商品要照先來後到出貨，併單如果保留了比較晚下單的那張，
// 排隊順序（跟它的訂單編號）就會被打亂，所以這裡不看使用者點的是哪張，一律以時間為準
function pickMergeKeeper(orders) {
  return orders.reduce((oldest, o) => {
    const oldestTime = oldest.createdAt?.toDate ? oldest.createdAt.toDate().getTime() : Date.now();
    const oTime = o.createdAt?.toDate ? o.createdAt.toDate().getTime() : Date.now();
    return oTime < oldestTime ? o : oldest;
  });
}

// 找出主訂單跟要併進來的訂單之間，有哪些資料不一致需要提醒店家
function findMergeConflicts(primary, others) {
  const conflicts = [];
  const pDelivery = primary.deliveryMethod === 'homeDelivery' ? 'homeDelivery' : 'cvs';
  for (const o of others) {
    const oDelivery = o.deliveryMethod === 'homeDelivery' ? 'homeDelivery' : 'cvs';
    const label = o.orderNo || o.lineName || '(無編號)';
    if (oDelivery !== pDelivery) {
      conflicts.push(`${label}：取貨方式不同（${oDelivery === 'homeDelivery' ? '宅配' : '超商'}），合併後會一律用主訂單的方式`);
    }
    if ((o.cvsName || '') !== (primary.cvsName || '')) {
      conflicts.push(`${label}：收件人不同（${o.cvsName || '未填'}）`);
    }
    if ((o.cvsPhone || '') !== (primary.cvsPhone || '')) {
      conflicts.push(`${label}：手機不同（${o.cvsPhone || '未填'}）`);
    }
    if (pDelivery === 'homeDelivery' && (o.address || '') !== (primary.address || '')) {
      conflicts.push(`${label}：地址不同（${o.address || '未填'}）`);
    }
    if (pDelivery === 'cvs' && (o.cvsStore || '') !== (primary.cvsStore || '')) {
      conflicts.push(`${label}：取貨門市不同（${o.cvsStoreName || ''} ${o.cvsStore || '未填'}）`);
    }
  }
  return conflicts;
}

// 算出合併後的各項金額。抽成獨立函式方便驗證，也讓「預覽」跟「實際儲存」用同一套算法，
// 避免預覽金額跟存進資料庫的金額不一致
function calcMergedTotals(primary, others) {
  const all = [primary, ...others];
  const items = mergeOrderItems(all);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  // 折扣類的金額一律相加：客人各張單用掉的優惠不該因為併單而消失
  const discountAmount = all.reduce((s, o) => s + (o.discountAmount || 0), 0);
  const manualDiscount = all.reduce((s, o) => s + (o.manualDiscount || 0), 0);
  const depositReceived = all.reduce((s, o) => s + (o.depositReceived || 0), 0);
  const hasHomeDelivery = primary.deliveryMethod === 'homeDelivery';
  // 運費依合併後的商品總額重算（滿額免運要用合併後的金額判斷，客人才享得到）
  const shippingFee = calcShippingFee(Math.max(0, subtotal - discountAmount - manualDiscount), hasHomeDelivery);
  const total = Math.max(0, subtotal - discountAmount - manualDiscount) + shippingFee;
  const couponCodes = all.map(o => o.couponCode).filter(Boolean);
  return {
    items, subtotal, discountAmount, manualDiscount, depositReceived,
    shippingFee, total,
    couponCode: couponCodes.length > 0 ? [...new Set(couponCodes)].join('+') : null,
    anyPreorder: items.some(i => i.stockType === 'preorder')
  };
}

let mergeState = { primary: null, candidates: [], selected: new Set() };

async function openMergeOrderModal(primary) {
  mergeState = { primary, candidates: [], selected: new Set() };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'mergeOrderModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">併單・${escapeHtml(primary.orderNo || '這張訂單')}</span>
        <button class="modal-close" id="closeMergeModal">×</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--c-cream); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:12px; color:var(--c-coffee); line-height:1.7">
          目前這張：<strong>${escapeHtml(primary.lineName || '未提供')}</strong>${primary.orderNo ? `（${escapeHtml(primary.orderNo)}）` : ''}<br>
          勾選要併進來的訂單。<strong>合併後會保留「最早建立」的那張訂單</strong>（編號與收件資料以它為準，先來後到的排隊順序不會被打亂），其餘的會被刪除，勾選後下方會顯示實際保留哪一張。
        </div>
        <div id="mergeCandidateList"><div class="loading-wrap"><div class="spin"></div>載入可併訂單...</div></div>
        <div id="mergePreview"></div>
        <button class="btn-primary" id="confirmMergeBtn" style="margin-top:10px" disabled>請先勾選要併入的訂單</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('closeMergeModal').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.getElementById('confirmMergeBtn').addEventListener('click', doMergeOrders);

  try {
    // 直接用訂單列表那邊已經讀好的資料，不要為了開一個視窗再打一次資料庫
    const all = await getOrdersForAdmin();
    // 只列出「未出貨」而且不是自己的訂單。已出貨的不能併（貨都寄出去了），
    // 同一個客人的通常排在前面，但不強制只顯示同名，因為 LINE 名稱常常對不上本人
    mergeState.candidates = all.filter(o => o.id !== mergeState.primary.id && !o.shippedAt);
    renderMergeCandidates();
  } catch (err) {
    console.error(err);
    document.getElementById('mergeCandidateList').innerHTML =
      `<div class="empty-state">${icon('alert-circle', 18)}載入訂單失敗</div>`;
  }
}

function renderMergeCandidates() {
  const list = document.getElementById('mergeCandidateList');
  const primary = mergeState.primary;
  if (mergeState.candidates.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:20px 10px">${icon('clipboard-off', 18)}<p style="margin-top:8px">沒有其他可以併入的未出貨訂單</p></div>`;
    return;
  }

  // 同一個 LINE 名稱的排前面，方便你一眼找到同一位客人分開下的單
  const sorted = [...mergeState.candidates].sort((a, b) => {
    const aSame = (a.lineName || '') === (primary.lineName || '') ? 0 : 1;
    const bSame = (b.lineName || '') === (primary.lineName || '') ? 0 : 1;
    return aSame - bSame;
  });

  list.innerHTML = sorted.map(o => {
    const sameName = (o.lineName || '') === (primary.lineName || '');
    const itemCount = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
    return `
      <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid ${sameName ? 'var(--c-orange)' : 'var(--c-blush)'}; border-radius:8px; margin-bottom:6px; cursor:pointer; background:#fff">
        <input type="checkbox" data-merge-pick="${o.id}" ${mergeState.selected.has(o.id) ? 'checked' : ''} style="margin-top:2px">
        <div style="flex:1; min-width:0; font-size:12px; color:var(--c-coffee); line-height:1.6">
          <strong>${escapeHtml(o.lineName || '未提供')}</strong>${sameName ? '<span style="color:var(--c-orange); font-size:10px"> ・同一位客人</span>' : ''}
          ${o.orderNo ? `<span style="color:var(--c-rose-text)"> ・${escapeHtml(o.orderNo)}</span>` : ''}<br>
          <span style="color:var(--c-rose-text); font-size:11px">
            共${itemCount}件 ・ ${formatPrice(o.total || 0)} ・ ${o.deliveryMethod === 'homeDelivery' ? '宅配' : '超商'}
          </span><br>
          <span style="font-size:11px">${(o.items || []).map(i => `${escapeHtml(i.name)}${i.style ? `（${escapeHtml(i.style)}）` : ''} x${i.qty}`).join('、')}</span>
        </div>
      </label>
    `;
  }).join('');

  list.querySelectorAll('[data-merge-pick]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.mergePick;
      if (cb.checked) mergeState.selected.add(id);
      else mergeState.selected.delete(id);
      renderMergePreview();
    });
  });
  renderMergePreview();
}

function renderMergePreview() {
  const box = document.getElementById('mergePreview');
  const btn = document.getElementById('confirmMergeBtn');
  const others = mergeState.candidates.filter(o => mergeState.selected.has(o.id));

  if (others.length === 0) {
    box.innerHTML = '';
    btn.disabled = true;
    btn.textContent = '請先勾選要併入的訂單';
    return;
  }

  // 保留哪一張以「最早建立」為準，不一定是你點「併單」的那張，所以每次勾選都要重算一次
  const allInvolved = [mergeState.primary, ...others];
  const keeper = pickMergeKeeper(allInvolved);
  const losers = allInvolved.filter(o => o !== keeper);
  const keeperChanged = keeper.id !== mergeState.primary.id;

  const t = calcMergedTotals(keeper, losers);
  const conflicts = findMergeConflicts(keeper, losers);

  box.innerHTML = `
    ${keeperChanged ? `
      <div style="background:#fff8f5; border:1px solid var(--c-orange); border-radius:8px; padding:10px 12px; margin-top:12px; font-size:12px; color:var(--c-coffee); line-height:1.8">
        ${icon('info-circle', 14)} 勾選的訂單裡有比較早建立的，<strong>系統會改保留 ${escapeHtml(keeper.orderNo || keeper.lineName || '（無編號）')}</strong>（先來後到，排隊順序不能因為併單被打亂），
        原本點的 ${escapeHtml(mergeState.primary.orderNo || mergeState.primary.lineName || '（無編號）')} 會被併入並刪除。
      </div>
    ` : ''}
    <div style="background:var(--c-cream); border-radius:8px; padding:12px; margin-top:12px; font-size:12px; color:var(--c-coffee); line-height:1.9">
      <div style="font-weight:700; margin-bottom:6px">合併後預覽（共 ${others.length + 1} 張單・保留 ${escapeHtml(keeper.orderNo || '（無編號）')}）</div>
      ${t.items.map(i => `${escapeHtml(i.name)}${i.style ? `（${escapeHtml(i.style)}）` : ''} x${i.qty}${i.stockType === 'preorder' ? '　<span style="color:var(--c-orange)">預購</span>' : ''}`).join('<br>')}
      <div style="border-top:0.5px solid var(--c-rose); margin:8px 0 6px"></div>
      商品小計：${formatPrice(t.subtotal)}<br>
      ${t.discountAmount > 0 ? `優惠碼折抵：-${formatPrice(t.discountAmount)}<br>` : ''}
      ${t.manualDiscount > 0 ? `額外折抵：-${formatPrice(t.manualDiscount)}<br>` : ''}
      運費（依合併後金額重算）：${t.shippingFee === 0 ? '免運' : formatPrice(t.shippingFee)}<br>
      <strong>應付總額：${formatPrice(t.total)}</strong>
      ${t.depositReceived > 0 ? `<br>已收訂金合計：${formatPrice(t.depositReceived)}` : ''}
    </div>
    ${conflicts.length > 0 ? `
      <div style="background:#fff8f5; border:1px solid #f0c9c9; border-radius:8px; padding:10px 12px; margin-top:8px; font-size:11px; color:#a33; line-height:1.8">
        ${icon('alert-circle', 14)} <strong>資料不一致，請確認後再併：</strong><br>
        ${conflicts.map(c => `・${escapeHtml(c)}`).join('<br>')}
      </div>
    ` : ''}
  `;
  btn.disabled = false;
  btn.textContent = `確認併單（併入 ${others.length} 張）`;
}

async function doMergeOrders() {
  const others = mergeState.candidates.filter(o => mergeState.selected.has(o.id));
  if (others.length === 0) return;

  // 保留哪一張以「最早建立」為準，跟預覽畫面用同一套邏輯算，不是單純用你點「併單」的那張
  const allInvolved = [mergeState.primary, ...others];
  const keeper = pickMergeKeeper(allInvolved);
  const losers = allInvolved.filter(o => o !== keeper);

  const loserNos = losers.map(o => o.orderNo || '(無編號)').join('、');
  if (!confirm(`確定要把 ${loserNos} 併入 ${keeper.orderNo || '這張訂單'} 嗎？\n\n（保留最早建立的那張，被併入的訂單會被刪除，此動作無法復原。）`)) return;

  const btn = document.getElementById('confirmMergeBtn');
  btn.disabled = true;
  btn.textContent = '併單中...';

  try {
    const t = calcMergedTotals(keeper, losers);

    // 先更新要保留的訂單，成功之後才刪除被併的訂單。
    // 順序很重要：萬一更新失敗，被併的訂單還在，資料不會憑空消失（頂多是併單沒生效，可以重試）
    await db.collection(COL.ORDERS).doc(keeper.id).update({
      items: t.items,
      orderType: t.anyPreorder ? 'line' : 'cvs',
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      manualDiscount: t.manualDiscount,
      depositReceived: t.depositReceived,
      shippingFee: t.shippingFee,
      total: t.total,
      couponCode: t.couponCode,
      // 留下併單痕跡，日後客人拿舊編號來問時查得到去向
      mergedFrom: losers.map(o => o.orderNo || o.id),
      mergedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    for (const o of losers) {
      await db.collection(COL.ORDERS).doc(o.id).delete();
    }

    document.getElementById('mergeOrderModalOverlay')?.remove();
    showToast(`已併單，保留編號 ${keeper.orderNo || ''}`);
    // 保留的那張直接更新快取、被併掉的從快取移除，不用整份訂單重讀。
    // mergedAt / lastEditedAt 是伺服器時間戳，畫面上沒用到，快取就不放，避免存進假的值
    const mergedChanges = {
      items: t.items,
      orderType: t.anyPreorder ? 'line' : 'cvs',
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      manualDiscount: t.manualDiscount,
      depositReceived: t.depositReceived,
      shippingFee: t.shippingFee,
      total: t.total,
      couponCode: t.couponCode,
      mergedFrom: losers.map(o => o.orderNo || o.id)
    };
    Object.assign(keeper, mergedChanges);
    patchOrderInCache(keeper.id, mergedChanges);
    losers.forEach(o => removeOrderFromCache(o.id));
    loadAndRenderOrders();
  } catch (err) {
    console.error('併單失敗:', err);
    showToast('併單失敗，請稍後再試（被併的訂單仍保留）');
    btn.disabled = false;
    btn.textContent = `確認併單（併入 ${others.length} 張）`;
  }
}

// ============================================
// 匯出訂單為賣貨便「訂單匯入」格式 (.xlsx)
// 欄位：取件人姓名/取件人手機/取件門市/溫層/商品/訂單金額/運費金額/買家下訂日期/商品備註/其他資訊
// ============================================
// 算出賣貨便「訂單金額」欄位要填多少，也就是超商實際要向客人收的貨款。
// 運費是賣貨便另一個獨立欄位，所以這裡只算商品的部分，不含運費。
//
// 為什麼要這樣扣：
//   優惠折抵 / 額外折抵 → 客人結帳時看到的就是折扣後的金額，
//     如果照商品小計去收，超商會多收客人錢（原本的寫法就是直接用 subtotal，會多收）
//   已收訂金 → 預購訂單客人通常先付過訂金了，取貨時只需要補尾款
function calcCodAmount(order) {
  const subtotal = order.subtotal ?? order.total ?? 0;
  const discount = order.discountAmount || 0;
  const manual = order.manualDiscount || 0;
  const deposit = order.depositReceived || 0;
  // 夾在 0 以上：訂金收超過商品金額時不能變成負數（賣貨便不接受負數金額）
  return Math.max(0, subtotal - discount - manual - deposit);
}

// 挑出這次要匯出的訂單。現貨、預購兩種挑法完全不同，所以分開處理：
//   現貨：跟以前一樣，依下單日期區間篩選
//   預購：不看日期，只看「使用者有沒有在畫面上勾選這張」（selectedIds）——
//         到貨時間跟下單日期沒有關係，用日期篩很容易漏單或多匯到還沒到貨的
// homeDelivery 一律排除：賣貨便格式不支援宅配
function selectOrdersForExport({ orders, wantInstock, wantPreorder, startDate, endDate, selectedIds }) {
  return orders
    .filter(o => o.deliveryMethod !== 'homeDelivery')
    .filter(o => {
      const hasPreorder = (o.items || []).some(item => isPreorderOrderItem(o, item));
      if (hasPreorder) {
        return wantPreorder && selectedIds.has(o.id);
      }
      if (!wantInstock) return false;
      const t = o.createdAt?.toDate ? o.createdAt.toDate() : null;
      return t && t >= startDate && t <= endDate;
    })
    .sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return ta - tb;
    });
}

async function exportOrdersToExcel() {
  const startDateStr = document.getElementById('exportStartDate').value;
  const endDateStr = document.getElementById('exportEndDate').value;

  const wantInstock = document.getElementById('exportInstock').checked;
  const wantPreorder = document.getElementById('exportPreorder').checked;
  if (!wantInstock && !wantPreorder) {
    showToast('請勾選要匯出「現貨訂單」或「預購訂單」');
    return;
  }

  // 日期只有現貨訂單需要，勾預購但沒勾現貨時不用逼使用者選日期
  if (wantInstock && (!startDateStr || !endDateStr)) {
    showToast('現貨訂單請選擇起訖日期');
    return;
  }

  // 勾了預購卻一張都沒選，多半是忘記去右邊「含預購訂單」清單勾選，先提醒一下比匯出空檔案有意義
  if (wantPreorder && exportPreorderSelection.size === 0) {
    showToast('請先到右邊「含預購訂單」清單勾選要匯出的訂單');
    return;
  }

  const btn = document.getElementById('exportOrdersBtn');
  btn.disabled = true;
  btn.textContent = '匯出中...';

  try {
    const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;

    // 匯出需要的資料只有兩種來源，不需要把整個訂單集合撈回來（訂單越積越多會越讀越兇）：
    //   1. 預購訂單 → 就是你在右邊清單勾選的那幾張，都是未出貨的，平常的快取裡就有
    //   2. 現貨訂單 → 依日期區間匯出，所以只要撈這段期間建立的訂單就夠了
    //      （用單一欄位的範圍查詢，不需要另外建立複合索引；也保留原本「已出貨的仍可重新匯出」的行為）
    const pendingOrders = await getOrdersForAdmin();
    const byId = new Map(pendingOrders.map(o => [o.id, o]));

    if (wantInstock && startDate && endDate) {
      const rangeSnap = await db.collection(COL.ORDERS)
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', endDate)
        .get();
      rangeSnap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }));
    }

    const allOrders = [...byId.values()];

    const orders = selectOrdersForExport({
      orders: allOrders,
      wantInstock,
      wantPreorder,
      startDate,
      endDate,
      selectedIds: exportPreorderSelection
    });

    if (orders.length === 0) {
      showToast('選擇的條件內沒有符合的超商取貨訂單');
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
        calcCodAmount(o),
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

    // 只勾預購、沒填日期時，檔名改用「今天」標記，不要讓檔名出現底線接空字串
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const fileLabel = (startDateStr && endDateStr) ? `${startDateStr}_${endDateStr}` : todayStr;
    XLSX.writeFile(wb, `K.Zone訂單匯入_${fileLabel}.xlsx`);
    showToast(`已匯出 ${orders.length} 筆訂單`);

  } catch (err) {
    console.error(err);
    showToast('匯出失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '下載匯入檔（.xlsx）';
  }
}
