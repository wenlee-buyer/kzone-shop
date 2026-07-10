// ============================================
// K.Zone 日韓代購 - Firebase 設定與共用工具
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyCwxH9eSLbwFRgITQjYoAzuZEKifgSJqIA",
  authDomain: "proxy-tool-6302c.firebaseapp.com",
  projectId: "proxy-tool-6302c",
  storageBucket: "proxy-tool-6302c.firebasestorage.app",
  messagingSenderId: "656458228261",
  appId: "1:656458228261:web:fd782aa43804cf071d95cc",
  measurementId: "G-7J5SZ5XV2X"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================
// Firestore 集合名稱（全部獨立於原本的 proxy 集合，絕不互相影響）
// ============================================
const COL = {
  PRODUCTS: 'kzone_products',
  CATEGORIES: 'kzone_categories',
  TAGS: 'kzone_tags',
  ORDERS: 'kzone_orders',
  SETTINGS: 'kzone_settings',
  IMPORTED_IDS: 'kzone_imported_ids' // 記錄已從舊系統匯入過的商品 id，避免重複匯入
};

// ============================================
// 預設資料（第一次啟用時，如果 Firestore 是空的，會自動寫入這些預設值）
// ============================================
const DEFAULT_CATEGORIES = [
  { id: 'cat_1', name: '樂園', order: 1 },
  { id: 'cat_2', name: '濟州島', order: 2 },
  { id: 'cat_3', name: '快閃店', order: 3 },
  { id: 'cat_4', name: '電影快閃店', order: 4 },
  { id: 'cat_5', name: '網咖', order: 5 }
];

const DEFAULT_TAGS = [
  { id: 'tag_1', name: '菇菇寶貝', order: 1 },
  { id: 'tag_2', name: '皮卡啾', order: 2 },
  { id: 'tag_3', name: '石靈', order: 3 },
  { id: 'tag_4', name: '雪吉拉', order: 4 },
  { id: 'tag_5', name: '綠水靈', order: 5 },
  { id: 'tag_6', name: '人物角色', order: 6 },
  { id: 'tag_7', name: '怪物', order: 7 }
];

const DEFAULT_SETTINGS = {
  siteName: 'K.Zone 日韓代購',
  siteSubtitle: '你的專屬楓谷周邊補給所',
  marqueeText: '🍁 韓國空運直送・品質保證・限量現貨 ・ 滿NT$5,000免運費',
  heroTitle: '楓谷限定\n韓國直送',
  heroSubtitle: '最新周邊空運到台\n數量有限・先搶先贏！',
  heroImage: '', // 空字串 = 使用預設蘑菇插圖
  lineOfficialUrl: 'https://lin.ee/r11kJmF',
  lineCommunityUrl: 'https://line.me/ti/g2/M2vucvJ9fCdggxca09QagYGsOAM2ll58btnz1A',
  lineCommunityTitle: '【K.Zone】楓之谷🍁週邊補給站',
  lineCommunityText: '加入社群獲得第一手預購/到貨/現貨上架消息，群組還有優惠價喔!\n(除此之外平常很安靜不會打擾)',
  firstCartReminderText: '【購買需知】\n1. 預購的商品會幫您加入登記，提供清單確認\n2. 確認後需付訂金50%，會額外告知您金額/轉帳帳號\n3. 海外商品需空運，到貨時間為一到二星期，可以主動詢問官方小編\n4. 到貨後會通知您下單，尾款使用超商貨到付款，可以選擇7-11(運費38)/全家(運費35)寄出',
  watermarkText: 'k.zone.buying',
  adminPassword: '1qaz2wsx'
};

// ============================================
// 密碼雜湊工具（後台密碼不再明文存放）
// ============================================
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function looksLikeHash(str) {
  return typeof str === 'string' && /^[0-9a-f]{64}$/i.test(str);
}

// ============================================
// 共用工具函式
// ============================================

// 確保預設資料存在（只在集合是空的時候寫入，不會覆蓋已存在的資料）
async function ensureDefaultData() {
  try {
    const catSnap = await db.collection(COL.CATEGORIES).limit(1).get();
    if (catSnap.empty) {
      const batch = db.batch();
      DEFAULT_CATEGORIES.forEach(cat => {
        batch.set(db.collection(COL.CATEGORIES).doc(cat.id), cat);
      });
      await batch.commit();
    }

    const tagSnap = await db.collection(COL.TAGS).limit(1).get();
    if (tagSnap.empty) {
      const batch = db.batch();
      DEFAULT_TAGS.forEach(tag => {
        batch.set(db.collection(COL.TAGS).doc(tag.id), tag);
      });
      await batch.commit();
    }

    const settingsDoc = await db.collection(COL.SETTINGS).doc('main').get();
    if (!settingsDoc.exists) {
      const hashedPw = await sha256Hex(DEFAULT_SETTINGS.adminPassword);
      await db.collection(COL.SETTINGS).doc('main').set({ ...DEFAULT_SETTINGS, adminPassword: hashedPw });
    }
  } catch (err) {
    console.error('初始化預設資料失敗:', err);
  }
}

// 讀取網站設定
async function getSettings() {
  try {
    const doc = await db.collection(COL.SETTINGS).doc('main').get();
    if (doc.exists) {
      return { ...DEFAULT_SETTINGS, ...doc.data() };
    }
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.error('讀取設定失敗:', err);
    return DEFAULT_SETTINGS;
  }
}

// 格式化金額
function formatPrice(num) {
  return 'NT$' + Number(num || 0).toLocaleString('zh-TW');
}

// 產生唯一 ID
function genId(prefix = 'id') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// LocalStorage 購物車管理（購物車只需暫存在客人自己裝置上，不需要存進資料庫）
const CART_KEY = 'kzone_cart_v1';
// v2：改成只在「第一次加入預購商品」時才跳提醒，用新 key 避免沿用舊版「第一次加任何商品都算」的紀錄
const FIRST_CART_FLAG = 'kzone_first_preorder_cart_seen_v2';

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
}

// 取得商品的所有來源分類ID（相容新格式 categoryIds 陣列與舊格式 categoryId 字串）
function getProductCategoryIds(product) {
  if (product.categoryIds && Array.isArray(product.categoryIds)) {
    return product.categoryIds;
  }
  if (product.categoryId) return [product.categoryId];
  return [];
}

// 運費規則：滿5000免運，其他一律38元
function calcShippingFee(orderTotal) {
  return orderTotal >= 5000 ? 0 : 38;
}

// 結帳前驗證購物車內所有商品的庫存是否仍然足夠
// 回傳 null 表示全部通過，回傳陣列表示有問題的商品說明
async function validateCartStock(cartItems) {
  const productIds = [...new Set(cartItems.map(i => i.productId))];
  const problems = [];

  for (const pid of productIds) {
    let freshData = null;
    try {
      const doc = await db.collection(COL.PRODUCTS).doc(pid).get();
      if (doc.exists) freshData = { id: doc.id, ...doc.data() };
    } catch (e) { continue; } // 讀取失敗不阻擋

    if (!freshData) continue;
    freshData.styles = normalizeStyles(freshData.styles);

    const itemsForProduct = cartItems.filter(i => i.productId === pid);
    for (const item of itemsForProduct) {
      if (isStyleSoldOut(freshData, item.style)) {
        problems.push(`「${item.name}${item.style ? '（'+item.style+'）' : ''}」已售完`);
      } else {
        const available = getAvailableStock(freshData, item.style);
        if (available !== null && item.qty > available) {
          problems.push(`「${item.name}${item.style ? '（'+item.style+'）' : ''}」庫存剩 ${available} 件，但您訂購了 ${item.qty} 件`);
        }
      }
    }
  }
  return problems.length > 0 ? problems : null;
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(c => c.productId === item.productId && c.style === item.style);
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
  return cart;
}

function updateCartQty(index, qty) {
  const cart = getCart();
  if (cart[index]) {
    cart[index].qty = Math.max(1, qty);
  }
  saveCart(cart);
  return cart;
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

function getCartTotal() {
  return getCart().reduce((sum, item) => sum + (item.price * item.qty), 0);
}

// 這個提醒只在客人「第一次把預購商品加入購物車」時跳出（現貨不會觸發），
// 所以旗標語意上是「有沒有看過預購提醒」，跟是否加過現貨無關
function hasSeenFirstCartReminder() {
  return localStorage.getItem(FIRST_CART_FLAG) === '1';
}

function markFirstCartReminderSeen() {
  localStorage.setItem(FIRST_CART_FLAG, '1');
}
