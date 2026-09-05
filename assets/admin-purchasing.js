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

  // 按「重新整理」時才強制重讀資料庫（平常沿用快取，省讀取額度）
  document.getElementById('refreshPurchasingBtn').addEventListener('click', () => {
    invalidateOrdersCache();
    clearStorefrontCache();
    loadAndRenderPurchasing();
  });
  await loadAndRenderPurchasing();
}

async function loadAndRenderPurchasing() {
  const wrap = document.getElementById('purchasingList');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>統計中...</div>`;

  try {
    // 訂單和採購進度一起讀，減少等待時間。
    // 訂單這裡刻意不加 where 條件（未出貨的判斷在 buildPurchaseDemand 裡做），
    // 因為 where + orderBy 不同欄位在 Firestore 需要額外建立複合索引，會直接查詢失敗
    // 訂單沿用訂單列表已經讀好的那份（getOrdersForAdmin 有 1 分鐘快取），
    // 商品走前台的快取版本。原本這一頁每次打開就是「300 筆訂單 + 全部商品 + 全部採購紀錄」，
    // 光是來回切換頁面就會吃掉大量 Firestore 讀取額度
    const [orders, purchaseSnap, products] = await Promise.all([
      getOrdersForAdmin(),
      db.collection(COL.PURCHASES).get(),
      fetchProductsCached()
    ]);

    purchasingState.demand = buildPurchaseDemand(orders);

    const allPurchases = {};
    purchaseSnap.docs.forEach(d => {
      allPurchases[d.id] = d.data().purchased || 0;
    });

    // 採購進度改成用「名稱＋款式」記錄（同名商品才會合併成一筆）。
    // 但先前輸入過的數字是用「商品ID＋款式」存的，這裡把它們接回來，
    // 不然改版後你之前打的已採購數量會全部歸零、得重新輸入一次
    purchasingState.purchasedMap = {};
    purchasingState.demand.forEach(d => {
      if (allPurchases[d.key] !== undefined) {
        purchasingState.purchasedMap[d.key] = allPurchases[d.key];
        return;
      }
      const legacySum = (d.productIds || [])
        .map(pid => allPurchases[legacyPurchaseDocId(pid, d.style)] || 0)
        .reduce((a, b) => a + b, 0);
      purchasingState.purchasedMap[d.key] = legacySum;
    });

    purchasingState.productMap = {};
    products.forEach(p => {
      purchasingState.productMap[p.id] = p;
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

  // 名稱後面那個「×N」就是「還要買幾個」，不是需求量。
  // 這是採購現場真正要看的數字，所以放在名稱旁邊、字大、橘色。
  // 需求量不放這裡（會跟缺少量兩個數字打架），移到右邊跟已採購放在一起當參考。
  const needBadge = (needed, purchased, size) => {
    const shortage = needed - purchased;
    if (shortage > 0) {
      return `<span style="color:var(--c-orange); font-weight:700; font-size:${size}px">×${shortage}</span>`;
    }
    if (shortage === 0) {
      return `<span style="color:#1a5c2a; font-weight:700; font-size:${size}px">${icon('check', size)}</span>`;
    }
    return `<span style="color:#a33; font-weight:700; font-size:${size}px">多買 ${-shortage}</span>`;
  };

  // 右側的參考資訊：需求量與已採購輸入框。
  // 用固定寬度讓每一列的數字垂直對齊，一整排掃下來比較好讀
  const rightSide = (d, purchased) => `
    <div style="flex-shrink:0; display:flex; align-items:center; gap:8px">
      <span style="font-size:11px; color:var(--c-rose-text); width:44px; text-align:right">需求 ${d.needed}</span>
      <span style="font-size:11px; color:var(--c-rose-text)">已採購</span>
      <input type="number" min="0" value="${purchased}" data-purchased="${escapeHtml(d.key)}"
        style="width:56px; text-align:center; border:0.5px solid var(--c-rose); border-radius:6px; padding:4px">
    </div>
  `;

  // 款式那一列。字級刻意比商品名小一號、不加粗，這樣一眼就分得出哪個是商品哪個是款式。
  // 已經買齊的整列淡化處理，讓還要買的東西在視覺上跳出來
  const styleRow = (d) => {
    const purchased = pMap[d.key] || 0;
    const done = purchased >= d.needed;

    return `
      <div style="display:flex; align-items:center; gap:10px; padding:5px 0 5px 14px; ${done ? 'opacity:0.5' : ''}">
        <div style="flex:1; min-width:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap">
          <span style="font-size:13px; color:var(--c-coffee)">
            <span style="color:var(--c-rose)">└</span> ${escapeHtml(d.style || '不挑款')}
          </span>
          ${needBadge(d.needed, purchased, 14)}
        </div>
        ${rightSide(d, purchased)}
      </div>
    `;
  };

  const groupHtml = groups.map(g => {
    const allStyles = g.products.flatMap(p => p.styles);
    const sum = sumStyles(allStyles, pMap);
    const isOpen = purchasingState.expanded.has(g.catId);

    // 商品層也要把「已經買齊的」排到最下面，不能只排款式。
    // 不挑款的商品各自是獨立的一張卡片，只排款式的話它們會卡在清單中間，
    // 採買時視線得一直跳過已完成的項目
    const sortedProducts = [...g.products].sort((a, b) => {
      const aLeft = sumStyles(a.styles, pMap).shortage;
      const bLeft = sumStyles(b.styles, pMap).shortage;
      const aDone = aLeft === 0 ? 1 : 0;
      const bDone = bLeft === 0 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;   // 沒買齊的排前面
      if (aLeft !== bLeft) return bLeft - aLeft;   // 都沒買齊時，缺得多的排前面
      return a.name.localeCompare(b.name);          // 完全一樣時用名稱排，順序才不會每次重繪都跳動
    });

    const productsHtml = sortedProducts.map(p => {
      // 只有一個款式、而且那個款式沒有名字（不挑款商品）時，不用多一層 └ 的縮排，
      // 直接把數量和輸入框放在商品那一行就好
      const singleNoStyle = p.styles.length === 1 && !p.styles[0].style;

      if (singleNoStyle) {
        const d = p.styles[0];
        const purchased = pMap[d.key] || 0;
        const done = purchased >= d.needed;
        return `
          <div style="border:1px solid var(--c-blush); border-radius:10px; padding:12px 14px; margin-bottom:8px; background:#fff; ${done ? 'opacity:0.5' : ''}">
            <div style="display:flex; align-items:center; gap:10px">
              <div style="flex:1; min-width:0; display:flex; align-items:center; gap:10px; flex-wrap:wrap">
                <span style="font-size:16px; font-weight:700; color:var(--c-coffee)">${escapeHtml(p.name)}</span>
                ${needBadge(d.needed, purchased, 17)}
              </div>
              ${rightSide(d, purchased)}
            </div>
          </div>
        `;
      }

      // 有款式的商品：商品名只當標題，不顯示合計數量或合計缺少量
      //（採買時是照款式逐一買的，多一個合計反而會看混）
      // 已經買齊的款式排到最下面，還要買的集中在上面，採購時視線不用跳過已完成的
      const sortedStyles = [...p.styles].sort((a, b) => {
        const aDone = (pMap[a.key] || 0) >= a.needed ? 1 : 0;
        const bDone = (pMap[b.key] || 0) >= b.needed ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        // 都還沒買齊時，缺得多的排前面
        const aLeft = a.needed - (pMap[a.key] || 0);
        const bLeft = b.needed - (pMap[b.key] || 0);
        return bLeft - aLeft;
      });
      const allDone = sortedStyles.every(d => (pMap[d.key] || 0) >= d.needed);

      return `
        <div style="border:1px solid var(--c-blush); border-radius:10px; padding:12px 14px; margin-bottom:8px; background:#fff">
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-size:16px; font-weight:700; color:var(--c-coffee); ${allDone ? 'opacity:0.5' : ''}">${escapeHtml(p.name)}</span>
            ${allDone ? `<span style="color:#1a5c2a; opacity:0.7">${icon('check', 15)}</span>` : ''}
          </div>
          <div style="margin-top:4px">
            ${sortedStyles.map(d => styleRow(d)).join('')}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="margin-bottom:10px">
        <div data-cat-toggle="${escapeHtml(g.catId)}"
          style="display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--c-cream); border:1px solid var(--c-blush); border-radius:8px; cursor:pointer">
          <span style="flex-shrink:0; color:var(--c-rose)">${icon(isOpen ? 'chevron-down' : 'chevron-right', 16)}</span>
          <span style="font-size:15px; font-weight:700; color:var(--c-coffee)">${escapeHtml(g.catName)}</span>
          ${sum.shortage > 0
            ? `<span style="color:var(--c-orange); font-weight:700; font-size:15px">×${sum.shortage}</span>`
            : `<span style="color:#1a5c2a; font-weight:700; font-size:13px">${icon('check', 14)} 已買齊</span>`}
          <span style="margin-left:auto; font-size:11px; color:var(--c-rose-text); text-align:right">${g.products.length} 項商品・需求 ${sum.needed} 件</span>
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
          productName: item.name,
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
