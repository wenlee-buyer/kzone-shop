// ============================================
// K.Zone 後台 - 預購採購單
// 把「還沒出貨的預購訂單」彙總成一張採購清單，方便連線／跟賣家補貨時對數量。
//
// 資料怎麼來的：
//   需求量 = 未出貨訂單中，下單當下是預購的商品，依「商品+款式」加總（即時算出來，不另外存）
//   已採購 = 店家在這一頁自己輸入的數字（存在 kzone_purchases）
//   還缺   = 需求量 - 已採購（不會顯示負數，多買的會另外標示）
//
// 出貨後為什麼會消失：訂單一旦標記出貨，需求量就不再計入（貨已經到而且寄出了），
// 同時 adjustPurchasedForOrder() 會把對應的已採購數量一起扣掉，避免帳面出現假的「多買了」。
// ============================================

let purchasingState = {
  demand: [],      // buildPurchaseDemand() 的結果
  purchasedMap: {} // key -> 已採購數量
};

async function renderPurchasingPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">預購採購單</div>
        <div class="admin-subtitle">把未出貨的預購訂單加總成採購清單・輸入已採購數量後會自動算出還缺多少</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-secondary" id="refreshPurchasingBtn" style="width:auto">重新整理</button>
      </div>
    </div>

    <div class="admin-card" style="background:var(--c-cream); border-color:var(--c-sand); margin-bottom:16px">
      <p style="font-size:12px; color:var(--c-coffee); line-height:1.8">
        ${icon('info-circle', 14)}
        清單只列出「還沒出貨」的預購商品。到貨後請到訂單列表按「標記出貨」，
        該筆訂單的數量就會自動從這裡扣掉（已採購數量也會一起扣），不影響其他還在等貨的訂單。
      </p>
    </div>

    <div class="admin-card">
      <div id="purchasingList"><div class="loading-wrap"><div class="spin"></div>統計中...</div></div>
    </div>
  `;

  document.getElementById('refreshPurchasingBtn').addEventListener('click', loadAndRenderPurchasing);
  await loadAndRenderPurchasing();
}

async function loadAndRenderPurchasing() {
  const wrap = document.getElementById('purchasingList');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>統計中...</div>`;

  try {
    // 訂單和採購進度一起讀，減少等待時間。
    // 訂單這裡刻意不加 where 條件（未出貨的判斷在 buildPurchaseDemand 裡做），
    // 因為 where + orderBy 不同欄位在 Firestore 需要額外建立複合索引，會直接查詢失敗
    const [orderSnap, purchaseSnap] = await Promise.all([
      db.collection(COL.ORDERS).orderBy('createdAt', 'desc').limit(300).get(),
      db.collection(COL.PURCHASES).get()
    ]);

    const orders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    purchasingState.demand = buildPurchaseDemand(orders);

    purchasingState.purchasedMap = {};
    purchaseSnap.docs.forEach(d => {
      purchasingState.purchasedMap[d.id] = d.data().purchased || 0;
    });

    renderPurchasingList();
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入採購清單失敗</div>`;
  }
}

function renderPurchasingList() {
  const wrap = document.getElementById('purchasingList');
  const demand = purchasingState.demand;

  if (demand.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        ${icon('circle-check', 28)}
        <p style="margin-top:12px">目前沒有待採購的預購商品</p>
        <p style="font-size:11px; color:var(--c-rose-text); margin-top:6px">
          未出貨的預購訂單出現後，這裡就會自動列出要採買的數量
        </p>
      </div>
    `;
    return;
  }

  const rows = demand.map(d => {
    const purchased = purchasingState.purchasedMap[d.key] || 0;
    const shortage = d.needed - purchased;
    const orderCount = d.orders.length;

    // 還缺 > 0 用橘色強調（要再去買）；剛好買齊用綠色；買超過需求用紅色提醒（可能重複下單了）
    let shortageHtml;
    if (shortage > 0) {
      shortageHtml = `<span style="color:var(--c-orange); font-weight:700">還缺 ${shortage}</span>`;
    } else if (shortage === 0) {
      shortageHtml = `<span style="color:#1a5c2a; font-weight:700">${icon('check', 14)} 已買齊</span>`;
    } else {
      shortageHtml = `<span style="color:#a33; font-weight:700">多買 ${Math.abs(shortage)}</span>`;
    }

    return `
      <tr>
        <td>
          <div style="font-size:13px; font-weight:700; color:var(--c-coffee)">${escapeHtml(d.name)}</div>
          ${d.style ? `<div style="font-size:11px; color:var(--c-rose-text); margin-top:2px">${escapeHtml(d.style)}</div>` : ''}
          <div style="font-size:10px; color:var(--c-rose-text); margin-top:2px">${orderCount} 筆訂單</div>
        </td>
        <td style="text-align:center; font-size:15px; font-weight:700; color:var(--c-coffee)">${d.needed}</td>
        <td style="text-align:center">
          <input type="number" min="0" value="${purchased}" data-purchased="${escapeHtml(d.key)}"
            style="width:70px; text-align:center; border:0.5px solid var(--c-rose); border-radius:6px; padding:6px">
        </td>
        <td style="text-align:center; font-size:13px">${shortageHtml}</td>
      </tr>
    `;
  }).join('');

  const totalNeeded = demand.reduce((s, d) => s + d.needed, 0);
  const totalShortage = demand.reduce((s, d) => {
    const p = purchasingState.purchasedMap[d.key] || 0;
    return s + Math.max(0, d.needed - p);
  }, 0);

  wrap.innerHTML = `
    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px; font-size:12px; color:var(--c-coffee)">
      <span>品項數：<strong>${demand.length}</strong></span>
      <span>總需求：<strong>${totalNeeded}</strong> 件</span>
      <span>還要採買：<strong style="color:var(--c-orange)">${totalShortage}</strong> 件</span>
    </div>
    <table class="admin-table">
      <thead>
        <tr>
          <th>商品／款式</th>
          <th style="text-align:center; width:80px">需求量</th>
          <th style="text-align:center; width:110px">已採購</th>
          <th style="text-align:center; width:100px">還缺</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // 輸入已採購數量後即時存檔（change 事件：離開欄位或按 Enter 才觸發，不會每打一個字就寫一次資料庫）
  wrap.querySelectorAll('[data-purchased]').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.purchased;
      const value = Math.max(0, parseInt(input.value) || 0);
      input.value = value; // 把負數或亂輸入的內容修正回畫面上

      const item = purchasingState.demand.find(d => d.key === key);
      if (!item) return;

      try {
        await db.collection(COL.PURCHASES).doc(key).set({
          productId: item.productId,
          style: item.style,
          purchased: value,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        purchasingState.purchasedMap[key] = value;
        renderPurchasingList(); // 重畫以更新「還缺」跟上方統計
        showToast('已儲存');
      } catch (err) {
        console.error(err);
        showToast('儲存失敗，請稍後再試');
      }
    });
  });
}
