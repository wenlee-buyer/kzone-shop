// ============================================
// K.Zone 後台 - 來源分類 / 角色標籤管理模組
// （動態管理：新增/修改/刪除後即時反映在前台，不需改程式碼）
// ============================================

async function renderCategoriesPage() {
  renderTaxonomyPage({
    title: '來源分類管理',
    subtitle: '管理商品的採買來源（樂園、濟州島、快閃店…），前台分類列會自動更新',
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
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">${title}</div>
        <div class="admin-subtitle">${subtitle}</div>
      </div>
    </div>

    <div class="admin-card">
      <div style="display:flex; gap:8px; margin-bottom:16px">
        <input type="text" id="newItemInput" placeholder="新增${itemLabel}名稱・${placeholder}" style="flex:1; border:0.5px solid var(--c-rose); border-radius:8px; padding:9px 11px; font-size:13px">
        <button class="btn-primary" id="addItemBtn" style="width:auto; padding:9px 18px">新增</button>
      </div>
      <div id="taxonomyList"></div>
    </div>
  `;

  function renderList() {
    const list = document.getElementById('taxonomyList');
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state">${icon('tag-off', 18)}尚未新增任何${itemLabel}</div>`;
      return;
    }
    list.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>順序</th><th>${itemLabel}名稱</th><th>操作</th></tr></thead>
        <tbody>
          ${items.map((item, idx) => `
            <tr>
              <td>
                <div style="display:flex; gap:4px">
                  <button class="btn-icon" data-move-up="${item.id}" ${idx===0?'disabled style="opacity:0.3"':''}>${icon('chevron-up', 18)}</button>
                  <button class="btn-icon" data-move-down="${item.id}" ${idx===items.length-1?'disabled style="opacity:0.3"':''}>${icon('chevron-down', 18)}</button>
                </div>
              </td>
              <td><input type="text" value="${escapeHtml(item.name)}" data-edit-name="${item.id}" style="border:0.5px solid var(--c-blush); border-radius:6px; padding:6px 9px; font-size:13px; width:160px"></td>
              <td>
                <div style="display:flex; gap:6px">
                  <button class="btn-icon" data-save="${item.id}" title="儲存名稱">${icon('check', 18)}</button>
                  <button class="btn-icon danger" data-delete="${item.id}" title="刪除">${icon('trash', 18)}</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    items.forEach(item => {
      document.querySelector(`[data-save="${item.id}"]`)?.addEventListener('click', async () => {
        const newName = document.querySelector(`[data-edit-name="${item.id}"]`).value.trim();
        if (!newName) { showToast('名稱不可空白'); return; }
        await db.collection(collectionName).doc(item.id).update({ name: newName });
        item.name = newName;
        showToast('已更新');
      });
      document.querySelector(`[data-delete="${item.id}"]`)?.addEventListener('click', async () => {
        if (!confirm(`確定要刪除「${item.name}」嗎？已使用此${itemLabel}的商品不會被刪除，但會失去這個${itemLabel}的關聯。`)) return;
        await db.collection(collectionName).doc(item.id).delete();
        const idx2 = items.findIndex(i => i.id === item.id);
        items.splice(idx2, 1);
        await reloadCoreData();
        renderList();
        showToast('已刪除');
      });
      document.querySelector(`[data-move-up="${item.id}"]`)?.addEventListener('click', () => moveItem(item.id, -1));
      document.querySelector(`[data-move-down="${item.id}"]`)?.addEventListener('click', () => moveItem(item.id, 1));
    });
  }

  async function moveItem(id, direction) {
    const idx = items.findIndex(i => i.id === id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const itemA = items[idx];
    const itemB = items[targetIdx];
    const orderA = itemA.order;
    const orderB = itemB.order;

    await Promise.all([
      db.collection(collectionName).doc(itemA.id).update({ order: orderB }),
      db.collection(collectionName).doc(itemB.id).update({ order: orderA })
    ]);

    itemA.order = orderB;
    itemB.order = orderA;
    items.sort((a, b) => a.order - b.order);
    await reloadCoreData();
    renderList();
  }

  renderList();

  document.getElementById('addItemBtn').addEventListener('click', async () => {
    const input = document.getElementById('newItemInput');
    const name = input.value.trim();
    if (!name) { showToast('請輸入名稱'); return; }

    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order || 0)) : 0;
    const newId = genId(collectionName === COL.CATEGORIES ? 'cat' : 'tag');
    const newItem = { id: newId, name, order: maxOrder + 1 };

    await db.collection(collectionName).doc(newId).set({ name: newItem.name, order: newItem.order });
    items.push(newItem);
    await reloadCoreData();
    input.value = '';
    renderList();
    showToast(`已新增${itemLabel}：${name}`);
  });

  document.getElementById('newItemInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addItemBtn').click();
  });
}
