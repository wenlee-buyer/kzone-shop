// ============================================
// K.Zone 後台 - 優惠碼管理模組
// 代碼本身當作 Firestore doc id，客人結帳輸入代碼時直接查該 doc，不需要額外索引
// ============================================

let couponsPageState = {
  editingCode: null // 目前正在編輯的優惠碼（doc id），null 表示新增
};

async function renderCouponsPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">優惠碼管理</div>
        <div class="admin-subtitle">設定折扣代碼，客人結帳時可以輸入折抵商品小計（不含運費）</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-primary" id="addCouponBtn" style="width:auto">+ 新增優惠碼</button>
      </div>
    </div>
    <div class="admin-card">
      <div id="couponsListWrap">
        <div class="loading-wrap"><div class="spin"></div>載入中...</div>
      </div>
    </div>
  `;

  document.getElementById('addCouponBtn').addEventListener('click', () => openCouponEditor(null));
  await loadAndRenderCoupons();
}

async function loadAndRenderCoupons() {
  const wrap = document.getElementById('couponsListWrap');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>載入中...</div>`;

  try {
    const snap = await db.collection(COL.COUPONS).get();
    const coupons = snap.docs.map(d => ({ code: d.id, ...d.data() }));
    // 依建立時間新到舊排序（沒有 createdAt 的舊資料排最後）
    coupons.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

    if (coupons.length === 0) {
      wrap.innerHTML = `<div class="empty-state">${icon('tag-off', 18)}尚未新增任何優惠碼</div>`;
      return;
    }

    const now = Date.now();
    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>代碼</th><th>折扣</th><th>有效期間</th><th>狀態</th><th>操作</th></tr>
        </thead>
        <tbody>
          ${coupons.map(c => renderCouponRow(c, now)).join('')}
        </tbody>
      </table>
    `;

    coupons.forEach(c => {
      document.getElementById(`edit-coupon-${c.code}`)?.addEventListener('click', () => openCouponEditor(c));
      document.getElementById(`toggle-coupon-${c.code}`)?.addEventListener('click', () => toggleCouponActive(c));
      document.getElementById(`delete-coupon-${c.code}`)?.addEventListener('click', () => deleteCoupon(c));
    });

  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入失敗</div>`;
  }
}

function formatCouponDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function renderCouponRow(c, now) {
  const discountText = c.discountType === 'percent' ? `折扣 ${c.discountValue}%` : `折抵 ${formatPrice(c.discountValue)}`;
  const rangeText = (c.startAt || c.endAt)
    ? `${c.startAt ? formatCouponDate(c.startAt) : '不限'} ～ ${c.endAt ? formatCouponDate(c.endAt) : '不限'}`
    : '不限期限';

  let statusPill = `<span class="pill pill-instock">啟用中</span>`;
  if (c.active === false) {
    statusPill = `<span class="pill pill-archived">已停用</span>`;
  } else if (c.endAt && now > c.endAt) {
    statusPill = `<span class="pill" style="background:#fbe1e1;color:#a33">已過期</span>`;
  } else if (c.startAt && now < c.startAt) {
    statusPill = `<span class="pill" style="background:#fff3d6;color:#a67c00">尚未開始</span>`;
  }

  return `
    <tr>
      <td style="font-weight:700; color:var(--c-coffee)">${escapeHtml(c.code)}</td>
      <td>${discountText}</td>
      <td style="font-size:12px">${rangeText}</td>
      <td>${statusPill}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap">
          <button class="btn-icon" id="edit-coupon-${c.code}" title="編輯">編輯</button>
          <button class="btn-icon ${c.active === false ? 'active-accent' : ''}" id="toggle-coupon-${c.code}" title="${c.active === false ? '啟用' : '停用'}">${c.active === false ? '啟用' : '停用'}</button>
          <button class="btn-icon danger" id="delete-coupon-${c.code}" title="刪除">刪除</button>
        </div>
      </td>
    </tr>
  `;
}

async function toggleCouponActive(c) {
  await db.collection(COL.COUPONS).doc(c.code).update({ active: c.active === false ? true : false });
  showToast(c.active === false ? '已啟用' : '已停用');
  loadAndRenderCoupons();
}

async function deleteCoupon(c) {
  if (!confirm(`確定要刪除優惠碼「${c.code}」嗎？此動作無法復原，已經使用過此優惠碼的訂單紀錄不會受影響。`)) return;
  await db.collection(COL.COUPONS).doc(c.code).delete();
  showToast('已刪除');
  loadAndRenderCoupons();
}

function msToDateInputValue(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function openCouponEditor(coupon) {
  const isEdit = !!coupon;
  couponsPageState.editingCode = isEdit ? coupon.code : null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'couponModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? '編輯優惠碼' : '新增優惠碼'}</span>
        <button class="modal-close" id="closeCouponModal">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">優惠碼 *（客人結帳時輸入的代碼，會自動轉大寫）</label>
          <input type="text" id="cf_code" value="${isEdit ? escapeHtml(coupon.code) : ''}" placeholder="例：WELCOME100" ${isEdit ? 'disabled style="background:var(--c-cream)"' : ''}>
          ${isEdit ? `<div style="font-size:11px; color:var(--c-rose-text); margin-top:4px">代碼建立後不能修改，如需改代碼請刪除後重新新增</div>` : ''}
        </div>

        <div class="field">
          <label class="field-label">折扣方式 *</label>
          <div class="tag-chip-list">
            <div class="tag-chip ${(!coupon || coupon.discountType === 'fixed') ? 'selected' : ''}" data-discount-type="fixed">固定金額折抵</div>
            <div class="tag-chip ${coupon?.discountType === 'percent' ? 'selected' : ''}" data-discount-type="percent">百分比折扣</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label" id="cf_valueLabel">折抵金額（NT$）*</label>
          <input type="number" id="cf_value" value="${coupon?.discountValue ?? ''}" placeholder="例：100">
        </div>

        <div class="field">
          <label class="field-label">開始日期（選填，留空表示現在就可以用）</label>
          <input type="date" id="cf_startAt" value="${coupon ? msToDateInputValue(coupon.startAt) : ''}">
        </div>
        <div class="field">
          <label class="field-label">結束日期（選填，留空表示不會過期）</label>
          <input type="date" id="cf_endAt" value="${coupon ? msToDateInputValue(coupon.endAt) : ''}">
        </div>

        <div class="field" style="background:var(--c-cream); border-radius:8px; padding:12px">
          <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--c-coffee); cursor:pointer">
            <input type="checkbox" id="cf_active" ${(!coupon || coupon.active !== false) ? 'checked' : ''} style="width:16px; height:16px">
            啟用（取消勾選可以暫時停用，不用刪除）
          </label>
        </div>

        <button class="btn-primary" id="cf_saveBtn" style="margin-top:6px">${isEdit ? '儲存變更' : '新增優惠碼'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function updateValueLabel() {
    const type = overlay.querySelector('[data-discount-type].selected')?.dataset.discountType || 'fixed';
    document.getElementById('cf_valueLabel').textContent = type === 'percent' ? '折扣百分比（例如輸入10代表打9折）*' : '折抵金額（NT$）*';
  }
  overlay.querySelectorAll('[data-discount-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      overlay.querySelectorAll('[data-discount-type]').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      updateValueLabel();
    });
  });
  updateValueLabel();

  document.getElementById('closeCouponModal').addEventListener('click', closeCouponEditor);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeCouponEditor(); });
  document.getElementById('cf_saveBtn').addEventListener('click', () => saveCoupon(isEdit));
}

function closeCouponEditor() {
  document.getElementById('couponModalOverlay')?.remove();
  couponsPageState.editingCode = null;
}

async function saveCoupon(isEdit) {
  const code = document.getElementById('cf_code').value.trim().toUpperCase();
  const discountType = document.querySelector('[data-discount-type].selected')?.dataset.discountType || 'fixed';
  const discountValue = parseFloat(document.getElementById('cf_value').value);
  const startAtVal = document.getElementById('cf_startAt').value;
  const endAtVal = document.getElementById('cf_endAt').value;
  const active = document.getElementById('cf_active').checked;

  if (!code) { showToast('請輸入優惠碼'); return; }
  if (!/^[A-Z0-9_-]+$/.test(code)) { showToast('優惠碼只能用英文字母、數字、- 和 _'); return; }
  if (isNaN(discountValue) || discountValue <= 0) { showToast('請輸入正確的折扣數字'); return; }
  if (discountType === 'percent' && discountValue > 100) { showToast('百分比折扣不能超過100'); return; }

  // 開始日期用當天 00:00，結束日期用當天 23:59:59，這樣「結束日當天」客人還能用到最後一刻
  const startAt = startAtVal ? new Date(startAtVal + 'T00:00:00').getTime() : null;
  const endAt = endAtVal ? new Date(endAtVal + 'T23:59:59').getTime() : null;
  if (startAt && endAt && startAt > endAt) { showToast('開始日期不能晚於結束日期'); return; }

  const saveBtn = document.getElementById('cf_saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '儲存中...';

  try {
    if (!isEdit) {
      const existing = await db.collection(COL.COUPONS).doc(code).get();
      if (existing.exists) {
        showToast('這組優惠碼已經存在了，請換一組代碼');
        saveBtn.disabled = false;
        saveBtn.textContent = '新增優惠碼';
        return;
      }
    }

    const couponData = { discountType, discountValue, startAt, endAt, active };
    if (!isEdit) couponData.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    await db.collection(COL.COUPONS).doc(code).set(couponData, { merge: true });
    showToast(isEdit ? '優惠碼已更新' : '優惠碼已新增');
    closeCouponEditor();
    loadAndRenderCoupons();
  } catch (err) {
    console.error(err);
    showToast('儲存失敗，請稍後再試');
    saveBtn.disabled = false;
    saveBtn.textContent = isEdit ? '儲存變更' : '新增優惠碼';
  }
}
