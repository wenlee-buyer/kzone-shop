// ============================================
// K.Zone SVG 圖示庫
// 改用 inline SVG 取代字體圖示（Tabler webfont 在部分瀏覽器無法正確顯示）
// 用法：icon('shopping-cart') 回傳一段 SVG HTML 字串，可直接插入 innerHTML
// ============================================

const ICON_PATHS = {
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 2-1.58l1.65-7.39H5.12"/>',
  'shopping-cart-plus': '<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 2-1.58l1.65-7.39H5.12"/><path d="M17 11V7"/><path d="M15 9h4"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'clipboard-list': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/><path d="M9 8h2"/>',
  'clipboard-off': '<path d="M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M4 4.5V19a2 2 0 0 0 2 2h12"/><path d="M3 3l18 18"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'hash': '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  'info-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'mood-empty': '<circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/>',
  'package': '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'package-off': '<path d="M5 5 19 19"/><path d="M3.3 7 12 12m9-4-9 5-9-5"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-2 1.14"/><path d="M3 8a2 2 0 0 0-.5.6"/><path d="M21 16V8a2 2 0 0 0-.1-.65"/><path d="M3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l1.5-.86"/>',
  'photo': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  'photo-plus': '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Z"/><path d="m3 16 5-5c.9-.9 2.1-.9 3 0l5 5"/><path d="m14 14 1-1c.9-.9 2.1-.9 3 0l3 3"/>',
  'refresh': '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  'settings': '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"/><circle cx="12" cy="12" r="3"/>',
  'tag': '<path d="M7.859 6h-2.834a2.025 2.025 0 0 0-2.025 2.025v2.834c0 .537.213 1.052.593 1.432l8.293 8.293a2.025 2.025 0 0 0 2.864 0l5.171-5.171a2.025 2.025 0 0 0 0-2.864l-8.293-8.293A2.025 2.025 0 0 0 10.196 6Z"/><path d="M17.5 10.5h.01"/>',
  'tag-off': '<path d="M3 3l18 18"/><path d="M7.859 6h-2.834a2.025 2.025 0 0 0-2.025 2.025v2.834c0 .537.213 1.052.593 1.432l8.293 8.293a2.025 2.025 0 0 0 2.864 0l1.476-1.476"/><path d="M17.5 10.5h.01"/><path d="M21 12.5 12.5 21"/>',
  'trash': '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
  'user': '<circle cx="12" cy="8" r="4"/><path d="M6 21v-1a6 6 0 0 1 12 0v1"/>',
  'users': '<circle cx="9" cy="7" r="4"/><path d="M3 21v-1a6 6 0 0 1 12 0v1"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-1a4 4 0 0 0-3-3.85"/>',
  'edit': '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  'archive': '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>',
  'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'message-circle': '<path d="M3 20l1.3-3.9A9 9 0 1 1 7.9 19.7L3 20Z"/>',
  'chart-bar': '<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>',
  'menu': '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  'video': '<path d="m16 10 4.553-2.276A1 1 0 0 1 22 8.618v6.764a1 1 0 0 1-1.447.894L16 14"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  'player-play': '<circle cx="12" cy="12" r="10"/><path d="M10 8.75a1 1 0 0 1 1.5-.866l5 3.25a1 1 0 0 1 0 1.732l-5 3.25A1 1 0 0 1 10 15.25Z"/>'
};

function icon(name, size = 18, strokeWidth = 2) {
  const path = ICON_PATHS[name];
  if (!path) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-3px">${path}</svg>`;
}

// 將靜態 HTML 中標記為 <span class="ico" data-icon="xxx"></span> 的佔位元素，
// 換成實際的 SVG 圖示。每次有新內容插入時可重複呼叫。
function renderStaticIcons(root = document) {
  root.querySelectorAll('.ico[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    const size = el.dataset.size || 18;
    el.outerHTML = icon(name, parseInt(size));
  });
}
