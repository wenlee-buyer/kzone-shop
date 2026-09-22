// ============================================
// K.Zone 後台 - 已出貨訂單
// ============================================
// 這一頁存在的目的有兩個：
//   1. 把「已出貨」的歷史訂單從訂單列表搬出來，訂單列表平常就只載入待出貨的，
//      可以省下大量 Firestore 讀取額度（免費方案一天 5 萬次，爆掉連客人結帳都會失敗）
//   2. 客人說沒收到貨時，可以直接用「出貨單號」或姓名查到那張單去追件
//
// 讀取策略：一次只讀 30 筆，不夠再往下翻；搜尋則是直接查資料庫（一次只花 1~3 次讀取），
// 所以就算是很久以前的訂單也找得到，不需要先把整份歷史載入進來。

const SHIPPED_PAGE_SIZE = 30;

let shippedPageState = {
  orders: [],      // 已經載入的已出貨訂單（依出貨日期新到舊）
  cursor: null,    // 分頁游標：下一批要從哪一筆之後開始拿
  loading: false,
  done: false,     // 是否已經翻到最底
  searchResults: null, // 有搜尋結果時顯示這個，null 代表目前是一般瀏覽模式
  searchKeyword: ''
};

async function renderShippedPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">已出貨訂單</div>
        <div class="admin-subtitle">依出貨日期由新到舊排列・可用出貨單號或姓名查詢</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-icon" id="refreshShippedBtn" style="width:auto">重新整理</button>
      </div>
    </div>

    <div class="admin-card">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
        <input type="text" id="shippedSearchInput" placeholder="輸入出貨單號、取件人姓名或 LINE 名稱"
          style="flex:1; min-width:220px; border:0.5px solid var(--c-rose); border-radius:8px; padding:9px 12px; font-size:13px; color:var(--c-coffee)">
        <button class="btn-primary" id="shippedSearchBtn" style="width:auto; padding:9px 20px">查詢</button>
        <button class="btn-secondary" id="shippedClearSearchBtn" style="width:auto; display:none">清除查詢</button>
      </div>
      <p style="font-size:11px; color:var(--c-rose-text); margin-top:8px; line-height:1.7">
        ${icon('info-circle', 13)}
        出貨單號與姓名需要完全相符才查得到（例如單號要一字不差）。
        另外也會一併比對目前畫面上已載入的訂單，那部分輸入一部分文字就找得到。
      </p>
    </div>

    <div class="admin-card" style="margin-bottom:0">
      <div id="shippedList"><div class="loading-wrap"><div class="spin"></div>載入中...</div></div>
    </div>
  `;

  document.getElementById('refreshShippedBtn').addEventListener('click', () => {
    resetShippedPageState();
    loadAndRenderShipped();
  });
  document.getElementById('shippedSearchBtn').addEventListener('click', runShippedSearch);
  document.getElementById('shippedSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runShippedSearch();
  });
  document.getElementById('shippedClearSearchBtn').addEventListener('click', () => {
    document.getElementById('shippedSearchInput').value = '';
    shippedPageState.searchResults = null;
    shippedPageState.searchKeyword = '';
    document.getElementById('shippedClearSearchBtn').style.display = 'none';
    renderShippedList();
  });

  // 換頁回來時如果之前已經載入過，就沿用，不要又重讀一次
  if (shippedPageState.orders.length > 0) {
    renderShippedList();
  } else {
    await loadAndRenderShipped();
  }
}

function resetShippedPageState() {
  shippedPageState.orders = [];
  shippedPageState.cursor = null;
  shippedPageState.loading = false;
  shippedPageState.done = false;
  shippedPageState.searchResults = null;
  shippedPageState.searchKeyword = '';
}

// 依「出貨日期」由新到舊分批拿。
// 這裡只用單一欄位排序（shippedAt），Firestore 內建索引就能跑，不用另外去主控台建立複合索引；
// 而且沒有出貨日期的訂單（＝還沒出貨的）本來就不會被這個查詢撈到，剛好就是我們要的過濾效果
async function loadMoreShippedOrders() {
  let q = db.collection(COL.ORDERS).orderBy('shippedAt', 'desc').limit(SHIPPED_PAGE_SIZE);
  if (shippedPageState.cursor) q = q.startAfter(shippedPageState.cursor);

  const snap = await q.get();
  if (snap.empty) {
    shippedPageState.done = true;
    return;
  }

  shippedPageState.cursor = snap.docs[snap.docs.length - 1];
  const page = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const seen = new Set(shippedPageState.orders.map(o => o.id));
  shippedPageState.orders = [...shippedPageState.orders, ...page.filter(o => !seen.has(o.id))];

  if (snap.docs.length < SHIPPED_PAGE_SIZE) shippedPageState.done = true;
}

async function loadAndRenderShipped() {
  const wrap = document.getElementById('shippedList');
  if (!wrap) return;
  shippedPageState.loading = true;
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>載入中...</div>`;
  try {
    await loadMoreShippedOrders();
  } catch (err) {
    console.error('載入已出貨訂單失敗:', err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入失敗，請稍後再試</div>`;
    shippedPageState.loading = false;
    return;
  }
  shippedPageState.loading = false;
  renderShippedList();
}

// ---- 查詢：先直接問資料庫（完全相符），再加上目前已載入訂單的模糊比對 ----
// 直接問資料庫的好處是「多久以前的訂單都找得到」，而且用的是單一欄位的等於條件，
// 一次查詢只花 1 次讀取，比把整份歷史訂單載回來便宜太多
async function searchShippedOrders(keyword) {
  const kw = (keyword || '').trim();
  if (!kw) return [];

  const found = new Map();

  // 先比對目前畫面上已經載入的那幾頁（可以模糊比對，輸入一部分就找得到）
  const lower = kw.toLowerCase();
  shippedPageState.orders.forEach(o => {
    const hay = [o.trackingNo, o.cvsName, o.lineName, o.orderNo, o.cvsPhone]
      .map(v => (v || '').toString().toLowerCase());
    if (hay.some(v => v && v.includes(lower))) found.set(o.id, o);
  });

  // 再去資料庫做完全相符的查詢，把沒載入到的歷史訂單也撈出來
  const fields = ['trackingNo', 'cvsName', 'lineName', 'orderNo'];
  for (const field of fields) {
    try {
      const snap = await db.collection(COL.ORDERS).where(field, '==', kw).limit(20).get();
      snap.docs.forEach(d => {
        const order = { id: d.id, ...d.data() };
        // 這一頁只看已出貨的；還沒出貨的訂單請到「訂單列表」處理
        if (order.shippedAt) found.set(order.id, order);
      });
    } catch (err) {
      console.error(`查詢 ${field} 失敗:`, err);
    }
  }

  return [...found.values()].sort(sortByShippedAtDesc);
}

// 依出貨日期新到舊。出貨日期是「YYYY-MM-DD」的字串，直接比大小就是正確的時間順序
function sortByShippedAtDesc(a, b) {
  return String(b.shippedAt || '').localeCompare(String(a.shippedAt || ''));
}

async function runShippedSearch() {
  const input = document.getElementById('shippedSearchInput');
  const btn = document.getElementById('shippedSearchBtn');
  const kw = input.value.trim();
  if (!kw) {
    showToast('請先輸入出貨單號或姓名');
    return;
  }

  btn.disabled = true;
  btn.textContent = '查詢中...';
  try {
    shippedPageState.searchResults = await searchShippedOrders(kw);
    shippedPageState.searchKeyword = kw;
    document.getElementById('shippedClearSearchBtn').style.display = '';
    renderShippedList();
  } catch (err) {
    console.error('查詢失敗:', err);
    showToast('查詢失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '查詢';
  }
}

function renderShippedList() {
  const wrap = document.getElementById('shippedList');
  if (!wrap) return;

  const isSearching = shippedPageState.searchResults !== null;
  const list = isSearching ? shippedPageState.searchResults : shippedPageState.orders;

  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:30px 10px">${icon('clipboard-off', 18)}
      <p style="margin-top:8px">${isSearching ? `找不到符合「${escapeHtml(shippedPageState.searchKeyword)}」的已出貨訂單` : '目前沒有已出貨的訂單'}</p></div>`;
    return;
  }

  const header = isSearching
    ? `<div style="font-size:12px; color:var(--c-rose-text); margin-bottom:10px">
         查詢「${escapeHtml(shippedPageState.searchKeyword)}」的結果：${list.length} 筆
       </div>`
    : `<div style="font-size:12px; color:var(--c-rose-text); margin-bottom:10px">
         目前顯示最近 ${list.length} 筆已出貨訂單${shippedPageState.done ? '（已經是全部了）' : ''}
       </div>`;

  // 不分現貨/預購，全部排在同一個清單裡；商品明細一樣預設收合，點標題才展開
  const cards = list.map(order => renderOrderCard(order, { showShippingHeader: true })).join('');

  const moreBtn = (!isSearching && !shippedPageState.done)
    ? `<button class="btn-secondary" id="loadMoreShippedBtn" style="width:100%; margin-top:10px">載入更早的訂單（每次 ${SHIPPED_PAGE_SIZE} 筆）</button>`
    : '';

  wrap.innerHTML = header + cards + moreBtn;

  document.getElementById('loadMoreShippedBtn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = '載入中...';
    try {
      await loadMoreShippedOrders();
      renderShippedList();
    } catch (err) {
      console.error('載入更多失敗:', err);
      showToast('載入失敗，請稍後再試');
      btn.disabled = false;
      btn.textContent = `載入更早的訂單（每次 ${SHIPPED_PAGE_SIZE} 筆）`;
    }
  });

  bindShippedCardEvents(list);
}

// 卡片上的互動：展開明細、備註存檔、修改出貨資訊、刪除。
// 這些行為跟訂單列表那邊一致，差別是這一頁的訂單都已經出貨了，沒有併單/編輯商品的按鈕
function bindShippedCardEvents(list) {
  list.forEach(order => {
    document.getElementById(`toggle-order-${order.id}`)?.addEventListener('click', () => {
      const detail = document.getElementById(`detail-order-${order.id}`);
      if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });

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

    // 修改出貨資訊（也包含「取消出貨標記」）。取消之後這張單會回到「訂單列表」的待出貨，
    // 所以要從這一頁的清單移除，畫面才不會顯示一張其實已經不算已出貨的單
    document.getElementById(`ship-order-${order.id}`)?.addEventListener('click', () => {
      openShipModal(order, { onSaved: () => refreshShippedAfterChange(order.id) });
    });

    document.getElementById(`del-order-${order.id}`)?.addEventListener('click', async () => {
      if (!confirm('確定要刪除這筆訂單紀錄嗎？此動作無法復原。')) return;
      try {
        await db.collection(COL.ORDERS).doc(order.id).delete();
        showToast('訂單已刪除');
        removeFromShippedPage(order.id);
      } catch (err) {
        console.error(err);
        showToast('刪除失敗，請稍後再試');
      }
    });
  });
}

function removeFromShippedPage(orderId) {
  shippedPageState.orders = shippedPageState.orders.filter(o => o.id !== orderId);
  if (shippedPageState.searchResults) {
    shippedPageState.searchResults = shippedPageState.searchResults.filter(o => o.id !== orderId);
  }
  renderShippedList();
}

// 出貨資訊被改過之後重新整理這一頁的顯示：
// 還是已出貨就更新排序，被取消出貨就從這頁移除（它回到訂單列表了）
function refreshShippedAfterChange(orderId) {
  const target = shippedPageState.orders.find(o => o.id === orderId)
    || (shippedPageState.searchResults || []).find(o => o.id === orderId);
  if (target && !target.shippedAt) {
    removeFromShippedPage(orderId);
    return;
  }
  shippedPageState.orders.sort(sortByShippedAtDesc);
  renderShippedList();
}
