/**
 * Amazon中国卖家识别器 - 内容脚本
 * 负责在Amazon页面中注入并执行识别和标记中国卖家的功能
 */

'use strict';

// 全局变量和设置
let settings = {
  pluginEnabled: true,
  markerColor: 'rgba(255, 0, 85, 0.85)',
  confidenceThreshold: 0.65,
  filterMode: 'all',
  customKeywords: [],
  autoScan: true,
  highlightColor: '#ff0055'
};
let currentPageType = 'unknown';
let isScanning = false;
let scanTimeout = null;
let sellerInfo = {};

// 创建直接可用的sellerDetector对象，不依赖外部加载
const sellerDetector = {
  isChineseSeller: function(sellerName) {
    if (!sellerName) return false;
    
    console.log(`[sellerDetector] 判断卖家是否来自中国: "${sellerName}"`);
    
    // 清理和标准化卖家名称
    const cleanName = sellerName.toLowerCase().trim()
      .replace(/\s+/g, '')
      .replace(/[^\w\s\u4e00-\u9fff]/g, ''); // 移除特殊字符但保留中文
    
    // 1. 直接包含中文字符
    if (/[\u4e00-\u9fff]/.test(cleanName)) {
      console.log(`[sellerDetector] 卖家名称包含中文字符: ${sellerName}`);
      return true;
    }
    
    // 2. 包含中国城市或地区名称
    const chineseCities = [
      'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hangzhou', 
      'chengdu', 'nanjing', 'wuhan', 'tianjin', 'suzhou', 
      'xiamen', 'dongguan', 'foshan', 'ningbo', 'zhongshan', 
      'chongqing', 'qingdao', 'dalian', 'kunming', 'jinan',
      'yiwu', 'wenzhou', 'hefei', 'shenyang', 'changsha',
      'xian', 'zhengzhou'
    ];
    
    for (const city of chineseCities) {
      if (cleanName.includes(city)) {
        console.log(`[sellerDetector] 卖家名称包含中国城市: ${city}`);
        return true;
      }
    }
    
    // 3. 常见中国卖家名称模式
    const chinesePatterns = [
      /^cn[_-]?/i,                  // 以cn开头
      /[_-]?cn$/i,                  // 以cn结尾
      /^ch[_-]?/i,                  // 以ch开头
      /[_-]?ch$/i,                  // 以ch结尾
      /china[_-]?/i,                // 包含china
      /^(?:sz|gz|sh|bj|hz)[a-z0-9]/i, // 城市缩写开头
      /^[a-z]+(?:2019|2020|2021|2022|2023|2024|888|666|168|818)$/i, // 数字组合
      /^(?:[a-z]{2,4})[_-]?(?:[a-z]{2,4})[_-]?(?:shop|store|mall|sz|cn|china)$/i, // 常见组合
      /^[a-z]+(?:trading|ecommerce|import|export|wholesale|retail)(?:co|ltd)?$/i, // 贸易公司
      /^[a-z]{4,8}(?:best|first|top|good|great|new|hot|cool|super|baby|home)$/i, // 常见后缀
      /^(?:best|first|top|good|great|new|hot|cool|super|win|lucky)[a-z]{4,8}$/i,  // 常见前缀
      /^[a-z]{2,5}(?:mall|shop|store|sell|buy|home|house|life|world|city|star|day)$/i, // 常见后缀
      /^(?:mall|shop|store|sell|buy|home|house|life|world|city|win|day)[a-z]{2,5}$/i,  // 常见前缀
      /^[a-z]{3,5}(?:[_-]?)[0-9]{2,4}$/i, // 字母+数字组合
      /(?:yi|yong|xin|xing|hong|jia|feng|tai)(?:da|xiang|yu|fu|feng|pin)/i // 拼音组合
    ];
    
    for (const pattern of chinesePatterns) {
      if (pattern.test(cleanName)) {
        console.log(`[sellerDetector] 卖家名称匹配中国卖家模式: ${pattern}`);
        return true;
      }
    }
    
    console.log(`[sellerDetector] 卖家 "${sellerName}" 不符合任何中国卖家模式`);
    return false;
  }
};

// 创建全局的 SellerDetector 类，确保其可用性
if (typeof window.SellerDetector === 'undefined') {
  window.SellerDetector = class SellerDetector {
    constructor(settings) {
      this.settings = settings || {};
      console.log('[SellerDetector] 初始化完成');
    }
    
    isChineseSeller(sellerName) {
      // 直接使用我们定义的检测函数
      return sellerDetector.isChineseSeller(sellerName);
    }
    
    updateSettings(newSettings) {
      this.settings = { ...this.settings, ...newSettings };
      console.log('[SellerDetector] 设置已更新:', this.settings);
    }
  };
  
  console.log('[Global] 已创建 SellerDetector 全局类');
}

// 全局变量和状态
let sellerCache = {};
let observerActive = false;
let floatingControlVisible = false; // 控制浮动控制面板的可见性

// 导入SellerDetector类和全局样式
// 注意：由于content_scripts的限制，我们需要动态加载SellerDetector和全局样式
function loadSellerDetector() {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    if (window.SellerDetector) {
      console.log('SellerDetector已加载，无需重新加载');
      resolve();
      return;
    }
    
    // 添加重试逻辑
    let retryCount = 0;
    const maxRetries = 3;
    
    function attemptLoad() {
      console.log(`尝试加载SellerDetector (尝试次数: ${retryCount + 1}/${maxRetries})`);
      
      // 创建脚本元素
      const script = document.createElement('script');
      
      try {
        // 获取脚本URL
        const scriptUrl = chrome.runtime.getURL('utils/seller-detector.js');
        console.log('加载脚本:', scriptUrl);
        script.src = scriptUrl;
        
        // 成功事件
        script.onload = () => {
          console.log('SellerDetector脚本加载成功');
          script.remove();
          
          // 验证SellerDetector是否真的可用
          if (typeof window.SellerDetector === 'undefined') {
            console.error('SellerDetector加载完成但未定义，可能是脚本内容有问题');
            handleError(new Error('SellerDetector未定义'));
            return;
          }
          
          console.log('SellerDetector加载并验证成功');
          resolve();
        };
        
        // 错误事件
        script.onerror = (error) => {
          console.error('加载SellerDetector脚本时出错:', error);
          script.remove();
          handleError(error);
        };
        
        // 添加脚本到页面
        (document.head || document.documentElement).appendChild(script);
        
      } catch (error) {
        console.error('创建或添加SellerDetector脚本时出错:', error);
        handleError(error);
      }
    }
    
    // 错误处理函数
    function handleError(error) {
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`将在1秒后重试加载SellerDetector (${retryCount}/${maxRetries})`);
        setTimeout(attemptLoad, 1000);
      } else {
        console.error(`SellerDetector加载失败，已达到最大重试次数 (${maxRetries})`);
        
        // 创建备用检测函数，避免整个扩展崩溃
        window.SellerDetector = {
          detect: function(text) {
            console.log('使用备用检测方法，可能不够准确');
            // 简单的检测逻辑，检查是否包含中国城市或地址关键词
            const keywords = ['china', 'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hangzhou'];
            const lowerText = (text || '').toLowerCase();
            for (const keyword of keywords) {
              if (lowerText.includes(keyword)) {
                return { isChineseSeller: true, confidence: 0.6 };
              }
            }
            return { isChineseSeller: false, confidence: 0 };
          }
        };
        
        console.log('已创建备用SellerDetector');
        resolve(); // 使用备用方案继续
      }
    }
    
    // 开始加载
    attemptLoad();
  });
}

// 加载全局样式函数
function loadGlobalStyles() {
  return new Promise((resolve) => {
    // 检查是否已加载
    if (window.addGlobalStyles) {
      resolve();
      return;
    }
    
    // 创建脚本元素
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('utils/global-styles.js');
    script.onload = () => {
      script.remove();
      resolve();
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'enablePlugin') {
    // 启用插件
    chrome.storage.sync.set({ pluginEnabled: true }, () => {
      console.log('插件已启用');
      // 重新初始化
      init();
    });
    sendResponse({ success: true });
  } 
  else if (request.action === 'disablePlugin') {
    // 禁用插件
    chrome.storage.sync.set({ pluginEnabled: false }, () => {
      console.log('插件已禁用');
      // 移除所有标记和控制面板
      removeAllMarks();
    });
    sendResponse({ success: true });
  }
  else if (request.action === 'updateSettings') {
    // 更新设置
    console.log('收到更新设置消息:', request.settings);
    settings = request.settings;
    
    // 更新筛选模式
    if (settings.filterMode) {
      // 应用新的筛选模式
      applyFilterMode(settings.filterMode);
    }
    
    // 更新高亮颜色
    if (settings.highlightColor) {
      document.documentElement.style.setProperty('--highlight-color', settings.highlightColor);
      
      // 更新已标记的卡片颜色
      document.querySelectorAll('.cn-seller-card').forEach(card => {
        card.style.setProperty('--highlight-color', settings.highlightColor);
      });
    }
    
    sendResponse({ success: true });
  }
  // 添加刷新扫描功能
  else if (request.action === 'refreshScan') {
    console.log('收到刷新扫描请求 - 开始处理');
    
    try {
      // 1. 立即发送成功响应，避免连接关闭
      sendResponse({ success: true, message: '刷新扫描请求已接收，正在处理...' });
      
      // 2. 确保全局变量重置
      isScanning = false;
      console.log('[重要] 已重置扫描状态 isScanning:', isScanning);
      
      // 3. 清除任何现有超时
      if (scanTimeout) {
        clearTimeout(scanTimeout);
        console.log('已清除现有的扫描超时定时器');
      }
      
      // 4. 移除现有标记 - 确保在删除后再次确认isScanning为false
      console.log('开始移除所有现有标记...');
      removeAllMarks();
      isScanning = false; // 确保removeAllMarks不会意外地设置isScanning为true
      console.log('[重要] 移除标记后再次确认 isScanning:', isScanning);
      
      // 5. 更新显示状态
      const statusContainer = ensureScanStatusContainer();
      if (statusContainer) {
        // 显示扫描状态容器
        statusContainer.style.display = 'block';
        setTimeout(() => {
          statusContainer.style.opacity = '1';
          statusContainer.style.transform = 'translateY(0)';
        }, 10);
      }
      
      // 6. 设置一个小延迟以确保DOM已更新并且isScanning重置
      setTimeout(() => {
        console.log('延迟后开始处理搜索页面...');
        // 确保isScanning为false
        isScanning = false;
        // 开始新的扫描
        processSearchPage();
      }, 300);
    } catch (error) {
      console.error('处理刷新扫描请求时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    // 已通过sendResponse立即回复
    return true;
  }
  return true;
});

/**
 * 移除所有标记和控制面板
 */
function removeAllMarks() {
  console.log('开始移除所有卖家标记...');
  
  // 保存当前滚动位置
  const scrollPos = window.pageYOffset;
  
  try {
    // 1. 移除控制面板
    const controlPanel = document.getElementById('cn-seller-control-panel');
    if (controlPanel) {
      controlPanel.remove();
      console.log('已移除控制面板');
    }
    
    // 2. 移除占位符
    const placeholder = document.getElementById('cn-seller-placeholder');
    if (placeholder) {
      placeholder.remove();
      console.log('已移除占位符');
    }
    
    // 3. 移除扫描状态容器
    const statusContainer = document.getElementById('cn-seller-scan-status');
    if (statusContainer) {
      statusContainer.remove();
      console.log('已移除扫描状态容器');
    }
    
    // 4. 查找所有已处理的卡片
    const processedCards = document.querySelectorAll('[data-seller-processed="true"]');
    console.log(`找到 ${processedCards.length} 个已处理卡片`);
    
    // 5. 安全移除相关属性和类，保留数据
    processedCards.forEach(card => {
      // 获取父元素，恢复显示
      const parentElement = findProductCardParent(card);
      if (parentElement && parentElement.style.display === 'none') {
        parentElement.style.display = '';
        console.log('已恢复隐藏的卡片显示');
      }
      
      // 移除中国卖家标记类和数据属性
      card.classList.remove('cn-seller-card');
      
      // 移除卖家类型数据属性
      card.removeAttribute('data-seller-type');
      
      // 移除处理标志但保留数据，以便保持插件状态
      card.setAttribute('data-seller-processed', 'false');
      
      // 移除卖家标记图标
      const sellerMarker = card.querySelector('.cn-seller-marker');
      if (sellerMarker) {
        sellerMarker.remove();
      }
      
      // 移除卖家标记样式
      card.style.removeProperty('--highlight-color');
      card.style.removeProperty('border');
      card.style.removeProperty('border-color');
      card.style.removeProperty('background');
    });
    
    // 6. 重置全局状态
    sellerInfo = {}; // 重置卖家信息缓存
    isScanning = false; // 确保扫描状态被重置
    
    console.log('所有卖家标记已成功移除');
    
    // 恢复滚动位置
    window.scrollTo(0, scrollPos);
    
    return true;
  } catch (error) {
    console.error('移除卖家标记时出错:', error);
    return false;
  }
}

/**
 * 更新已识别卖家计数
 */
function updateSellerCount() {
  try {
    console.log('[统计] 更新卖家计数统计...');
    
    // 获取所有处理过的卡片
    const processedCards = document.querySelectorAll('[data-seller-processed="true"]');
    const totalProcessed = processedCards.length;
    
    // 获取中国卖家卡片
    const chineseSellerCards = document.querySelectorAll('[data-seller-type="chinese"]');
    const chineseSellerCount = chineseSellerCards.length;
    
    console.log(`[统计] 已处理卡片: ${totalProcessed}, 中国卖家: ${chineseSellerCount}`);
    
    // 计算中国卖家百分比
    console.log(`[统计] 已处理卡片总数: ${totalProcessed}, 中国卖家数量: ${chineseSellerCount}`);
    
    // 如果没有已处理的卡片，不更新统计
    if (totalProcessed === 0) {
      console.log('[统计] 没有已处理的卡片，不更新统计');
      return;
    }
    
    // 计算中国卖家比例
    const percentage = Math.round((chineseSellerCount / totalProcessed) * 100);
    
    try {
      // 更新插件存储中的统计数据
      chrome.storage.local.set({
        sellerStats: {
          totalProducts: totalProcessed,
          chineseSellerCount: chineseSellerCount,
          percentage: percentage,
          timestamp: Date.now()
        }
      }, () => {
        console.log(`[统计] 已保存到本地存储: 总数=${totalProcessed}, 中国卖家=${chineseSellerCount}, 比例=${percentage}%`);
      });
    } catch (storageError) {
      console.error('[统计] 保存到存储时出错:', storageError);
    }
    
    // 更新统计UI显示
    try {
      const statsContainer = document.getElementById('cn-seller-scan-status');
      if (statsContainer) {
        // 更新进度文本
        const progressText = statsContainer.querySelector('.scan-progress-text');
        if (progressText) {
          progressText.textContent = `已扫描: ${totalProcessed}/${totalProcessed}`;
        }
        
        // 更新统计数据
        const stats = {
          total: totalProcessed,
          chinese: chineseSellerCount,
          nonChinese: totalProcessed - chineseSellerCount,
          percentage: percentage
        };
        
        updateScanStats(stats);
        console.log(`[统计] UI统计数据已更新`);
      }
    } catch (uiError) {
      console.error('[统计] 更新UI统计数据时出错:', uiError);
    }
    
    // 确保筛选按钮状态正确
    try {
      updateFilterButtonsState(settings.filterMode || 'all');
      console.log('[统计] 筛选按钮状态已更新');
    } catch (filterError) {
      console.error('[统计] 更新筛选按钮状态时出错:', filterError);
    }
    
    return {
      totalProducts: totalProcessed,
      chineseSellerCount: chineseSellerCount,
      percentage: percentage
    };
  } catch (error) {
    console.error('[统计] 更新卖家统计时出错:', error);
    return null;
  }
}

// 初始化
init();

/**
 * 初始化函数
 */
async function init() {
  console.log('初始化Amazon中国卖家检测插件');
  console.log('当前URL:', window.location.href);
  
  try {
    // 检查插件是否启用
    const enabled = await isPluginEnabled();
    if (!enabled) {
      console.log('插件已禁用，跳过初始化');
      return;
    }
    
    // 加载必要的类
    await loadSellerDetector();
    console.log('已加载SellerDetector类');
    
    // 获取设置
    settings = await getSettings();
    console.log('已加载设置:', settings);
    
    // 应用全局样式
    loadGlobalStyles();
    
    // 确定当前页面类型
    currentPageType = determinePageType();
    console.log('当前页面类型:', currentPageType);
    
    // 尝试恢复上次扫描结果
    if (currentPageType === 'search') {
      const restored = restoreSearchResults();
      if (restored) {
        console.log('已成功恢复上次扫描结果');
        return; // 如果已恢复，跳过后续初始化
      } else {
        console.log('没有可恢复的扫描结果或恢复失败');
      }
    }
    
    // 根据页面类型执行相应的操作
    if (currentPageType === 'search' && settings.autoScan) {
      // 自动扫描搜索结果页面
      console.log('启用了自动扫描，等待页面加载完成后开始扫描...');
      
      // 更新扫描状态
      updateScanStatus(true, 0, 0, '准备自动扫描...');
      
      // 延迟一段时间后开始扫描，确保页面已完全加载
      scanTimeout = setTimeout(async () => {
        console.log('开始自动扫描...');
        await processSearchPage();
      }, 2000);
    } else if (currentPageType === 'search') {
      // 搜索页面但不自动扫描，只添加控制面板
      console.log('在搜索页面添加控制面板');
      addFilterControls();
    }
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

/**
 * 检查插件是否启用
 * @return {Promise<boolean>} 是否启用
 */
function isPluginEnabled() {
  return new Promise(resolve => {
    chrome.storage.sync.get('pluginEnabled', data => {
      // 如果没有设置过，默认为启用
      resolve(data.pluginEnabled !== false);
    });
  });
}

/**
 * 获取插件设置
 * @return {Promise<Object>} 设置对象
 */
function getSettings() {
  return new Promise(resolve => {
    try {
      // 确保chrome.runtime存在
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.error('chrome.runtime.sendMessage 不可用');
        // 返回默认设置
        resolve({
          autoScan: true,
          highlightColor: '#ff0055',
          filterMode: 'all'
        });
        return;
      }
      
      // 添加超时处理
      const timeoutId = setTimeout(() => {
        console.error('获取设置超时');
        resolve({
          autoScan: true,
          highlightColor: '#ff0055',
          filterMode: 'all'
        });
      }, 3000);
      
      // 发送消息
      chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          console.error('获取设置时出错:', chrome.runtime.lastError);
          resolve({
            autoScan: true,
            highlightColor: '#ff0055',
            filterMode: 'all'
          });
          return;
        }
        
        if (!response || !response.settings) {
          console.error('获取设置时返回无效响应:', response);
          resolve({
            autoScan: true,
            highlightColor: '#ff0055',
            filterMode: 'all'
          });
          return;
        }
        
        resolve(response.settings);
      });
    } catch (error) {
      console.error('获取设置过程中出错:', error);
      resolve({
        autoScan: true,
        highlightColor: '#ff0055',
        filterMode: 'all'
      });
    }
  });
}

/**
 * 安全地发送消息到背景脚本
 * @param {Object} message - 要发送的消息
 * @param {Function} [callback] - 可选的回调函数
 */
function safeSendMessage(message, callback) {
  try {
    // 确保chrome.runtime存在
    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.error('chrome.runtime.sendMessage 不可用');
      if (callback) callback(null);
      return;
    }
    
    // 发送消息
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        console.error('发送消息时出错:', chrome.runtime.lastError);
        if (callback) callback(null);
        return;
      }
      
      if (callback) callback(response);
    });
  } catch (error) {
    console.error('发送消息过程中出错:', error);
    if (callback) callback(null);
  }
}

/**
 * 确定当前页面类型
 * @return {string} 页面类型：'search'、'product'或'other'
 */
function determinePageType() {
  const url = window.location.href;
  
  if (url.includes('/s?') || url.includes('/s/ref=') || url.includes('/gp/search/')) {
    return 'search';
  } 
  else if (url.includes('/dp/') || url.includes('/gp/product/')) {
    return 'product';
  }
  
  return 'other';
}

/**
 * 保存搜索结果到localStorage
 * @param {number} totalProducts - 总产品数量
 * @param {number} chineseSellerCount - 中国卖家数量
 * @param {Array} results - 处理结果
 */
function saveSearchResults(totalProducts, chineseSellerCount, results) {
  try {
    // 提取当前URL的路径部分作为KEY
    const urlPath = window.location.pathname + window.location.search;
    
    // 提取所有已标记的卡片的ASIN和父元素选择器路径
    const markedCards = document.querySelectorAll('[data-marked-as-chinese="true"]');
    const markedAsins = Array.from(markedCards).map(card => {
      const asin = card.getAttribute('data-asin') || '';
      const parent = findProductCardParent(card);
      
      // 创建一个简单的选择器路径，用于稍后恢复
      let selectorPath = '';
      if (parent) {
        const classes = Array.from(parent.classList).join('.');
        selectorPath = classes ? `.${classes}` : '';
      }
      
      return { asin, selectorPath };
    });
    
    // 构建保存数据
    const saveData = {
      timestamp: Date.now(),
      totalProducts,
      chineseSellerCount,
      markedAsins,
      url: window.location.href
    };
    
    // 保存到localStorage
    localStorage.setItem(`amazonCnSeller_${urlPath}`, JSON.stringify(saveData));
    console.log('已保存扫描结果到localStorage:', saveData);
    
  } catch (error) {
    console.error('保存扫描结果时出错:', error);
  }
}

/**
 * 从localStorage恢复搜索结果
 * @returns {boolean} 是否成功恢复
 */
function restoreSearchResults() {
  try {
    // 提取当前URL的路径部分作为KEY
    const urlPath = window.location.pathname + window.location.search;
    const savedDataJson = localStorage.getItem(`amazonCnSeller_${urlPath}`);
    
    if (!savedDataJson) {
      console.log('未找到保存的扫描结果');
      return false;
    }
    
    // 解析保存的数据
    const savedData = JSON.parse(savedDataJson);
    console.log('找到保存的扫描结果:', savedData);
    
    // 检查数据是否过期(超过30分钟)
    const now = Date.now();
    const saveTime = savedData.timestamp;
    const thirtyMinutes = 30 * 60 * 1000;
    
    if (now - saveTime > thirtyMinutes) {
      console.log('保存的扫描结果已过期');
      localStorage.removeItem(`amazonCnSeller_${urlPath}`);
      return false;
    }
    
    // 恢复扫描状态显示
    const statusContainer = ensureScanStatusContainer();
    if (statusContainer) {
      updateScanStatus(
        false, 
        savedData.totalProducts, 
        savedData.totalProducts, 
        `已恢复上次扫描结果 (${new Date(saveTime).toLocaleTimeString()})`,
        false,
        100
      );
    }
    
    // 查找产品卡片并重新标记
    const productCards = getProductCards();
    if (!productCards || productCards.length === 0) {
      console.log('无法恢复标记，未找到产品卡片');
      return false;
    }
    
    // 处理每个已保存的ASIN
    let restoredCount = 0;
    for (const { asin } of savedData.markedAsins) {
      if (!asin) continue;
      
      // 查找匹配ASIN的产品卡片
      const matchingCards = Array.from(productCards).filter(card => {
        // 直接从属性获取ASIN
        if (card.getAttribute('data-asin') === asin) return true;
        
        // 从链接中查找ASIN
        const links = card.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
        for (const link of links) {
          if (link.href.includes(`/dp/${asin}`) || link.href.includes(`/product/${asin}`)) {
            return true;
          }
        }
        
        return false;
      });
      
      // 如果找到匹配的卡片，重新标记
      for (const card of matchingCards) {
        try {
          // 标记为中国卖家
          markChineseSeller(card);
          restoredCount++;
        } catch (error) {
          console.error(`恢复标记卡片时出错 (ASIN: ${asin}):`, error);
        }
      }
    }
    
    console.log(`已恢复 ${restoredCount}/${savedData.markedAsins.length} 个中国卖家标记`);
    
    // 添加过滤控制面板
    addFilterControls();
    
    // 更新过滤按钮状态
    updateFilterButtonsState(settings.filterMode);
    
    return restoredCount > 0;
    
  } catch (error) {
    console.error('恢复扫描结果时出错:', error);
    return false;
  }
}

/**
 * 处理亚马逊搜索结果页面
 * 扫描所有产品卡片，识别卖家，统计中国卖家数量
 */
async function processSearchPage() {
  try {
    if (!isPluginEnabled()) {
      console.log('插件已禁用，不处理搜索页面');
      return;
    }
    
    console.log('开始处理搜索页面...');
    
    // 创建扫描状态容器
    ensureScanStatusContainer();
    
    // 更新扫描状态为进行中
    updateScanStatus(true, 0, 0, '正在准备扫描...');
    
    // 尝试恢复之前的搜索结果
    const savedResults = await restoreSearchResults();
    if (savedResults && savedResults.results.length > 0) {
      console.log(`恢复了之前的扫描结果: ${savedResults.results.length} 个产品`);
      updateScanStatus(false, savedResults.totalProducts, savedResults.totalProducts, '使用缓存的扫描结果');
      updateScanStats({
        totalScanned: savedResults.totalProducts,
        chineseSellerCount: savedResults.chineseSellerCount,
        percentage: savedResults.chineseSellerCount / savedResults.totalProducts * 100
      });
      return;
    }
    
    // 确保卖家检测器已加载
    await loadSellerDetector();
    
    // 触发延迟加载以显示更多产品
    await triggerLazyLoading();
    
    // 获取所有产品卡片
    let allCards = getProductCards();
    
    // 如果找不到产品卡片，重试几次
    if (allCards.length === 0) {
      for (let i = 0; i < 3; i++) {
        console.log(`未找到产品卡片，尝试重试 ${i + 1}/3...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        allCards = getProductCards();
        if (allCards.length > 0) break;
      }
    }
    
    if (allCards.length === 0) {
      console.log('无法找到任何产品卡片，请检查选择器是否正确');
      updateScanStatus(false, 0, 0, '未找到产品卡片');
      return;
    }
    
    // 更新总数
    const totalCards = allCards.length;
    console.log(`找到 ${totalCards} 个产品卡片`);
    
    // 更新扫描状态
    updateScanStatus(true, 0, totalCards, '开始扫描产品...');
    
    // 包含中国卖家的产品卡片数组
    const chineseSellerCards = [];
    
    // 每个批次处理的卡片数量
    const batchSize = 10;
    
    // 分批处理产品卡片以避免阻塞UI
    for (let i = 0; i < totalCards; i += batchSize) {
      // 当前批次的卡片
      const batch = allCards.slice(i, i + batchSize);
      
      // 更新扫描状态
      const current = Math.min(i + batchSize, totalCards);
      const progressPercent = Math.round((current / totalCards) * 100);
      updateScanStatus(true, current, totalCards, `已扫描 ${current}/${totalCards} 个产品`, false, progressPercent);
      
      // 等待一小段时间以避免UI阻塞
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 处理当前批次的卡片
      for (const card of batch) {
        try {
          // 检查是否已经处理过
          if (card.dataset.processed === 'true') continue;
          
          // 添加卖家信息到卡片
          await addSellerInfoToCard(card);
          
          // 如果已标记为中国卖家，添加到结果列表
          if (card.dataset.chineseSeller === 'true') {
            chineseSellerCards.push(card);
          }
        } catch (cardError) {
          console.error(`处理产品卡片时出错:`, cardError);
        }
      }
    }
    
    // 计算结果统计
    const chineseSellerCount = chineseSellerCards.length;
    const percentage = totalCards > 0 ? (chineseSellerCount / totalCards * 100) : 0;
    
    // 更新扫描状态为完成
    updateScanStatus(false, totalCards, totalCards, `扫描完成: 找到 ${chineseSellerCount} 个中国卖家 (${percentage.toFixed(1)}%)`);
    
    // 更新统计信息
    updateScanStats({
      totalScanned: totalCards,
      chineseSellerCount,
      percentage
    });
    
    // 保存扫描结果
    const results = chineseSellerCards.map(card => {
      return {
        asin: card.dataset.asin || '',
        sellerName: card.dataset.sellerName || '',
        productUrl: card.dataset.productUrl || '',
        sellerUrl: card.dataset.sellerUrl || '',
        features: card.dataset.features || ''
      };
    });
    
    saveSearchResults(totalCards, chineseSellerCount, results);
    
    console.log(`搜索页面处理完成: 总共 ${totalCards} 个产品, ${chineseSellerCount} 个中国卖家 (${percentage.toFixed(1)}%)`);
    
    // 显示扫描完成面板
    showScanCompletedPanel({
      totalScanned: totalCards,
      chineseSellerCount,
      percentage
    });
    
  } catch (error) {
    console.error('处理搜索页面时出错:', error);
    updateScanStatus(false, 0, 0, '扫描出错，请重试');
  }
}

// 添加卖家信息到产品卡片
async function addSellerInfoToCard(card) {
  try {
    // 检查卡片是否已处理过
    if (card.dataset.processed === 'true') return;
    
    // 标记卡片为已处理
    card.dataset.processed = 'true';
    
    // 获取卡片ID
    const cardId = Date.now() + '-' + Math.floor(Math.random() * 10000);
    card.dataset.cardId = cardId;
    
    // 添加产品URL到数据集
    let productUrl = '';
    const titleElement = card.querySelector('h2 a, h5 a, .a-size-base-plus a, .a-size-mini a, [data-cy="title-recipe"] a');
    
    if (titleElement && titleElement.href) {
      productUrl = titleElement.href;
      card.dataset.productUrl = productUrl;
      
      // 提取ASIN
      const asinMatch = productUrl.match(/\/([A-Z0-9]{10})(?:\/|\?|$)/);
      if (asinMatch && asinMatch[1]) {
        card.dataset.asin = asinMatch[1];
      }
    }
    
    // 获取卖家名称
    let sellerName = null;
    
    // 尝试从卡片元素内容中提取卖家名称
    const sellerSelectors = [
      '.a-row .a-size-base:not([class*="a-color-price"]):not([class*="a-text-price"])',
      '.a-row [data-cy="seller-name"]',
      '.a-row .a-size-small:not([class*="a-color-price"]):not([class*="a-text-price"])',
      '.a-row .a-size-base-plus:not([class*="a-color-price"]):not([class*="a-text-price"])',
      '.a-row a[href*="seller="]',
      '.s-seller-details',
      '[data-component-type="s-seller-data"]',
      '.a-row:nth-child(2) span.a-size-small',
      '.s-title-instructions-style span',
      '.a-box-inner .a-row:not([class*="a-price"])'
    ];
    
    for (const selector of sellerSelectors) {
      const elements = card.querySelectorAll(selector);
      
      for (const element of elements) {
        // 忽略价格和评分元素
        if (
          element.textContent.includes('$') || 
          element.textContent.includes('€') ||
          element.textContent.includes('£') ||
          element.textContent.includes('stars') ||
          element.textContent.includes('rating') ||
          element.className.includes('price') ||
          element.className.includes('stars') ||
          element.className.includes('rating') ||
          element.parentElement.className.includes('price') ||
          element.parentElement.className.includes('stars') ||
          element.parentElement.className.includes('rating')
        ) {
          continue;
        }
        
        // 查找包含"by"的文本，这通常表示卖家信息
        const text = element.textContent.trim();
        const byMatch = text.match(/(?:sold|Ships|by|from)[\s:]+([^|.]+)(?:\||.|$)/i);
        
        if (byMatch && byMatch[1]) {
          sellerName = byMatch[1].trim();
          break;
        }
        
        // 尝试查找卖家链接
        const sellerLink = element.querySelector('a[href*="seller="]');
        if (sellerLink) {
          sellerName = sellerLink.textContent.trim();
          
          // 提取卖家ID
          const sellerIdMatch = sellerLink.href.match(/seller=([A-Z0-9]+)/i);
          if (sellerIdMatch && sellerIdMatch[1]) {
            card.dataset.sellerId = sellerIdMatch[1];
          }
          
          // 提取卖家URL
          card.dataset.sellerUrl = sellerLink.href;
          
          break;
        }
      }
      
      if (sellerName) break;
    }
    
    // 如果没有找到卖家信息，并且有产品URL，尝试从产品页面获取
    if (!sellerName && productUrl) {
      try {
        console.log(`从产品页面获取卖家信息: ${productUrl}`);
        
        // 避免频繁请求
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
        
        const sellerInfo = await fetchSellerInfoFromProductPage(productUrl);
        
        if (sellerInfo && sellerInfo.sellerName) {
          sellerName = sellerInfo.sellerName;
          card.dataset.sellerName = sellerName;
          
          if (sellerInfo.sellerId) {
            card.dataset.sellerId = sellerInfo.sellerId;
          }
          
          if (sellerInfo.sellerUrl) {
            card.dataset.sellerUrl = sellerInfo.sellerUrl;
          }
          
          if (sellerInfo.isConfirmedChinese) {
            card.dataset.isConfirmedChinese = 'true';
          }
          
          // 使用卖家特征函数检查是否是中国卖家
          const features = getChineseFeatures(sellerName, sellerInfo);
          if (features.length > 0 || sellerInfo.isConfirmedChinese) {
            card.dataset.chineseSeller = 'true';
            card.dataset.features = features.join(', ');
            
            // 添加可视化标记
            addVisualMarker(card, sellerName, features, sellerInfo);
            
            // 更新卖家列表
            updateSellerListInPanel(cardId, sellerName, card.dataset.asin);
          }
        }
      } catch (error) {
        console.error(`从产品页面获取卖家信息失败:`, error);
      }
      
      return;
    }
    
    // 如果找到卖家名称，检查是否为中国卖家
    if (sellerName) {
      card.dataset.sellerName = sellerName;
      
      // 检查是否为中国卖家
      const sellerDetector = window.SellerDetector.getInstance();
      const isChineseSeller = sellerDetector.isChineseSeller(sellerName);
      
      if (isChineseSeller) {
        card.dataset.chineseSeller = 'true';
        
        // 获取中国特征
        const features = getChineseFeatures(sellerName);
        card.dataset.features = features.join(', ');
        
        // 添加可视化标记
        addVisualMarker(card, sellerName, features);
        
        // 更新卖家列表
        updateSellerListInPanel(cardId, sellerName, card.dataset.asin);
      }
    }
  } catch (error) {
    console.error('添加卖家信息到产品卡片时出错:', error);
  }
}

// 显示卖家详情面板
function showSellerDetailPanel(sellerName, sellerInfo, asin, cardId) {
  try {
    // 移除先前的面板
    const existingPanel = document.querySelector('.seller-detail-panel');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    // 创建新面板
    const panel = document.createElement('div');
    panel.className = 'seller-detail-panel';
    panel.style.position = 'fixed';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.width = '80%';
    panel.style.maxWidth = '600px';
    panel.style.maxHeight = '80vh';
    panel.style.overflowY = 'auto';
    panel.style.backgroundColor = 'white';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)';
    panel.style.zIndex = '9999';
    panel.style.padding = '20px';
    panel.style.fontFamily = 'Arial, sans-serif';
    
    // 添加关闭按钮
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#333';
    
    closeButton.addEventListener('click', () => {
      panel.remove();
    });
    
    panel.appendChild(closeButton);
    
    // 添加标题
    const title = document.createElement('h2');
    title.textContent = `卖家详情: ${sellerName}`;
    title.style.margin = '0 0 20px 0';
    title.style.borderBottom = '1px solid #eee';
    title.style.paddingBottom = '10px';
    title.style.color = '#d30000';
    panel.appendChild(title);
    
    // 内容容器
    const content = document.createElement('div');
    
    // 添加基本信息
    const basicInfo = document.createElement('div');
    basicInfo.style.marginBottom = '20px';
    
    // 信息行创建函数
    const createInfoRow = (label, value, isHighlight = false) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.margin = '8px 0';
      
      const labelElement = document.createElement('div');
      labelElement.textContent = label;
      labelElement.style.fontWeight = 'bold';
      labelElement.style.width = '120px';
      labelElement.style.flexShrink = '0';
      
      const valueElement = document.createElement('div');
      valueElement.textContent = value || '未知';
      valueElement.style.flex = '1';
      if (isHighlight) {
        valueElement.style.color = '#d30000';
        valueElement.style.fontWeight = 'bold';
      }
      
      row.appendChild(labelElement);
      row.appendChild(valueElement);
      
      return row;
    };
    
    // 添加卖家ID信息
    if (sellerInfo && sellerInfo.sellerId) {
      basicInfo.appendChild(createInfoRow('卖家ID:', sellerInfo.sellerId));
    }
    
    // 添加卖家国家信息
    const sellerCountry = (sellerInfo && sellerInfo.sellerCountry) ? sellerInfo.sellerCountry : '未确认';
    basicInfo.appendChild(createInfoRow('卖家国家:', sellerCountry, sellerCountry === 'China'));
    
    // 添加确信度信息
    if (sellerInfo && sellerInfo.confidence) {
      const confidencePercent = Math.round(sellerInfo.confidence * 100);
      basicInfo.appendChild(createInfoRow('确信度:', `${confidencePercent}%`, confidencePercent > 70));
    }
    
    // 添加企业名称
    if (sellerInfo && sellerInfo.businessName) {
      basicInfo.appendChild(createInfoRow('企业名称:', sellerInfo.businessName, true));
    }
    
    // 添加企业地址
    if (sellerInfo && sellerInfo.businessAddress) {
      const addressRow = createInfoRow('企业地址:', '', true);
      
      // 将地址拆分为多行显示
      const addressElement = addressRow.querySelector('div:last-child');
      const addressLines = sellerInfo.businessAddress.split('\n');
      
      addressLines.forEach((line, index) => {
        const lineElement = document.createElement('div');
        lineElement.textContent = line.trim();
        if (index > 0) {
          lineElement.style.marginTop = '4px';
        }
        addressElement.appendChild(lineElement);
      });
      
      basicInfo.appendChild(addressRow);
    }
    
    // 添加中国特征列表
    const features = getChineseFeatures(sellerName, sellerInfo);
    if (features.length > 0) {
      const featuresTitle = document.createElement('h3');
      featuresTitle.textContent = '中国卖家特征:';
      featuresTitle.style.margin = '15px 0 10px 0';
      featuresTitle.style.fontSize = '16px';
      
      const featuresList = document.createElement('ul');
      featuresList.style.margin = '0';
      featuresList.style.paddingLeft = '20px';
      
      features.forEach(feature => {
        const featureItem = document.createElement('li');
        featureItem.textContent = feature;
        featureItem.style.margin = '5px 0';
        featuresList.appendChild(featureItem);
      });
      
      content.appendChild(featuresTitle);
      content.appendChild(featuresList);
    }
    
    // 添加链接部分
    const linksSection = document.createElement('div');
    linksSection.style.marginTop = '25px';
    linksSection.style.borderTop = '1px solid #eee';
    linksSection.style.paddingTop = '15px';
    
    // 创建链接函数
    const createLink = (label, url) => {
      if (!url) return null;
      
      const link = document.createElement('a');
      link.textContent = label;
      link.href = url;
      link.target = '_blank';
      link.style.display = 'inline-block';
      link.style.margin = '0 15px 10px 0';
      link.style.padding = '6px 12px';
      link.style.backgroundColor = '#f0f0f0';
      link.style.borderRadius = '4px';
      link.style.textDecoration = 'none';
      link.style.color = '#0066c0';
      link.style.fontWeight = 'bold';
      
      return link;
    };
    
    // 添加产品页面链接
    if (asin) {
      const productUrl = `https://www.amazon.com/dp/${asin}`;
      const productLink = createLink('查看产品页面', productUrl);
      if (productLink) linksSection.appendChild(productLink);
    }
    
    // 添加卖家页面链接
    if (sellerInfo && sellerInfo.sellerUrl) {
      const sellerLink = createLink('查看卖家页面', sellerInfo.sellerUrl);
      if (sellerLink) linksSection.appendChild(sellerLink);
    }
    
    content.appendChild(basicInfo);
    content.appendChild(linksSection);
    panel.appendChild(content);
    
    // 添加到页面
    document.body.appendChild(panel);
    
    // 添加点击外部关闭功能
    const handleOutsideClick = (event) => {
      if (!panel.contains(event.target)) {
        panel.remove();
        document.removeEventListener('click', handleOutsideClick);
      }
    };
    
    // 延迟添加点击监听，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
    
  } catch (error) {
    console.error('显示卖家详情面板时出错:', error);
  }
}

// 触发页面的懒加载，确保所有产品都被加载
async function triggerLazyLoading() {
  console.log("触发懒加载以加载所有产品...");
  
  const updateStatus = (message) => {
    updateScanStatus(true, 0, 0, message);
  };
  
  // 确保状态容器存在
  ensureScanStatusContainer();
  
  // 记录初始产品数量
  const initialProductCount = getProductCards().length;
  updateStatus(`正在加载更多产品... (当前: ${initialProductCount} 个产品)`);
  
  // 定义滚动函数
  const scrollToBottom = async () => {
    return new Promise(resolve => {
      let lastPosition = window.scrollY;
      
      // 滚动到页面底部
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
      
      // 等待内容加载
      setTimeout(() => {
        // 检查是否有新元素被加载
        const newPosition = window.scrollY;
        resolve(newPosition > lastPosition);
      }, 1000);
    });
  };
  
  // 执行多次滚动，确保所有内容被加载
  let newContentLoaded = true;
  let attempts = 0;
  let maxAttempts = 10;
  let finalProductCount = initialProductCount;
  
  while (newContentLoaded && attempts < maxAttempts) {
    attempts++;
    
    // 更新状态
    updateStatus(`正在加载更多产品... (已滚动 ${attempts}/${maxAttempts} 次, 当前: ${getProductCards().length} 个产品)`);
    
    // 执行滚动
    newContentLoaded = await scrollToBottom();
    
    // 滚动后再检查产品数量
    finalProductCount = getProductCards().length;
    
    // 如果产品数量没有变化，且已经尝试了至少2次，则提前结束
    if (finalProductCount === initialProductCount && attempts >= 2) {
      newContentLoaded = false;
    }
    
    // 如果产品数量增加，重置计数器继续尝试
    if (finalProductCount > initialProductCount && attempts >= 3) {
      console.log(`产品数量增加: ${initialProductCount} -> ${finalProductCount}`);
      
      // 每次找到新内容时，点击"加载更多"按钮（如果存在）
      const loadMoreButtons = [
        ...document.querySelectorAll('a[href*="load-more"]'),
        ...document.querySelectorAll('button:not([disabled])[class*="load-more"]'),
        ...document.querySelectorAll('span[class*="load-more"]'),
        ...document.querySelectorAll('div[class*="load-more"]'),
        ...document.querySelectorAll('button:not([disabled]):not([aria-disabled="true"]):not([aria-hidden="true"]):not([style*="display: none"])[class*="pag"]')
      ];
      
      for (const button of loadMoreButtons) {
        if (button && button.offsetParent !== null) { // 确保按钮可见
          console.log('点击"加载更多"按钮', button);
          button.click();
          // 给页面一些时间加载
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    
    // 短暂等待，让新内容加载
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 最后一次滚动，尝试加载任何遗漏的内容
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth'
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 最终检查产品数量
  finalProductCount = getProductCards().length;
  
  // 更新状态
  updateStatus(`懒加载完成 - 共发现 ${finalProductCount} 个产品 (原始: ${initialProductCount})`);
  
  // 返回产品数量是否增加
  console.log(`懒加载完成 - 产品数量 ${initialProductCount} -> ${finalProductCount}`);
  return finalProductCount > initialProductCount;
}

// 注意：全局样式已移至utils/global-styles.js中的window.addGlobalStyles函数

/**
 * 从商品详情页获取卖家信息
 * @param {string} url - 商品URL
 * @returns {Promise<Object|null>} 返回卖家信息对象，或null表示获取失败
 */
async function fetchSellerInfoFromProductPage(url) {
  try {
    console.log('尝试从商品页面获取卖家信息:', url);
    
    // 使用fetch API获取页面内容，添加重试逻辑
    let response = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': window.navigator.userAgent,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          },
          // 添加随机参数避免缓存
          cache: 'no-store'
        });
        
        if (response.ok) break;
        
        console.warn(`尝试 ${retryCount + 1}/${maxRetries} 失败: ${response.status} ${response.statusText}`);
        retryCount++;
        // 指数退避策略
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      } catch (fetchError) {
        console.warn(`尝试 ${retryCount + 1}/${maxRetries} 出错:`, fetchError);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      }
    }
    
    if (!response || !response.ok) {
      console.error(`获取产品页面失败: ${response ? `${response.status} ${response.statusText}` : '无响应'}`);
      return null;
    }
    
    const html = await response.text();
    console.log(`成功获取到产品页面HTML，长度: ${html.length} 字符`);
    
    // 解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 检查是否成功解析
    if (!doc || !doc.body) {
      console.error('HTML解析失败');
      return null;
    }
    
    console.log('HTML解析成功，开始提取卖家信息...');
    
    // 提取卖家信息 - 产品页面(B页面)
    let sellerName = null;
    let sellerUrl = null;
    let sellerId = null;
    
    // 方法1: 直接从产品页面提取卖家链接 - 更新选择器，确保更好的兼容性
    const sellerLinkSelectors = [
      '#merchant-info a', // 最常见的卖家信息位置
      '#sellerProfileTriggerId', // 另一个常见位置
      '.offer-display-feature-text a', // 特价商品卖家位置
      '#tabular-buybox a[href*="seller="]', // 表格式购买框中的卖家链接
      '.tabular-buybox-container a[href*="seller="]',
      'a[href*="/sp?seller="]', // 一般卖家链接格式
      'a[href*="&seller="]',
      'a[href*="seller="]',
      '[id*="merchant"] a', // 含有merchant的元素中的链接
      '[class*="seller"] a', // 含有seller的元素中的链接
      '[class*="merchant"] a', // 含有merchant的元素中的链接
      '.a-row a[href*="seller="]', // 包含卖家链接的行
      '.a-section a[href*="seller="]', // 包含卖家链接的区域
      '.offer-display-feature-text', // 卖家信息容器
      '.tabular-buybox-text', // 表格式购买框中的文本
      // 新增选择器，处理更多情况
      '.merchant-info a',
      '#bylineInfo',
      'div[id*="seller"] a',
      'div[class*="seller"] a',
      'span[class*="seller"] a',
      'a.a-link-normal[href*="seller"]',
      '#sold-by a',
      '[data-feature-name="shipsFromSoldBy"] a'
    ];
    
    for (const selector of sellerLinkSelectors) {
      try {
        const sellerElements = doc.querySelectorAll(selector);
        if (!sellerElements || sellerElements.length === 0) continue;
        
        for (const sellerElement of sellerElements) {
          // 检查是否为链接元素
          if (sellerElement.tagName === 'A' && sellerElement.href && sellerElement.textContent) {
            sellerName = sellerElement.textContent.trim();
            sellerUrl = sellerElement.href;
            
            // 如果链接不是绝对URL，转换为绝对URL
            if (sellerUrl && !sellerUrl.startsWith('http')) {
              // 处理相对URL
              const baseUrl = new URL(url).origin;
              sellerUrl = new URL(sellerUrl, baseUrl).href;
            }
            
            // 尝试从URL中提取sellerId
            const idMatch = sellerUrl.match(/seller=([A-Z0-9]+)/i);
            if (idMatch && idMatch[1]) {
              sellerId = idMatch[1];
            }
            
            // 排除Amazon自己
            if (sellerName.toLowerCase().includes('amazon')) {
              console.log('排除Amazon自营卖家:', sellerName);
              sellerName = null;
              sellerUrl = null;
              sellerId = null;
              continue;
            }
            
            console.log(`在产品页面找到卖家: ${sellerName}, URL: ${sellerUrl}, ID: ${sellerId || '未知'}`);
            break;
          }
          // 检查是否包含卖家链接
          else {
            const links = sellerElement.querySelectorAll('a');
            for (const link of links) {
              if (link.href && link.href.includes('seller=')) {
                sellerName = link.textContent.trim();
                sellerUrl = link.href;
                
                // 如果链接不是绝对URL，转换为绝对URL
                if (sellerUrl && !sellerUrl.startsWith('http')) {
                  // 处理相对URL
                  const baseUrl = new URL(url).origin;
                  sellerUrl = new URL(sellerUrl, baseUrl).href;
                }
                
                // 尝试从URL中提取sellerId
                const idMatch = sellerUrl.match(/seller=([A-Z0-9]+)/i);
                if (idMatch && idMatch[1]) {
                  sellerId = idMatch[1];
                }
                
                // 排除Amazon自己
                if (sellerName.toLowerCase().includes('amazon')) {
                  console.log('排除Amazon自营卖家:', sellerName);
                  sellerName = null;
                  sellerUrl = null;
                  sellerId = null;
                  continue;
                }
                
                console.log(`在产品页面找到卖家: ${sellerName}, URL: ${sellerUrl}, ID: ${sellerId || '未知'}`);
                break;
              }
            }
          }
        }
        
        if (sellerName) break;
      } catch (error) {
        console.error(`使用选择器 "${selector}" 提取卖家信息时出错:`, error);
      }
    }
    
    // 方法4: 如果找到卖家URL，尝试从卖家页面提取更多信息（如国家信息）
    if (sellerUrl) {
      console.log(`尝试从卖家页面(C页面)获取更多信息: ${sellerUrl}`);
      
      try {
        // 获取卖家页面内容，添加重试逻辑
        let sellerResponse = null;
        let sellerRetryCount = 0;
        const sellerMaxRetries = 3;
        
        while (sellerRetryCount < sellerMaxRetries) {
          try {
            sellerResponse = await fetch(sellerUrl, {
              method: 'GET',
              credentials: 'same-origin',
              headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml',
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': window.navigator.userAgent,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
              },
              cache: 'no-store'
            });
            
            if (sellerResponse.ok) break;
            
            console.warn(`获取卖家页面尝试 ${sellerRetryCount + 1}/${sellerMaxRetries} 失败: ${sellerResponse.status}`);
            sellerRetryCount++;
            // 指数退避策略
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, sellerRetryCount)));
          } catch (fetchError) {
            console.warn(`获取卖家页面尝试 ${sellerRetryCount + 1}/${sellerMaxRetries} 出错:`, fetchError);
            sellerRetryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, sellerRetryCount)));
          }
        }
        
        if (!sellerResponse || !sellerResponse.ok) {
          console.error(`获取卖家页面失败: ${sellerResponse ? `${sellerResponse.status} ${sellerResponse.statusText}` : '无响应'}`);
          // 虽然获取C页面失败，但已有A-B页面的信息，所以继续
        } else {
          const sellerHtml = await sellerResponse.text();
          console.log(`成功获取到卖家页面HTML，长度: ${sellerHtml.length} 字符`);
          
          // 解析卖家页面HTML
          const sellerDoc = parser.parseFromString(sellerHtml, 'text/html');
          
          // 检查解析是否成功
          if (!sellerDoc || !sellerDoc.body) {
            console.error('卖家页面HTML解析失败');
          } else {
            console.log('卖家页面HTML解析成功，提取国家信息...');
            
            // 新增：特别处理 Detailed Seller Information 区块
            const detailedSellerInfoSelectors = [
              '#detailed-seller-info',
              '#detailed-seller-information',
              'h2:contains("Detailed Seller Information"), h2:contains("Business Information"), h2:contains("详细卖家信息")',
              '.detailed-seller-info',
              '[class*="seller-info"]',
              '[id*="seller-info"]',
              '.a-box:contains("Business Name")',
              '.a-section:contains("Business Name")',
              'div:contains("Business Name"):not(:contains("Business Name:"))',
              // 扩展选择器，处理更多情况
              'h2.a-spacing-none + div',
              '.a-box-group .a-box',
              'div[role="main"] .a-section'
            ];
            
            let sellerDetailElement = null;
            
            for (const selector of detailedSellerInfoSelectors) {
              try {
                const elements = sellerDoc.querySelectorAll(selector);
                console.log(`使用选择器 "${selector}" 查找卖家详情区块，找到 ${elements.length} 个元素`);
                
                for (const element of elements) {
                  const text = element.textContent.trim();
                  if (!text || text.length < 10) continue;
                  
                  // 检查是否包含关键信息
                  if (
                    text.includes('Business Name') || 
                    text.includes('Business Address') || 
                    text.includes('Seller Information') ||
                    text.includes('Detailed Seller') ||
                    text.includes('公司名称') || 
                    text.includes('营业地址') ||
                    text.includes('卖家信息')
                  ) {
                    console.log(`找到卖家详情区块: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
                    sellerDetailElement = element;
                    break;
                  }
                }
                
                if (sellerDetailElement) break;
              } catch (error) {
                console.error(`使用选择器 "${selector}" 查找卖家详情时出错:`, error);
              }
            }
            
            // 如果找到卖家详情区块，进行特殊处理
            if (sellerDetailElement) {
              console.log('找到卖家详情区块，开始提取关键信息');
              
              // 提取关键信息
              const detailText = sellerDetailElement.textContent.trim();
              
              // 检查是否直接包含中国相关关键词
              const chineseKeywords = [
                'China', 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou', 
                'Hangzhou', 'Xiamen', '中国', '北京', '上海', '深圳', 
                '广州', '杭州', '浙江', '广东', 'CN',
                'PRC', 'P.R.C', 'People\'s Republic of China'
              ];
              
              let isConfirmedChinese = false;
              let businessName = '';
              let businessAddress = '';
              
              // 尝试提取Business Name和Business Address
              const nameMatch = detailText.match(/Business Name:?\s*([^\n]+)/i);
              const addressMatch = detailText.match(/Business Address:?\s*([^]*)(?:(?:\n\s*\n)|$)/i);
              
              if (nameMatch && nameMatch[1]) {
                businessName = nameMatch[1].trim();
                console.log(`提取到企业名称: ${businessName}`);
              }
              
              if (addressMatch && addressMatch[1]) {
                businessAddress = addressMatch[1].trim();
                console.log(`提取到企业地址: ${businessAddress}`);
              }
              
              // 检查名称中是否包含"Shenzhen", "Guangzhou"等中国城市名称
              if (businessName) {
                const chineseCityInName = [
                  'Shenzhen', 'Guangzhou', 'Shanghai', 'Beijing', 'Hangzhou', 
                  'Yiwu', 'Ningbo', 'Xiamen', 'Dongguan', 'Foshan', 'Suzhou', 
                  'Zhongshan', 'Taizhou'
                ];
                
                for (const city of chineseCityInName) {
                  if (businessName.includes(city)) {
                    console.log(`企业名称包含中国城市名称: ${city}`);
                    isConfirmedChinese = true;
                    break;
                  }
                }
              }
              
              // 检查地址中是否有中文字符
              const hasChineseChars = /[\u4e00-\u9fff]/.test(businessAddress);
              if (hasChineseChars) {
                console.log('企业地址包含中文字符');
                isConfirmedChinese = true;
              }
              
              // 检查地址中是否包含中国关键词
              for (const keyword of chineseKeywords) {
                if (businessAddress.includes(keyword)) {
                  console.log(`企业地址包含中国关键词: ${keyword}`);
                  isConfirmedChinese = true;
                  break;
                }
              }
              
              // 特殊情况：检查页面HTML中是否包含中文地址
              if (!isConfirmedChinese) {
                const fullHtml = sellerDoc.documentElement.outerHTML;
                for (const keyword of chineseKeywords) {
                  if (fullHtml.includes(keyword)) {
                    console.log(`页面HTML中包含中国关键词: ${keyword}`);
                    isConfirmedChinese = true;
                    break;
                  }
                }
                
                // 检查页面HTML中是否有中文字符
                if (!isConfirmedChinese && /[\u4e00-\u9fff]/.test(fullHtml)) {
                  console.log('页面HTML中包含中文字符');
                  isConfirmedChinese = true;
                }
              }
              
              // 检查是否包含国家代码"CN"
              const countryCodeMatch = detailText.match(/\b(CN|CHN)\b/);
              if (countryCodeMatch) {
                console.log(`找到中国国家代码: ${countryCodeMatch[0]}`);
                isConfirmedChinese = true;
              }
              
              // 如果确认是中国卖家，返回详细信息
              if (isConfirmedChinese) {
                return {
                  sellerName,
                  sellerId,
                  sellerUrl,
                  sellerCountry: 'China',
                  businessName,
                  businessAddress,
                  isConfirmedChinese: true,
                  confidence: 0.95,
                  detailSource: 'seller_page_detail'
                };
              }
              
              // 即使没有确认是中国卖家，也返回提取的详细信息
              if (businessName || businessAddress) {
                return {
                  sellerName,
                  sellerId,
                  sellerUrl,
                  businessName,
                  businessAddress,
                  isConfirmedChinese: false,
                  confidence: 0.6,
                  detailSource: 'seller_page_detail_uncertain'
                };
              }
            }
            
            // 继续使用之前的提取逻辑（如果详细区块处理失败）
            // 直接从HTML文本中检查中国关键词
            const isChineseInHtml = 
              sellerHtml.includes('China') || 
              sellerHtml.includes('Beijing') || 
              sellerHtml.includes('Shanghai') || 
              sellerHtml.includes('Shenzhen') || 
              sellerHtml.includes('Guangzhou') || 
              sellerHtml.includes('Hangzhou') ||
              sellerHtml.includes('Xiamen') ||
              sellerHtml.includes('中国') ||
              sellerHtml.includes('北京') ||
              sellerHtml.includes('上海') ||
              sellerHtml.includes('深圳') ||
              sellerHtml.includes('广州') ||
              sellerHtml.includes('杭州');
            
            if (isChineseInHtml) {
              console.log('卖家页面HTML文本中包含中国地址关键词');
              return {
                sellerName,
                sellerId,
                sellerUrl,
                sellerCountry: 'China',
                isConfirmedChinese: true,
                confidence: 0.95
              };
            }
            
            // 提取卖家国家信息
            let sellerCountry = null;
            let sellerBusinessInfo = null;
            let confidence = 0;
            
            // 以下元素通常包含业务地址
            const businessInfoSelectors = [
              // 商家详情
              '#page-section-detail-seller-info', 
              '.seller-information',
              'section[id*="seller"]',
              'div[id*="seller"]',
              'div[class*="seller"]',
              
              // 地址信息
              '.a-row:not(:empty)',
              '.a-section:not(:empty)',
              '[class*="address"]',
              '[class*="location"]',
              'h1+div',
              'h2+div',
              '.address-section',
              'p',
              // 新增选择器
              '.seller-address',
              '.business-address',
              '.seller-details',
              '#sellerName ~ div',
              '#sellerName + div',
              'div[id*="business-address"]',
              'div[class*="business-address"]',
              'div[class*="seller-details"]',
              'div[class*="info"]',
              '#aag_detailsAbout'
            ];
            
            // 遍历各个选择器
            for (const selector of businessInfoSelectors) {
              try {
                const elements = sellerDoc.querySelectorAll(selector);
                console.log(`使用选择器 "${selector}" 找到 ${elements.length} 个元素`);
                
                if (!elements || elements.length === 0) continue;
                
                for (const element of elements) {
                  const text = element.textContent.trim();
                  if (!text || text.length < 5) continue; // 忽略太短的文本
                  
                  // 检查中国相关关键词
                  const chineseKeywordsInElement = [
                    'China', 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou', 'Hangzhou',
                    'Xiamen', 'Chengdu', 'Nanjing', 'Tianjin', 'Wuhan', 'Chongqing',
                    'Dongguan', 'Suzhou', 'Zhongshan', 'Ningbo', 'Zhejiang', 'Guangdong', 'Jiangsu',
                    // 添加更多关键词
                    'PRC', 'P.R.C', 'People\'s Republic of China', 'CN',
                    '中国', '广东', '深圳', '上海', '北京', '浙江', '杭州', '义乌'
                  ];
                  
                  for (const keyword of chineseKeywordsInElement) {
                    if (text.includes(keyword)) {
                      console.log(`找到中国关键词: ${keyword}`);
                      sellerCountry = 'China';
                      sellerBusinessInfo = text;
                      confidence = 0.9;
                      break;
                    }
                  }
                  
                  if (sellerCountry) break;
                }
                
                if (sellerCountry) break;
                
              } catch (error) {
                console.error(`使用选择器 "${selector}" 提取卖家国家信息时出错:`, error);
              }
            }
            
            // 如果确定是中国卖家，返回完整信息
            if (sellerCountry === 'China') {
              return {
                sellerName,
                sellerId,
                sellerUrl,
                sellerCountry,
                sellerBusinessInfo,
                isConfirmedChinese: true,
                confidence
              };
            }
          }
        }
      } catch (error) {
        console.error('获取卖家页面信息时出错:', error);
        // 错误处理 - 继续使用已有信息
      }
    }
    
    // 方法2: 如果未找到卖家链接，尝试从文本中提取
    if (!sellerName) {
      console.log('未找到直接卖家链接，尝试从文本中提取...');
      
      const sellerTextSelectors = [
        '#merchant-info', // 常见的卖家信息文本节点
        '.tabular-buybox-text',
        '[class*="byline"]', // 含有byline的元素
        '[class*="seller"]', // 含有seller的元素
        '[class*="merchant"]', // 含有merchant的元素
        '.a-row:has(.a-color-secondary)', // 含有次要文本的行
        '.a-section:has(.a-color-secondary)', // 含有次要文本的区域
        '[class*="sold-by"]', // 含有sold-by的元素
        '[class*="ships-from"]', // 含有ships-from的元素
        // 新增选择器
        '.merchant-info',
        '#bylineInfo',
        '[data-feature-name="bylineInfo"]',
        '[data-feature-name="shipsFromSoldBy"]',
        '#sold-by'
      ];
      
      for (const selector of sellerTextSelectors) {
        try {
          const elements = doc.querySelectorAll(selector);
          for (const element of elements) {
            if (element && element.textContent) {
              const text = element.textContent.trim();
              
              // 尝试匹配常见模式
              const patterns = [
                /(?:Sold|Ships) by[:\s]+([^.]+)/i, // "Sold by: Seller Name"
                /(?:Sold|Ships) from[:\s]+([^.]+)/i, // "Sold from: Seller Name"
                /Seller:?\s+([^.]+)/i, // "Seller: Seller Name"
                /from\s+([^.]+)/i, // "from Seller Name"
                /(?:Ships|Sold|Fulfilled)\s+by:?\s+([^.]+)/i, // "Ships by: Seller Name"
                /(?:Seller|Vendor|Store):?\s+([^.]+)/i, // "Seller: Seller Name"
                // 新增模式
                /Brand:?\s+([^.]+)/i, // "Brand: Seller Name"
                /Visit the ([^.]+) Store/i, // "Visit the Seller Name Store"
                /by\s+([^.]+)/i // "by Seller Name"
              ];
              
              for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                  sellerName = match[1].trim();
                  
                  // 排除Amazon自己
                  if (sellerName.toLowerCase().includes('amazon')) {
                    console.log('文本提取排除Amazon自营卖家:', sellerName);
                    sellerName = null;
                    continue;
                  }
                  
                  console.log(`从文本中提取到卖家名称: ${sellerName}`);
                  
                  // 尝试在同一个元素中找到链接
                  const links = element.querySelectorAll('a');
                  for (const link of links) {
                    if (link.href && (link.href.includes('seller=') || link.textContent.trim() === sellerName)) {
                      sellerUrl = link.href;
                      
                      // 如果链接不是绝对URL，转换为绝对URL
                      if (sellerUrl && !sellerUrl.startsWith('http')) {
                        // 处理相对URL
                        const baseUrl = new URL(url).origin;
                        sellerUrl = new URL(sellerUrl, baseUrl).href;
                      }
                      
                      console.log(`找到匹配卖家名称的链接: ${sellerUrl}`);
                      
                      // 尝试从URL中提取sellerId
                      const idMatch = sellerUrl.match(/seller=([A-Z0-9]+)/i);
                      if (idMatch && idMatch[1]) {
                        sellerId = idMatch[1];
                        console.log(`从链接中提取卖家ID: ${sellerId}`);
                      }
                      
                      break;
                    }
                  }
                  
                  break;
                }
              }
              
              if (sellerName) break;
            }
          }
          
          if (sellerName) break;
        } catch (error) {
          console.error(`使用选择器 "${selector}" 提取卖家文本时出错:`, error);
        }
      }
    }
    
    // 方法3: 如果找到了卖家名称但没有URL，尝试构建卖家页面URL
    if (sellerName && !sellerUrl) {
      console.log(`找到卖家名称 "${sellerName}" 但未找到URL，尝试提取卖家ID...`);
      
      // 尝试从页面中找到卖家ID
      const sellerIdRegexes = [
        /seller=([A-Z0-9]{10,16})/i,
        /merchantId=([A-Z0-9]{10,16})/i,
        /merchant=([A-Z0-9]{10,16})/i,
        /sellerId=([A-Z0-9]{10,16})/i
      ];
      
      // 在整个HTML中搜索
      for (const regex of sellerIdRegexes) {
        const match = html.match(regex);
        if (match && match[1]) {
          sellerId = match[1];
          
          // 构建卖家URL - 使用当前页面的域名构建
          const currentUrl = new URL(url);
          sellerUrl = `${currentUrl.origin}/sp?seller=${sellerId}`;
          
          console.log(`构建卖家URL: ${sellerUrl}`);
          break;
        }
      }
    }
    
    // 返回从B页面获取的信息
    if (sellerName) {
      return { 
        sellerName, 
        sellerId, 
        sellerUrl,
        confidence: sellerId && sellerUrl ? 0.7 : 0.5, // 有ID和URL的置信度更高
        isConfirmedChinese: false 
      };
    }
    
    console.log('未能从产品页面获取卖家信息');
    return null;
  } catch (error) {
    console.error('从产品页面获取卖家信息时出错:', error);
    return null;
  }
}

/**
 * 确保扫描状态容器存在
 * @returns {HTMLElement} 状态容器元素
 */
function ensureScanStatusContainer() {
  // 检查是否已存在
  let container = document.getElementById('cn-seller-scan-status');
  
  if (container) {
    // 如果存在，仅返回而不立即显示
    return container;
  }
  
  // 创建容器
  container = document.createElement('div');
  container.id = 'cn-seller-scan-status';
  container.style.cssText = `
    position: fixed;
    top: 70px;
    left: 0;
    right: 0;
    width: 80%;
    max-width: 1200px;
    min-width: 800px;
    margin: 0 auto;
    padding: 15px 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    transition: all 0.3s ease;
    display: none;
    opacity: 0;
    transform: translateY(-10px);
    max-height: 85vh;
    overflow-y: auto;
  `;
  
  // 内容容器
  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;
  
  // 标题部分
  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  `;
  
  // 标题
  const title = document.createElement('h3');
  title.textContent = '中国卖家扫描';
  title.style.cssText = `
    margin: 0;
    color: #ff0055;
    font-size: 18px;
    font-weight: bold;
  `;
  
  titleDiv.appendChild(title);
  
  // 添加关闭按钮
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: #ff0055;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    width: 24px;
    height: 24px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  `;
  
  // 添加鼠标悬停效果
  closeButton.onmouseover = function() {
    this.style.backgroundColor = 'rgba(255, 0, 85, 0.1)';
  };
  
  closeButton.onmouseout = function() {
    this.style.backgroundColor = 'transparent';
  };
  
  // 添加点击关闭功能
  closeButton.onclick = function() {
    container.style.opacity = '0';
    container.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      container.style.display = 'none';
    }, 300);
  };
  
  titleDiv.appendChild(closeButton);
  contentDiv.appendChild(titleDiv);
  
  // 状态详情部分
  const statusDiv = document.createElement('div');
  statusDiv.className = 'scan-status-details';
  statusDiv.style.cssText = `
    padding: 15px;
    border-radius: 6px;
    background-color: rgba(0, 0, 0, 0.02);
    margin-bottom: 15px;
  `;
  contentDiv.appendChild(statusDiv);
  
  // 统计部分
  const statsDiv = document.createElement('div');
  statsDiv.className = 'scan-stats-section';
  statsDiv.style.cssText = `
    padding: 15px;
    border-radius: 6px;
    background-color: rgba(0, 0, 0, 0.02);
    margin-bottom: 15px;
  `;
  contentDiv.appendChild(statsDiv);
  
  // 中国卖家列表部分
  const sellerListSection = document.createElement('div');
  sellerListSection.className = 'cn-seller-list-section';
  sellerListSection.style.cssText = `
    max-height: 300px;
    overflow-y: auto;
    padding: 0 15px;
    margin-bottom: 15px;
    border-radius: 6px;
    background-color: rgba(0, 0, 0, 0.02);
  `;
  contentDiv.appendChild(sellerListSection);
  
  // 操作按钮部分
  const actionDiv = document.createElement('div');
  actionDiv.style.cssText = `
    display: flex;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px solid #eee;
  `;
  
  // 创建刷新按钮
  const refreshButton = document.createElement('button');
  refreshButton.textContent = '重新扫描';
  refreshButton.style.cssText = `
    background-color: #ff0055;
    color: white;
    border: none;
    border-radius: 5px;
    padding: 8px 20px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s ease;
    font-size: 14px;
  `;
  
  refreshButton.onmouseover = function() {
    this.style.backgroundColor = '#e00046';
  };
  
  refreshButton.onmouseout = function() {
    this.style.backgroundColor = '#ff0055';
  };
  
  refreshButton.onclick = function() {
    console.log('用户点击重新扫描');
    // 显示扫描状态容器
    container.style.display = 'block';
    setTimeout(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    }, 10);
    
    removeAllMarks();
    processSearchPage();
  };
  
  actionDiv.appendChild(refreshButton);
  contentDiv.appendChild(actionDiv);
  
  // 添加到页面
  container.appendChild(contentDiv);
  document.body.appendChild(container);
  
  return container;
}

/**
 * 更新扫描状态显示
 * @param {boolean} isActive - 是否正在扫描中
 * @param {number} current - 当前项目
 * @param {number} total - 总数量
 * @param {string} message - 状态信息
 * @param {boolean} isRefreshing - 是否为刷新扫描
 * @param {number} progressPercent - 进度百分比
 */
function updateScanStatus(isActive, current, total, message, isRefreshing = false, progressPercent) {
  const statusContainer = document.getElementById('cn-seller-scan-status');
  if (!statusContainer) return;
  
  // 记录更新的状态
  console.log(`更新扫描状态: 活跃=${isActive}, 当前=${current}, 总数=${total}, 消息="${message}"`);
  
  // 确保容器可见
  if (statusContainer.style.display === 'none') {
    statusContainer.style.display = 'block';
    setTimeout(() => {
      statusContainer.style.opacity = '1';
      statusContainer.style.transform = 'translateY(0)';
    }, 10);
  }
  
  // 找到状态显示部分
  const statusDiv = statusContainer.querySelector('.scan-status-details');
  if (!statusDiv) return;
  
  // 清除旧内容
  statusDiv.innerHTML = '';
  
  // 创建状态指示器
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'scan-status-indicator';
  statusIndicator.style.display = 'flex';
  statusIndicator.style.alignItems = 'center';
  statusIndicator.style.marginBottom = '10px';
  statusIndicator.style.padding = '10px';
  statusIndicator.style.borderRadius = '6px';
  statusIndicator.style.backgroundColor = isActive ? 'rgba(255, 0, 85, 0.1)' : 'rgba(153, 153, 153, 0.1)';
  
  // 创建状态图标
  const statusIcon = document.createElement('div');
  statusIcon.style.cssText = `
    width: 16px;
    height: 16px;
    border-radius: 50%;
    margin-right: 12px;
    background-color: ${isActive ? '#ff0055' : '#999'};
    ${isActive ? 'animation: pulse 1.5s infinite ease-in-out;' : ''}
  `;
  
  // 添加脉动动画
  if (isActive) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.1); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
  
  statusIndicator.appendChild(statusIcon);
  
  // 创建状态文本
  const statusText = document.createElement('div');
  statusText.style.cssText = `
    font-size: 14px;
    font-weight: bold;
    color: ${isActive ? '#ff0055' : '#666'};
  `;
  statusText.textContent = isActive ? '正在扫描中...' : '扫描已完成';
  statusIndicator.appendChild(statusText);
  
  statusDiv.appendChild(statusIndicator);
  
  // 创建进度条
  if (isActive && total > 0) {
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      width: 100%;
      height: 8px;
      background-color: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
      margin: 15px 0;
    `;
    
    const progressBar = document.createElement('div');
    const percent = progressPercent !== undefined ? progressPercent : Math.round((current / total) * 100);
    progressBar.style.cssText = `
      width: ${percent}%;
      height: 100%;
      background-color: #ff0055;
      border-radius: 4px;
      transition: width 0.3s ease;
    `;
    
    progressContainer.appendChild(progressBar);
    statusDiv.appendChild(progressContainer);
    
    // 进度文本
    const progressText = document.createElement('div');
    progressText.style.cssText = `
      text-align: center;
      font-size: 13px;
      color: #666;
      margin-bottom: 10px;
    `;
    progressText.textContent = `进度: ${current} / ${total} (${percent}%)`;
    statusDiv.appendChild(progressText);
  }
  
  // 添加状态消息
  if (message) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      margin-top: 10px;
      padding: 10px;
      background-color: ${isActive ? 'rgba(255, 0, 85, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
      border-radius: 4px;
      font-size: 13px;
      color: #333;
    `;
    messageDiv.textContent = message;
    statusDiv.appendChild(messageDiv);
  }
}

/**
 * 更新扫描统计信息
 * @param {Object} stats - 统计数据对象
 */
function updateScanStats(stats) {
  const statusContainer = document.getElementById('cn-seller-scan-status');
  if (!statusContainer) return;
  
  const statsDiv = statusContainer.querySelector('.scan-stats-section');
  if (!statsDiv) return;
  
  // 清除旧内容
  statsDiv.innerHTML = '';
  
  // 创建标题
  const statsTitle = document.createElement('h4');
  statsTitle.textContent = '扫描统计';
  statsTitle.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    font-size: 16px;
    font-weight: bold;
  `;
  statsDiv.appendChild(statsTitle);
  
  // 创建统计网格
  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
  `;
  
  // 添加统计项
  const addStatItem = (label, value, color = '#333', icon = null) => {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 12px;
      background-color: rgba(0, 0, 0, 0.03);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
    `;
    
    const valueEl = document.createElement('div');
    valueEl.style.cssText = `
      font-size: 20px;
      font-weight: bold;
      color: ${color};
      margin-bottom: 5px;
    `;
    valueEl.textContent = value;
    
    const labelEl = document.createElement('div');
    labelEl.style.cssText = `
      font-size: 12px;
      color: #666;
    `;
    labelEl.textContent = label;
    
    item.appendChild(valueEl);
    item.appendChild(labelEl);
    
    return item;
  };
  
  // 添加各项统计
  statsGrid.appendChild(addStatItem('总产品数', stats.totalProducts || 0));
  statsGrid.appendChild(addStatItem('中国卖家数', stats.cnSellers || 0, '#ff0055'));
  statsGrid.appendChild(addStatItem('中国卖家比例', `${stats.cnSellerPercentage || 0}%`, '#ff0055'));
  statsGrid.appendChild(addStatItem('扫描耗时', `${stats.scanTime || 0}秒`));
  
  statsDiv.appendChild(statsGrid);
  
  // 更新卖家列表
  updateSellerList(stats.sellerList || []);
}

/**
 * 更新卖家列表显示
 * @param {Array} sellerList - 卖家列表数组
 */
function updateSellerList(sellerList) {
  const statusContainer = document.getElementById('cn-seller-scan-status');
  if (!statusContainer) return;
  
  const sellerListSection = statusContainer.querySelector('.cn-seller-list-section');
  if (!sellerListSection) return;
  
  // 清除旧内容
  sellerListSection.innerHTML = '';
  
  // 创建标题
  const listTitle = document.createElement('h4');
  listTitle.textContent = '已识别中国卖家';
  listTitle.style.cssText = `
    margin: 15px 0;
    color: #333;
    font-size: 16px;
    font-weight: bold;
  `;
  sellerListSection.appendChild(listTitle);
  
  // 如果没有卖家
  if (!sellerList || sellerList.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.style.cssText = `
      padding: 15px;
      text-align: center;
      color: #666;
      font-style: italic;
    `;
    emptyMessage.textContent = '暂未识别到中国卖家';
    sellerListSection.appendChild(emptyMessage);
    return;
  }
  
  // 创建卖家列表
  const sellerListEl = document.createElement('ul');
  sellerListEl.style.cssText = `
    list-style: none;
    padding: 0;
    margin: 0 0 15px 0;
  `;
  
  // 添加卖家项
  sellerList.forEach((seller, index) => {
    const sellerItem = document.createElement('li');
    sellerItem.style.cssText = `
      padding: 10px 15px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
      ${index % 2 === 0 ? 'background-color: rgba(0, 0, 0, 0.01);' : ''}
    `;
    
    const sellerName = document.createElement('div');
    sellerName.style.cssText = `
      font-weight: ${seller.confidence > 0.8 ? 'bold' : 'normal'};
      color: ${seller.confidence > 0.8 ? '#ff0055' : '#333'};
    `;
    sellerName.textContent = seller.name || '未知卖家';
    
    const sellerConfidence = document.createElement('div');
    sellerConfidence.style.cssText = `
      font-size: 12px;
      color: #666;
      background-color: rgba(255, 0, 85, ${seller.confidence || 0});
      padding: 2px 8px;
      border-radius: 10px;
      color: white;
    `;
    sellerConfidence.textContent = `${Math.round((seller.confidence || 0) * 100)}%`;
    
    sellerItem.appendChild(sellerName);
    sellerItem.appendChild(sellerConfidence);
    sellerListEl.appendChild(sellerItem);
  });
  
  sellerListSection.appendChild(sellerListEl);
}

/**
 * 添加筛选控制面板
 */
function addFilterControls() {
  console.log('添加筛选控制面板');
  
  // 检查是否已存在
  if (document.getElementById('cn-seller-filter-controls')) {
    console.log('筛选控制面板已存在，不重复添加');
    return;
  }
  
  // 创建筛选控制容器
  const filterContainer = document.createElement('div');
  filterContainer.id = 'cn-seller-filter-controls';
  filterContainer.className = 'cyberpunk-filter-controls';
  
  // 设置容器样式
  filterContainer.style.position = 'sticky';
  filterContainer.style.top = '0';
  filterContainer.style.zIndex = '1000';
  filterContainer.style.width = '100%';
  filterContainer.style.backgroundColor = 'rgba(25, 25, 25, 0.95)';
  filterContainer.style.padding = '10px 20px';
  filterContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
  filterContainer.style.backdropFilter = 'blur(5px)';
  filterContainer.style.borderBottom = '2px solid #ff0055';
  
  // 设置筛选控制面板的内容
  filterContainer.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:15px;">
        <div style="font-size:16px; color:white; font-weight:bold;">
          中国卖家检测
        </div>
        <button id="scan-button" class="cyberpunk-button" style="padding:5px 15px; background-color:#ff0055; border:1px solid #ff0055; color:white; cursor:pointer; border-radius:3px; font-weight:bold;">扫描页面</button>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="filter-all" class="cyberpunk-button" style="padding:5px 15px; background-color:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; cursor:pointer; border-radius:3px;">全部</button>
        <button id="filter-chinese-only" class="cyberpunk-button" style="padding:5px 15px; background-color:rgba(255,0,85,0.1); border:1px solid #ff0055; color:white; cursor:pointer; border-radius:3px;">仅中国卖家</button>
        <button id="filter-hide-chinese" class="cyberpunk-button" style="padding:5px 15px; background-color:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; cursor:pointer; border-radius:3px;">非中国卖家</button>
      </div>
    </div>
  `;
  
  // 添加到页面
  const insertLocation = determineFilterControlsInsertLocation();
  if (insertLocation) {
    insertLocation.parentNode.insertBefore(filterContainer, insertLocation);
  } else {
    // 备用插入位置 - 页面顶部
    document.body.insertBefore(filterContainer, document.body.firstChild);
  }
  
  // 添加扫描按钮事件
  document.getElementById('scan-button').addEventListener('click', () => {
    console.log('用户点击扫描按钮');
    
    // 确保扫描状态容器存在
    const statusContainer = ensureScanStatusContainer();
    
    // 显示扫描状态容器
    statusContainer.style.display = 'block';
    setTimeout(() => {
      statusContainer.style.opacity = '1';
      statusContainer.style.transform = 'translateY(0)';
    }, 10);
    
    // 清除之前的标记并开始新的扫描
    removeAllMarks();
    processSearchPage();
  });
  
  // 添加过滤按钮事件
  document.getElementById('filter-all').addEventListener('click', () => {
    handleFilterButtonClick('all');
  });
  
  document.getElementById('filter-chinese-only').addEventListener('click', () => {
    handleFilterButtonClick('chinese-only');
  });
  
  document.getElementById('filter-hide-chinese').addEventListener('click', () => {
    handleFilterButtonClick('hide-chinese');
  });
  
  // 初始化按钮状态
  updateFilterButtonsState(settings.filterMode || 'all');
  
  console.log('筛选控制面板添加完成');
}

// 确定筛选控制面板的插入位置
function determineFilterControlsInsertLocation() {
  // 尝试查找不同电商网站的顶部导航栏
  
  // Amazon常见的顶部导航选择器
  const possibleSelectors = [
    '.nav-belt',
    '#navbar', 
    '#nav-main', 
    '#navbar-main', 
    '#nav-belt',
    '#nav-subnav',
    '#nav-search',
    '#search',
    '.s-desktop-toolbar',
    '.a-section.a-spacing-small.a-spacing-top-small'
  ];
  
  // 首先尝试找到nav-belt作为首选
  const navBelt = document.querySelector('.nav-belt');
  if (navBelt) {
    console.log('找到.nav-belt作为首选插入位置');
    return navBelt.nextElementSibling;
  }
  
  // 然后尝试其他选择器
  for (const selector of possibleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log(`找到${selector}作为插入位置`);
      return element.nextElementSibling || element;
    }
  }
  
  // 如果所有选择器都失败，找到页面中的第一个主要内容区域
  const mainContent = document.querySelector('main') || document.querySelector('#content') || document.querySelector('.content');
  if (mainContent) {
    console.log('使用主内容区域作为备用插入位置');
    return mainContent;
  }
  
  // 最后的备用方案 - 页面顶部
  console.log('使用页面顶部作为最终备用插入位置');
  return document.body.firstElementChild;
}

/**
 * 处理筛选按钮点击
 * @param {string} mode - 筛选模式：'all', 'chinese-only', 或 'hide-chinese'
 */
function handleFilterButtonClick(mode) {
  console.log(`筛选按钮点击: ${mode}`);
  
  // 保存当前筛选模式到设置中
  settings.filterMode = mode;
  
  // 保存到存储
  chrome.storage.local.set({settings}, () => {
    console.log(`筛选模式已保存: ${mode}`);
  });
  
  // 如果选择的是中国卖家模式，且当前页面是搜索结果页，则触发重新扫描
  if (mode === 'chinese-only' && determinePageType() === 'search') {
    console.log('选择了仅中国卖家模式，准备重新扫描...');
    
    // 先清除之前的标记
    removeAllMarks();
    
    // 然后启动新的扫描
    setTimeout(() => {
      processSearchPage();
    }, 500);
  } else {
    // 其他模式直接应用筛选
    applyFilterMode(mode);
  }
  
  // 更新筛选按钮高亮状态
  updateFilterButtonsState(mode);
  
  // 更新筛选模式显示
  updateCurrentFilterMode(mode);
  
  // 更新统计数据显示 - 查找当前状态容器并刷新
  const statusContainer = document.getElementById('cn-seller-scan-status');
  if (statusContainer) {
    const progressText = statusContainer.querySelector('.scan-progress-text');
    if (progressText) {
      const progressMatch = progressText.textContent.match(/已扫描: (\d+)\/(\d+)/);
      if (progressMatch && progressMatch.length === 3) {
        const current = parseInt(progressMatch[1]);
        const total = parseInt(progressMatch[2]);
        // 重新更新状态以刷新统计数据
        updateScanStatus(false, current, total, mode === 'chinese-only' ? '正在重新扫描...' : '筛选模式已更新', false, Math.round((current / total) * 100));
      }
    }
  }
}

/**
 * 更新筛选按钮状态
 * @param {string} activeMode - 当前激活的筛选模式
 */
function updateFilterButtonsState(activeMode) {
  console.log(`更新筛选按钮状态: ${activeMode}`);
  
  // 获取所有筛选按钮
  const allButton = document.getElementById('filter-all');
  const chineseOnlyButton = document.getElementById('filter-chinese-only');
  const hideChineseButton = document.getElementById('filter-hide-chinese');
  
  if (!allButton || !chineseOnlyButton || !hideChineseButton) {
    console.log('找不到筛选按钮，无法更新状态');
    return;
  }
  
  // 重置所有按钮的状态
  const resetButtons = () => {
    [allButton, chineseOnlyButton, hideChineseButton].forEach(button => {
      button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      button.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      button.style.color = 'white';
      button.style.fontWeight = 'normal';
      button.style.boxShadow = 'none';
    });
  };
  
  // 首先重置所有按钮
  resetButtons();
  
  // 然后设置激活的按钮
  switch (activeMode) {
    case 'all':
      allButton.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
      allButton.style.border = '1px solid #4CAF50';
      allButton.style.color = '#ffffff';
      allButton.style.fontWeight = 'bold';
      allButton.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.5)';
      break;
      
    case 'chinese-only':
      chineseOnlyButton.style.backgroundColor = 'rgba(255, 0, 85, 0.2)';
      chineseOnlyButton.style.border = '1px solid #ff0055';
      chineseOnlyButton.style.color = '#ffffff';
      chineseOnlyButton.style.fontWeight = 'bold';
      chineseOnlyButton.style.boxShadow = '0 0 5px rgba(255, 0, 85, 0.5)';
      break;
      
    case 'hide-chinese':
      hideChineseButton.style.backgroundColor = 'rgba(33, 150, 243, 0.2)';
      hideChineseButton.style.border = '1px solid #2196F3';
      hideChineseButton.style.color = '#ffffff';
      hideChineseButton.style.fontWeight = 'bold';
      hideChineseButton.style.boxShadow = '0 0 5px rgba(33, 150, 243, 0.5)';
      break;
      
    default:
      // 如果没有有效的模式，默认为"全部"
      allButton.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
      allButton.style.border = '1px solid #4CAF50';
      allButton.style.color = '#ffffff';
      allButton.style.fontWeight = 'bold';
      break;
  }
}

/**
 * 更新当前筛选模式显示
 * @param {string} mode - 筛选模式
 */
function updateCurrentFilterMode(mode) {
  const statusContainer = ensureScanStatusContainer();
  if (!statusContainer) return;
  
  let modeText = '全部显示';
  switch (mode) {
    case 'chinese-only':
      modeText = '仅显示中国卖家';
      break;
    case 'hide-chinese':
      modeText = '隐藏中国卖家';
      break;
    default:
      modeText = '全部显示';
  }
  
  // 在状态容器中添加或更新筛选模式信息
  let filterModeInfo = statusContainer.querySelector('.filter-mode-info');
  if (!filterModeInfo) {
    filterModeInfo = document.createElement('div');
    filterModeInfo.className = 'filter-mode-info';
    statusContainer.appendChild(filterModeInfo);
  }
  
  filterModeInfo.textContent = `当前筛选模式: ${modeText}`;
  filterModeInfo.style.marginTop = '10px';
  filterModeInfo.style.color = '#fff';
  filterModeInfo.style.fontWeight = 'bold';
}

/**
 * 应用筛选模式
 * @param {string} mode - 筛选模式 (all, chinese-only, hide-chinese)
 */
function applyFilterMode(mode) {
  console.log(`应用筛选模式: ${mode}`);
  
  // 获取所有已处理的产品卡片
  const cards = document.querySelectorAll('[data-seller-processed="true"]');
  console.log(`应用筛选到 ${cards.length} 个已处理卡片`);
  
  // 根据不同模式应用筛选
  switch (mode) {
    case 'all':
      // 显示所有卡片并恢复默认样式
      cards.forEach(card => {
        const parentElement = findProductCardParent(card);
        if (parentElement) {
          // 显示所有卡片
          parentElement.style.display = '';
          
          // 恢复中国卖家的高亮样式，非中国卖家恢复默认样式
          const sellerType = card.getAttribute('data-seller-type');
          if (sellerType === 'chinese') {
            // 恢复中国卖家的高亮
            parentElement.style.opacity = '1';
            parentElement.style.filter = 'none';
            if (!parentElement.style.border || parentElement.style.border === 'none') {
              parentElement.style.setProperty('--highlight-color', settings.highlightColor || '#ff0055');
              parentElement.style.border = '3px solid var(--highlight-color)';
              parentElement.style.boxShadow = '0 0 12px var(--highlight-color)';
            }
          } else {
            // 确保非中国卖家没有特殊样式
            parentElement.style.opacity = '1';
            parentElement.style.filter = 'none';
          }
        }
      });
      console.log('已显示所有商品卡片，并恢复默认样式');
      break;
      
    case 'chinese-only':
      // 突出显示中国卖家，淡化其他卡片
      cards.forEach(card => {
        const sellerType = card.getAttribute('data-seller-type');
        const parentElement = findProductCardParent(card);
        
        if (parentElement) {
          // 所有卡片都保持可见
          parentElement.style.display = '';
          
          if (sellerType === 'chinese') {
            // 突出显示中国卖家
            parentElement.style.opacity = '1';
            parentElement.style.filter = 'none';
            parentElement.style.zIndex = '2';
            if (!parentElement.style.border || parentElement.style.border === 'none') {
              parentElement.style.setProperty('--highlight-color', settings.highlightColor || '#ff0055');
              parentElement.style.border = '3px solid var(--highlight-color)';
              parentElement.style.boxShadow = '0 0 12px var(--highlight-color)';
            }
          } else {
            // 淡化非中国卖家
            parentElement.style.opacity = '0.4';
            parentElement.style.filter = 'grayscale(80%)';
            parentElement.style.zIndex = '1';
            // 移除边框高亮
            parentElement.style.border = 'none';
            parentElement.style.boxShadow = 'none';
          }
        }
      });
      console.log('已突出显示中国卖家商品，淡化其他商品');
      break;
      
    case 'hide-chinese':
      // 突出显示非中国卖家，淡化中国卖家
      cards.forEach(card => {
        const sellerType = card.getAttribute('data-seller-type');
        const parentElement = findProductCardParent(card);
        
        if (parentElement) {
          // 所有卡片都保持可见
          parentElement.style.display = '';
          
          if (sellerType === 'chinese') {
            // 淡化中国卖家
            parentElement.style.opacity = '0.4';
            parentElement.style.filter = 'grayscale(80%)';
            parentElement.style.zIndex = '1';
            // 保留边框但减弱显示
            if (parentElement.style.border) {
              parentElement.style.border = '1px solid var(--highlight-color, #ff0055)';
              parentElement.style.boxShadow = 'none';
            }
          } else {
            // 突出显示非中国卖家
            parentElement.style.opacity = '1';
            parentElement.style.filter = 'none';
            parentElement.style.zIndex = '2';
            // 清除边框，保持干净外观
            parentElement.style.border = 'none';
            parentElement.style.boxShadow = 'none';
          }
        }
      });
      console.log('已突出显示非中国卖家商品，淡化中国卖家商品');
      break;
  }
  
  console.log('筛选模式应用完成');
}

/**
 * 查找产品卡片的父元素（用于显示/隐藏整个产品）
 * @param {Element} card - 产品卡片元素
 * @return {Element} 父元素
 */
function findProductCardParent(card) {
  // 尝试查找不同层级的父元素，直到找到可能的产品容器
  let current = card;
  let parent = null;
  
  // 亚马逊常见的产品父容器选择器
  const possibleParentSelectors = [
    '.s-result-item',
    '.sg-col-4-of-12',
    '.sg-col-4-of-16',
    '.sg-col-4-of-20',
    '.sg-col',
    '.a-spacing-base'
  ];
  
  // 向上查找5层，寻找匹配的父元素
  for (let i = 0; i < 5; i++) {
    if (!current.parentElement) break;
    current = current.parentElement;
    
    // 检查是否匹配任何可能的父容器选择器
    for (const selector of possibleParentSelectors) {
      if (current.matches(selector)) {
        parent = current;
        break;
      }
    }
    
    if (parent) break;
  }
  
  // 如果找不到特定父元素，返回卡片本身
  return parent || card;
}

/**
 * 在产品卡片上标记中国卖家
 * @param {Element} card - 产品卡片元素
 */
function markChineseSeller(card) {
  try {
    // 检查卡片是否已处理过
    if (card.dataset.processed === 'true') {
      return;
    }
    
    // 标记卡片为已处理
    card.dataset.processed = 'true';
    
    // 获取卡片ID
    const cardId = Date.now() + '-' + Math.floor(Math.random() * 10000);
    card.dataset.cardId = cardId;
    
    // 添加产品URL到数据集
    let productUrl = '';
    const titleElement = card.querySelector('h2 a, h5 a, .a-size-base-plus a, .a-size-mini a, [data-cy="title-recipe"] a');
    
    if (titleElement && titleElement.href) {
      productUrl = titleElement.href;
      card.dataset.productUrl = productUrl;
      
      // 提取ASIN
      const asinMatch = productUrl.match(/\/([A-Z0-9]{10})(?:\/|\?|$)/);
      if (asinMatch && asinMatch[1]) {
        card.dataset.asin = asinMatch[1];
      }
    }
    
    // 获取卖家名称和原始卖家元素
    let sellerElement = null;
    let sellerName = null;
    
    // 卖家元素可能出现在不同位置
    const sellerSelectors = [
      '.a-row .a-size-base:not([class*="a-color-price"]):not([class*="a-text-price"])',
      '.a-row [data-cy="seller-name"]',
      '.a-row .a-size-small:not([class*="a-color-price"]):not([class*="a-text-price"])',
      '.a-row .a-size-base-plus:not([class*="a-color-price"]):not([class*="a-text-price"])',
      '.a-row a[href*="seller="]',
      '.s-seller-details',
      '[data-component-type="s-seller-data"]',
      '.a-row:nth-child(2) span.a-size-small',
      '.s-title-instructions-style span',
      '.a-box-inner .a-row:not([class*="a-price"])',
      // 新增选择器
      '.a-row:has(a[href*="seller="])',
      '.a-section:has(a[href*="seller="])',
      '.s-productinfo-block',
      '[data-cy="seller-name"]',
      '[data-feature-name="seller"]'
    ];
    
    for (const selector of sellerSelectors) {
      const elements = card.querySelectorAll(selector);
      
      for (const element of elements) {
        // 忽略价格和评分元素
        if (
          element.textContent.includes('$') || 
          element.textContent.includes('€') ||
          element.textContent.includes('£') ||
          element.textContent.includes('stars') ||
          element.textContent.includes('rating') ||
          element.className.includes('price') ||
          element.className.includes('stars') ||
          element.className.includes('rating') ||
          element.parentElement.className.includes('price') ||
          element.parentElement.className.includes('stars') ||
          element.parentElement.className.includes('rating')
        ) {
          continue;
        }
        
        // 查找包含"by"的文本，这通常表示卖家信息
        const text = element.textContent.trim();
        const byMatch = text.match(/(?:sold|Ships|by|from)[\s:]+([^|.]+)(?:\||.|$)/i);
        
        if (byMatch && byMatch[1]) {
          sellerName = byMatch[1].trim();
          sellerElement = element;
          break;
        }
        
        // 尝试查找卖家链接
        const sellerLink = element.querySelector('a[href*="seller="]');
        if (sellerLink) {
          sellerName = sellerLink.textContent.trim();
          sellerElement = element;
          
          // 提取卖家ID
          const sellerIdMatch = sellerLink.href.match(/seller=([A-Z0-9]+)/i);
          if (sellerIdMatch && sellerIdMatch[1]) {
            card.dataset.sellerId = sellerIdMatch[1];
          }
          
          break;
        }
      }
      
      if (sellerName) break;
    }
    
    // 如果找不到卖家名称，尝试从整个卡片中提取
    if (!sellerName) {
      // 尝试从卡片文本提取卖家信息
      const cardText = card.textContent;
      const byMatches = [
        ...cardText.matchAll(/(?:sold|ship|by|from)[\s:]+([^\n|.]+)(?:\||.|$)/gi)
      ];
      
      for (const match of byMatches) {
        if (match[1] && match[1].trim() && !match[1].includes('$') && !match[1].includes('€') && !match[1].includes('£')) {
          sellerName = match[1].trim();
          break;
        }
      }
    }
    
    // 如果没有找到卖家信息，尝试通过商品页面获取
    if (!sellerName && productUrl) {
      card.dataset.pendingSellerInfo = 'true';
      
      const fetchDelay = Math.floor(Math.random() * 1000) + 500; // 添加随机延迟，避免频繁请求
      
      setTimeout(async () => {
        try {
          // 避免重复提取
          if (card.dataset.sellerInfoFetched === 'true') return;
          card.dataset.sellerInfoFetched = 'true';
          
          console.log(`通过商品页面获取卖家信息: ${productUrl}`);
          const sellerInfo = await fetchSellerInfoFromProductPage(productUrl);
          
          if (sellerInfo && sellerInfo.sellerName) {
            sellerName = sellerInfo.sellerName;
            card.dataset.sellerName = sellerName;
            
            if (sellerInfo.sellerId) {
              card.dataset.sellerId = sellerInfo.sellerId;
            }
            
            if (sellerInfo.sellerUrl) {
              card.dataset.sellerUrl = sellerInfo.sellerUrl;
            }
            
            if (sellerInfo.isConfirmedChinese) {
              card.dataset.isConfirmedChinese = 'true';
            }
            
            // 重新检查是否为中国卖家
            const sellerDetector = window.SellerDetector.getInstance();
            const isChineseSeller = sellerDetector.isChineseSeller(sellerName, sellerInfo);
            
            if (isChineseSeller) {
              card.dataset.chineseSeller = 'true';
              
              // 更新统计和UI
              const features = getChineseFeatures(sellerName, sellerInfo);
              card.dataset.features = features.join(', ');
              
              // 添加可视化标记
              addVisualMarker(card, sellerName, features, sellerInfo);
              
              // 更新卖家列表
              updateSellerListInPanel(cardId, sellerName, card.dataset.asin);
            }
          }
        } catch (error) {
          console.error('通过商品页面获取卖家信息时出错:', error);
        }
      }, fetchDelay);
      
      return;
    }
    
    // 如果找到卖家名称，记录并检查是否为中国卖家
    if (sellerName) {
      card.dataset.sellerName = sellerName;
      
      // 检查是否为中国卖家
      const sellerDetector = window.SellerDetector.getInstance();
      const isChineseSeller = sellerDetector.isChineseSeller(sellerName);
      
      // 如果是中国卖家，标记卡片并应用视觉样式
      if (isChineseSeller) {
        card.dataset.chineseSeller = 'true';
        
        // 获取中国特征并存储
        const features = getChineseFeatures(sellerName);
        card.dataset.features = features.join(', ');
        
        // 添加可视化标记
        addVisualMarker(card, sellerName, features);
        
        // 更新卖家列表
        updateSellerListInPanel(cardId, sellerName, card.dataset.asin);
      }
    }
  } catch (error) {
    console.error('标记中国卖家时出错:', error);
  }
}

// 添加可视化标记到卡片
function addVisualMarker(card, sellerName, features, sellerInfo) {
  try {
    // 确保不会重复添加标记
    if (card.querySelector('.chinese-seller-marker')) {
      return;
    }
    
    // 创建标记元素
    const marker = document.createElement('div');
    marker.className = 'chinese-seller-marker';
    marker.style.backgroundColor = '#ffdddd';
    marker.style.border = '2px solid #ff6666';
    marker.style.borderRadius = '4px';
    marker.style.padding = '4px 8px';
    marker.style.margin = '4px 0';
    marker.style.fontSize = '13px';
    marker.style.fontWeight = 'bold';
    marker.style.color = '#cc0000';
    marker.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
    marker.style.position = 'relative';
    marker.style.zIndex = '10';
    marker.style.display = 'flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'space-between';
    
    // 确定信心级别并显示信息
    let confidence = 'middle';
    let confidenceIcon = '⚠️';
    
    if (sellerInfo && sellerInfo.confidence) {
      if (sellerInfo.confidence >= 0.9) {
        confidence = 'high';
        confidenceIcon = '🔴';
      } else if (sellerInfo.confidence >= 0.7) {
        confidence = 'middle';
        confidenceIcon = '⚠️';
      } else {
        confidence = 'low';
        confidenceIcon = '❓';
      }
    }
    
    // 创建主要信息
    const infoDiv = document.createElement('div');
    infoDiv.style.display = 'flex';
    infoDiv.style.alignItems = 'center';
    infoDiv.style.flex = '1';
    
    // 添加信心图标
    const iconSpan = document.createElement('span');
    iconSpan.textContent = confidenceIcon;
    iconSpan.style.marginRight = '6px';
    iconSpan.style.fontSize = '16px';
    infoDiv.appendChild(iconSpan);
    
    // 添加卖家信息
    const textSpan = document.createElement('span');
    textSpan.textContent = `中国卖家: ${sellerName}`;
    infoDiv.appendChild(textSpan);
    
    // 添加详情按钮
    const detailsButton = document.createElement('button');
    detailsButton.textContent = '详情';
    detailsButton.style.marginLeft = '8px';
    detailsButton.style.padding = '2px 6px';
    detailsButton.style.backgroundColor = '#f0f0f0';
    detailsButton.style.border = '1px solid #ccc';
    detailsButton.style.borderRadius = '3px';
    detailsButton.style.cursor = 'pointer';
    detailsButton.style.fontSize = '11px';
    
    // 添加详情按钮事件
    detailsButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // 显示详情面板
      showSellerDetailPanel(sellerName, sellerInfo, card.dataset.asin, card.dataset.cardId);
    });
    
    marker.appendChild(infoDiv);
    marker.appendChild(detailsButton);
    
    // 寻找适合插入标记的位置
    const insertPositions = [
      card.querySelector('h2'),
      card.querySelector('.a-price'),
      card.querySelector('.a-row:first-child'),
      card.querySelector('.s-title-instructions-style'),
      card.querySelector('.a-section'),
      card
    ];
    
    let inserted = false;
    for (const position of insertPositions) {
      if (position) {
        position.insertAdjacentElement('afterend', marker);
        inserted = true;
        break;
      }
    }
    
    // 如果无法找到合适的位置，直接附加到卡片末尾
    if (!inserted) {
      card.appendChild(marker);
    }
    
    // 视觉上强调整个卡片
    card.style.position = 'relative';
    
    // 添加卡片边框
    const border = document.createElement('div');
    border.className = 'chinese-seller-border';
    border.style.position = 'absolute';
    border.style.top = '0';
    border.style.left = '0';
    border.style.right = '0';
    border.style.bottom = '0';
    border.style.pointerEvents = 'none';
    border.style.border = '3px solid #ff6666';
    border.style.borderRadius = '4px';
    border.style.zIndex = '2';
    
    // 确保不会重复添加边框
    if (!card.querySelector('.chinese-seller-border')) {
      card.appendChild(border);
    }
    
  } catch (error) {
    console.error('添加可视化标记时出错:', error);
  }
}

/**
 * 更新状态面板中的卖家列表
 * @param {string} cardId - 卡片ID
 * @param {string} sellerName - 卖家名称
 * @param {string} asin - 产品ASIN
 */
function updateSellerListInPanel(cardId, sellerName, asin) {
  // 获取或创建卖家列表容器
  const statusContainer = document.getElementById('cn-seller-scan-status');
  if (!statusContainer) return;
  
  let sellerListSection = statusContainer.querySelector('.seller-list-section');
  if (!sellerListSection) {
    sellerListSection = document.createElement('div');
    sellerListSection.className = 'seller-list-section';
    sellerListSection.style.marginTop = '15px';
    sellerListSection.style.borderTop = '1px solid #eee';
    sellerListSection.style.paddingTop = '10px';
    sellerListSection.style.maxHeight = '300px';
    sellerListSection.style.overflowY = 'auto';
    
    // 创建标题
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    title.textContent = '已识别中国卖家列表:';
    sellerListSection.appendChild(title);
    
    // 创建卖家列表容器
    const listContainer = document.createElement('div');
    listContainer.className = 'seller-list-container';
    sellerListSection.appendChild(listContainer);
    
    // 添加到状态容器
    statusContainer.appendChild(sellerListSection);
  }
  
  // 获取卖家列表容器
  const listContainer = sellerListSection.querySelector('.seller-list-container');
  
  // 检查是否已存在此卖家
  const existingItem = listContainer.querySelector(`[data-card-id="${cardId}"]`);
  if (existingItem) return;
  
  // 创建卖家列表项
  const listItem = document.createElement('div');
  listItem.className = 'seller-list-item';
  listItem.setAttribute('data-card-id', cardId);
  listItem.setAttribute('data-asin', asin);
  listItem.style.padding = '5px 0';
  listItem.style.display = 'flex';
  listItem.style.justifyContent = 'space-between';
  listItem.style.alignItems = 'center';
  listItem.style.borderBottom = '1px solid #f0f0f0';
  
  // 设置卖家名称
  const nameSpan = document.createElement('span');
  nameSpan.textContent = sellerName.length > 20 ? sellerName.substring(0, 20) + '...' : sellerName;
  nameSpan.title = sellerName;
  nameSpan.style.overflow = 'hidden';
  nameSpan.style.textOverflow = 'ellipsis';
  nameSpan.style.whiteSpace = 'nowrap';
  nameSpan.style.flex = '1';
  
  // 创建跳转按钮
  const jumpButton = document.createElement('button');
  jumpButton.textContent = '跳转';
  jumpButton.style.background = 'var(--highlight-color, #ff0055)';
  jumpButton.style.color = 'white';
  jumpButton.style.border = 'none';
  jumpButton.style.borderRadius = '3px';
  jumpButton.style.padding = '3px 8px';
  jumpButton.style.marginLeft = '10px';
  jumpButton.style.cursor = 'pointer';
  jumpButton.style.fontSize = '12px';
  jumpButton.style.fontWeight = 'bold';
  
  // 添加跳转功能
  jumpButton.onclick = function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    // 查找对应元素
    const targetElement = document.getElementById(cardId);
    if (targetElement) {
      // 平滑滚动到目标位置
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // 添加高亮效果
      targetElement.style.transition = 'box-shadow 0.5s ease';
      const originalBoxShadow = targetElement.style.boxShadow;
      targetElement.style.boxShadow = '0 0 30px var(--highlight-color, #ff0055)';
      
      // 恢复原来的阴影
      setTimeout(() => {
        targetElement.style.boxShadow = originalBoxShadow;
      }, 2000);
    }
  };
  
  // 组合元素
  listItem.appendChild(nameSpan);
  listItem.appendChild(jumpButton);
  
  // 添加到列表
  listContainer.appendChild(listItem);
}

/**
 * 显示卖家详细信息面板
 * @param {string} sellerName - 卖家名称
 * @param {string} sellerInfo - 卖家信息
 * @param {string} asin - 产品ASIN
 * @param {string} cardId - 卡片ID
 */
function showSellerDetailPanel(sellerName, sellerInfo, asin, cardId) {
  try {
    console.log('[详情] 显示卖家详情面板:', sellerName);
    
    // 如果已存在详情面板，先移除它
    let existingPanel = document.getElementById('seller-detail-panel');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    // 创建详情面板
    const panel = document.createElement('div');
    panel.id = 'seller-detail-panel';
    panel.style.position = 'fixed';
    panel.style.top = '80px';
    panel.style.right = '20px';
    panel.style.width = '350px';
    panel.style.maxHeight = '80vh';
    panel.style.overflowY = 'auto';
    panel.style.backgroundColor = 'white';
    panel.style.borderRadius = '8px';
    panel.style.padding = '15px';
    panel.style.boxShadow = '0 5px 30px rgba(0,0,0,0.4)';
    panel.style.zIndex = '10000';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.style.border = '3px solid var(--highlight-color, #ff0055)';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(50px)';
    panel.style.transition = 'all 0.3s ease-out';
    
    // 添加关闭按钮
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '10px';
    closeButton.style.background = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.lineHeight = '24px';
    closeButton.style.color = '#444';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.width = '30px';
    closeButton.style.height = '30px';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.borderRadius = '50%';
    closeButton.style.transition = 'all 0.2s';
    
    closeButton.addEventListener('mouseover', () => {
      closeButton.style.background = '#f0f0f0';
      closeButton.style.color = 'var(--highlight-color, #ff0055)';
    });
    
    closeButton.addEventListener('mouseout', () => {
      closeButton.style.background = 'transparent';
      closeButton.style.color = '#444';
    });
    
    closeButton.addEventListener('click', () => {
      panel.style.opacity = '0';
      panel.style.transform = 'translateX(50px)';
      setTimeout(() => panel.remove(), 300);
    });
    
    panel.appendChild(closeButton);
    
    // 添加标题
    const title = document.createElement('h2');
    title.textContent = '中国卖家详情';
    title.style.color = 'var(--highlight-color, #ff0055)';
    title.style.marginTop = '0';
    title.style.borderBottom = '2px solid #eee';
    title.style.paddingBottom = '10px';
    title.style.fontSize = '18px';
    panel.appendChild(title);
    
    // 添加卖家信息
    const infoContainer = document.createElement('div');
    infoContainer.style.marginBottom = '15px';
    infoContainer.style.lineHeight = '1.5';
    
    // 卖家名称
    const nameRow = document.createElement('div');
    nameRow.innerHTML = `<strong>卖家名称:</strong> <span style="word-break: break-word;">${sellerName}</span>`;
    nameRow.style.marginBottom = '8px';
    infoContainer.appendChild(nameRow);
    
    // ASIN
    const asinRow = document.createElement('div');
    asinRow.innerHTML = `<strong>商品ASIN:</strong> <a href="https://www.amazon.com/dp/${asin}" target="_blank" style="color: var(--highlight-color, #ff0055); text-decoration: none;">${asin}</a>`;
    asinRow.style.marginBottom = '8px';
    infoContainer.appendChild(asinRow);
    
    // 中国特征
    const chineseFeatures = getChineseFeatures(sellerName, sellerInfo);
    if (chineseFeatures.length > 0) {
      const featuresRow = document.createElement('div');
      featuresRow.innerHTML = `<strong>中国特征:</strong>`;
      featuresRow.style.marginBottom = '5px';
      
      const featuresList = document.createElement('ul');
      featuresList.style.margin = '5px 0 8px 20px';
      featuresList.style.padding = '0';
      
      chineseFeatures.forEach(feature => {
        const featureItem = document.createElement('li');
        featureItem.textContent = feature;
        featureItem.style.margin = '5px 0';
        featuresList.appendChild(featureItem);
      });
      
      featuresRow.appendChild(featuresList);
      infoContainer.appendChild(featuresRow);
    }
    
    panel.appendChild(infoContainer);
    
    // 添加导航按钮
    const navButtonsContainer = document.createElement('div');
    navButtonsContainer.style.display = 'flex';
    navButtonsContainer.style.justifyContent = 'space-between';
    navButtonsContainer.style.marginBottom = '15px';
    
    // 跳转到卡片按钮
    const goToCardButton = document.createElement('button');
    goToCardButton.textContent = '跳转到商品';
    goToCardButton.className = 'action-button';
    goToCardButton.addEventListener('click', () => {
      const targetCard = document.getElementById(cardId);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 高亮闪烁效果
        targetCard.style.animation = 'highlight-pulse 1s 3';
        
        // 仅当样式不存在时添加
        if (!document.getElementById('highlight-pulse-style')) {
          const style = document.createElement('style');
          style.id = 'highlight-pulse-style';
          style.textContent = `
            @keyframes highlight-pulse {
              0% { box-shadow: 0 0 10px var(--highlight-color, #ff0055); }
              50% { box-shadow: 0 0 30px var(--highlight-color, #ff0055); }
              100% { box-shadow: 0 0 10px var(--highlight-color, #ff0055); }
            }
          `;
          document.head.appendChild(style);
        }
      }
    });
    
    // 查看卖家商店按钮
    const viewStoreButton = document.createElement('button');
    viewStoreButton.textContent = '查看卖家商店';
    viewStoreButton.className = 'action-button';
    
    // 构建卖家商店链接
    const encodedSellerName = encodeURIComponent(sellerName);
    const sellerStoreUrl = `https://www.amazon.com/s?i=merchant-items&me=${encodedSellerName}`;
    
    viewStoreButton.addEventListener('click', () => {
      window.open(sellerStoreUrl, '_blank');
    });
    
    // 添加按钮样式
    const buttonStyle = document.createElement('style');
    buttonStyle.textContent = `
      .action-button {
        padding: 8px 12px;
        border: none;
        border-radius: 5px;
        background-color: var(--highlight-color, #ff0055);
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .action-button:hover {
        filter: brightness(110%);
        transform: translateY(-2px);
      }
      
      .action-button:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(buttonStyle);
    
    navButtonsContainer.appendChild(goToCardButton);
    navButtonsContainer.appendChild(viewStoreButton);
    panel.appendChild(navButtonsContainer);
    
    // 添加卖家列表
    const sellerListContainer = document.createElement('div');
    sellerListContainer.id = 'seller-list-container';
    panel.appendChild(sellerListContainer);
    
    // 添加到页面
    document.body.appendChild(panel);
    
    // 显示动画
    setTimeout(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
    }, 10);
    
    return panel;
  } catch (error) {
    console.error('[详情] 显示卖家详情面板时出错:', error);
    return null;
  }
}

// 获取卖家的中国特征
function getChineseFeatures(sellerName, sellerInfo) {
  try {
    if (!sellerName) return [];
    
    const features = [];
    const normalizedName = sellerName.toLowerCase();
    
    // 检查卖家名称中是否有中文字符
    if (/[\u4e00-\u9fff]/.test(sellerName)) {
      features.push('中文字符');
    }
    
    // 检查是否包含常见中国城市名称
    const chineseCities = [
      'shenzhen', 'guangzhou', 'shanghai', 'beijing', 'hangzhou', 
      'yiwu', 'ningbo', 'dongguan', 'foshan', 'xiamen', 'chengdu',
      'nanjing', 'tianjin', 'wuhan', 'chongqing', 'zhongshan',
      'suzhou', 'qingdao', 'dalian', 'guangdong', 'fujian', 'zhejiang'
    ];
    
    for (const city of chineseCities) {
      if (normalizedName.includes(city)) {
        features.push(`包含城市名"${city}"`);
        break;
      }
    }
    
    // 检查卖家名称格式是否符合中国卖家特征
    const chinesePatterns = [
      /^[a-z0-9]+(yiwu|china|cn|beijing|shanghai|shen[zs]hen|guang[zs]hou|hang[zs]hou|ningbo)[a-z0-9]*$/i,
      /^cn[-_]?\w+/i,
      /^zh[-_]?\w+/i,
      /^china[-_]?\w+/i,
      /\w+[-_]?cn$/i,
      /\w+[-_]?zh$/i,
      /\w+[-_]?china$/i,
      /^[a-z]+(?:trading|store|shop|tech|electronics|home|official|direct|factory|wholesale|mall)\d*$/i,
    ];
    
    for (const pattern of chinesePatterns) {
      if (pattern.test(normalizedName)) {
        features.push('特征命名模式');
        break;
      }
    }
    
    // 检查卖家详细信息（如果有）
    if (sellerInfo) {
      // 检查是否已确认为中国卖家
      if (sellerInfo.isConfirmedChinese) {
        features.push('已确认为中国卖家');
      }
      
      // 检查卖家国家
      if (sellerInfo.sellerCountry === 'China') {
        features.push('国家为中国');
      }
      
      // 检查企业名称中是否包含中国特征
      if (sellerInfo.businessName) {
        if (/[\u4e00-\u9fff]/.test(sellerInfo.businessName)) {
          features.push('企业名称包含中文');
        }
        if (/(shenzhen|guangzhou|shanghai|beijing|china)/i.test(sellerInfo.businessName)) {
          features.push('企业名称包含中国地名');
        }
      }
      
      // 检查企业地址
      if (sellerInfo.businessAddress) {
        if (/[\u4e00-\u9fff]/.test(sellerInfo.businessAddress)) {
          features.push('企业地址包含中文');
        }
        if (/(china|cn|中国|广东|浙江|深圳|上海|北京)/i.test(sellerInfo.businessAddress)) {
          features.push('企业地址位于中国');
        }
      }
    }
    
    return features;
  } catch (error) {
    console.error('分析卖家特征时出错:', error);
    return [];
  }
}

// 更新卖家列表面板
function updateSellerListInPanel(cardId, sellerName, asin) {
  try {
    // 查找或创建卖家列表
    let sellerList = document.getElementById('cn-seller-list');
    
    // 如果列表不存在但面板存在，则在面板中创建列表
    if (!sellerList) {
      const panel = document.getElementById('seller-detail-panel');
      if (panel) {
        sellerList = document.createElement('div');
        sellerList.id = 'cn-seller-list';
        sellerList.style.fontSize = '14px';
        
        const sellerListContainer = panel.querySelector('#seller-list-container') || panel;
        sellerListContainer.appendChild(sellerList);
      } else {
        // 如果面板不存在，无法更新列表
        return false;
      }
    }
    
    // 检查该卖家是否已在列表中
    const existingItem = document.getElementById(`seller-list-item-${asin}`);
    if (existingItem) {
      return true; // 已存在，不重复添加
    }
    
    // 创建新的卖家列表项
    const listItem = document.createElement('div');
    listItem.id = `seller-list-item-${asin}`;
    listItem.className = 'seller-list-item';
    listItem.style.padding = '8px 10px';
    listItem.style.borderBottom = '1px solid #eee';
    listItem.style.cursor = 'pointer';
    listItem.style.transition = 'all 0.2s';
    
    // 高亮当前选择的卖家
    if (document.getElementById('seller-detail-panel')?.getAttribute('data-current-asin') === asin) {
      listItem.style.backgroundColor = '#fff0f5';
    }
    
    // 添加鼠标悬停效果
    listItem.addEventListener('mouseenter', () => {
      listItem.style.backgroundColor = '#fff0f5';
    });
    
    listItem.addEventListener('mouseleave', () => {
      if (document.getElementById('seller-detail-panel')?.getAttribute('data-current-asin') !== asin) {
        listItem.style.backgroundColor = 'transparent';
      }
    });
    
    // 点击跳转到对应的商品卡片
    listItem.addEventListener('click', () => {
      const targetCard = document.getElementById(cardId);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 高亮闪烁效果
        targetCard.style.animation = 'highlight-pulse 1s 3';
      }
      
      // 更新当前选中的卖家
      const panel = document.getElementById('seller-detail-panel');
      if (panel) {
        panel.setAttribute('data-current-asin', asin);
        
        // 更新所有列表项的背景色
        const allItems = document.querySelectorAll('.seller-list-item');
        allItems.forEach(item => {
          item.style.backgroundColor = 'transparent';
        });
        
        // 高亮当前选中项
        listItem.style.backgroundColor = '#fff0f5';
      }
    });
    
    // 设置列表项内容
    listItem.textContent = sellerName.length > 30 ? sellerName.substring(0, 30) + '...' : sellerName;
    listItem.title = sellerName;
    
    // 添加到列表
    sellerList.appendChild(listItem);
    
    return true;
  } catch (error) {
    console.error('[列表] 更新卖家列表时出错:', error);
    return false;
  }
}

// 查找产品卡片的父容器
function findProductCardParent(card) {
  try {
    if (!card) return null;
    
    // 尝试查找合适的父容器
    // 首先尝试最近的带有一些常见产品卡片类或属性的父元素
    let parent = card;
    
    // 按照常见的产品卡片容器类名向上查找
    const commonParentSelectors = [
      'data-component-type="s-search-result"',
      'data-asin',
      'data-uuid',
      'data-component-id',
      'class="s-result-item"',
      'class="sg-col-4-of-12"',
      'class="sg-col-4-of-16"',
      'class="a-section"'
    ];
    
    // 只向上查找最多5层，避免过度查找
    let depth = 0;
    while (parent && depth < 5) {
      let foundMatch = false;
      
      // 检查当前元素是否有匹配的选择器
      for (const selector of commonParentSelectors) {
        const attributeName = selector.split("=")[0].trim();
        const attributeValue = selector.split("=")[1]?.replace(/"/g, '').trim();
        
        if (attributeValue) {
          // 如果是类名选择器
          if (attributeName === 'class') {
            if (parent.classList.contains(attributeValue)) {
              foundMatch = true;
              break;
            }
          } else if (parent.hasAttribute(attributeName)) {
            // 如果是其他属性选择器
            foundMatch = true;
            break;
          }
        }
      }
      
      if (foundMatch) {
        return parent;
      }
      
      // 向上找父元素
      if (parent.parentElement) {
        parent = parent.parentElement;
        depth++;
      } else {
        break;
      }
    }
    
    // 如果没有找到合适的父容器，返回原始元素
    return card;
  } catch (error) {
    console.error('[查找] 查找产品卡片父容器时出错:', error);
    return card;
  }
}

// 显示扫描完成统计数据面板
function showScanCompletedPanel(stats) {
  try {
    console.log('[完成] 显示扫描完成统计面板');
    
    // 移除可能已存在的完成面板
    const existingPanel = document.getElementById('scan-completed-panel');
    if (existingPanel) {
      existingPanel.remove();
    }
    
    // 获取统计数据
    const totalProcessed = stats.totalProcessed || 0;
    const chineseSellerCount = stats.chineseSellerCount || 0;
    const percentage = stats.percentage || 0;
    
    // 创建面板
    const panel = document.createElement('div');
    panel.id = 'scan-completed-panel';
    panel.style.position = 'fixed';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%) scale(0.9)';
    panel.style.backgroundColor = 'white';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.5)';
    panel.style.padding = '25px';
    panel.style.minWidth = '350px';
    panel.style.maxWidth = '450px';
    panel.style.zIndex = '10000';
    panel.style.opacity = '0';
    panel.style.transition = 'all 0.3s ease-out';
    panel.style.border = '3px solid var(--highlight-color, #ff0055)';
    panel.style.textAlign = 'center';
    panel.style.fontFamily = 'Arial, sans-serif';
    
    // 标题
    const title = document.createElement('h2');
    title.textContent = '扫描完成';
    title.style.color = 'var(--highlight-color, #ff0055)';
    title.style.margin = '0 0 20px 0';
    title.style.fontSize = '22px';
    panel.appendChild(title);
    
    // 结果图标
    const resultIcon = document.createElement('div');
    resultIcon.innerHTML = chineseSellerCount > 0 ? 
      '<div style="font-size: 48px; margin: 10px 0;">🔍</div>' : 
      '<div style="font-size: 48px; margin: 10px 0;">✅</div>';
    panel.appendChild(resultIcon);
    
    // 结果文本
    const resultText = document.createElement('div');
    resultText.style.fontSize = '18px';
    resultText.style.margin = '10px 0 20px 0';
    resultText.style.fontWeight = 'bold';
    
    if (chineseSellerCount > 0) {
      resultText.textContent = `发现了 ${chineseSellerCount} 个中国卖家`;
      resultText.style.color = 'var(--highlight-color, #ff0055)';
    } else {
      resultText.textContent = '没有发现中国卖家';
      resultText.style.color = '#4caf50';
    }
    panel.appendChild(resultText);
    
    // 详细统计信息
    const statsContainer = document.createElement('div');
    statsContainer.style.backgroundColor = '#f8f8f8';
    statsContainer.style.borderRadius = '5px';
    statsContainer.style.padding = '15px';
    statsContainer.style.margin = '10px 0 20px 0';
    statsContainer.style.textAlign = 'left';
    statsContainer.style.fontSize = '14px';
    statsContainer.style.lineHeight = '1.6';
    
    statsContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>总共扫描:</span>
        <span>${totalProcessed} 个产品</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>中国卖家:</span>
        <span style="color: var(--highlight-color, #ff0055); font-weight: bold;">
          ${chineseSellerCount} 个
        </span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>占比:</span>
        <span style="font-weight: bold;">${percentage}%</span>
      </div>
    `;
    panel.appendChild(statsContainer);
    
    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '15px';
    
    // 返回按钮
    const closeButton = document.createElement('button');
    closeButton.textContent = '关闭';
    closeButton.className = 'scan-action-button close-button';
    closeButton.addEventListener('click', () => {
      panel.style.opacity = '0';
      panel.style.transform = 'translate(-50%, -50%) scale(0.9)';
      setTimeout(() => panel.remove(), 300);
    });
    
    // 筛选按钮
    const filterButton = document.createElement('button');
    filterButton.textContent = chineseSellerCount > 0 ? '仅显示中国卖家' : '显示所有产品';
    filterButton.className = 'scan-action-button filter-button';
    filterButton.addEventListener('click', () => {
      if (chineseSellerCount > 0) {
        applyFilterMode('chinese');
        settings.filterMode = 'chinese';
      } else {
        applyFilterMode('all');
        settings.filterMode = 'all';
      }
      
      // 保存设置
      try {
        if (chrome && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.set({ filterMode: settings.filterMode });
        }
      } catch (error) {
        console.error('[完成] 保存筛选设置时出错:', error);
      }
      
      // 关闭面板
      panel.style.opacity = '0';
      panel.style.transform = 'translate(-50%, -50%) scale(0.9)';
      setTimeout(() => panel.remove(), 300);
    });
    
    // 添加按钮样式
    const style = document.createElement('style');
    style.textContent = `
      .scan-action-button {
        padding: 10px 16px;
        border: none;
        border-radius: 5px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 14px;
      }
      
      .close-button {
        background-color: #f0f0f0;
        color: #333;
      }
      
      .close-button:hover {
        background-color: #e0e0e0;
      }
      
      .filter-button {
        background-color: var(--highlight-color, #ff0055);
        color: white;
      }
      
      .filter-button:hover {
        filter: brightness(110%);
      }
    `;
    document.head.appendChild(style);
    
    buttonContainer.appendChild(closeButton);
    buttonContainer.appendChild(filterButton);
    panel.appendChild(buttonContainer);
    
    // 添加到页面
    document.body.appendChild(panel);
    
    // 显示动画
    setTimeout(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 10);
    
    // 自动关闭面板（15秒后）
    setTimeout(() => {
      if (document.getElementById('scan-completed-panel')) {
        panel.style.opacity = '0';
        panel.style.transform = 'translate(-50%, -50%) scale(0.9)';
        setTimeout(() => {
          if (document.getElementById('scan-completed-panel')) {
            panel.remove();
          }
        }, 300);
      }
    }, 15000);
    
    return panel;
  } catch (error) {
    console.error('[完成] 显示扫描完成面板时出错:', error);
    return null;
  }
}

// 获取当前页面上的产品卡片
function getProductCards() {
  try {
    // 根据页面类型选择合适的选择器
    const pageType = determinePageType();
    let cardSelectors = [];
    
    if (pageType === 'search') {
      // 搜索结果页面的产品卡片选择器
      cardSelectors = [
        '.s-result-item[data-component-type="s-search-result"]',
        '.s-result-item:not(.AdHolder)',
        '.sg-col-4-of-24.sg-col-4-of-12',
        '.sg-col-4-of-20',
        'div[data-asin]:not([data-asin=""])',
        'div[data-uuid]:not([data-uuid=""])',
        'div[data-component-type="s-search-result"]',
        '.s-shopping-adviser',
        // 新增选择器，处理更多情况
        '.a-section.a-spacing-base',
        '.octopus-pc-card',
        '.octopus-search-result-card',
        '.s-card-container',
        '.a-cardui'
      ];
    } else {
      // 其他页面类型的产品卡片选择器
      cardSelectors = [
        'div[data-asin]:not([data-asin=""])',
        '.a-carousel-card',
        '.a-section.aok-relative',
        '[data-csa-c-item-id]',
        // 新增选择器
        '.a-section.a-spacing-medium',
        '.p13n-grid-content',
        '.p13n-sc-grid-item',
        '.octopus-pc-item'
      ];
    }
    
    // 使用Set来保存唯一的产品卡片
    const cardSet = new Set();
    
    // 尝试每个选择器
    for (const selector of cardSelectors) {
      const cards = document.querySelectorAll(selector);
      
      if (cards && cards.length > 0) {
        console.log(`使用选择器 "${selector}" 找到 ${cards.length} 个产品卡片`);
        
        cards.forEach(card => {
          // 确保元素有足够的内容，避免选中导航元素
          if (
            card.textContent.length > 50 &&
            !card.classList.contains('AdHolder') &&
            !card.classList.contains('amazon-prime-action-card') &&
            !card.parentElement?.classList.contains('s-shopping-adviser-container')
          ) {
            cardSet.add(card);
          }
        });
      }
    }
    
    const uniqueCards = Array.from(cardSet);
    console.log(`找到 ${uniqueCards.length} 个唯一产品卡片`);
    
    return uniqueCards;
  } catch (error) {
    console.error('获取产品卡片时出错:', error);
    return [];
  }
}

// 过滤可见的产品卡片
function filterVisibleCards(cards) {
  try {
    const visibleCards = cards.filter(card => {
      // 检查卡片是否在视口中或接近视口
      const rect = card.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;
      
      // 卡片在视口中或在视口附近(上下300px内)
      return (
        (rect.top >= -300 && rect.top <= windowHeight + 300) ||
        (rect.bottom >= -300 && rect.bottom <= windowHeight + 300) ||
        (rect.top <= 0 && rect.bottom >= windowHeight)
      );
    });
    
    console.log(`从 ${cards.length} 个卡片中过滤出 ${visibleCards.length} 个可见卡片`);
    return visibleCards;
  } catch (error) {
    console.error('过滤可见卡片时出错:', error);
    return cards; // 出错时返回所有卡片
  }
}