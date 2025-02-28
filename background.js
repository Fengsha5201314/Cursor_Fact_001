/**
 * Amazon中国卖家识别器 - 背景脚本
 * 负责插件的核心逻辑和数据处理
 */

'use strict';

// 默认设置
const DEFAULT_SETTINGS = {
  highlightColor: '#ff0055', // 赛博朋克风格的霓虹粉红色
  borderStyle: 'neon',      // 霓虹边框效果
  showIcon: true,           // 显示中国国旗图标
  showBorder: true,         // 显示边框
  filterMode: 'all',        // 默认显示所有卖家
  animationEnabled: true,   // 启用动画效果
  darkMode: true,           // 默认启用暗黑模式
  glitchEffect: true,       // 启用故障效果
  floatingControlVisible: true, // 默认显示浮动控制面板
  autoScan: true,           // 自动扫描页面
  customKeywords: [         // 自定义识别关键词
    // 中国英文名称和缩写
    'China', 'CN', 'PRC', 'Chinese', 'Made in China',
    // 中文名称
    '中国', '中华', '华人', '国产',
    // 主要省份（英文）
    'Guangdong', 'Zhejiang', 'Jiangsu', 'Fujian', 'Shandong', 'Henan', 'Hebei', 'Hunan', 'Hubei', 'Anhui',
    'Sichuan', 'Jiangxi', 'Yunnan', 'Liaoning', 'Shaanxi', 'Guizhou', 'Shanxi', 'Chongqing', 'Heilongjiang', 'Jilin',
    'Gansu', 'Xinjiang', 'Inner Mongolia', 'Guangxi', 'Hainan', 'Ningxia', 'Qinghai', 'Tibet', 'Hong Kong', 'Macau', 'Taiwan',
    // 主要城市（英文）
    'Shenzhen', 'Shanghai', 'Beijing', 'Hangzhou', 'Yiwu', 'Guangzhou', 'Dongguan', 'Foshan', 'Zhongshan',
    'Ningbo', 'Wenzhou', 'Suzhou', 'Nanjing', 'Wuhan', 'Tianjin', 'Xiamen', 'Fuzhou', 'Changsha', 'Jinan',
    'Qingdao', 'Dalian', 'Chengdu', 'Wuxi', 'Taizhou', 'Jinhua', 'Huizhou', 'Quanzhou', 'Nanchang', 'Jiaxing',
    'Zhengzhou', 'Shijiazhuang', 'Hefei', 'Kunming', 'Nanning', 'Changchun', 'Harbin', 'Lanzhou', 'Urumqi',
    'Lhasa', 'Hohhot', 'Nanchong', 'Shantou', 'Zhuhai', 'Shaoxing', 'Humen', 'Putian', 'Yantai', 'Weifang',
    // 主要工业区和市场
    'Baiyun', 'Nanhai', 'Changan', 'Keqiao', 'Haining', 'Songgang', 'Longgang', 'Bao\'an', 'Panyu',
    'Huadu', 'Pudong', 'Minhang', 'Nanshan', 'Futian', 'Luohu', 'Yuhang', 'Xiaoshan', 'Binjiang',
    // 常见中国卖家特征词
    'Trading', 'Technology', 'Electronics', 'Import Export', 'Wholesale', 'Factory Direct', 'OEM', 'ODM',
    'Manufacturer', 'Supplier', 'Industrial', 'Commercial', 'Enterprise', 'Limited', 'Int\'l', 'International',
    'Global', 'Worldwide', 'Group', 'Holdings', 'Industry', 'Co Ltd', 'Co., Ltd.', 'LLC', 'Inc',
    'Store', 'Shop', 'Mall', 'Mart', 'Market', 'Flagship', 'Official', 'Direct', 'Authorized'
  ],
  cacheExpiration: 7        // 缓存过期天数
};

// 初始化设置
chrome.runtime.onInstalled.addListener(() => {
  // 初始化插件启用状态为已启用
  chrome.storage.sync.set({ pluginEnabled: true }, () => {
    console.log('初始化插件状态为已启用');
  });
  
  chrome.storage.sync.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
      console.log('初始化默认设置');
    }
  });
  
  // 初始化卖家缓存
  chrome.storage.local.get('sellerCache', (data) => {
    if (!data.sellerCache) {
      chrome.storage.local.set({ sellerCache: {} });
      console.log('初始化卖家缓存');
    }
  });
});

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openOptions') {
    // 打开选项页面
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
  }
  else if (request.action === 'getSettings') {
    // 返回设置
    chrome.storage.sync.get('settings', (data) => {
      sendResponse({ settings: data.settings || DEFAULT_SETTINGS });
    });
    return true; // 异步响应
  } 
  else if (request.action === 'checkSellerCache') {
    // 检查卖家缓存
    chrome.storage.local.get('sellerCache', (data) => {
      const cache = data.sellerCache || {};
      const sellerId = request.sellerId;
      
      if (cache[sellerId] && !isCacheExpired(cache[sellerId].timestamp)) {
        sendResponse({ 
          found: true, 
          isChineseSeller: cache[sellerId].isChineseSeller,
          confidence: cache[sellerId].confidence,
          details: cache[sellerId].details
        });
      } else {
        sendResponse({ found: false });
      }
    });
    return true; // 异步响应
  }
  else if (request.action === 'updateSellerCache') {
    // 更新卖家缓存
    chrome.storage.local.get('sellerCache', (data) => {
      const cache = data.sellerCache || {};
      const sellerId = request.sellerId;
      
      // 更新缓存
      cache[sellerId] = {
        isChineseSeller: request.isChineseSeller,
        confidence: request.confidence || 0.8,
        details: request.details || {},
        timestamp: Date.now()
      };
      
      // 清理过期缓存
      const cleanedCache = cleanExpiredCache(cache);
      
      chrome.storage.local.set({ sellerCache: cleanedCache }, () => {
        sendResponse({ success: true });
      });
    });
    return true; // 异步响应
  }
  else if (request.action === 'updateSellerCount') {
    // 接收并处理来自content.js的卖家计数更新
    console.log('收到卖家计数更新:', request.data);
    // 可以在这里处理或转发给popup.js
    sendResponse({ success: true });
  }
});

/**
 * 检查缓存是否过期
 * @param {number} timestamp - 缓存时间戳
 * @return {boolean} 是否过期
 */
function isCacheExpired(timestamp) {
  // 使用默认设置中的缓存过期天数
  const expirationDays = DEFAULT_SETTINGS.cacheExpiration;
  const now = Date.now();
  const expirationTime = expirationDays * 24 * 60 * 60 * 1000;
  
  // 判断是否过期
  return (now - timestamp) > expirationTime;
}

/**
 * 清理过期的缓存项
 * @param {Object} cache - 缓存对象
 * @return {Object} 清理后的缓存对象
 */
function cleanExpiredCache(cache) {
  const now = Date.now();
  const cleanedCache = {};
  
  // 使用默认设置中的缓存过期天数
  const expirationTime = DEFAULT_SETTINGS.cacheExpiration * 24 * 60 * 60 * 1000;
  
  // 只保留未过期的缓存项
  Object.keys(cache).forEach(key => {
    if ((now - cache[key].timestamp) <= expirationTime) {
      cleanedCache[key] = cache[key];
    }
  });
  
  return cleanedCache;
}