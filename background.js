/**
 * Amazon中国卖家识别器 - 背景脚本
 * 处理扩展的核心逻辑，包括设置、缓存和消息传递
 */

'use strict';

// 默认设置
const DEFAULT_SETTINGS = {
  highlightColor: '#ff0055',
  showBorder: true,
  showIcon: true,
  filterMode: 'all',
  scanDelay: 1000,
  cacheExpireTime: 7, // 缓存过期天数
  customKeywords: [
    // 中文地址关键词（简体）
    '省', '市', '区', '县', '镇', '村', '路', '街', '号', '广东', '浙江', '江苏', '福建', '上海', '北京',
    // 中文地址关键词（繁体）
    '廣東', '浙江', '江蘇', '福建', '上海', '北京',
    // 中国邮编格式
    '\\d{6}',
    // 常见中国城市（英文）
    'Shenzhen', 'Guangzhou', 'Shanghai', 'Yiwu', 'Hangzhou'
  ],
  confidenceThreshold: 0.7, // 识别可信度阈值
  enableAutoScan: true, // 自动扫描功能
  floatingControlVisible: true // 浮动控制按钮是否可见
};

// 初始化扩展
initializeExtension();

/**
 * 初始化扩展
 */
async function initializeExtension() {
  console.log('初始化Amazon中国卖家识别器扩展');
  
  // 检查设置
  const settingsExist = await checkIfSettingsExist();
  if (!settingsExist) {
    console.log('设置不存在，初始化默认设置');
    await initializeDefaultSettings();
  }
  
  // 设置插件默认为启用
  chrome.storage.sync.get('pluginEnabled', data => {
    if (data.pluginEnabled === undefined) {
      chrome.storage.sync.set({ pluginEnabled: true });
    }
  });
  
  // 启动定期清理过期缓存的任务
  setInterval(cleanExpiredCache, 3600000); // 每小时清理一次
  
  console.log('Amazon中国卖家识别器扩展初始化完成');
}

/**
 * 检查设置是否存在
 * @return {Promise<boolean>} 设置是否存在
 */
function checkIfSettingsExist() {
  return new Promise(resolve => {
    chrome.storage.sync.get('settings', data => {
      resolve(!!data.settings);
    });
  });
}

/**
 * 初始化默认设置
 * @return {Promise<void>}
 */
function initializeDefaultSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.set({ settings: DEFAULT_SETTINGS }, () => {
      console.log('已应用默认设置:', DEFAULT_SETTINGS);
      resolve();
    });
  });
}

/**
 * 获取设置
 * @return {Promise<Object>} 设置对象
 */
function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get('settings', data => {
      resolve(data.settings || DEFAULT_SETTINGS);
    });
  });
}

/**
 * 更新设置
 * @param {Object} newSettings - 新设置对象
 * @return {Promise<void>}
 */
function updateSettings(newSettings) {
  return new Promise(resolve => {
    chrome.storage.sync.get('settings', data => {
      const currentSettings = data.settings || DEFAULT_SETTINGS;
      const updatedSettings = { ...currentSettings, ...newSettings };
      
      chrome.storage.sync.set({ settings: updatedSettings }, () => {
        console.log('设置已更新:', updatedSettings);
        resolve();
      });
    });
  });
}

/**
 * 检查卖家是否在缓存中
 * @param {string} sellerId - 卖家ID
 * @return {Promise<Object|null>} 卖家缓存对象或null
 */
function checkSellerCache(sellerId) {
  return new Promise(resolve => {
    chrome.storage.local.get('sellerCache', data => {
      const cache = data.sellerCache || {};
      
      if (cache[sellerId]) {
        console.log(`卖家 ${sellerId} 在缓存中找到`);
        resolve(cache[sellerId]);
      } else {
        console.log(`卖家 ${sellerId} 不在缓存中`);
        resolve(null);
      }
    });
  });
}

/**
 * 更新卖家缓存
 * @param {string} sellerId - 卖家ID
 * @param {boolean} isChineseSeller - 是否为中国卖家
 * @param {number} confidence - 置信度
 * @param {Object} details - 详细信息
 * @return {Promise<void>}
 */
function updateSellerCache(sellerId, isChineseSeller, confidence, details) {
  return new Promise(resolve => {
    chrome.storage.local.get('sellerCache', data => {
      const cache = data.sellerCache || {};
      
      cache[sellerId] = {
        isChineseSeller,
        confidence,
        details,
        lastUpdated: new Date().toISOString()
      };
      
      chrome.storage.local.set({ sellerCache: cache }, () => {
        console.log(`卖家 ${sellerId} 已${isChineseSeller ? '标记为中国卖家' : '不是中国卖家'}，置信度: ${confidence}`);
        resolve();
      });
    });
  });
}

/**
 * 清理过期的卖家缓存
 */
function cleanExpiredCache() {
  console.log('开始清理过期缓存');
  
  chrome.storage.local.get(['sellerCache', 'settings'], data => {
    const cache = data.sellerCache || {};
    const settings = data.settings || DEFAULT_SETTINGS;
    const expireDays = settings.cacheExpireTime || DEFAULT_SETTINGS.cacheExpireTime;
    
    // 计算过期时间
    const now = new Date();
    const expireTime = new Date(now.getTime() - expireDays * 24 * 60 * 60 * 1000);
    
    let count = 0;
    for (const sellerId in cache) {
      const lastUpdated = new Date(cache[sellerId].lastUpdated);
      if (lastUpdated < expireTime) {
        delete cache[sellerId];
        count++;
      }
    }
    
    // 更新缓存
    if (count > 0) {
      chrome.storage.local.set({ sellerCache: cache }, () => {
        console.log(`已清理 ${count} 个过期卖家缓存项`);
      });
    } else {
      console.log('没有过期的卖家缓存需要清理');
    }
  });
}

/**
 * 获取卖家统计信息
 * @return {Promise<Object>} 统计信息对象
 */
function getSellerStats() {
  return new Promise(resolve => {
    chrome.storage.local.get('sellerCache', data => {
      const cache = data.sellerCache || {};
      const sellerCount = Object.keys(cache).length;
      const chineseSellerCount = Object.values(cache).filter(item => item.isChineseSeller).length;
      
      const stats = {
        total: sellerCount,
        chinese: chineseSellerCount,
        lastUpdate: new Date().toISOString()
      };
      
      chrome.storage.sync.set({ sellerStats: stats });
      
      resolve(stats);
    });
  });
}

// 监听来自内容脚本和弹出窗口的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  // 处理不同类型的消息
  if (request.action === 'getSettings') {
    // 获取设置
    getSettings().then(settings => {
      sendResponse({ settings });
    });
    return true; // 异步响应
  } 
  else if (request.action === 'updateSettings') {
    // 更新设置
    updateSettings(request.settings).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'checkSellerCache') {
    // 检查卖家缓存
    checkSellerCache(request.sellerId).then(cacheData => {
      sendResponse({ cacheData });
    });
    return true;
  }
  else if (request.action === 'updateSellerCache') {
    // 更新卖家缓存
    updateSellerCache(
      request.data.sellerId,
      request.data.isChineseSeller,
      request.data.confidence,
      request.data.details
    ).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (request.action === 'getSellerStats') {
    // 获取卖家统计信息
    getSellerStats().then(stats => {
      sendResponse({ stats });
    });
    return true;
  }
  else if (request.action === 'openOptions') {
    // 打开设置页面
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
  }
  else if (request.action === 'sellerCacheUpdated') {
    // 卖家缓存更新通知 - 不需要响应
    console.log('卖家缓存已更新:', request.data);
    sendResponse({ success: true });
  }
  else if (request.action === 'updateSellerCount') {
    // 更新卖家计数通知 - 不需要响应
    console.log('卖家计数已更新:', request.data);
    sendResponse({ success: true });
  }
  
  // 默认响应
  sendResponse({ error: '未知操作' });
});

// 安装或更新扩展时的处理
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    console.log('Amazon中国卖家识别器扩展已安装');
    // 打开选项页面
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('Amazon中国卖家识别器扩展已更新');
  }
});