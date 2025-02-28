/**
 * Amazon中国卖家识别器 - 内容脚本
 * 负责在Amazon页面中注入并执行识别和标记中国卖家的功能
 */

'use strict';

// 全局变量和状态
let SellerDetector;
let settings = {
  pluginEnabled: true,
  markerColor: 'rgba(255, 0, 85, 0.85)',
  confidenceThreshold: 0.65,
  filterMode: 'all',
  customKeywords: []
};
let sellerCache = {};
let currentPageType = 'unknown';
let isScanning = false;
let scanTimeout;
let observerActive = false;
let floatingControlVisible = false; // 控制浮动控制面板的可见性

// 导入SellerDetector类和全局样式
// 注意：由于content_scripts的限制，我们需要动态加载SellerDetector和全局样式
function loadSellerDetector() {
  return new Promise((resolve) => {
    // 检查是否已加载
    if (window.SellerDetector) {
      resolve();
      return;
    }
    
    // 创建脚本元素
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('utils/seller-detector.js');
    script.onload = () => {
      script.remove();
      resolve();
    };
    (document.head || document.documentElement).appendChild(script);
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
      
      // 5. 创建或更新扫描状态容器，强调重新扫描
      const statusContainer = ensureScanStatusContainer();
      if (statusContainer) {
        updateScanStatus(false, 0, 0, '正在准备刷新扫描...', true);
      }
      
      // 6. 确保页面类型已正确识别
      currentPageType = determinePageType();
      console.log('[刷新扫描] 当前页面类型:', currentPageType);
      
      // 7. 强制检查当前页面是否为搜索页面，如果不是，尝试使用更宽松的判断
      if (currentPageType !== 'search') {
        console.log('[警告] 当前页面不是标准搜索页面，尝试更宽松的判断...');
        
        // 检查URL和页面结构是否可能是搜索页
        const url = window.location.href;
        const hasSearchResults = document.getElementById('search') || 
                                document.querySelector('.s-main-slot') || 
                                document.querySelector('.s-search-results');
        
        if ((url.includes('amazon') && (url.includes('ref=') || url.includes('field-keywords='))) || hasSearchResults) {
          console.log('[刷新扫描] 使用宽松判断将页面视为搜索页面');
          currentPageType = 'search';
        } else {
          console.log('[错误] 当前页面类型不支持扫描:', currentPageType);
          updateScanStatus(false, 0, 0, '当前页面不支持扫描，请在搜索结果页使用此功能', false);
          isScanning = false;
          return;
        }
      }
      
      // 8. 延长延迟时间，确保DOM有足够时间更新，并强调正在进行刷新扫描
      console.log('设置延迟2秒后重新初始化...');
      window.setTimeout(() => {
        console.log('[重要] 延迟时间到，再次确认 isScanning:', isScanning);
        // 再次检查确保扫描状态已重置
        isScanning = false;
        
        // 最后一次确认isScanning状态，然后开始新的扫描
        console.log('[刷新扫描] 最终状态检查，isScanning:', isScanning);
        console.log('[刷新扫描] 开始执行搜索页面处理，启动新的扫描流程');
        
        // 直接调用processSearchPage，而不是init()，避免其他初始化过程干扰
        processSearchPage();
      }, 2000); // 2秒延迟，确保DOM有足够时间更新
    } catch (error) {
      console.error('处理刷新扫描请求时出错:', error);
      // 确保即使出错也重置扫描状态
      isScanning = false;
      
      // 尝试再次进行扫描
      setTimeout(() => {
        console.log('[错误恢复] 尝试再次启动扫描');
        isScanning = false;
        currentPageType = determinePageType(); // 再次检查页面类型
        if (currentPageType === 'search') {
          processSearchPage();
        } else {
          console.log('[错误] 当前页面类型不支持扫描:', currentPageType);
          updateScanStatus(false, 0, 0, '当前页面不支持扫描，请在搜索结果页使用此功能', false);
        }
      }, 3000);
      
      // 只有在尚未响应的情况下才发送错误响应
      try {
        sendResponse({ success: false, error: error.message });
      } catch (e) {
        console.log('无法发送响应，可能已关闭', e);
      }
    }
    
    // 注意：已经使用sendResponse，所以这里不需要返回true
  }
  return true;
});

/**
 * 移除所有标记和控制面板
 */
function removeAllMarks() {
  try {
    console.log('开始移除所有标记和控制面板...');
    
    // 移除控制面板
    const controlPanel = document.getElementById('cn-seller-filter-controls');
    if (controlPanel) {
      console.log('移除控制面板');
      controlPanel.remove();
    }
    
    // 移除占位符
    const placeholder = document.getElementById('cn-seller-filter-placeholder');
    if (placeholder) {
      console.log('移除占位符');
      placeholder.remove();
    }
    
    // 移除扫描状态容器
    const scanStatusContainer = document.getElementById('scan-status-container');
    if (scanStatusContainer) {
      console.log('移除扫描状态容器');
      scanStatusContainer.remove();
    }
    
    // 移除所有已处理的卡片标记
    console.log('开始移除所有已处理的卡片标记');
    const processedCards = document.querySelectorAll('[data-seller-processed]');
    console.log(`找到 ${processedCards.length} 个已处理的卡片`);
    
    processedCards.forEach(card => {
      try {
        // 移除处理标记
        card.removeAttribute('data-seller-processed');
        card.removeAttribute('data-seller-type');
        card.removeAttribute('data-marked-chinese');
        
        // 获取卡片的父容器
        let container = null;
        try {
          container = findProductCardParent(card);
          if (!container) {
            container = card;
          }
        } catch (error) {
          console.error('查找卡片父容器时出错:', error);
          container = card;
        }
        
        // 移除中国卖家标记类和样式
        container.classList.remove('cn-seller-card');
        container.style.border = '';
        container.style.boxShadow = '';
        
        // 移除中国卖家标记元素
        const markers = container.querySelectorAll('.chinese-seller-marker');
        markers.forEach(marker => marker.remove());
        
        // 恢复标题样式
        const titleSelectors = [
          'h2 a', 
          '.a-size-medium', 
          '.a-size-base-plus', 
          '[data-cy="title-recipe"]',
          'h5 a',
          '.a-link-normal .a-text-normal',
          '.a-color-base.a-text-normal'
        ];
        
        for (const selector of titleSelectors) {
          const titleElement = container.querySelector(selector);
          if (titleElement) {
            titleElement.classList.remove('cn-seller-title');
            titleElement.style.color = '';
            titleElement.style.textShadow = '';
            titleElement.style.fontWeight = '';
          }
        }
      } catch (cardError) {
        console.error('清除卡片标记时出错:', cardError);
      }
    });
    
    // 移除所有标记元素（以防有遗漏）
    const allMarkers = document.querySelectorAll('.chinese-seller-marker');
    allMarkers.forEach(marker => marker.remove());
    
    // 移除所有标记的卡片样式
    const markedCards = document.querySelectorAll('.cn-seller-card');
    markedCards.forEach(card => {
      card.classList.remove('cn-seller-card');
      card.style.border = '';
      card.style.boxShadow = '';
    });
    
    // 移除所有标记的标题样式
    const markedTitles = document.querySelectorAll('.cn-seller-title');
    markedTitles.forEach(title => {
      title.classList.remove('cn-seller-title');
      title.style.color = '';
      title.style.textShadow = '';
      title.style.fontWeight = '';
    });
    
    console.log('所有标记和控制面板已移除');
  } catch (error) {
    console.error('移除标记时出错:', error);
  }
}

/**
 * 更新已识别卖家计数
 */
function updateSellerCount() {
  chrome.storage.local.get('sellerCache', data => {
    const cache = data.sellerCache || {};
    const sellerCount = Object.keys(cache).length;
    const chineseSellerCount = Object.values(cache).filter(item => item.isChineseSeller).length;
    
    console.log('更新卖家计数:', chineseSellerCount, '/', sellerCount);
    
    // 更新popup中的计数
    chrome.runtime.sendMessage({
      action: 'updateSellerCount',
      data: {
        total: sellerCount,
        chinese: chineseSellerCount
      }
    });
    
    // 如果存在状态面板，也更新面板中的计数
    const statusContainer = document.getElementById('scan-status-container');
    if (statusContainer) {
      // 移除旧的计数信息
      const oldCountElement = statusContainer.querySelector('.seller-count-info');
      if (oldCountElement) {
        oldCountElement.remove();
      }
      
      // 创建新的计数元素
      const countElement = document.createElement('div');
      countElement.className = 'seller-count-info';
      countElement.textContent = `已识别中国卖家: ${chineseSellerCount}/${sellerCount}`;
      countElement.style.marginTop = '8px';
      countElement.style.marginBottom = '5px';
      countElement.style.color = 'var(--highlight-color)';
      countElement.style.fontWeight = 'bold';
      countElement.style.textShadow = '0 0 3px var(--highlight-color)';
      countElement.style.padding = '3px 6px';
      countElement.style.borderLeft = '2px solid var(--highlight-color)';
      countElement.style.backgroundColor = 'rgba(255, 0, 85, 0.1)';
      countElement.style.fontSize = '14px';
      countElement.style.letterSpacing = '0.5px';
      countElement.style.animation = 'count-update 0.5s ease';
      
      // 添加动画样式
      const countStyle = document.createElement('style');
      countStyle.textContent = `
        @keyframes count-update {
          0% { opacity: 0; transform: translateY(-5px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(countStyle);
      
      // 添加到状态容器
      statusContainer.appendChild(countElement);
      
      // 更新背景插件的存储
      chrome.storage.sync.set({
        sellerStats: {
          total: sellerCount,
          chinese: chineseSellerCount,
          lastUpdate: new Date().toISOString()
        }
      });
    }
  });
}

// 初始化
init();

/**
 * 初始化函数
 */
async function init() {
  // 检查插件是否启用
  const enabled = await isPluginEnabled();
  if (!enabled) {
    console.log('Amazon中国卖家识别器已禁用');
    return;
  }
  
  // 加载SellerDetector类
  await loadSellerDetector();
  
  // 获取设置
  settings = await getSettings();
  console.log('已加载设置:', settings);
  
  // 加载全局样式
  await loadGlobalStyles();
  
  // 确定页面类型
  currentPageType = determinePageType();
  
  // 应用全局样式 - 传入settings参数
  if (window.addGlobalStyles) {
    console.log('应用全局样式，使用设置:', settings);
    window.addGlobalStyles(settings);
  } else {
    console.error('全局样式函数未加载');
  }
  
  // 添加浮动控制按钮 - 无论页面类型都添加
  addFloatingButton();
  
  // 根据页面类型执行相应操作
  if (currentPageType === 'search') {
    // 搜索结果页
    // 添加筛选控制面板
    addFilterControls();
    
    // 添加滚动事件监听
    addScrollListener();
    
    // 监听页面变化（针对无限滚动和AJAX加载）
    observePageChanges();
    
    // 自动扫描功能 - 始终启用
    console.log('准备开始自动扫描页面...');
    
    // 创建或更新扫描状态容器，提前显示即将扫描的状态
    ensureScanStatusContainer();
    updateScanStatus(false, 0, 0, '页面加载完成后将自动开始扫描...');
    
    // 延迟一小段时间再开始扫描，确保页面已完全加载
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      console.log('开始自动扫描页面');
      processSearchPage();
    }, 1500); // 增加延迟时间，确保页面完全加载
  } 
  else if (currentPageType === 'product') {
    // 商品详情页
    processProductPage();
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
    chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
      resolve(response.settings);
    });
  });
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
 * 处理亚马逊搜索结果页面
 * 扫描所有产品卡片，识别卖家，统计中国卖家数量
 */
async function processSearchPage() {
  console.log('开始处理搜索页面 - URL:', window.location.href);
  console.log('当前页面类型:', currentPageType);
  
  // 记录开始时间，用于计算耗时
  const startTime = Date.now();
  
  try {
    // 检查是否正在扫描中，避免重复扫描
    if (isScanning) {
      console.log('[警告] 已有扫描进行中，跳过');
      updateScanStatus(true, 0, 0, '已有扫描进行中...，请等待完成');
      return;
    }
    
    // 设置正在扫描标志
    isScanning = true;
    console.log('[重要] 设置扫描标志 isScanning =', isScanning);
    
    // 确保状态容器存在
    const statusContainer = ensureScanStatusContainer();
    
    // 更新扫描状态，提示正在准备扫描
    updateScanStatus(true, 0, 0, '准备扫描...');
    
    // 获取产品卡片
    console.log('尝试获取产品卡片...');
    let productCards = getProductCards();
    console.log(`获取产品卡片结果: ${productCards ? productCards.length : 0} 个`);
    
    // 如果没有找到产品卡片，尝试触发懒加载
    if (!productCards || productCards.length === 0) {
      console.log('[警告] 未找到产品卡片，尝试触发懒加载...');
      updateScanStatus(true, 0, 0, '未找到产品卡片，尝试加载更多内容...');
      
      try {
        const lazyLoadSuccess = await triggerLazyLoading();
        console.log('懒加载触发结果:', lazyLoadSuccess ? '成功' : '失败');
        
        // 懒加载后重新获取产品卡片
        productCards = getProductCards();
        console.log(`懒加载后获取产品卡片结果: ${productCards ? productCards.length : 0} 个`);
        
        // 如果还是没有找到，尝试更加激进的方法来找到产品
        if (!productCards || productCards.length === 0) {
          console.log('尝试强制重新渲染页面后再次扫描...');
          // 修改页面偏移以强制触发布局重新计算
          window.scrollTo(0, 0);
          await new Promise(resolve => setTimeout(resolve, 1000));
          window.scrollTo(0, 200);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 再次尝试获取产品卡片
          productCards = getProductCards();
          console.log(`强制重新渲染后获取产品卡片结果: ${productCards ? productCards.length : 0} 个`);
        }
      } catch (lazyLoadError) {
        console.error('触发懒加载时出错:', lazyLoadError);
        // 即使懒加载失败，仍然尝试获取产品卡片
        productCards = getProductCards();
      }
    }
    
    // 最终检查是否有产品卡片
    if (!productCards || productCards.length === 0) {
      console.log('[错误] 在多次尝试后仍未找到产品卡片');
      updateScanStatus(false, 0, 0, '未找到任何产品卡片，请尝试刷新页面');
      isScanning = false;
      return;
    }
    
    console.log(`开始处理 ${productCards.length} 个产品卡片`);
    updateScanStatus(true, 0, productCards.length, `开始扫描 ${productCards.length} 个产品...`);
    
    // 使用批次处理产品卡片，避免浏览器卡顿
    const batchSize = 5; // 每次处理5个
    const totalBatches = Math.ceil(productCards.length / batchSize);
    
    let processedCount = 0;
    let chineseSellerCount = 0;
    let nonChineseSellerCount = 0;
    let unknownSellerCount = 0;
    
    // 处理每个批次
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      // 检查是否需要停止扫描（例如用户离开页面）
      if (!isScanning) {
        console.log('扫描被中断，停止处理');
        updateScanStatus(false, processedCount, productCards.length, '扫描已中断');
        return;
      }
      
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min((batchIndex + 1) * batchSize, productCards.length);
      const currentBatch = productCards.slice(startIdx, endIdx);
      
      console.log(`处理批次 ${batchIndex + 1}/${totalBatches}, 卡片 ${startIdx + 1} 到 ${endIdx}`);
      
      // 处理这个批次的卡片
      for (const card of currentBatch) {
        try {
          console.log(`处理卡片 ${processedCount + 1}/${productCards.length}`);
          
          // 处理单个产品卡片
          const result = await processProductCard(card);
          
          // 根据结果更新统计信息
          if (result) {
            processedCount++;
            
            if (result.isChineseSeller) {
              console.log('识别为中国卖家:', result.sellerName);
              chineseSellerCount++;
              
              // 如果已经启用了只显示中国卖家的过滤模式，立即应用标记
              if (settings.filterMode === 'chinese-only') {
                // 显示当前卡片
                const container = findProductCardParent(card);
                if (container) {
                  container.style.display = '';
                }
              } 
              // 如果已经启用了隐藏中国卖家的过滤模式，立即应用标记
              else if (settings.filterMode === 'hide-chinese') {
                // 隐藏当前卡片
                const container = findProductCardParent(card);
                if (container) {
                  container.style.display = 'none';
                }
              }
            } else if (result.isUnknown) {
              console.log('未能识别卖家类型');
              unknownSellerCount++;
            } else {
              console.log('识别为非中国卖家:', result.sellerName);
              nonChineseSellerCount++;
              
              // 应用过滤模式
              if (settings.filterMode === 'chinese-only') {
                // 隐藏当前卡片
                const container = findProductCardParent(card);
                if (container) {
                  container.style.display = 'none';
                }
              }
            }
            
            // 更新扫描状态
            const progressPercent = Math.floor((processedCount / productCards.length) * 100);
            const statusMessage = `已扫描 ${processedCount}/${productCards.length} 个产品，发现 ${chineseSellerCount} 个中国卖家`;
            updateScanStatus(true, processedCount, productCards.length, statusMessage, false, progressPercent);
          }
        } catch (cardError) {
          console.error('处理卡片时出错:', cardError);
          // 即使出错也继续处理下一个卡片
          processedCount++;
          unknownSellerCount++;
        }
      }
      
      // 批次处理完成后，暂停一下，避免浏览器卡顿
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // 扫描完成，更新状态
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`扫描完成：处理了 ${processedCount} 个产品，发现 ${chineseSellerCount} 个中国卖家，耗时 ${elapsedTime} 秒`);
    updateScanStatus(false, processedCount, productCards.length, 
      `扫描完成：找到 ${chineseSellerCount} 个中国卖家 (共 ${processedCount} 个产品)，耗时 ${elapsedTime} 秒`);
    
    // 确保添加过滤控件
    if (!document.getElementById('cn-seller-filter-controls')) {
      addFilterControls();
    }
    
    // 应用当前保存的过滤模式
    if (settings.filterMode && settings.filterMode !== 'all') {
      console.log(`应用保存的过滤模式: ${settings.filterMode}`);
      applyFilterMode(settings.filterMode);
    }
    
    // 重置正在扫描标志
    isScanning = false;
    console.log('[重要] 重置扫描标志 isScanning =', isScanning);
  } catch (error) {
    console.error('处理搜索页面时出错:', error);
    // 确保重置扫描状态
    isScanning = false;
    console.log('[错误恢复] 重置扫描标志 isScanning =', isScanning);
    updateScanStatus(false, 0, 0, `扫描出错: ${error.message}`);
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
    
    // 使用fetch API获取页面内容
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': window.navigator.userAgent
      }
    });
    
    if (!response.ok) {
      console.error(`获取产品页面失败: ${response.status} ${response.statusText}`);
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
    
    // 方法1: 直接从产品页面提取卖家链接
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
      '[class*="merchant"] a' // 含有merchant的元素中的链接
    ];
    
    for (const selector of sellerLinkSelectors) {
      try {
        const sellerElement = doc.querySelector(selector);
        if (sellerElement && sellerElement.href && sellerElement.textContent) {
          sellerName = sellerElement.textContent.trim();
          sellerUrl = sellerElement.href;
          
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
      } catch (error) {
        console.error(`使用选择器 "${selector}" 提取卖家信息时出错:`, error);
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
        '[class*="merchant"]' // 含有merchant的元素
      ];
      
      for (const selector of sellerTextSelectors) {
        try {
          const element = doc.querySelector(selector);
          if (element && element.textContent) {
            const text = element.textContent.trim();
            
            // 尝试匹配常见模式
            const patterns = [
              /(?:Sold|Ships) by[:\s]+([^.]+)/i, // "Sold by: Seller Name"
              /(?:Sold|Ships) from[:\s]+([^.]+)/i, // "Sold from: Seller Name"
              /Seller:?\s+([^.]+)/i, // "Seller: Seller Name"
              /from\s+([^.]+)/i // "from Seller Name"
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
                break;
              }
            }
            
            if (sellerName) break;
          }
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
      
      for (const regex of sellerIdRegexes) {
        const match = html.match(regex);
        if (match && match[1]) {
          sellerId = match[1];
          sellerUrl = `https://www.amazon.com/sp?seller=${sellerId}`;
          console.log(`构建卖家URL: ${sellerUrl}`);
          break;
        }
      }
    }
    
    // 方法4: 如果找到卖家URL，尝试从卖家页面提取更多信息（如国家信息）
    if (sellerUrl) {
      console.log(`尝试从卖家页面(C页面)获取更多信息: ${sellerUrl}`);
      
      try {
        // 获取卖家页面内容
        const sellerResponse = await fetch(sellerUrl, {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': window.navigator.userAgent
          }
        });
        
        if (!sellerResponse.ok) {
          console.error(`获取卖家页面失败: ${sellerResponse.status} ${sellerResponse.statusText}`);
          // 虽然获取C页面失败，但已有A-B页面的信息，所以继续
        } else {
          const sellerHtml = await sellerResponse.text();
          console.log(`成功获取到卖家页面HTML，长度: ${sellerHtml.length} 字符`);
          
          // 解析卖家页面HTML
          const sellerDoc = parser.parseFromString(sellerHtml, 'text/html');
          
          // 提取卖家国家信息
          const businessInfoSelectors = [
            '.a-row:contains("Business Name"), .a-row:contains("Business Address")',
            '.a-section:contains("Business Address")',
            '.a-section:contains("located in")',
            'h1 + div',
            '#page-section-detail-seller-info',
            '.seller-information',
            '[class*="address"]',
            '[class*="location"]'
          ];
          
          let sellerCountry = null;
          let sellerBusinessInfo = null;
          
          // 先直接查找中国关键词
          if (sellerHtml.includes('China') || 
              sellerHtml.includes('Beijing') || 
              sellerHtml.includes('Shanghai') || 
              sellerHtml.includes('Shenzhen') || 
              sellerHtml.includes('Guangzhou') || 
              sellerHtml.includes('Hangzhou')) {
            
            console.log('卖家页面包含中国地址关键词');
            sellerCountry = 'China';
          }
          
          // 如果没有直接找到，尝试查找特定元素
          if (!sellerCountry) {
            for (const selector of businessInfoSelectors) {
              try {
                const elements = sellerDoc.querySelectorAll(selector);
                if (!elements || elements.length === 0) continue;
                
                for (const element of elements) {
                  const text = element.textContent.trim();
                  
                  // 检查是否包含中国相关关键词
                  const isChineseAddress = 
                    text.includes('China') || 
                    text.includes('Beijing') || 
                    text.includes('Shanghai') || 
                    text.includes('Shenzhen') || 
                    text.includes('Guangzhou') || 
                    text.includes('Hangzhou');
                  
                  if (isChineseAddress) {
                    sellerCountry = 'China';
                    sellerBusinessInfo = text;
                    console.log(`卖家位于中国: ${text}`);
                    break;
                  }
                  
                  // 尝试从文本中提取国家信息
                  const countryMatch = text.match(/(?:located|based|address|location)(?:\s+in)?(?:\s*:)?\s+([^,\.]+(?:,\s*[^,\.]+){0,2}?)(?:\.|\n|$)/i);
                  if (countryMatch && countryMatch[1]) {
                    sellerCountry = countryMatch[1].trim();
                    sellerBusinessInfo = text;
                    console.log(`找到卖家国家信息: ${sellerCountry}`);
                    break;
                  }
                }
                
                if (sellerCountry) break;
              } catch (error) {
                console.error(`使用选择器 "${selector}" 提取卖家国家信息时出错:`, error);
              }
            }
          }
          
          // 如果已经确定是中国卖家，直接返回结果
          if (sellerCountry === 'China') {
            return {
              sellerName,
              sellerId,
              sellerUrl,
              sellerCountry,
              sellerBusinessInfo,
              isConfirmedChinese: true
            };
          }
          
          // 保存国家信息以便返回
          if (sellerCountry) {
            return {
              sellerName,
              sellerId,
              sellerUrl,
              sellerCountry,
              sellerBusinessInfo
            };
          }
        }
      } catch (error) {
        console.error('获取卖家页面信息时出错:', error);
        // 错误处理 - 继续使用已有信息
      }
    }
    
    // 返回从B页面获取的信息
    if (sellerName) {
      return { sellerName, sellerId, sellerUrl };
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
  // 检查是否已存在扫描状态容器
  let statusContainer = document.querySelector('.scan-status-container');
  
  // 如果状态容器不存在，创建它
  if (!statusContainer) {
    // 查找添加位置 - 尝试多个可能的位置
    const searchResults = document.querySelector('.s-result-list') || 
                         document.querySelector('.s-search-results') || 
                         document.getElementById('search-results') ||
                         document.querySelector('.s-main-slot') ||
                         document.querySelector('#search');
    
    if (!searchResults) {
      console.error('无法找到搜索结果容器');
      return null;
    }
    
    // 创建状态容器
    statusContainer = document.createElement('div');
    statusContainer.id = 'scan-status-container';
    statusContainer.className = 'scan-status-container';
    statusContainer.innerHTML = `
      <div id="scan-status-text" class="scan-status-text">准备扫描...</div>
      <div class="scan-progress">
        <div id="scan-progress-bar" class="cyberpunk-progress-bar" style="width: 0%;">
          <div class="progress-glow"></div>
        </div>
      </div>
    `;
    
    // 设置样式
    statusContainer.style.display = 'block';
    statusContainer.style.padding = '15px';
    statusContainer.style.margin = '15px 0';
    statusContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
    statusContainer.style.borderRadius = '8px';
    statusContainer.style.border = '2px solid var(--highlight-color, #ff0055)';
    statusContainer.style.boxShadow = '0 0 20px var(--highlight-color, #ff0055), inset 0 0 8px rgba(0, 0, 0, 0.9)';
    statusContainer.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
    statusContainer.style.zIndex = '1000';
    statusContainer.style.color = '#fff';
    statusContainer.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    statusContainer.style.textShadow = '0 0 5px var(--highlight-color, #ff0055)';
    
    // 进度条样式
    const progressBar = statusContainer.querySelector('.cyberpunk-progress-bar');
    if (progressBar) {
      progressBar.style.height = '20px';
      progressBar.style.backgroundColor = 'rgba(255, 0, 85, 0.3)';
      progressBar.style.borderRadius = '4px';
      progressBar.style.position = 'relative';
      progressBar.style.overflow = 'hidden';
      progressBar.style.transition = 'width 0.5s ease';
    }
    
    const progressGlow = statusContainer.querySelector('.progress-glow');
    if (progressGlow) {
      progressGlow.style.position = 'absolute';
      progressGlow.style.top = '0';
      progressGlow.style.left = '0';
      progressGlow.style.height = '100%';
      progressGlow.style.width = '5px';
      progressGlow.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
      progressGlow.style.boxShadow = '0 0 10px 5px rgba(255, 255, 255, 0.5)';
      progressGlow.style.animation = 'progress-glow 2s ease-in-out infinite';
    }
    
    // 添加动画样式
    if (!document.getElementById('scan-status-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'scan-status-styles';
      styleEl.textContent = `
        @keyframes progress-glow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(1000%); }
        }
        .cyberpunk-progress-bar.scanning {
          background-image: linear-gradient(45deg, 
            rgba(255, 0, 85, 0.3) 25%, 
            rgba(255, 0, 85, 0.5) 25%, 
            rgba(255, 0, 85, 0.5) 50%, 
            rgba(255, 0, 85, 0.3) 50%, 
            rgba(255, 0, 85, 0.3) 75%, 
            rgba(255, 0, 85, 0.5) 75%, 
            rgba(255, 0, 85, 0.5));
          background-size: 20px 20px;
          animation: progress-stripe 1s linear infinite;
        }
        @keyframes progress-stripe {
          0% { background-position: 0 0; }
          100% { background-position: 20px 20px; }
        }
      `;
      document.head.appendChild(styleEl);
    }
    
    // 插入到搜索结果前面
    try {
      searchResults.parentNode.insertBefore(statusContainer, searchResults);
      console.log('创建了扫描状态容器');
    } catch (error) {
      console.error('插入扫描状态容器时出错:', error);
      return null;
    }
  }
  
  return statusContainer;
}

/**
 * 更新扫描状态显示
 * @param {boolean} isActive - 扫描是否仍在活动状态
 * @param {number} current - 当前处理的产品数量
 * @param {number} total - 总产品数量
 * @param {string} message - 要显示的状态消息
 * @param {boolean} isRefreshing - 是否为刷新扫描状态
 * @param {number} progressPercent - 进度百分比，可选
 */
function updateScanStatus(isActive, current, total, message, isRefreshing = false, progressPercent) {
  const container = ensureScanStatusContainer();
  if (!container) {
    console.error('无法更新扫描状态 - 容器不存在');
    return;
  }
  
  // 计算进度百分比（如果未提供）
  if (progressPercent === undefined && total > 0) {
    progressPercent = Math.round((current / total) * 100);
  } else if (progressPercent === undefined) {
    progressPercent = 0;
  }
  
  // 更新进度条
  const progressBar = container.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = `${progressPercent}%`;
    
    // 基于进度更新颜色
    if (progressPercent <= 30) {
      progressBar.style.backgroundColor = '#ff0055'; // 红色
    } else if (progressPercent <= 70) {
      progressBar.style.backgroundColor = '#ffcc00'; // 黄色
    } else {
      progressBar.style.backgroundColor = '#00ff66'; // 绿色
    }
  }
  
  // 更新进度文本
  const progressText = container.querySelector('.progress-text');
  if (progressText) {
    if (total > 0) {
      progressText.textContent = `${current}/${total} (${progressPercent}%)`;
    } else {
      progressText.textContent = '';
    }
  }
  
  // 更新状态文本
  const statusText = container.querySelector('.status-text');
  if (statusText) {
    statusText.textContent = message;
    
    // 根据状态设置不同颜色
    if (isActive) {
      statusText.style.color = '#00f3ff'; // 活动时为青色
    } else if (message.includes('错误') || message.includes('失败')) {
      statusText.style.color = '#ff0055'; // 错误时为红色
    } else if (message.includes('完成')) {
      statusText.style.color = '#00ff66'; // 完成时为绿色
    } else {
      statusText.style.color = '#fff'; // 默认为白色
    }
    
    // 如果是刷新扫描，添加特殊标记
    if (isRefreshing) {
      statusText.textContent = '🔄 ' + message;
      statusText.style.animation = 'status-pulse 1s infinite';
    } else {
      statusText.style.animation = '';
    }
  }
  
  // 更新活动状态指示器
  const activeIndicator = container.querySelector('.scanner-active-indicator');
  if (activeIndicator) {
    activeIndicator.style.backgroundColor = isActive ? '#00ff66' : '#888';
    activeIndicator.style.boxShadow = isActive ? '0 0 10px #00ff66' : 'none';
    activeIndicator.style.animation = isActive ? 'pulse 1.5s infinite' : 'none';
  }
  
  // 更新控制按钮状态
  const refreshButton = container.querySelector('.refresh-scan-button');
  if (refreshButton) {
    refreshButton.disabled = isActive;
    refreshButton.style.opacity = isActive ? '0.5' : '1';
    refreshButton.style.cursor = isActive ? 'not-allowed' : 'pointer';
  }
  
  // 确保容器可见
  container.style.display = 'block';
  
  // 添加键盘控制 - ESC键停止扫描
  if (isActive && !window.escKeyListenerAdded) {
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isScanning) {
        console.log('检测到ESC键，停止扫描');
        isScanning = false;
        updateScanStatus(false, current, total, '扫描已手动停止 (ESC)');
      }
    });
    window.escKeyListenerAdded = true;
  }
}

/**
 * 获取所有产品卡片
 * @returns {Array} 产品卡片元素数组
 */
function getProductCards() {
  console.log('开始寻找产品卡片...');
  console.log('当前URL:', window.location.href);
  console.log('当前页面类型:', currentPageType);
  
  // 尝试不同的产品卡片选择器，以适应Amazon页面的不同布局
  let productCards = [];
  
  // 搜索结果页面
  if (currentPageType === 'search') {
    console.log('识别为搜索结果页面，尝试查找产品卡片');
    
    // 创建更全面的选择器列表
    const selectors = [
      // 原有选择器
      '.s-result-item[data-asin]:not([data-asin=""])',
      '.sg-col-4-of-12.s-result-item',
      '.sg-col-4-of-16.s-result-item',
      '[data-component-type="s-search-result"]',
      '.s-asin',
      '.s-result-list .a-section.a-spacing-medium',
      'div.s-result-list div.s-result-item',
      
      // 新增更全面的选择器
      'div[data-asin]:not([data-asin=""]):not(.AdHolder)',
      '.s-result-item:not(.AdHolder)',
      '[cel_widget_id*="MAIN-SEARCH_RESULTS"]',
      '.s-card-container',
      '.s-result',
      '.sg-col-4-of-24',
      '.sg-col-4-of-20',
      '.a-spacing-base:not(.a-spacing-top-base)',
      '.a-cardui',
      'div[data-cel-widget*="search_result"]',
      '[data-component-id*="s-search-result"]',
      'div[data-uuid]',
      'div[data-index]',
      
      // 2023-2024更新的选择器
      '[data-component-id]',
      '.puis-card-container',
      '.s-desktop-width-max .s-desktop-content .s-matching-dir .sg-col-16-of-20 .sg-col-0-of-12 .sg-col .sg-col-12-of-16 .sg-col-0-of-20 .s-list-col-right',
      '[data-csa-c-type="item"]',
      '[data-csa-c-item-id]',
      '.a-section.a-spacing-base',
      '.puis-list-col-right',
      '.s-include-content-margin',
      '.s-latency-cf-section',
      '.widgetId\=search-results_*',
      'div[data-csa-c-slot-id]',
      'span[data-component-type="s-product-image"]',
      'div[class*="s-product-image-container"]',
      'div.rush-component.s-featured-result-item'
    ];
    
    console.log(`将尝试 ${selectors.length} 个不同的选择器`);
    
    // 尝试每个选择器
    for (const selector of selectors) {
      try {
        const items = document.querySelectorAll(selector);
        if (items && items.length > 0) {
          console.log(`使用选择器 "${selector}" 找到 ${items.length} 个产品卡片`);
          productCards = Array.from(items);
          break;
        }
      } catch (error) {
        console.error(`使用选择器 "${selector}" 时出错:`, error);
      }
    }
    
    // 如果上面的选择器都没找到产品，尝试查找包含价格和评分的元素作为备用
    if (productCards.length === 0) {
      console.log('使用备用产品检测方法 - 查找价格和评分元素');
      
      // 更全面的备用检测元素
      const priceElements = document.querySelectorAll('.a-price, .a-offscreen, .a-price-whole, span[aria-hidden="true"][class*="price"], .a-price-fraction');
      const ratingElements = document.querySelectorAll('.a-star-rating, .a-icon-star, .a-icon-star-small, i[class*="star"], .a-size-small.a-link-normal');
      const titleElements = document.querySelectorAll('h2 a, h5 a, .a-size-base-plus, .a-size-medium, a.a-link-normal[href*="/dp/"], .a-link-normal .a-text-normal, .a-color-base.a-text-normal');
      const linkElements = document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/slredirect/"]');
      const imageElements = document.querySelectorAll('img[data-image-index], img.s-image, .s-product-image-container img, .aok-relative img');
      
      console.log('备用检测找到的元素数量:');
      console.log(`价格元素: ${priceElements.length}`);
      console.log(`评分元素: ${ratingElements.length}`);
      console.log(`标题元素: ${titleElements.length}`);
      console.log(`链接元素: ${linkElements.length}`);
      console.log(`图片元素: ${imageElements.length}`);
      
      // 2. 收集所有可能的产品元素
      const potentialProductElements = new Set();
      
      // 处理函数 - 向上查找可能的产品容器
      const findPotentialProduct = (element) => {
        if (!element) return null;
        let current = element;
        for (let i = 0; i < 10; i++) { // 向上查找最多10层
          if (!current.parentElement) break;
          current = current.parentElement;
          
          // 检查是否可能是产品卡片的特征
          if (current.tagName === 'DIV' || current.tagName === 'LI') {
            // 检查一些可能表明这是产品卡片的特征
            if (current.hasAttribute('data-asin') || 
                current.hasAttribute('data-uuid') || 
                current.hasAttribute('data-index') ||
                current.hasAttribute('data-component-type') ||
                current.hasAttribute('data-component-id') ||
                current.hasAttribute('data-csa-c-item-id') ||
                current.hasAttribute('data-csa-c-type') ||
                current.className.includes('s-result') ||
                current.className.includes('card') ||
                current.className.includes('sg-col') ||
                current.className.includes('puis') ||
                current.style.position === 'relative') {
              return current;
            }
          }
        }
        return null;
      };
      
      // 收集可能的产品元素
      const collectFromElements = (elements) => {
        elements.forEach(el => {
          const product = findPotentialProduct(el);
          if (product) potentialProductElements.add(product);
        });
      };
      
      // 从各种元素收集可能的产品卡片
      collectFromElements(priceElements);
      collectFromElements(ratingElements);
      collectFromElements(titleElements);
      collectFromElements(linkElements);
      collectFromElements(imageElements);
      
      if (potentialProductElements.size > 0) {
        console.log(`使用备用方法找到 ${potentialProductElements.size} 个可能的产品卡片`);
        productCards = Array.from(potentialProductElements);
      } else {
        console.log('备用方法也未找到产品卡片');
      }
    }
    
    // 如果仍未找到产品卡片，使用最激进的方法 - 查找任何可能包含产品的区域
    if (productCards.length === 0) {
      console.log('使用最后的备用方法 - 查找任何可能的产品区域');
      
      // 查找主要内容区域
      const mainContent = document.getElementById('search') || 
                         document.querySelector('.s-main-slot') || 
                         document.querySelector('.s-search-results') ||
                         document.querySelector('main') ||
                         document.querySelector('.sg-col-20-of-24') ||
                         document.querySelector('[data-cel-widget="search_results"]') ||
                         document.querySelector('#search-results') ||
                         document.querySelector('.s-matching-dir');
      
      if (mainContent) {
        console.log('找到主要内容区域:', mainContent);
        // 先尝试寻找可能包含价格的元素
        const allPriceElements = mainContent.querySelectorAll('.a-price, .a-offscreen, .a-price-whole');
        console.log(`主内容区域内找到 ${allPriceElements.length} 个价格元素`);
        
        // 查找主要内容区域的直接子元素
        const directChildren = mainContent.children;
        if (directChildren && directChildren.length > 0) {
          console.log(`主内容区域直接子元素数量: ${directChildren.length}`);
          productCards = Array.from(directChildren).filter(child => {
            // 过滤掉明显不是产品的元素
            return child.tagName === 'DIV' && !child.id.includes('pagination') && 
                   !child.className.includes('a-section-footer') &&
                   !child.className.includes('pagination');
          });
          console.log(`从主要内容区域找到 ${productCards.length} 个可能的产品区域`);
        }
      } else {
        console.log('未找到主要内容区域，尝试直接获取所有可能的产品区域');
        // 如果找不到主要区域，尝试直接获取所有包含价格的父元素
        const allPriceElementsPage = document.querySelectorAll('.a-price, .a-offscreen, .a-price-whole');
        
        if (allPriceElementsPage.length > 0) {
          const potentialProducts = new Set();
          allPriceElementsPage.forEach(priceEl => {
            let current = priceEl;
            for (let i = 0; i < 5; i++) {
              if (!current.parentElement) break;
              current = current.parentElement;
              if (current.tagName === 'DIV' && 
                  (current.className.includes('a-section') || current.className.includes('s-'))) {
                potentialProducts.add(current);
                break;
              }
            }
          });
          
          if (potentialProducts.size > 0) {
            productCards = Array.from(potentialProducts);
            console.log(`通过价格元素发现 ${productCards.length} 个潜在产品区域`);
          }
        }
      }
    }
  }
  // 产品页面处理逻辑保持不变
  else if (currentPageType === 'product') {
    // 产品页面通常只有一个主产品
    const mainProduct = document.getElementById('dp') || document.getElementById('ppd');
    if (mainProduct) {
      productCards = [mainProduct];
    }
    
    // 也检查"买这个也买那个"和"相关产品"部分
    const relatedSelectors = [
      '#sims-consolidated-1_feature_div .a-carousel-card',
      '#sims-consolidated-2_feature_div .a-carousel-card',
      '#purchase-sims-feature .a-carousel-card',
      '.sims-fbt-rows .sims-fbt-image-box',
      // 更多可能的相关产品选择器
      '.a-carousel-card',
      '[data-a-carousel-options]'
    ];
    
    // 查找相关产品
    for (const selector of relatedSelectors) {
      const related = document.querySelectorAll(selector);
      if (related && related.length > 0) {
        productCards = [...productCards, ...Array.from(related)];
      }
    }
  }
  
  // 检查是否有任何商品具有hidden属性并排除它们（可能是筛选器隐藏的）
  const visibleCards = productCards.filter(card => {
    if (!card) return false;
    
    try {
      const style = window.getComputedStyle(card);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             card.offsetParent !== null; // 检查元素是否实际可见
    } catch (error) {
      console.error('检查卡片可见性时出错:', error);
      return true; // 出错时默认认为可见
    }
  });
  
  console.log(`最终找到 ${visibleCards.length} 个可见的产品卡片（总共 ${productCards.length} 个）`);
  
  // 如果没有找到卡片，输出页面结构以便调试
  if (visibleCards.length === 0) {
    console.log('未找到产品卡片，输出页面结构以便调试:');
    console.log('Body子元素数量:', document.body.children.length);
    console.log('主要内容区域:');
    console.log('- search元素存在:', !!document.getElementById('search'));
    console.log('- s-main-slot元素存在:', !!document.querySelector('.s-main-slot'));
    console.log('- s-search-results元素存在:', !!document.querySelector('.s-search-results'));
    console.log('- sg-col-20-of-24元素存在:', !!document.querySelector('.sg-col-20-of-24'));
    console.log('- data-cel-widget=search_results元素存在:', !!document.querySelector('[data-cel-widget="search_results"]'));
  }
  
  return visibleCards;
}

/**
 * 处理单个产品卡片
 * @param {Element} card - 产品卡片元素
 * @returns {Promise<Object>} 处理结果，包含卖家信息
 */
async function processProductCard(card) {
  try {
    // 检查卡片是否有效
    if (!card) {
      console.log('卡片为空，无法处理');
      return null;
    }
    
    // 检查卡片是否已经被处理过
    if (card.hasAttribute('data-seller-processed')) {
      console.log('卡片已被处理，跳过');
      const sellerType = card.getAttribute('data-seller-type');
      return { isAlreadyProcessed: true, isChineseSeller: sellerType === 'chinese' };
    }
    
    // 添加处理标记
    card.setAttribute('data-seller-processed', 'true');
    
    // 获取产品ASIN（Amazon标准识别号）
    let asin = card.getAttribute('data-asin');
    console.log('初始ASIN检查:', asin);
    
    // 如果没有直接获取到ASIN，尝试从各种位置提取
    if (!asin || asin === '') {
      console.log('未在data-asin属性中找到ASIN，尝试其他方法');
      
      // 1. 从URL提取ASIN - 检查多种链接模式
      const linkSelectors = [
        'a[href*="/dp/"]', 
        'a[href*="/gp/product/"]',
        'a[href*="/gp/slredirect/"]',
        'a[href*="product-reviews"]',
        'a[href*="offer-listing"]',
        'a[href*="dealID="]',
        '.a-link-normal',
        'a[data-routing]'
      ];
      
      // 合并所有选择器，一次性查询
      const allLinkSelector = linkSelectors.join(', ');
      const links = card.querySelectorAll(allLinkSelector);
      
      if (links.length > 0) {
        console.log(`找到 ${links.length} 个可能包含ASIN的链接`);
        
        for (const link of links) {
          const href = link.getAttribute('href');
          if (!href) continue;
          
          // 尝试多种正则表达式匹配模式
          const patterns = [
            /\/(?:dp|gp\/product|gp\/slredirect)\/([A-Z0-9]{10})(?:\/|\?|$)/,
            /(?:product-reviews|offer-listing)\/([A-Z0-9]{10})(?:\/|\?|$)/,
            /(?:\/|%2F)([A-Z0-9]{10})(?:\/|%2F|\?|$)/,
            /asin(?:=|%3D)([A-Z0-9]{10})(?:&|$)/,
            /\/images\/I\/([A-Z0-9]{10})(?:[A-Z0-9]|\.|$)/
          ];
          
          for (const pattern of patterns) {
            const match = href.match(pattern);
            if (match && match[1]) {
              asin = match[1];
              console.log(`从链接提取到ASIN: ${asin}`);
              break;
            }
          }
          
          if (asin) break; // 如果找到ASIN，结束循环
        }
      }
      
      // 2. 如果仍未找到，尝试从各种属性中提取
      if (!asin) {
        const possibleAttributes = [
          'data-asin', 'data-cel-widget', 'data-csa-c-item-id', 
          'id', 'data-uuid', 'data-id', 'data-component-id'
        ];
        
        for (const attrName of possibleAttributes) {
          // 检查卡片本身
          if (card.hasAttribute(attrName)) {
            const attrValue = card.getAttribute(attrName);
            const match = attrValue.match(/([A-Z0-9]{10})/);
            if (match && match[1]) {
              asin = match[1];
              console.log(`从${attrName}属性提取到ASIN: ${asin}`);
              break;
            }
          }
          
          // 检查卡片子元素
          const elementsWithAttr = card.querySelectorAll(`[${attrName}]`);
          for (const element of elementsWithAttr) {
            const attrValue = element.getAttribute(attrName);
            const match = attrValue.match(/([A-Z0-9]{10})/);
            if (match && match[1]) {
              asin = match[1];
              console.log(`从子元素的${attrName}属性提取到ASIN: ${asin}`);
              break;
            }
          }
          
          if (asin) break;
        }
      }
      
      // 3. 最后尝试从图片URL中提取
      if (!asin) {
        const images = card.querySelectorAll('img');
        for (const img of images) {
          if (img.src) {
            const match = img.src.match(/\/images\/I\/([A-Z0-9]{10})/);
            if (match && match[1]) {
              asin = match[1];
              console.log(`从图片URL提取到ASIN: ${asin}`);
              break;
            }
          }
        }
      }
    }
    
    // 如果最终仍未找到ASIN
    if (!asin) {
      console.log('无法提取ASIN，标记为未知卖家');
      card.setAttribute('data-seller-type', 'unknown');
      return { isChineseSeller: false, isUnknown: true };
    }
    
    console.log(`处理产品卡片，ASIN: ${asin}`);
    
    // 从卡片中查找卖家信息
    let sellerName = '';
    let sellerUrl = '';
    
    // 更全面的卖家信息选择器
    const sellerSelectors = [
      // 基本卖家信息选择器
      '.a-row.a-size-base a:not([href*="field-lbr_brands"])',
      '[data-cy="seller-name"] a',
      '.a-size-base.a-link-normal:not([href*="field-lbr_brands"])',
      '.a-size-small.a-color-secondary',
      '.a-size-small:not(.a-color-price)',
      '.puis-seller-name-with-icon .a-row',
      
      // 包含"by"或"from"的元素
      '*:contains("by ")',
      '*:contains("from ")',
      '*:contains("Brand: ")',
      '*:contains("Visit the ")',
      '*:contains("Sponsored by ")',
      
      // 更多可能的选择器
      '.a-row:not(.a-spacing-top-small)',
      '.a-row.a-size-small',
      '.a-row a[href*="/s?i=merchant-items"]',
      '.a-row a[href*="/shops/"]',
      'a[href*="/s?marketplaceID="]',
      'a[href*="seller="]',
      'span.rush-component'
    ];
    
    // 尝试每个选择器
    for (const selector of sellerSelectors) {
      try {
        const elements = card.querySelectorAll(selector);
        
        for (const element of elements) {
          let text = element.textContent.trim();
          
          // 1. 检查是否包含"by"或"from"关键词
          const byMatch = text.match(/(?:by|from|sold by|Brand:)\s+([^|.]+)/i);
          if (byMatch) {
            sellerName = byMatch[1].trim();
            console.log(`找到卖家名称（通过标准模式）: ${sellerName}`);
            
            // 查找链接
            const links = element.querySelectorAll('a');
            for (const link of links) {
              const href = link.getAttribute('href');
              if (href && (href.includes('/s?i=merchant-items') || 
                          href.includes('/shops/') || 
                          href.includes('seller=') || 
                          href.includes('marketplaceID'))) {
                sellerUrl = href;
                console.log(`找到卖家链接: ${sellerUrl}`);
                break;
              }
            }
            
            if (sellerName) break;
          }
          
          // 2. 检查链接文本
          if (element.tagName === 'A') {
            const href = element.getAttribute('href');
            if (href && (href.includes('/s?i=merchant-items') || 
                        href.includes('/shops/') || 
                        href.includes('seller=') || 
                        href.includes('marketplaceID'))) {
              sellerName = element.textContent.trim();
              sellerUrl = href;
              console.log(`找到卖家名称（通过链接）: ${sellerName}`);
              break;
            }
          }
        }
        
        if (sellerName) break;
      } catch (error) {
        console.error(`使用选择器 "${selector}" 提取卖家信息时出错:`, error);
      }
    }
    
    // 如果无法从卡片中获取卖家信息，尝试从产品详情页获取
    let sellerResult = null;
    let isChineseSeller = false;
    
    // 确定卖家类型函数
    const determineSellerType = (sellerInfo) => {
      // 如果有确认的中国卖家标志，直接返回中国卖家
      if (sellerInfo.isConfirmedChinese) {
        console.log(`卖家 ${sellerInfo.sellerName} 已确认为中国卖家`);
        card.setAttribute('data-seller-type', 'chinese');
        markChineseSeller(card);
        return true;
      }
      
      // 初始化检测类
      if (!SellerDetector) {
        console.log('SellerDetector未初始化，使用window.SellerDetector');
        SellerDetector = window.SellerDetector;
      }
      
      if (!SellerDetector) {
        console.error('SellerDetector类不可用，无法判断卖家');
        card.setAttribute('data-seller-type', 'unknown');
        return false;
      }
      
      // 创建检测器实例
      const detector = new SellerDetector(settings.confidenceThreshold, settings.customKeywords);
      
      // 检测是否为中国卖家
      isChineseSeller = detector.isChineseSeller(sellerInfo.sellerName, sellerInfo.sellerCountry);
      
      console.log(`卖家 ${sellerInfo.sellerName} 是中国卖家: ${isChineseSeller}`);
      
      // 更新卡片属性
      card.setAttribute('data-seller-type', isChineseSeller ? 'chinese' : 'non-chinese');
      
      // 如果是中国卖家，标记卡片
      if (isChineseSeller) {
        markChineseSeller(card);
      }
      
      return isChineseSeller;
    };
    
    // 如果已有卖家信息，基于当前数据判断卖家类型
    if (sellerName) {
      sellerResult = { sellerName, sellerUrl };
      isChineseSeller = determineSellerType(sellerResult);
    } 
    // 否则尝试从详情页获取
    else if (asin) {
      try {
        // 构建产品页面URL
        const productUrl = `https://www.amazon.com/dp/${asin}`;
        console.log(`从产品详情页获取卖家信息: ${productUrl}`);
        
        // 获取卖家信息
        sellerResult = await fetchSellerInfoFromProductPage(productUrl);
        
        if (sellerResult && sellerResult.sellerName) {
          console.log(`从详情页获取到卖家信息: ${sellerResult.sellerName}`);
          isChineseSeller = determineSellerType(sellerResult);
        } else {
          console.log('从详情页无法获取到卖家信息');
          card.setAttribute('data-seller-type', 'unknown');
        }
      } catch (error) {
        console.error('获取卖家详情时出错:', error);
        card.setAttribute('data-seller-type', 'unknown');
      }
    } else {
      console.log('没有ASIN和卖家信息，标记为未知卖家');
      card.setAttribute('data-seller-type', 'unknown');
    }
    
    return {
      asin,
      sellerName: sellerResult ? sellerResult.sellerName : '',
      sellerUrl: sellerResult ? sellerResult.sellerUrl : '',
      sellerCountry: sellerResult ? sellerResult.sellerCountry : '',
      isChineseSeller,
      isUnknown: !sellerResult || !sellerResult.sellerName
    };
  } catch (error) {
    console.error('处理产品卡片时出错:', error);
    // 确保卡片被标记为已处理，防止重复尝试
    if (card) {
      card.setAttribute('data-seller-processed', 'true');
      card.setAttribute('data-seller-type', 'error');
    }
    return { error: error.message };
  }
}

/**
 * 添加筛选控制面板
 */
function addFilterControls() {
  console.log('添加筛选控制面板');
  
  // 检查是否已存在
  if (document.getElementById('filter-controls-container')) {
    console.log('筛选控制面板已存在，不重复添加');
    return;
  }
  
  // 创建筛选控制容器
  const filterContainer = document.createElement('div');
  filterContainer.id = 'filter-controls-container';
  filterContainer.className = 'cyberpunk-filter-controls';
  
  // 设置筛选控制面板的内容
  filterContainer.innerHTML = `
    <div class="filter-section">
      <h3>快速搜索</h3>
      <div class="filter-buttons">
        <button id="filter-all" class="cyberpunk-button">全部</button>
        <button id="filter-chinese-only" class="cyberpunk-button">仅中国</button>
        <button id="filter-hide-chinese" class="cyberpunk-button">隐藏中国</button>
      </div>
    </div>
  `;
  
  // 设置样式
  filterContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  filterContainer.style.padding = '15px';
  filterContainer.style.borderRadius = '8px';
  filterContainer.style.margin = '15px 0';
  filterContainer.style.border = '2px solid var(--highlight-color, #ff0055)';
  filterContainer.style.boxShadow = '0 0 10px var(--highlight-color, #ff0055)';
  filterContainer.style.color = '#fff';
  
  // 查找搜索结果区域来插入筛选控件
  const searchResults = document.querySelector('.s-result-list') || 
                       document.querySelector('.s-search-results') || 
                       document.getElementById('search-results') ||
                       document.querySelector('.s-main-slot') ||
                       document.querySelector('#search');
  
  if (!searchResults) {
    console.error('无法找到搜索结果容器，无法添加筛选控件');
    return;
  }
  
  // 插入到搜索结果前面
  searchResults.parentNode.insertBefore(filterContainer, searchResults);
  
  // 添加筛选按钮点击事件
  document.getElementById('filter-all').addEventListener('click', function() {
    handleFilterButtonClick('all');
  });
  
  document.getElementById('filter-chinese-only').addEventListener('click', function() {
    handleFilterButtonClick('chinese-only');
  });
  
  document.getElementById('filter-hide-chinese').addEventListener('click', function() {
    handleFilterButtonClick('hide-chinese');
  });
  
  console.log('筛选控制面板添加完成');
}

/**
 * 处理筛选按钮点击
 * @param {string} mode - 筛选模式：'all', 'chinese-only', 或 'hide-chinese'
 */
function handleFilterButtonClick(mode) {
  console.log(`筛选模式切换: ${mode}`);
  
  // 保存设置
  settings.filterMode = mode;
  chrome.storage.sync.set({ filterMode: mode });
  
  // 应用筛选
  applyFilterMode(mode);
  
  // 更新UI状态
  updateFilterButtonsState(mode);
  
  // 更新当前筛选模式显示
  updateCurrentFilterMode(mode);
  
  // 重新扫描页面以确保所有产品都被处理
  processSearchPage();
}

/**
 * 更新筛选按钮状态
 * @param {string} activeMode - 当前激活的筛选模式
 */
function updateFilterButtonsState(activeMode) {
  const allButton = document.getElementById('filter-all');
  const chineseOnlyButton = document.getElementById('filter-chinese-only');
  const hideChineseButton = document.getElementById('filter-hide-chinese');
  
  if (allButton) allButton.classList.toggle('active', activeMode === 'all');
  if (chineseOnlyButton) chineseOnlyButton.classList.toggle('active', activeMode === 'chinese-only');
  if (hideChineseButton) hideChineseButton.classList.toggle('active', activeMode === 'hide-chinese');
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
 * @param {string} mode - 筛选模式：'all', 'chinese-only', 或 'hide-chinese'
 */
function applyFilterMode(mode) {
  console.log(`应用筛选模式: ${mode}`);
  
  // 获取所有已处理的产品卡片
  const cards = document.querySelectorAll('[data-seller-processed="true"]');
  
  // 根据不同模式应用筛选
  switch (mode) {
    case 'all':
      // 显示所有卡片
      cards.forEach(card => {
        const parentElement = findProductCardParent(card);
        if (parentElement) {
          parentElement.style.display = '';
        }
      });
      break;
      
    case 'chinese-only':
      // 只显示中国卖家
      cards.forEach(card => {
        const sellerType = card.getAttribute('data-seller-type');
        const parentElement = findProductCardParent(card);
        
        if (parentElement) {
          if (sellerType === 'chinese') {
            parentElement.style.display = '';
          } else {
            parentElement.style.display = 'none';
          }
        }
      });
      break;
      
    case 'hide-chinese':
      // 隐藏中国卖家
      cards.forEach(card => {
        const sellerType = card.getAttribute('data-seller-type');
        const parentElement = findProductCardParent(card);
        
        if (parentElement) {
          if (sellerType === 'chinese') {
            parentElement.style.display = 'none';
          } else {
            parentElement.style.display = '';
          }
        }
      });
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
 * 标记中国卖家产品卡片
 * @param {Element} card - 产品卡片元素
 */
function markChineseSeller(card) {
  try {
    // 检查卡片是否有效
    if (!card) {
      console.log('卡片为空，无法标记');
      return;
    }
    
    // 检查卡片是否已经被标记
    if (card.hasAttribute('data-marked-chinese')) {
      console.log('卡片已被标记为中国卖家，跳过');
      return;
    }
    
    console.log('开始标记中国卖家产品卡片');
    
    // 获取卡片的父元素（容器）
    let container = null;
    try {
      container = findProductCardParent(card);
      if (!container) {
        console.log('找不到卡片的父容器，使用卡片本身');
        container = card; // 如果找不到父容器，使用卡片本身
      }
    } catch (error) {
      console.error('查找卡片父容器时出错:', error);
      container = card; // 出错时使用卡片本身
    }
    
    // 标记卡片已经处理
    try {
      card.setAttribute('data-marked-chinese', 'true');
    } catch (error) {
      console.error('标记卡片属性时出错:', error);
    }
    
    // 创建和应用标记
    try {
      // 创建标记元素
      const marker = document.createElement('div');
      marker.className = 'chinese-seller-marker';
      marker.innerHTML = `
        <div class="marker-content">
          <span class="marker-flag">CN</span>
          <span class="marker-text">中国卖家</span>
        </div>
      `;
      
      // 应用样式
      marker.style.position = 'absolute';
      marker.style.top = '5px';
      marker.style.right = '5px';
      marker.style.zIndex = '1000';
      marker.style.backgroundColor = settings.markerColor || 'rgba(255, 0, 85, 0.85)';
      marker.style.color = '#fff';
      marker.style.padding = '4px 8px';
      marker.style.borderRadius = '4px';
      marker.style.fontSize = '12px';
      marker.style.fontWeight = 'bold';
      marker.style.textShadow = '0 0 2px rgba(0, 0, 0, 0.7)';
      marker.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.3)';
      marker.style.display = 'flex';
      marker.style.alignItems = 'center';
      marker.style.justifyContent = 'center';
      marker.style.lineHeight = '1';
      marker.style.transition = 'all 0.3s ease';
      marker.style.animation = 'marker-appear 0.5s ease';
      marker.style.pointerEvents = 'none'; // 防止marker阻止点击
      
      // 标记内容样式
      const markerContent = marker.querySelector('.marker-content');
      if (markerContent) {
        markerContent.style.display = 'flex';
        markerContent.style.alignItems = 'center';
        markerContent.style.gap = '5px';
      }
      
      // 国旗样式
      const markerFlag = marker.querySelector('.marker-flag');
      if (markerFlag) {
        markerFlag.style.fontWeight = 'bold';
        markerFlag.style.fontSize = '10px';
        markerFlag.style.backgroundColor = '#d0021b';
        markerFlag.style.color = '#fff';
        markerFlag.style.padding = '2px 4px';
        markerFlag.style.borderRadius = '2px';
        markerFlag.style.display = 'inline-block';
      }
      
      // 设置容器为相对定位，以便标记可以绝对定位
      const containerPosition = window.getComputedStyle(container).position;
      if (containerPosition === 'static') {
        container.style.position = 'relative';
      }
      
      // 添加动画样式（如果还不存在）
      if (!document.getElementById('chinese-seller-marker-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'chinese-seller-marker-styles';
        styleElement.textContent = `
          @keyframes marker-appear {
            0% { opacity: 0; transform: translateY(-10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          
          .chinese-seller-marker {
            position: absolute;
            top: 5px;
            right: 5px;
            z-index: 9999;
            background-color: rgba(255, 0, 85, 0.85);
            color: #fff;
            border-radius: 4px;
            animation: marker-appear 0.5s ease;
          }
          
          .cn-seller-card {
            border: 2px solid rgba(255, 0, 85, 0.85) !important;
            box-shadow: 0 0 10px rgba(255, 0, 85, 0.3) !important;
            position: relative;
          }
          
          .cn-seller-title {
            color: #ff0055 !important;
            text-shadow: 0 0 1px rgba(255, 0, 85, 0.3) !important;
            font-weight: bold !important;
          }
        `;
        document.head.appendChild(styleElement);
      }
      
      // 将标记添加到容器中
      container.appendChild(marker);
      
      // 添加醒目的边框
      container.classList.add('cn-seller-card');
      container.style.border = `2px solid ${settings.markerColor || 'rgba(255, 0, 85, 0.85)'}`;
      container.style.boxShadow = `0 0 10px ${settings.markerColor || 'rgba(255, 0, 85, 0.3)'}`;
      
      // 尝试标记产品标题
      try {
        // 查找产品标题
        const titleSelectors = [
          'h2 a', 
          '.a-size-medium', 
          '.a-size-base-plus', 
          '[data-cy="title-recipe"]',
          'h5 a',
          '.a-link-normal .a-text-normal',
          '.a-color-base.a-text-normal'
        ];
        
        for (const selector of titleSelectors) {
          const titleElement = container.querySelector(selector);
          if (titleElement) {
            titleElement.classList.add('cn-seller-title');
            titleElement.style.color = '#ff0055';
            titleElement.style.textShadow = '0 0 1px rgba(255, 0, 85, 0.3)';
            titleElement.style.fontWeight = 'bold';
            break;
          }
        }
      } catch (titleError) {
        console.error('标记产品标题时出错:', titleError);
      }
      
      console.log('中国卖家产品卡片标记完成');
    } catch (markerError) {
      console.error('创建卖家标记时出错:', markerError);
    }
  } catch (error) {
    console.error('标记中国卖家产品时出错:', error);
  }
}