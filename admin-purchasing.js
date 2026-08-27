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
  demand: [],       // buildPurchaseDemand() 的結果
  purchasedMap: {}, // key -> 已採購數量
  productMap: {},   // productId -> 商品資料（拿來查所屬分類）
  // 記住哪些分類是展開的。這個一定要存在畫面重繪之外的地方：
  // 每次輸入已採購數量存檔後都會重繪整份清單，如果不記住展開狀態，
  // 打完一個數字所有分類就會全部收起來，要一直重新展開，很難用
  expanded: new Set()
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
    // 商品也要一起讀，因為採購清單要依商品的來源分類分組（訂單裡只存了 productId）
    const [orderSnap, purchaseSnap, productSnap] = await Promise.all([
      db.collection(COL.ORDERS).orderBy('createdAt', 'desc').limit(300).get(),
      db.collection(COL.PURCHASES).get(),
      db.collection(COL.PRODUCTS).get()
    ]);

    const orders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    purchasingState.demand = buildPurchaseDemand(orders);

    purchasingState.purchasedMap = {};
    purchaseSnap.docs.forEach(d => {
      purchasingState.purchasedMap[d.id] = d.data().purchased || 0;
    });

    purchasingState.productMap = {};
    productSnap.docs.forEach(d => {
      purchasingState.productMap[d.id] = { id: d.id, ...d.data() };
    });

    renderPurchasingList();
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入採購清單失敗</div>`;
  }
}

// 「次要分類」：這些分類是跨類型的標籤性質分類，採購時不適合當成主要歸屬。
// 例如鍵帽專區裡的東西同時也屬於網咖、樂園等各個來源，採買時是按來源去買的，
// 所以只要商品還掛了其他分類，就歸到那個其他分類；只掛次要分類時才留在次要分類。
const SECONDARY_CATEGORY_NAMES = ['鍵帽專區'];

// 決定一個商品在採購單上要歸到哪個分類。
// 一律只歸一個分類、不重複列出，因為採購單是拿來對數量的，
// 同一個商品出現在兩個分類會有重複採買的風險。
function pickPurchaseCategory(product, categories) {
  if (!product) return null;
  const catIds = getProductCategoryIds(product);
  if (catIds.length === 0) return null;

  const secondaryIds = new Set(
    categories.filter(c => SECONDARY_CATEGORY_NAMES.includes(c.name)).map(c => c.id)
  );

  // 優先挑「不是次要分類」的；都是次要分類時才退回用次要分類
  const preferred = catIds.find(id => !secondaryIds.has(id));
  return preferred || catIds[0];
}

// 把需求清單整理成「分類 → 商品 → 款式」三層。
// 同一個商品的不同款式要收在同一個商品底下，因為採買時一定是一起買的，
// 分散列出會讓你在同一個分類裡重複找同一個商品。
function groupDemandByCategory(demand, productMap, categories) {
  const buckets = {}; // catId -> { catId, catName, order, products: {} }

  const ensureBucket = (catId, catName, order) => {
    if (!buckets[catId]) buckets[catId] = { catId, catName, order, products: {} };
    return buckets[catId];
  };

  for (const item of demand) {
    const product = productMap[item.productId];
    const catId = pickPurchaseCategory(product, categories);
    const cat = categories.find(c => c.id === catId);

    // 找不到商品（可能已被刪除）或商品沒設分類時，統一收到「未分類」，避免整項消失不見
    const bucketId = cat ? cat.id : '__uncategorized__';
    const bucketName = cat ? cat.name : '未分類／商品已刪除';
    const bucketOrder = cat ? (cat.order ?? 9999) : 99999;
    const bucket = ensureBucket(bucketId, bucketName, bucketOrder);

    if (!bucket.products[item.productId]) {
      // 記下這個商品「除了歸屬分類以外」還掛了哪些分類，顯示成小字提示，
      // 讓你知道它其實也屬於別的分類（例如鍵帽專區），不會覺得東西不見了
      const otherNames = product
        ? getProductCategoryIds(product)
            .filter(id => id !== bucketId)
            .map(id => categories.find(c => c.id === id)?.name)
            .filter(Boolean)
        : [];
      bucket.products[item.productId] = {
        productId: item.productId,
        name: item.name,
        otherCategoryNames: otherNames,
        styles: []
      };
    }
    bucket.products[item.productId].styles.push(item);
  }

  return Object.values(buckets)
    .map(b => ({
      catId: b.catId,
      catName: b.catName,
      order: b.order,
      products: Object.values(b.products).map(p => ({
        ...p,
        // 同商品的款式依需求量多的排前面，方便先處理量大的
        styles: p.styles.sort((x, y) => y.needed - x.needed)
      }))
    }))
    // 依後台「來源分類」設定的順序排列，跟你平常看到的分類順序一致
    .sort((a, b) => a.order - b.order);
}

// 算一個分類（或一個商品）底下的合計，用在收起狀態的摘要
function sumStyles(styles, purchasedMap) {
  let needed = 0, shortage = 0;
  for (const s of styles) {
    const p = purchasedMap[s.key] || 0;
    needed += s.needed;
    shortage += Math.max(0, s.needed - p);
  }
  return { needed, shortage };
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

  const pMap = purchasingState.purchasedMap;
  const groups = groupDemandByCategory(demand, purchasingState.productMap, appState.categories);

  // 單一款式的那一列（需求量／已採購輸入／還缺）
  const styleRow = (d, showStyleName) => {
    const purchased = pMap[d.key] || 0;
    const shortage = d.needed - purchased;

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
      <div style="display:flex; align-items:center; gap:8px; padding:6px 0 6px 12px; border-top:0.5px solid var(--c-blush)">
        <div style="flex:1; min-width:0; font-size:12px; color:var(--c-coffee)">
          ${showStyleName ? escapeHtml(d.style || '（不挑款）') : '<span style="color:var(--c-rose-text)">數量</span>'}
          <span style="font-size:10px; color:var(--c-rose-text)">・${d.orders.length} 筆訂單</span>
        </div>
        <div style="width:60px; text-align:center; font-size:14px; font-weight:700; color:var(--c-coffee)">${d.needed}</div>
        <div style="width:80px; text-align:center">
          <input type="number" min="0" value="${purchased}" data-purchased="${escapeHtml(d.key)}"
            style="width:64px; text-align:center; border:0.5px solid var(--c-rose); border-radius:6px; padding:5px">
        </div>
        <div style="width:90px; text-align:center; font-size:12px">${shortageHtml}</div>
      </div>
    `;
  };

  const groupHtml = groups.map(g => {
    const allStyles = g.products.flatMap(p => p.styles);
    const sum = sumStyles(allStyles, pMap);
    const isOpen = purchasingState.expanded.has(g.catId);

    const productsHtml = g.products.map(p => {
      const pSum = sumStyles(p.styles, pMap);
      // 只有一個款式而且款式名稱是空的（不挑款商品）時，不用再多一層款式名稱
      const singleNoStyle = p.styles.length === 1 && !p.styles[0].style;
      return `
        <div style="border:1px solid var(--c-blush); border-radius:8px; padding:8px 10px; margin-bottom:6px; background:#fff">
          <div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap">
            <span style="font-size:13px; font-weight:700; color:var(--c-coffee)">${escapeHtml(p.name)}</span>
            ${p.styles.length > 1 ? `<span style="font-size:10px; color:var(--c-rose-text)">${p.styles.length} 個款式・合計 ${pSum.needed} 件</span>` : ''}
            ${p.otherCategoryNames.length > 0 ? `<span style="font-size:10px; color:var(--c-rose-text)">（也屬於 ${p.otherCategoryNames.map(escapeHtml).join('、')}）</span>` : ''}
          </div>
          ${p.styles.map(d => styleRow(d, !singleNoStyle)).join('')}
        </div>
      `;
    }).join('');

    return `
      <div style="margin-bottom:10px">
        <div data-cat-toggle="${escapeHtml(g.catId)}"
          style="display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--c-cream); border:1px solid var(--c-blush); border-radius:8px; cursor:pointer">
          <span style="flex-shrink:0; color:var(--c-rose)">${icon(isOpen ? 'chevron-down' : 'chevron-right', 16)}</span>
          <span style="flex:1; min-width:0; font-size:13px; font-weight:700; color:var(--c-coffee)">${escapeHtml(g.catName)}</span>
          <span style="font-size:11px; color:var(--c-rose-text)">${g.products.length} 項商品・需求 ${sum.needed} 件</span>
          ${sum.shortage > 0
            ? `<span style="font-size:11px; font-weight:700; color:var(--c-orange)">還缺 ${sum.shortage}</span>`
            : `<span style="font-size:11px; font-weight:700; color:#1a5c2a">${icon('check', 13)} 已買齊</span>`}
        </div>
        ${isOpen ? `<div style="padding:8px 0 0 8px">${productsHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  const totalNeeded = demand.reduce((s, d) => s + d.needed, 0);
  const totalShortage = demand.reduce((s, d) => s + Math.max(0, d.needed - (pMap[d.key] || 0)), 0);

  wrap.innerHTML = `
    <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:12px; font-size:12px; color:var(--c-coffee)">
      <span>品項數：<strong>${demand.length}</strong></span>
      <span>總需求：<strong>${totalNeeded}</strong> 件</span>
      <span>還要採買：<strong style="color:var(--c-orange)">${totalShortage}</strong> 件</span>
      <button class="btn-icon" id="togglePurchasingAll" style="font-size:11px; padding:5px 10px; margin-left:auto">
        ${purchasingState.expanded.size > 0 ? '全部收起' : '全部展開'}
      </button>
    </div>
    ${groupHtml}
  `;

  // 分類標題整條都可以點，展開/收起（狀態記在 purchasingState.expanded，重繪後不會跑掉）
  wrap.querySelectorAll('[data-cat-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.catToggle;
      if (purchasingState.expanded.has(id)) purchasingState.expanded.delete(id);
      else purchasingState.expanded.add(id);
      renderPurchasingList();
    });
  });

  document.getElementById('togglePurchasingAll')?.addEventListener('click', () => {
    if (purchasingState.expanded.size > 0) {
      purchasingState.expanded.clear();
    } else {
      groups.forEach(g => purchasingState.expanded.add(g.catId));
    }
    renderPurchasingList();
  });

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
