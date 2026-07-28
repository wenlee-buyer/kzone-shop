// ============================================
// K.Zone 後台 - 圖片下載模組
// 讓你可以勾選要下載的商品，把已經套過浮水印的商品圖片打包成 ZIP 下載，
// 拿去用在其他銷售平台（蝦皮/PChome...等）。原本商品同步匯入頁面已經用不到了，改成這個功能。
// ============================================

let imageDownloadPageState = {
  products: [],
  selectedIds: new Set()
};

async function renderImageDownloadPage() {
  const main = document.getElementById('adminMain');
  main.innerHTML = `
    <div class="admin-header">
      <div>
        <div class="admin-title">圖片下載</div>
        <div class="admin-subtitle">勾選商品，把已加上浮水印的圖片打包下載，可拿去用在其他銷售平台</div>
      </div>
      <div class="admin-btn-row">
        <button class="btn-secondary" id="selectAllImgBtn" style="width:auto">全選</button>
        <button class="btn-secondary" id="clearSelectImgBtn" style="width:auto">取消全選</button>
        <button class="btn-primary" id="downloadZipBtn" style="width:auto">下載選取商品圖片（ZIP）</button>
      </div>
    </div>
    <div class="admin-card">
      <div id="imageDownloadListWrap">
        <div class="loading-wrap"><div class="spin"></div>載入商品中...</div>
      </div>
    </div>
  `;

  document.getElementById('selectAllImgBtn').addEventListener('click', () => {
    imageDownloadPageState.products.forEach(p => {
      if (p.images && p.images.length > 0) imageDownloadPageState.selectedIds.add(p.id);
    });
    renderImageDownloadList();
  });
  document.getElementById('clearSelectImgBtn').addEventListener('click', () => {
    imageDownloadPageState.selectedIds.clear();
    renderImageDownloadList();
  });
  document.getElementById('downloadZipBtn').addEventListener('click', downloadSelectedImagesZip);

  await loadImageDownloadProducts();
}

async function loadImageDownloadProducts() {
  const wrap = document.getElementById('imageDownloadListWrap');
  wrap.innerHTML = `<div class="loading-wrap"><div class="spin"></div>載入中...</div>`;

  try {
    // 不分上架/封存狀態，全部商品都列出來，方便你把舊商品的圖片也一起挖出來用
    const snap = await db.collection(COL.PRODUCTS).get();
    imageDownloadPageState.products = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

    renderImageDownloadList();
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty-state">${icon('alert-circle', 18)}載入失敗</div>`;
  }
}

function renderImageDownloadList() {
  const wrap = document.getElementById('imageDownloadListWrap');
  const products = imageDownloadPageState.products;

  if (products.length === 0) {
    wrap.innerHTML = `<div class="empty-state">${icon('package-off', 18)}目前沒有商品</div>`;
    return;
  }

  const selectedCount = imageDownloadPageState.selectedIds.size;
  const countLabel = document.createElement('div');

  wrap.innerHTML = `
    <div style="font-size:12px; color:var(--c-rose-text); margin-bottom:10px">已選擇 ${selectedCount} 項商品</div>
    <table class="admin-table">
      <thead><tr><th></th><th>圖片</th><th>名稱</th><th>圖片數量</th></tr></thead>
      <tbody>
        ${products.map(p => {
          const imgCount = (p.images || []).length;
          const img = (p.images && p.images[0]) || '';
          const checked = imageDownloadPageState.selectedIds.has(p.id);
          const disabled = imgCount === 0;
          return `
            <tr style="${disabled ? 'opacity:0.5' : ''}">
              <td><input type="checkbox" data-select-product="${p.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="width:16px; height:16px"></td>
              <td><div style="width:44px;height:44px;border-radius:8px;overflow:hidden;background:var(--c-cream)">${img ? `<img src="${escapeHtml(img)}" style="width:100%;height:100%;object-fit:cover">` : ''}</div></td>
              <td style="max-width:200px; white-space:normal">${escapeHtml(p.name || '（未命名商品）')}</td>
              <td>${imgCount === 0 ? '無圖片' : `${imgCount} 張`}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-select-product]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.selectProduct;
      if (cb.checked) imageDownloadPageState.selectedIds.add(id);
      else imageDownloadPageState.selectedIds.delete(id);
      // 只更新上方的「已選擇 X 項」文字，不重新整個渲染表格（避免勾選時畫面閃動或失去捲動位置）
      const label = wrap.querySelector('div');
      if (label) label.textContent = `已選擇 ${imageDownloadPageState.selectedIds.size} 項商品`;
    });
  });
}

// 把中文/特殊符號的商品名稱轉成安全的資料夾/檔案名稱，避免壓縮檔在某些系統打不開
function sanitizeFilename(name) {
  return (name || '未命名商品').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名商品';
}

// 從圖片網址判斷副檔名：只看網址「路徑最後一段」裡的副檔名，
// 避免網域本身含有句點（例如 example.com）被誤判成副檔名，
// 也避免抓到問號後面的查詢字串或斜線，導致檔名裡混進不合法字元
function getImageExtFromUrl(url) {
  const lastSegment = (url || '').split('?')[0].split('/').pop() || '';
  const match = lastSegment.match(/\.([a-zA-Z0-9]{2,4})$/);
  return match ? match[1].toLowerCase() : 'jpg';
}

async function downloadSelectedImagesZip() {
  const selectedProducts = imageDownloadPageState.products.filter(p => imageDownloadPageState.selectedIds.has(p.id));
  if (selectedProducts.length === 0) {
    showToast('請先勾選至少一個商品');
    return;
  }

  const btn = document.getElementById('downloadZipBtn');
  btn.disabled = true;

  try {
    const zip = new JSZip();
    let totalImages = 0;
    let failedCount = 0;
    const usedFolderNames = {}; // 避免同名商品資料夾互相覆蓋

    let doneCount = 0;
    for (const product of selectedProducts) {
      const images = product.images || [];
      if (images.length === 0) continue;

      let folderName = sanitizeFilename(product.name);
      if (usedFolderNames[folderName] !== undefined) {
        usedFolderNames[folderName]++;
        folderName = `${folderName}_${usedFolderNames[folderName]}`;
      } else {
        usedFolderNames[folderName] = 0;
      }
      const folder = zip.folder(folderName);

      for (let i = 0; i < images.length; i++) {
        btn.textContent = `下載中... (${doneCount + 1}/${selectedProducts.length} 個商品)`;
        try {
          const res = await fetch(images[i]);
          if (!res.ok) throw new Error('圖片下載失敗');
          const blob = await res.blob();
          const ext = getImageExtFromUrl(images[i]);
          folder.file(`${i + 1}.${ext}`, blob);
          totalImages++;
        } catch (e) {
          console.error('圖片下載失敗:', images[i], e);
          failedCount++;
        }
      }
      doneCount++;
    }

    if (totalImages === 0) {
      showToast('沒有成功下載到任何圖片，請稍後再試');
      return;
    }

    btn.textContent = '打包中...';
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `K.Zone商品圖片_${dateStr}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);

    showToast(failedCount > 0
      ? `下載完成！共 ${totalImages} 張圖片（${failedCount} 張下載失敗，可能是網路問題，請稍後重試）`
      : `下載完成！共打包 ${totalImages} 張圖片`);

  } catch (err) {
    console.error(err);
    showToast('打包下載失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '下載選取商品圖片（ZIP）';
  }
}
