// ============================================
// K.Zone 後台 - 網站設定模組
// （Banner圖／LINE連結／提醒文字／密碼 等全部可編輯，無需改程式碼）
// ============================================

let settingsPageState = {
  pendingHeroImage: null // { blob, dataUrl }
};

async function renderSettingsPage() {
  const s = appState.settings;
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">網站設定</div>
        <div class="admin-subtitle">這裡的設定會即時反映在前台網站，修改後請記得儲存</div>
      </div>
    </div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:14px">基本資訊</h3>
      <div class="field">
        <label class="field-label">網站名稱</label>
        <input type="text" id="st_siteName" value="${escapeHtml(s.siteName)}">
      </div>
      <div class="field">
        <label class="field-label">副標題</label>
        <input type="text" id="st_siteSubtitle" value="${escapeHtml(s.siteSubtitle)}">
      </div>
      <div class="field">
        <label class="field-label">頂部跑馬燈文字</label>
        <input type="text" id="st_marqueeText" value="${escapeHtml(s.marqueeText)}">
      </div>
    </div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:14px">首頁主視覺 Banner</h3>
      <div class="field">
        <label class="field-label">主標題（換行請按 Enter）</label>
        <textarea id="st_heroTitle">${escapeHtml(s.heroTitle)}</textarea>
      </div>
      <div class="field">
        <label class="field-label">副標語（換行請按 Enter）</label>
        <textarea id="st_heroSubtitle">${escapeHtml(s.heroSubtitle)}</textarea>
      </div>
      <div class="field">
        <label class="field-label">主視覺圖片（不上傳則使用預設蘑菇插圖）</label>
        <div id="heroImgPreview" style="margin-bottom:10px">
          ${s.heroImage ? `<img src="${escapeHtml(s.heroImage)}" style="width:100px; height:100px; object-fit:cover; border-radius:10px">` : `<div style="font-size:12px; color:var(--c-rose-text)">目前使用預設蘑菇插圖</div>`}
        </div>
        <button class="btn-secondary" id="st_chooseHeroBtn" style="width:auto">上傳主視覺圖片</button>
        <input type="file" id="st_heroFileInput" accept="image/*" style="display:none">
        ${s.heroImage ? `<button class="btn-icon danger" id="st_removeHeroBtn" style="margin-left:8px">恢復預設插圖</button>` : ''}
      </div>
    </div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:14px">LINE 設定</h3>
      <div class="field">
        <label class="field-label">LINE 官方帳號連結</label>
        <input type="text" id="st_lineOfficialUrl" value="${escapeHtml(s.lineOfficialUrl)}">
      </div>
      <div class="field">
        <label class="field-label">LINE 社群連結</label>
        <input type="text" id="st_lineCommunityUrl" value="${escapeHtml(s.lineCommunityUrl)}">
      </div>
      <div class="field">
        <label class="field-label">LINE 社群標題</label>
        <input type="text" id="st_lineCommunityTitle" value="${escapeHtml(s.lineCommunityTitle)}">
      </div>
      <div class="field">
        <label class="field-label">LINE 社群說明文字</label>
        <textarea id="st_lineCommunityText">${escapeHtml(s.lineCommunityText)}</textarea>
      </div>
    </div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:14px">購買需知提醒（第一次加入購物車時跳出）</h3>
      <div class="field">
        <textarea id="st_firstCartReminderText" style="min-height:140px">${escapeHtml(s.firstCartReminderText)}</textarea>
      </div>
    </div>

    <div class="admin-card">
      <h3 style="font-size:14px; color:var(--c-coffee); margin-bottom:14px">浮水印與安全設定</h3>
      <div class="field">
        <label class="field-label">商品圖片浮水印文字</label>
        <input type="text" id="st_watermarkText" value="${escapeHtml(s.watermarkText)}">
      </div>
      <div class="field">
        <label class="field-label">後台管理密碼（密碼已加密儲存，不會顯示原文；留空表示不變更）</label>
        <input type="text" id="st_adminPassword" value="" placeholder="輸入新密碼以變更，留空則維持原密碼">
      </div>
    </div>

    <button class="btn-primary" id="saveSettingsBtn" style="max-width:240px">儲存所有設定</button>
  `;

  document.getElementById('st_chooseHeroBtn').addEventListener('click', () => {
    document.getElementById('st_heroFileInput').click();
  });

  document.getElementById('st_heroFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await blobToDataURL(file);
    settingsPageState.pendingHeroImage = { file, dataUrl };
    document.getElementById('heroImgPreview').innerHTML = `<img src="${dataUrl}" style="width:100px; height:100px; object-fit:cover; border-radius:10px">`;
  });

  document.getElementById('st_removeHeroBtn')?.addEventListener('click', () => {
    settingsPageState.pendingHeroImage = 'REMOVE';
    document.getElementById('heroImgPreview').innerHTML = `<div style="font-size:12px; color:var(--c-rose-text)">將恢復使用預設蘑菇插圖</div>`;
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', saveAllSettings);
}

async function saveAllSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  btn.textContent = '儲存中...';

  try {
    let heroImageUrl = appState.settings.heroImage;

    if (settingsPageState.pendingHeroImage === 'REMOVE') {
      heroImageUrl = '';
    } else if (settingsPageState.pendingHeroImage) {
      heroImageUrl = await uploadImageToStorage(settingsPageState.pendingHeroImage.file, 'banner');
    }

    const newSettings = {
      siteName: document.getElementById('st_siteName').value.trim(),
      siteSubtitle: document.getElementById('st_siteSubtitle').value.trim(),
      marqueeText: document.getElementById('st_marqueeText').value.trim(),
      heroTitle: document.getElementById('st_heroTitle').value,
      heroSubtitle: document.getElementById('st_heroSubtitle').value,
      heroImage: heroImageUrl,
      lineOfficialUrl: document.getElementById('st_lineOfficialUrl').value.trim(),
      lineCommunityUrl: document.getElementById('st_lineCommunityUrl').value.trim(),
      lineCommunityTitle: document.getElementById('st_lineCommunityTitle').value.trim(),
      lineCommunityText: document.getElementById('st_lineCommunityText').value,
      firstCartReminderText: document.getElementById('st_firstCartReminderText').value,
      watermarkText: document.getElementById('st_watermarkText').value.trim()
    };

    // 密碼欄位留空 = 不變更；有輸入才雜湊後更新
    const newPw = document.getElementById('st_adminPassword').value.trim();
    if (newPw) {
      newSettings.adminPassword = await sha256Hex(newPw);
    }

    await db.collection(COL.SETTINGS).doc('main').set(newSettings, { merge: true });
    appState.settings = { ...appState.settings, ...newSettings };
    settingsPageState.pendingHeroImage = null;

    showToast('設定已儲存！前台網站將自動套用最新設定');
    renderSettingsPage();

  } catch (err) {
    console.error(err);
    showToast('儲存失敗，請稍後再試');
    btn.disabled = false;
    btn.textContent = '儲存所有設定';
  }
}
