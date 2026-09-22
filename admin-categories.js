// ============================================
// K.Zone 後台 - 來源分類 / 角色標籤管理模組
// （動態管理：新增/修改/刪除後即時反映在前台，不需改程式碼）
// ============================================
// 來源分類支援兩層：主分類 → 子分類（子分類的 parentId 記著它掛在哪個主分類底下）。
// 角色標籤只有一層，共用同一個畫面但不顯示「上層分類」那些欄位。
//
// 為什麼只做兩層：階層一深，客人要點很多次才找得到商品，後台整理也容易亂，
// 兩層對代購網站已經很夠用（例如「樂園 → 鑰匙圈／娃娃／文具」）

async function renderCategoriesPage() {
  renderTaxonomyPage({
    title: '來源分類管理',
    subtitle: '管理商品的採買來源，可再細分子分類（例：樂園 → 鑰匙圈）。前台分類列會自動更新',
    collectionName: COL.CATEGORIES,
    items: appState.categories,
    itemLabel: '分類',
    placeholder: '例：樂園'
  });
}

async function renderTagsPage() {
  renderTaxonomyPage({
    title: '角色標籤管理',
    subtitle: '管理商品的角色標籤（菇菇寶貝、皮卡啾…），前台標籤篩選列會自動更新',
    collectionName: COL.TAGS,
    items: appState.tags,
    itemLabel: '標籤',
    placeholder: '例：菇菇寶貝'
  });
}

function renderTaxonomyPage({ title, subtitle, collectionName, items, itemLabel, placeholder }) {
  // 只有「來源分類」有主/子分類的概念，角色標籤維持單層
  const supportsSubLevel = collectionName === COL.CATEGORIES;
  const main = document.getElementById('adminMain');

  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">${title}</div>
        <div class="admin-subtitle">${subtitle}</div>
      </div>
    </div>

    <div class="admin-card">
      <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap">
        <input type="text" id="newItemInput" placeholder="新增${itemLabel}名稱・${placeholder}" style="flex:1; min-width:180px; border:0.5px solid var(--c-rose); border-radius:8px; padding:9px 11px; font-size:13px">
        ${supportsSubLevel ? `
          <select id="newItemParent" style="border:0.5px solid var(--c-rose); border-radius:8px; padding:9px 11px; font-size:13px; color:var(--c-coffee)">
            <option value="">建立為主分類</option>
          </select>
        ` : ''}
        <button class="btn-primary" id="addItemBtn" style="width:auto; padding:9px 18px">新增</button>
      </div>
      ${supportsSubLevel ? `
        <p style="font-size:11px; color:var(--c-rose-text); margin-bottom:14px; line-height:1.7">
          ${icon('info-circle', 13)}
          想建立子分類，右邊選一個主分類再按新增即可。前台電腦版滑到主分類會展開子分類選單，
          手機版點主分類會在下方出現子分類按鈕；不論哪一種，點主分類都會顯示它底下所有商品。
        </p>
      ` : ''}
      <div id="taxonomyList"></div>
    </div>
  `;

  // 目前所有主分類（給「上層分類」下拉用）
  function mainItems() {
    return items.filter(i => !i.parentId);
  }
  function childrenOf(parentId) {
    return items.filter(i => i.parentId === parentId);
  }

  // 依「主分類 → 它的子分類」排出畫面上要顯示的順序
  function displayRows() {
    const rows = [];
    mainItems().forEach(m => {
      rows.push({ item: m, isSub: false });
      childrenOf(m.id).forEach(c => rows.push({ item: c, isSub: true }));
    });
    // 保險：萬一有子分類的主分類被刪掉了，這些「孤兒」也要顯示出來才能處理，不能讓它們消失在畫面上
    const shown = new Set(rows.map(r => r.item.id));
    items.filter(i => !shown.has(i.id)).forEach(i => rows.push({ item: i, isSub: false, orphan: true }));
    return rows;
  }

  function parentSelectHtml(item) {
    // 已經有子分類的主分類不能再變成別人的子分類（只做兩層）
    const hasChildren = childrenOf(item.id).length > 0;
    const options = mainItems()
      .filter(m => m.id !== item.id)
      .map(m => `<option value="${m.id}" ${item.parentId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`)
      .join('');
    return `
      <select data-parent="${item.id}" ${hasChildren ? 'disabled title="這個主分類底下還有子分類，不能再變成別人的子分類"' : ''}
        style="border:0.5px solid var(--c-blush); border-radius:6px; padding:6px 8px; font-size:12px; color:var(--c-coffee); ${hasChildren ? 'opacity:0.45' : ''}">
        <option value="">（主分類）</option>
        ${options}
      </select>
    `;
  }

  function renderList() {
    const list = document.getElementById('taxonomyList');
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state">${icon('tag-off', 18)}尚未新增任何${itemLabel}</div>`;
      if (supportsSubLevel) refreshParentSelect();
      return;
    }

    const rows = displayRows();

    list.innerHTML = `
      <table class="admin-table">
        <thead><tr>
          <th>順序</th>
          <th>${itemLabel}名稱</th>
          ${supportsSubLevel ? '<th>上層分類</th>' : ''}
          <th>操作</th>
        </tr></thead>
        <tbody>
          ${rows.map(({ item, isSub, orphan }) => {
            const siblings = isSub ? childrenOf(item.parentId) : mainItems();
            const posInSiblings = siblings.findIndex(s => s.id === item.id);
            const isFirst = posInSiblings <= 0;
            const isLast = posInSiblings === siblings.length - 1;
            const subCount = !isSub ? childrenOf(item.id).length : 0;
            return `
            <tr ${isSub ? 'style="background:#fcfaf7"' : ''}>
              <td>
                <div style="display:flex; gap:4px">
                  <button class="btn-icon" data-move-up="${item.id}" ${isFirst ? 'disabled style="opacity:0.3"' : ''} title="在同一層往上移">${icon('chevron-up', 18)}</button>
                  <button class="btn-icon" data-move-down="${item.id}" ${isLast ? 'disabled style="opacity:0.3"' : ''} title="在同一層往下移">${icon('chevron-down', 18)}</button>
                </div>
              </td>
              <td>
                <div style="display:flex; align-items:center; gap:6px">
                  ${isSub ? '<span style="color:var(--c-rose-text); font-size:12px">└</span>' : ''}
                  <input type="text" value="${escapeHtml(item.name)}" data-edit-name="${item.id}" style="border:0.5px solid var(--c-blush); border-radius:6px; padding:6px 9px; font-size:13px; width:150px">
                  ${subCount > 0 ? `<span class="pill" style="background:var(--c-cream); color:var(--c-rose-text)">${subCount} 個子分類</span>` : ''}
                  ${orphan ? `<span class="pill" style="background:#fff3cd; color:#856404" title="它的上層分類已經被刪除了，請重新指定或改成主分類">⚠ 上層已刪除</span>` : ''}
                </div>
              </td>
              ${supportsSubLevel ? `<td>${parentSelectHtml(item)}</td>` : ''}
              <td>
                <div style="display:flex; gap:6px">
                  ${supportsSubLevel ? `<button class="btn-icon" data-copy-link="${item.id}" title="複製這個分類的網址，可傳給客人直接看該分類商品">${icon('link', 18)}</button>` : ''}
                  <button class="btn-icon" data-save="${item.id}" title="儲存名稱">${icon('check', 18)}</button>
                  <button class="btn-icon danger" data-delete="${item.id}" title="刪除">${icon('trash', 18)}</button>
                </div>
              </td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    `;

    items.forEach(item => {
      document.querySelector(`[data-save="${item.id}"]`)?.addEventListener('click', async () => {
        const newName = document.querySelector(`[data-edit-name="${item.id}"]`).value.trim();
        if (!newName) { showToast('名稱不可空白'); return; }
        await db.collection(collectionName).doc(item.id).update({ name: newName });
        item.name = newName;
        await rebuildCatalog().catch(err => console.error('重建商品目錄快照失敗:', err));
        renderList();
        showToast('已更新');
      });

      // 改變上層分類（只有來源分類有這個欄位）
      document.querySelector(`[data-parent="${item.id}"]`)?.addEventListener('change', async (e) => {
        const newParentId = e.target.value || null;
        if (newParentId && childrenOf(item.id).length > 0) {
          showToast('這個分類底下還有子分類，請先處理它們');
          e.target.value = item.parentId || '';
          return;
        }
        try {
          // 改成子分類時排到該主分類底下的最後面，改回主分類時排到主分類的最後面
          const siblings = newParentId ? childrenOf(newParentId) : mainItems().filter(m => m.id !== item.id);
          const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order || 0)) : 0;
          await db.collection(collectionName).doc(item.id).update({ parentId: newParentId, order: maxOrder + 1 });
          item.parentId = newParentId;
          item.order = maxOrder + 1;
          await reloadCoreData();
          await rebuildCatalog().catch(err => console.error('重建商品目錄快照失敗:', err));
          renderList();
          showToast(newParentId ? '已移到該主分類底下' : '已改為主分類');
        } catch (err) {
          console.error(err);
          showToast('變更失敗，請稍後再試');
        }
      });

      document.querySelector(`[data-delete="${item.id}"]`)?.addEventListener('click', async () => {
        // 主分類底下還有子分類時不能直接刪，否則那些子分類會變成找不到爸爸的孤兒
        const kids = childrenOf(item.id);
        if (kids.length > 0) {
          showToast(`「${item.name}」底下還有 ${kids.length} 個子分類，請先刪除或把它們改成主分類`);
          return;
        }
        if (!confirm(`確定要刪除「${item.name}」嗎？已使用此${itemLabel}的商品不會被刪除，但會失去這個${itemLabel}的關聯。`)) return;
        await db.collection(collectionName).doc(item.id).delete();
        const idx2 = items.findIndex(i => i.id === item.id);
        items.splice(idx2, 1);
        await reloadCoreData();
        await rebuildCatalog().catch(err => console.error('重建商品目錄快照失敗:', err));
        renderList();
        showToast('已刪除');
      });

      document.querySelector(`[data-copy-link="${item.id}"]`)?.addEventListener('click', async () => {
        // admin-dashboard.html 跟 products.html 是同一層目錄，把檔名換掉就是前台分類頁的網址
        const url = `${location.origin}${location.pathname.replace(/admin-dashboard\.html$/, '')}products.html?cat=${encodeURIComponent(item.id)}`;
        const ok = await copyTextToClipboard(url);
        showToast(ok ? `已複製「${item.name}」的分類連結！` : '複製失敗，請手動選取複製');
      });

      document.querySelector(`[data-move-up="${item.id}"]`)?.addEventListener('click', () => moveItem(item.id, -1));
      document.querySelector(`[data-move-down="${item.id}"]`)?.addEventListener('click', () => moveItem(item.id, 1));
    });

    if (supportsSubLevel) refreshParentSelect();
  }

  // 新增用的「上層分類」下拉，每次清單變動都要重新產生一次，才不會少了剛新增的主分類
  function refreshParentSelect() {
    const sel = document.getElementById('newItemParent');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = `<option value="">建立為主分類</option>` +
      mainItems().map(m => `<option value="${m.id}">└ 放進「${escapeHtml(m.name)}」底下</option>`).join('');
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
  }

  // 上下移動只在「同一層的兄弟姊妹」之間交換，不會跨層亂跑
  async function moveItem(id, direction) {
    const target = items.find(i => i.id === id);
    if (!target) return;
    const siblings = target.parentId ? childrenOf(target.parentId) : mainItems();

    const idx = siblings.findIndex(i => i.id === id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    // 直接交換陣列裡的位置，畫面順序不要依賴 order 數值排序決定。
    // 原本的做法是交換兩邊的 order 數值再排序，但如果舊資料裡剛好有兩筆 order 數值相同（或缺漏），
    // 交換後數值還是相等，排序結果不會變，畫面就會看起來「怎麼點都沒反應」，尤其容易發生在第一筆。
    [siblings[idx], siblings[targetIdx]] = [siblings[targetIdx], siblings[idx]];

    // 交換完之後，依照「同一層目前真正看到的順序」整批重新編號成連續的 1,2,3...，
    // 這樣即使舊資料的 order 數值本來就亂了，點過一次之後也會自動修正乾淨，不會再卡住
    const batch = db.batch();
    siblings.forEach((item, i) => {
      item.order = i + 1;
      batch.update(db.collection(collectionName).doc(item.id), { order: i + 1 });
    });
    await batch.commit();

    // items 是共用的來源陣列，要讓它的排列順序跟資料庫一致，畫面重繪才會正確
    items.sort((a, b) => (a.order || 0) - (b.order || 0));

    await reloadCoreData();
    await rebuildCatalog().catch(err => console.error('重建商品目錄快照失敗:', err));
    renderList();
  }

  renderList();

  document.getElementById('addItemBtn').addEventListener('click', async () => {
    const input = document.getElementById('newItemInput');
    const name = input.value.trim();
    if (!name) { showToast('請輸入名稱'); return; }

    const parentSel = document.getElementById('newItemParent');
    const parentId = parentSel ? (parentSel.value || null) : null;

    // 排序值只跟同一層的兄弟姊妹比，不要跟別層混在一起算
    const siblings = parentId ? childrenOf(parentId) : mainItems();
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(i => i.order || 0)) : 0;
    const newId = genId(collectionName === COL.CATEGORIES ? 'cat' : 'tag');
    const newItem = { id: newId, name, order: maxOrder + 1, parentId };

    const payload = { name: newItem.name, order: newItem.order };
    // Firestore 不接受 undefined，主分類就明確存 null
    if (supportsSubLevel) payload.parentId = parentId;

    await db.collection(collectionName).doc(newId).set(payload);
    items.push(newItem);
    await reloadCoreData();
    await rebuildCatalog().catch(err => console.error('重建商品目錄快照失敗:', err));
    input.value = '';
    renderList();
    showToast(parentId ? `已新增子分類：${name}` : `已新增${itemLabel}：${name}`);
  });

  document.getElementById('newItemInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addItemBtn').click();
  });
}
