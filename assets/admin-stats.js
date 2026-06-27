// ============================================
// K.Zone 後台 - 流量統計模組
// 統計商品點擊次數、Top5熱門商品、日期區間篩選
// 資料來源：kzone_stats 集合（每個商品每天一筆，用 increment 累加）
// ============================================

async function renderStatsPage() {
  const main = document.getElementById('adminMain');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">流量統計</div>
        <div class="admin-subtitle">統計客人點擊各商品的次數，了解哪些商品最受歡迎</div>
      </div>
    </div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:12px">選擇日期區間</h3>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div class="field" style="margin-bottom:0; flex:1; min-width:130px">
          <label class="field-label">起始日期</label>
          <input type="date" id="statsStartDate" value="${sevenDaysAgoStr}">
        </div>
        <div class="field" style="margin-bottom:0; flex:1; min-width:130px">
          <label class="field-label">結束日期</label>
          <input type="date" id="statsEndDate" value="${todayStr}">
        </div>
        <button class="btn-primary" id="loadStatsBtn" style="width:auto; padding:9px 20px">查詢</button>
      </div>
    </div>

    <div id="statsResultWrap">
      <div class="loading-wrap"><div class="spin"></div>載入中...</div>
    </div>
  `;

  document.getElementById('loadStatsBtn').addEventListener('click', loadStats);
  loadStats();
}

async function loadStats() {
  const startStr = document.getElementById('statsStartDate').value;
  const endStr = document.getElementById('statsEndDate').value;
  const wrap = document.getElementById('statsResultWrap');

  if (!startStr || !endStr) {
    showToast('請選擇日期區間');
    return;
  }
  if (startStr > endStr) {
    showToast('起始日期不能晚於結束日期');
    return;
  }

  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>統計中...</div>`;

  try {
    // 查詢選定區間內所有的統計紀錄
    // 使用單一 where 查詢（避免複合索引需求），日期篩選在前端做
    const snap = await db.collection('kzone_stats').get();
    const allDocs = snap.docs.map(d => d.data());

    // 篩選日期區間
    const filtered = allDocs.filter(d => d.date >= startStr && d.date <= endStr);

    if (filtered.length === 0) {
      wrap.innerHTML = `
        <div class="admin-card">
          <div class="empty-state">${icon('mood-empty', 28)}<p style="margin-top:10px">這個日期區間內沒有點擊紀錄</p></div>
        </div>
      `;
      return;
    }

    // 依商品彙總總點擊次數
    const productMap = {};
    let totalViews = 0;

    filtered.forEach(d => {
      const pid = d.productId;
      if (!productMap[pid]) {
        productMap[pid] = { productId: pid, productName: d.productName || '未知商品', count: 0 };
      }
      productMap[pid].count += (d.count || 0);
      totalViews += (d.count || 0);
    });

    // 依點擊次數排序
    const sorted = Object.values(productMap).sort((a, b) => b.count - a.count);
    const top5 = sorted.slice(0, 5);
    const maxCount = top5[0]?.count || 1;

    // 計算有紀錄的天數（用來算平均每日瀏覽）
    const uniqueDates = [...new Set(filtered.map(d => d.date))];
    const dayCount = uniqueDates.length;

    wrap.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:12px; margin-bottom:16px">
        <div class="admin-card" style="text-align:center; margin-bottom:0">
          <div style="font-size:28px; font-weight:700; color:var(--c-coffee)">${totalViews.toLocaleString()}</div>
          <div style="font-size:12px; color:var(--c-rose-text); margin-top:4px">總商品點擊次數</div>
        </div>
        <div class="admin-card" style="text-align:center; margin-bottom:0">
          <div style="font-size:28px; font-weight:700; color:var(--c-coffee)">${Object.keys(productMap).length}</div>
          <div style="font-size:12px; color:var(--c-rose-text); margin-top:4px">被點擊的商品數</div>
        </div>
        <div class="admin-card" style="text-align:center; margin-bottom:0">
          <div style="font-size:28px; font-weight:700; color:var(--c-coffee)">${dayCount > 0 ? Math.round(totalViews / dayCount) : 0}</div>
          <div style="font-size:12px; color:var(--c-rose-text); margin-top:4px">平均每日點擊</div>
        </div>
      </div>

      <div class="admin-card">
        <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:16px">
          ${icon('package', 16)} Top 5 熱門商品
          <span style="font-size:11px; font-weight:400; color:var(--c-rose-text); margin-left:8px">${startStr} ～ ${endStr}</span>
        </h3>
        ${top5.map((item, idx) => `
          <div style="margin-bottom:14px">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px">
              <div style="display:flex; align-items:center; gap:8px">
                <div style="
                  width:24px; height:24px; border-radius:50%; flex-shrink:0;
                  background:${['var(--c-coffee)', '#a6754f', 'var(--c-orange)', 'var(--c-rose)', 'var(--c-sand)'][idx]};
                  color:#fff; font-size:12px; font-weight:700;
                  display:flex; align-items:center; justify-content:center;
                ">${idx + 1}</div>
                <span style="font-size:13px; font-weight:500; color:var(--c-coffee)">${escapeHtml(item.productName)}</span>
              </div>
              <span style="font-size:13px; font-weight:700; color:var(--c-coffee); flex-shrink:0; margin-left:8px">${item.count} 次</span>
            </div>
            <div style="height:8px; background:var(--c-blush); border-radius:4px; overflow:hidden">
              <div style="
                height:100%; border-radius:4px;
                background:${['var(--c-coffee)', '#a6754f', 'var(--c-orange)', 'var(--c-rose)', 'var(--c-sand)'][idx]};
                width:${Math.round((item.count / maxCount) * 100)}%;
                transition: width 0.6s ease;
              "></div>
            </div>
          </div>
        `).join('')}
      </div>

      ${sorted.length > 5 ? `
        <div class="admin-card">
          <h3 style="font-size:14px; font-weight:700; color:var(--c-coffee); margin-bottom:12px">全部商品點擊排名（Top 15）</h3>
          <table class="admin-table">
            <thead><tr><th>排名</th><th>商品名稱</th><th>點擊次數</th></tr></thead>
            <tbody>
              ${sorted.slice(0, 15).map((item, idx) => `
                <tr>
                  <td style="color:var(--c-rose-text); font-size:12px">${idx + 1}</td>
                  <td style="font-size:13px">${escapeHtml(item.productName)}</td>
                  <td><span style="font-weight:700; color:var(--c-coffee)">${item.count}</span> 次</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div class="admin-card" style="background:var(--c-cream); border-color:var(--c-sand)">
        <p style="font-size:12px; color:var(--c-rose-text); line-height:1.7">
          ${icon('info-circle', 14)}
          以上統計的是客人點擊進入商品頁面的次數。如需更詳細的整體網站瀏覽數據（總瀏覽量、來源裝置、停留時間等），建議搭配 Google Analytics 使用。
        </p>
      </div>
    `;

  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="admin-card"><div class="empty-state">${icon('alert-circle', 28)}<p style="margin-top:10px">載入統計資料失敗，請稍後再試</p></div></div>`;
  }
}
