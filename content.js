/**
 * Amazon中国卖家识别器 - 内容脚本
 * 负责在Amazon页面中注入并执行识别和标记中国卖家的功能
 */

'use strict';

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

// 全局变量
let settings = {};
let sellerCache = {};
let currentPageType = '';
let observerActive = false;
let filterMode = 'all'; // 'all', 'onlyChinese', 'hideChinese'
let floatingControlVisible = false; // 控制浮动控制面板的可见性

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
  return true;
});

/**
 * 移除所有标记和控制面板
 */
function removeAllMarks() {
  // 移除控制面板
  const controls = document.getElementById('cn-seller-filter-controls');
  if (controls) {
    controls.remove();
  }
  
  const placeholder = document.getElementById('cn-seller-filter-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  // 移除所有卡片标记
  document.querySelectorAll('.cn-seller-card').forEach(card => {
    card.classList.remove('cn-seller-card', 'cyberpunk-border');
    card.style.display = '';
    card.removeAttribute('data-seller-type');
    
    // 移除图标标记
    const mark = card.querySelector('.cn-seller-mark');
    if (mark) {
      mark.remove();
    }
    
    // 恢复标题样式
    const title = card.querySelector('.cn-seller-title');
    if (title) {
      title.classList.remove('cn-seller-title');
      title.style.color = '';
      title.style.textShadow = '';
    }
  });
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
  
  // 添加全局样式 - 传入settings参数
  if (window.addGlobalStyles) {
    console.log('应用全局样式，使用设置:', settings);
    window.addGlobalStyles(settings);
  } else {
    console.error('全局样式函数未加载');
  }
  
  // 根据页面类型执行相应操作
  if (currentPageType === 'search') {
    // 搜索结果页
    // 添加筛选控制面板
    addFilterControls();
    
    // 添加滚动事件监听
    addScrollListener();
    
    // 监听页面变化（针对无限滚动和AJAX加载）
    observePageChanges();
    
    // 根据设置决定是否自动扫描
    if (settings.autoScan !== false) {
      console.log('自动扫描已启用，开始扫描页面...');
      // 延迟一小段时间再开始扫描，确保页面已完全加载
      setTimeout(() => {
        processSearchPage();
      }, 1000);
    } else {
      console.log('自动扫描已禁用，等待用户手动触发扫描');
      // 更新状态提示用户需要手动扫描
      const statusText = document.getElementById('scan-status-text');
      if (statusText) {
        statusText.textContent = '请点击"开始扫描"按钮进行扫描';
      }
    }
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
 * 处理搜索结果页
 */
async function processSearchPage() {
  // 获取所有商品卡片
  const productCards = getProductCards();
  
  console.log('找到商品卡片数量:', productCards.length);
  
  // 更新扫描状态
  updateScanStatus(true, 0, productCards.length);
  
  // 处理每个商品卡片
  for (let i = 0; i < productCards.length; i++) {
    await processProductCard(productCards[i]);
    // 更新扫描进度
    updateScanStatus(true, i + 1, productCards.length);
  }
  
  // 完成扫描
  updateScanStatus(false, productCards.length, productCards.length);
}

/**
 * 获取搜索结果页中的商品卡片
 * @return {Array} 商品卡片元素数组
 */
function getProductCards() {
  // 适配不同的Amazon页面结构
  const selectors = [
    'div[data-component-type="s-search-result"]',
    '.s-result-item',
    '.sg-col-4-of-12',
    '.sg-col-4-of-16',
    '.s-asin'
  ];
  
  for (const selector of selectors) {
    const cards = Array.from(document.querySelectorAll(selector));
    if (cards.length > 0) {
      return cards.filter(card => !card.classList.contains('AdHolder'));
    }
  }
  
  return [];
}

/**
 * 处理单个商品卡片
 * @param {Element} card - 商品卡片DOM元素
 */
async function processProductCard(card) {
  try {
    // 如果卡片已经处理过，跳过
    if (card.hasAttribute('data-seller-type')) {
      return;
    }
    
    // 确保SellerDetector已加载
    await loadSellerDetector();
    
    // 提取卖家信息
    const sellerInfo = extractSellerInfo(card);
    
    if (!sellerInfo) {
      console.log('无法从卡片获取卖家信息，尝试从商品链接获取');
      // 无法直接从卡片获取卖家信息，尝试从商品链接获取
      const productLink = card.querySelector('a.a-link-normal[href*="/dp/"]');
      if (productLink) {
        const productUrl = productLink.href;
        // 异步获取商品详情页的卖家信息
        fetchSellerInfoFromProductPage(productUrl, card);
      }
      return;
    }
    
    console.log('提取到卖家信息:', sellerInfo);
    
    // 检查SellerDetector是否可用
    if (typeof SellerDetector === 'undefined' || !window.SellerDetector) {
      console.error('SellerDetector类未加载，无法检测卖家');
      return;
    }
    
    // 使用SellerDetector类检查卖家是否为中国卖家
    const detector = new window.SellerDetector(settings);
    const result = await detector.checkIfChineseSeller(
      sellerInfo.sellerId, 
      sellerInfo.sellerName, 
      sellerInfo.sellerUrl
    );
    
    console.log('卖家检测结果:', result);
    
    // 更新卖家缓存
    updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
    
    if (result.isChineseSeller) {
      // 标记中国卖家
      markChineseSeller(card, sellerInfo, result.details);
      
      // 设置卡片类型属性
      card.setAttribute('data-seller-type', 'chinese');
      
      // 根据筛选模式处理显示
      if (filterMode === 'hideChinese') {
        card.style.display = 'none';
      } else {
        card.style.display = '';
      }
    } else {
      // 设置卡片类型属性
      card.setAttribute('data-seller-type', 'other');
      
      // 根据筛选模式处理显示
      if (filterMode === 'onlyChinese') {
        card.style.display = 'none';
      } else {
        card.style.display = '';
      }
    }
  } catch (error) {
    console.error('处理商品卡片时出错:', error);
  }
}

/**
 * 添加筛选控制面板
 */
function addFilterControls() {
  // 检查是否已添加控制面板
  if (document.querySelector('#cn-seller-filter-controls')) {
    return;
  }
  
  // 创建控制面板
  const controls = document.createElement('div');
  controls.id = 'cn-seller-filter-controls';
  controls.className = 'cyberpunk-controls fixed-top';
  controls.innerHTML = `
    <div class="controls-container">
      <div class="controls-header">
        <div class="header-text">Amazon中国卖家识别器</div>
        <div class="header-decoration"></div>
        <div class="close-button" id="cn-seller-close-button">×</div>
      </div>
      <div class="controls-body">
        <div class="filter-buttons">
          <button id="filter-all" class="cyberpunk-button ${filterMode === 'all' ? 'active' : ''}">
            <span class="button-text">全部显示</span>
            <span class="button-glow"></span>
          </button>
          <button id="filter-chinese" class="cyberpunk-button ${filterMode === 'onlyChinese' ? 'active' : ''}">
            <span class="button-text">仅中国卖家</span>
            <span class="button-glow"></span>
          </button>
          <button id="filter-others" class="cyberpunk-button ${filterMode === 'hideChinese' ? 'active' : ''}">
            <span class="button-text">隐藏中国卖家</span>
            <span class="button-glow"></span>
          </button>
        </div>
        <div class="scan-status" id="scan-status-container">
          <div id="scan-status-text">准备就绪</div>
          <div class="scan-progress">
            <div id="scan-progress-bar" class="progress-bar"></div>
          </div>
        </div>
        <div class="scan-controls">
          <button id="start-scan-button" class="cyberpunk-button scan-button">
            <span class="button-text">开始扫描</span>
            <span class="button-glow"></span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  // 添加到页面
  document.body.appendChild(controls);
  
  // 创建占位元素，用于固定顶部时保持布局
  const placeholder = document.createElement('div');
  placeholder.id = 'cn-seller-filter-placeholder';
  document.body.insertBefore(placeholder, document.body.firstChild);
  
  // 添加事件监听
  document.getElementById('filter-all').addEventListener('click', () => setFilterMode('all'));
  document.getElementById('filter-chinese').addEventListener('click', () => setFilterMode('onlyChinese'));
  document.getElementById('filter-others').addEventListener('click', () => setFilterMode('hideChinese'));
  
  // 关闭按钮事件
  document.getElementById('cn-seller-close-button').addEventListener('click', () => {
    controls.style.display = 'none';
    // 显示浮动按钮
    const floatingButton = document.getElementById('cn-seller-floating-button');
    if (!floatingButton) {
      addFloatingButton();
    } else {
      floatingButton.style.display = '';
    }
  });
  
  // 添加浮动控制按钮
  if (settings.floatingControlVisible !== false) {
    addFloatingButton();
  }
  
  // 添加扫描按钮事件监听
  const scanButton = document.getElementById('start-scan-button');
  if (scanButton) {
    scanButton.addEventListener('click', () => {
      console.log('开始扫描按钮被点击');
      // 更新扫描状态
      updateScanStatus(true, 0, 0);
      // 延迟一小段时间再开始扫描，确保UI更新
      setTimeout(() => {
        processSearchPage();
      }, 100);
    });
  } else {
    console.error('扫描按钮不存在');
  }
  
  // 初始化扫描状态
  updateScanStatus(false, 0, 0);
}

/**
 * 应用筛选模式
 * @param {string} mode - 筛选模式：'all'、'onlyChinese'或'hideChinese'
 */
function applyFilterMode(mode) {
  console.log('应用筛选模式:', mode);
  filterMode = mode;
  
  // 更新按钮状态
  updateFilterButtonsState(mode);
  
  // 应用筛选
  const cards = getProductCards();
  console.log('找到商品卡片数量:', cards.length);
  
  let chineseCount = 0;
  let otherCount = 0;
  let processedCount = 0;
  
  for (const card of cards) {
    const sellerType = card.getAttribute('data-seller-type');
    if (!sellerType) continue;
    
    processedCount++;
    
    if (mode === 'onlyChinese') {
      card.style.display = sellerType === 'chinese' ? '' : 'none';
      if (sellerType === 'chinese') chineseCount++;
    } 
    else if (mode === 'hideChinese') {
      card.style.display = sellerType === 'chinese' ? 'none' : '';
      if (sellerType !== 'chinese') otherCount++;
    }
    else {
      card.style.display = '';
      if (sellerType === 'chinese') chineseCount++;
      else otherCount++;
    }
  }
  
  console.log(`筛选结果: 中国卖家 ${chineseCount}, 其他卖家 ${otherCount}`);
  
  // 添加动画效果
  document.querySelectorAll('.cn-seller-card:not(.filter-animation)').forEach(card => {
    if (card.style.display !== 'none') {
      card.classList.add('filter-animation');
      setTimeout(() => {
        card.classList.remove('filter-animation');
      }, 500);
    }
  });
  
  // 更新状态文本
  const statusText = document.getElementById('scan-status-text');
  if (statusText) {
    statusText.textContent = `筛选完成: 显示${mode === 'onlyChinese' ? '中国卖家' : (mode === 'hideChinese' ? '非中国卖家' : '所有卖家')}`;
  }
}

/**
 * 更新筛选按钮状态
 * @param {string} mode - 筛选模式
 */
function updateFilterButtonsState(mode) {
  document.querySelectorAll('#cn-seller-filter-controls .filter-buttons .cyberpunk-button').forEach(button => {
    button.classList.remove('active');
  });
  
  const activeButton = document.getElementById(`filter-${mode === 'all' ? 'all' : (mode === 'onlyChinese' ? 'chinese' : 'others')}`);
  if (activeButton) {
    activeButton.classList.add('active');
  }
}

/**
 * 设置筛选模式并立即应用
 * @param {string} mode - 筛选模式：'all'、'onlyChinese'或'hideChinese'
 */
function setFilterMode(mode) {
  // 更新全局变量
  filterMode = mode;
  
  // 直接应用筛选模式
  applyFilterMode(mode);
  
  // 更新浮动控制面板中的按钮状态
  document.querySelectorAll('#cn-seller-floating-control .cyberpunk-button[data-mode]').forEach(button => {
    button.classList.remove('active');
  });
  
  const activeButton = document.querySelector(`#cn-seller-floating-control .cyberpunk-button[data-mode="${mode}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }
  
  // 保存设置
  chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
    const updatedSettings = response.settings || {};
    updatedSettings.filterMode = mode;
    chrome.storage.sync.set({ settings: updatedSettings }, () => {
      console.log('筛选模式已保存:', mode);
    });
  });
}

/**
 * 根据筛选模式处理卡片显示
 * @param {Element} card - 商品卡片DOM元素
 * @param {boolean} isChineseSeller - 是否为中国卖家
 */
function applyFilterToCard(card, isChineseSeller) {
  // 根据当前筛选模式决定是否显示
  if (filterMode === 'onlyChinese' && !isChineseSeller) {
    card.style.display = 'none';
  } 
  else if (filterMode === 'hideChinese' && isChineseSeller) {
    card.style.display = 'none';
  }
  else {
    card.style.display = '';
  }
  
  // 标记卡片类型（用于筛选）
  if (isChineseSeller) {
    card.setAttribute('data-seller-type', 'chinese');
  } else {
    card.setAttribute('data-seller-type', 'other');
  }
}

/**
 * 更新扫描状态
 * @param {boolean} isScanning - 是否正在扫描
 * @param {number} current - 当前已扫描数量
 * @param {number} total - 总数量
 */
function updateScanStatus(isScanning, current, total) {
  const statusContainer = document.getElementById('scan-status-container');
  const statusText = document.getElementById('scan-status-text');
  const progressBar = document.getElementById('scan-progress-bar');
  
  if (!statusContainer || !statusText || !progressBar) {
    console.error('扫描状态元素不存在');
    // 如果元素不存在，尝试重新创建
    if (currentPageType === 'search') {
      addFilterControls();
      return updateScanStatus(isScanning, current, total);
    }
    return;
  }
  
  // 确保进度条容器可见且样式明显
  const scanProgress = statusContainer.querySelector('.scan-progress');
  if (scanProgress) {
    scanProgress.style.display = 'block';
    scanProgress.style.height = '16px';
    scanProgress.style.marginTop = '12px';
    scanProgress.style.marginBottom = '8px';
    scanProgress.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    scanProgress.style.borderRadius = '8px';
    scanProgress.style.overflow = 'hidden';
    scanProgress.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    scanProgress.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.7), inset 0 0 5px rgba(0, 0, 0, 0.7)';
    scanProgress.style.position = 'relative';
  }
  
  // 显示状态容器，样式更加突出
  statusContainer.style.display = 'block';
  statusContainer.style.padding = '15px';
  statusContainer.style.margin = '15px 0';
  statusContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  statusContainer.style.borderRadius = '8px';
  statusContainer.style.border = '2px solid var(--highlight-color)';
  statusContainer.style.boxShadow = '0 0 20px var(--highlight-color), inset 0 0 8px rgba(0, 0, 0, 0.9)';
  statusContainer.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
  
  // 设置状态文本样式
  statusText.style.fontSize = '16px';
  statusText.style.fontWeight = 'bold';
  statusText.style.color = 'var(--highlight-color)';
  statusText.style.textShadow = '0 0 5px var(--highlight-color)';
  statusText.style.marginBottom = '10px';
  statusText.style.letterSpacing = '0.5px';
  
  // 计算进度百分比
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  // 设置进度条样式 - 增强视觉效果
  progressBar.style.height = '100%';
  progressBar.style.backgroundColor = 'var(--highlight-color)';
  progressBar.style.width = total > 0 ? `${percentage}%` : '0%';
  progressBar.style.transition = 'width 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
  progressBar.style.boxShadow = '0 0 15px var(--highlight-color), 0 0 5px #fff';
  progressBar.style.borderRadius = '4px';
  progressBar.style.position = 'relative';
  progressBar.style.overflow = 'hidden';
  progressBar.style.display = 'block'; // 确保进度条显示
  
  // 添加进度条内部闪光效果
  if (!progressBar.querySelector('.progress-glow')) {
    const progressGlow = document.createElement('div');
    progressGlow.className = 'progress-glow';
    progressGlow.style.position = 'absolute';
    progressGlow.style.top = '0';
    progressGlow.style.left = '-15%';
    progressGlow.style.width = '15%';
    progressGlow.style.height = '100%';
    progressGlow.style.background = 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)';
    progressGlow.style.animation = 'progress-glow 1.5s infinite';
    progressBar.appendChild(progressGlow);
  }
  
  // 输出调试信息
  console.log(`更新扫描状态: ${current}/${total}, 进度: ${percentage}%, 进度条宽度: ${progressBar.style.width}`);
  
  // 更新状态文本
  if (isScanning) {
    // 添加扫描中类，用于动画效果
    statusContainer.classList.add('scanning');
    
    // 更新文本内容
    statusText.textContent = `正在扫描: ${current}/${total} (${percentage}%)`;
    
    // 添加扫描中动画
    statusText.style.animation = 'scanning-text 1.5s infinite';
    
    // 添加脉冲效果到进度条
    progressBar.style.animation = 'progress-pulse 1s infinite';
    
    // 更新扫描按钮文本
    const scanButton = document.getElementById('start-scan-button');
    if (scanButton) {
      scanButton.querySelector('.button-text').textContent = '扫描中...';
      scanButton.disabled = true;
      scanButton.style.opacity = '0.7';
      scanButton.style.cursor = 'not-allowed';
    }
  } else {
    // 移除扫描中类
    statusContainer.classList.remove('scanning');
    
    // 更新文本内容
    statusText.textContent = current > 0 ? `扫描完成: 已处理 ${current} 个商品` : '准

/**
 * 添加浮动控制按钮
 */
function addFloatingButton() {
  // 检查是否已存在浮动按钮
  if (document.getElementById('cn-seller-floating-button')) {
    return;
  }
  
  // 创建浮动按钮
  const floatingButton = document.createElement('div');
  floatingButton.id = 'cn-seller-floating-button';
  floatingButton.className = 'cyberpunk-floating-button';
  floatingButton.innerHTML = `
    <div class="button-icon">CN</div>
    <div class="floating-menu" id="cn-seller-floating-menu">
      <button class="floating-menu-item" id="floating-scan-button">扫描页面</button>
      <button class="floating-menu-item" id="floating-filter-button" data-mode="onlyChinese">仅显示中国卖家</button>
      <button class="floating-menu-item" id="floating-settings-button">设置</button>
    </div>
  `;
  
  // 设置明确的样式确保按钮在右侧
  floatingButton.style.position = 'fixed';
  floatingButton.style.bottom = '20px';
  floatingButton.style.right = '20px';
  floatingButton.style.left = 'auto';
  floatingButton.style.zIndex = '10000';
  
  // 添加到页面
  document.body.appendChild(floatingButton);
  
  // 添加点击事件
  floatingButton.addEventListener('click', (e) => {
    // 如果点击的是按钮本身而不是菜单项
    if (e.target.closest('.button-icon')) {
      // 显示/隐藏浮动菜单
      const menu = document.getElementById('cn-seller-floating-menu');
      if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      }
    }
  });
  
  // 添加扫描按钮事件
  const scanButton = document.getElementById('floating-scan-button');
  if (scanButton) {
    scanButton.addEventListener('click', () => {
      // 显示控制面板
      const controls = document.getElementById('cn-seller-filter-controls');
      if (controls) {
        controls.style.display = '';
        // 隐藏浮动按钮
        floatingButton.style.display = 'none';
      }
      // 触发扫描
      processSearchPage();
    });
  }
  
  // 添加筛选按钮事件
  const filterButton = document.getElementById('floating-filter-button');
  if (filterButton) {
    filterButton.addEventListener('click', () => {
      // 切换筛选模式
      const currentMode = filterButton.getAttribute('data-mode');
      const newMode = currentMode === 'onlyChinese' ? 'all' : 'onlyChinese';
      setFilterMode(newMode);
      filterButton.setAttribute('data-mode', newMode);
      filterButton.textContent = newMode === 'onlyChinese' ? '仅显示中国卖家' : '显示所有卖家';
    });
  }
  
  // 添加设置按钮事件
  const settingsButton = document.getElementById('floating-settings-button');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOptions' });
    });
  }
  
  // 添加浮动菜单样式
  const style = document.createElement('style');
  style.textContent = `
    #cn-seller-floating-menu {
      display: none;
      position: absolute;
      bottom: 60px;
      right: 0;
      background-color: rgba(0, 0, 0, 0.9);
      border: 1px solid var(--highlight-color);
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 0 15px var(--highlight-color);
    }
    
    .floating-menu-item {
      display: block;
      width: 150px;
      padding: 8px 12px;
      margin: 5px 0;
      background-color: rgba(255, 255, 255, 0.1);
      color: white;
      border: none;
      border-radius: 4px;
      text-align: left;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .floating-menu-item:hover {
      background-color: var(--highlight-color);
      transform: translateX(-5px);
    }
  `;
  document.head.appendChild(style);
}
}

/**
 * 提取卖家信息
 * @param {Element} card - 商品卡片DOM元素
 * @return {Object|null} 卖家信息对象或null
 */
function extractSellerInfo(card) {
  // 尝试多种选择器来提取卖家信息
  const sellerSelectors = [
    '.a-row .a-size-small:not(.a-color-secondary)',
    '.a-row .a-size-base:not(.a-color-secondary)',
    '.a-row a[href*="seller="]',
    '.a-row span:contains("by")',
    '.a-row:contains("by")',
    '.s-sold-by a',
    '.a-spacing-none:contains("by")',
    '.a-color-secondary:contains("by")',
    '.a-size-small:contains("by")',
    '.a-link-normal[href*="seller="]'
  ];
  
  let sellerElement = null;
  let sellerText = '';
  
  // 尝试各种选择器找到卖家信息
  for (const selector of sellerSelectors) {
    try {
      if (selector.includes(':contains')) {
        // 处理包含特定文本的选择器
        const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
        const elements = Array.from(card.querySelectorAll('.a-row, .a-size-small, .a-color-secondary'));
        sellerElement = elements.find(el => el.textContent.includes(textToFind));
      } else {
        sellerElement = card.querySelector(selector);
      }
      
      if (sellerElement && sellerElement.textContent.trim()) {
        sellerText = sellerElement.textContent.trim();
        console.log('找到卖家元素:', selector, sellerText);
        break;
      }
    } catch (error) {
      console.warn('选择器解析错误:', error);
    }
  }
  
  if (!sellerElement || !sellerText) {
    return null;
  }
  
  // 提取卖家名称和链接
  let sellerName = '';
  let sellerUrl = '';
  let sellerId = 'unknown';
  
  // 查找卖家链接
  const sellerLink = sellerElement.querySelector('a[href*="seller="]') || 
                    sellerElement.closest('a[href*="seller="]');
  
  if (sellerLink) {
    sellerName = sellerLink.textContent.trim();
    sellerUrl = sellerLink.href;
    
    // 提取卖家ID
    if (sellerUrl.includes('seller=')) {
      sellerId = sellerUrl.split('seller=')[1].split('&')[0];
    }
  } else {
    // 尝试从文本中提取卖家名称
    const byMatch = sellerText.match(/by\s+([^\n]+)/i);
    if (byMatch) {
      sellerName = byMatch[1].trim();
    } else {
      sellerName = sellerText;
    }
  }
  
  return {
    sellerId,
    sellerName,
    sellerUrl
  };
}

/**
 * 添加滚动事件监听
 */
function addScrollListener() {
  // 防抖动函数
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      // 检查是否有新的商品卡片
      const processedCards = document.querySelectorAll('[data-seller-type]');
      const allCards = getProductCards();
      
      // 找出未处理的卡片
      const unprocessedCards = Array.from(allCards).filter(card => {
        return !card.hasAttribute('data-seller-type');
      });
      
      if (unprocessedCards.length > 0) {
        console.log('发现新的未处理卡片:', unprocessedCards.length);
        // 处理新的卡片
        for (const card of unprocessedCards) {
          processProductCard(card);
        }
      }
    }, settings.scanDelay || 500);
  });
}

/**
 * 监听页面变化
 */
function observePageChanges() {
  // 如果已经在监听，则不重复添加
  if (observerActive) return;
  
  // 创建MutationObserver实例
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的商品卡片
    const processedCards = document.querySelectorAll('[data-seller-type]');
    const allCards = getProductCards();
    
    // 找出未处理的卡片
    const unprocessedCards = Array.from(allCards).filter(card => {
      return !card.hasAttribute('data-seller-type');
    });
    
    if (unprocessedCards.length > 0) {
      console.log('观察到DOM变化，发现新卡片:', unprocessedCards.length);
      // 处理新的卡片
      for (const card of unprocessedCards) {
        processProductCard(card);
      }
    }
  });
  
  // 配置观察选项
  const config = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };
  
  // 开始观察
  const targetNode = document.querySelector('#search') || document.querySelector('.s-main-slot') || document.body;
  observer.observe(targetNode, config);
  
  // 标记为已激活
  observerActive = true;
}

/**
 * 处理商品详情页
 */
function processProductPage() {
  // 提取卖家信息
  const sellerInfo = extractSellerInfoFromProductPage(document);
  
  if (!sellerInfo) {
    console.log('无法获取卖家信息');
    return;
  }
  
  // 使用SellerDetector类检查卖家是否为中国卖家
  const detector = new SellerDetector(settings);
  detector.checkIfChineseSeller(
    sellerInfo.sellerId, 
    sellerInfo.sellerName, 
    sellerInfo.sellerUrl
  ).then(result => {
    // 更新卖家缓存
    updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
    
    if (result.isChineseSeller) {
      // 标记中国卖家
      const sellerElement = document.querySelector('#merchant-info') || 
                           document.querySelector('#sellerProfileTriggerId');
      
      if (sellerElement) {
        sellerElement.classList.add('cn-seller-highlight');
        sellerElement.style.color = settings.highlightColor || '#ff0055';
        sellerElement.style.fontWeight = 'bold';
        sellerElement.style.textShadow = '0 0 3px ' + (settings.highlightColor || '#ff0055');
        
        // 添加标记
        const mark = document.createElement('span');
        mark.className = 'cn-seller-mark-inline';
        mark.textContent = ' [中国卖家]';
        mark.style.color = settings.highlightColor || '#ff0055';
        mark.style.fontWeight = 'bold';
        sellerElement.appendChild(mark);
      }
    }
  });
}

/**
 * 标记中国卖家
 * @param {Element} card - 商品卡片DOM元素
 * @param {Object} sellerInfo - 卖家信息
 * @param {Object} details - 识别详情
 */
function markChineseSeller(card, sellerInfo, details) {
  // 添加标记类
  card.classList.add('cn-seller-card');
  
  // 添加边框效果
  if (settings.showBorder) {
    card.classList.add('cyberpunk-border');
    // 增强边框效果
    card.style.boxShadow = `0 0 15px var(--highlight-color), inset 0 0 8px var(--highlight-color)`;
    card.style.border = `2px solid var(--highlight-color)`;
    card.style.borderRadius = '4px';
    card.style.transform = 'scale(1.02)';
    card.style.transition = 'all 0.3s ease';
    card.style.zIndex = '10';
  }
  
  // 查找商品标题
  const titleElement = card.querySelector('h2') || card.querySelector('.a-size-medium') || card.querySelector('.a-link-normal h2');
  if (titleElement) {
    titleElement.classList.add('cn-seller-title');
    // 增强标题效果
    titleElement.style.color = 'var(--highlight-color)';
    titleElement.style.textShadow = '0 0 5px var(--highlight-color)';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.letterSpacing = '0.5px';
    
    // 添加闪烁动画
    titleElement.style.animation = 'title-glow 2s infinite alternate';
  }
  
  // 添加中国卖家标记图标
  if (settings.showIcon) {
    const mark = document.createElement('div');
    mark.className = 'cn-seller-mark';
    mark.innerHTML = `<span class="mark-text">CN</span>`;
    mark.title = `卖家: ${sellerInfo.sellerName}\n识别为中国卖家`;
    
    // 增强图标效果
    mark.style.position = 'absolute';
    mark.style.top = '5px';
    mark.style.right = '5px';
    mark.style.backgroundColor = 'var(--highlight-color)';
    mark.style.color = 'white';
    mark.style.padding = '4px 8px';
    mark.style.borderRadius = '4px';
    mark.style.fontSize = '14px';
    mark.style.fontWeight = 'bold';
    mark.style.zIndex = '100';
    mark.style.boxShadow = '0 0 10px var(--highlight-color), 0 0 5px var(--highlight-color)';
    mark.style.animation = 'pulse 1.5s infinite';
    mark.style.textShadow = '0 0 3px white';
    
    // 添加到卡片
    const cardContainer = card.querySelector('.a-section') || card;
    cardContainer.style.position = 'relative';
    cardContainer.appendChild(mark);
  }
  
  // 应用筛选模式
  applyFilterToCard(card, true);
  
  // 添加闪烁效果
  setTimeout(() => {
    const markElement = card.querySelector('.cn-seller-mark');
    if (markElement) {
      markElement.style.animation = 'glitch 2s infinite alternate';
    }
  }, 1500);
  
  // 添加动画效果
  card.classList.add('filter-animation');
  
  // 添加高亮闪烁效果
  const flashOverlay = document.createElement('div');
  flashOverlay.className = 'cn-seller-flash-overlay';
  flashOverlay.style.position = 'absolute';
  flashOverlay.style.top = '0';
  flashOverlay.style.left = '0';
  flashOverlay.style.width = '100%';
  flashOverlay.style.height = '100%';
  flashOverlay.style.backgroundColor = 'var(--highlight-color)';
  flashOverlay.style.opacity = '0.3';
  flashOverlay.style.zIndex = '5';
  flashOverlay.style.pointerEvents = 'none';
  flashOverlay.style.borderRadius = '4px';
  
  // 确保卡片有相对定位，以便绝对定位的覆盖层正确显示
  if (window.getComputedStyle(card).position === 'static') {
    card.style.position = 'relative';
  }
  
  card.appendChild(flashOverlay);
  
  // 闪烁动画
  setTimeout(() => {
    flashOverlay.style.opacity = '0';
    flashOverlay.style.transition = 'opacity 0.5s ease';
  }, 100);
  
  setTimeout(() => {
    card.classList.remove('filter-animation');
    if (flashOverlay && flashOverlay.parentNode) {
      flashOverlay.remove();
    }
  }, 1000);
  
  // 添加价格标记（如果存在）
  const priceElement = card.querySelector('.a-price') || card.querySelector('.a-color-price');
  if (priceElement) {
    priceElement.style.color = 'var(--highlight-color)';
    priceElement.style.fontWeight = 'bold';
  }
}

/**
 * 更新卖家缓存
 * @param {string} sellerId - 卖家ID
 * @param {boolean} isChineseSeller - 是否为中国卖家
 * @param {number} confidence - 置信度
 * @param {Object} details - 详细信息
 */
function updateSellerCache(sellerId, isChineseSeller, confidence, details) {
  if (!sellerId || sellerId === 'unknown') return;
  
  // 获取现有缓存
  chrome.storage.local.get('sellerCache', data => {
    const cache = data.sellerCache || {};
    
    // 检查是否已存在相同数据，避免重复更新
    const existingEntry = cache[sellerId];
    if (existingEntry && 
        existingEntry.isChineseSeller === isChineseSeller && 
        existingEntry.confidence === confidence) {
      console.log(`卖家 ${sellerId} 数据未变化，跳过更新`);
      return;
    }
    
    // 更新缓存
    cache[sellerId] = {
      isChineseSeller,
      confidence,
      details,
      lastUpdated: new Date().toISOString()
    };
    
    // 保存缓存
    chrome.storage.local.set({ sellerCache: cache }, () => {
      console.log(`卖家 ${sellerId} 已${isChineseSeller ? '标记为中国卖家' : '不是中国卖家'}，置信度: ${confidence}`);
      
      // 立即更新卖家计数
      updateSellerCount();
      
      // 发送消息通知popup更新
      chrome.runtime.sendMessage({
        action: 'sellerCacheUpdated',
        data: {
          sellerId,
          isChineseSeller,
          confidence
        }
      });
    });
  });
}

// 注意：全局样式已移至utils/global-styles.js中的window.addGlobalStyles函数

/**
 * 从商品详情页获取卖家信息
 * @param {string} productUrl - 商品URL
 * @param {Element} card - 商品卡片DOM元素
 */
async function fetchSellerInfoFromProductPage(productUrl, card) {
  try {
    // 确保SellerDetector已加载
    await loadSellerDetector();
    
    // 直接获取页面内容
    const response = await fetch(productUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'User-Agent': navigator.userAgent
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // 解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 提取卖家信息
    const sellerInfo = extractSellerInfoFromProductPage(doc);
    
    if (sellerInfo) {
      // 检查SellerDetector是否可用
      if (typeof SellerDetector === 'undefined' || !window.SellerDetector) {
        console.error('SellerDetector类未加载，无法检测卖家');
        return;
      }
      
      // 使用SellerDetector类检查卖家是否为中国卖家
      const detector = new window.SellerDetector(settings);
      const result = await detector.checkIfChineseSeller(
        sellerInfo.sellerId, 
        sellerInfo.sellerName, 
        sellerInfo.sellerUrl
      );
      
      // 更新卖家缓存
      updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
      
      if (result.isChineseSeller) {
        // 标记中国卖家
        markChineseSeller(card, sellerInfo, result.details);
        
        // 根据筛选模式处理显示
        applyFilterToCard(card, true);
      } else {
        // 根据筛选模式处理显示
        applyFilterToCard(card, false);
      }
    }
  } catch (error) {
    console.error('获取商品详情页失败:', error);
  }
}

/**
 * 从商品详情页提取卖家信息
 * @param {Document} doc - 解析后的商品详情页文档
 * @return {Object|null} 卖家信息对象或null
 */
function extractSellerInfoFromProductPage(doc) {
  // 尝试多种选择器来提取卖家信息
  const sellerSelectors = [
    '#merchant-info',
    '#sellerProfileTriggerId',
    '.tabular-buybox-text a',
    '.offer-display-feature-text',
    '.a-row:contains("Sold by")',
    '.a-row:contains("Ships from")',
    '.a-row a[href*="seller="]'
  ];
  
  let sellerElement = null;
  let sellerText = '';
  
  // 尝试各种选择器找到卖家信息
  for (const selector of sellerSelectors) {
    try {
      if (selector.includes(':contains')) {
        // 处理包含特定文本的选择器
        const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
        const elements = Array.from(doc.querySelectorAll('.a-row, .a-section'));
        sellerElement = elements.find(el => el.textContent.includes(textToFind));
      } else {
        sellerElement = doc.querySelector(selector);
      }
      
      if (sellerElement) {
        sellerText = sellerElement.textContent.trim();
        break;
      }
    } catch (error) {
      console.warn('选择器解析错误:', error);
    }
  }
  
  if (!sellerElement) {
    return null;
  }
  
  // 提取卖家名称和链接
  let sellerName = '';
  let sellerUrl = '';
  let sellerId = 'unknown';
  
  // 查找卖家链接
  const sellerLink = sellerElement.querySelector('a[href*="seller="]') || 
                    sellerElement.closest('a[href*="seller="]');
  
  if (sellerLink) {
    sellerName = sellerLink.textContent.trim();
    sellerUrl = sellerLink.href;
    
    // 提取卖家ID
    if (sellerUrl.includes('seller=')) {
      sellerId = sellerUrl.split('seller=')[1].split('&')[0];
    }
  } else {
    // 尝试从文本中提取卖家名称
    const byMatch = sellerText.match(/by\s+([^\n]+)/i);
    if (byMatch) {
      sellerName = byMatch[1].trim();
    } else {
      sellerName = sellerText;
    }
  }
  
  return {
    sellerId,
    sellerName,
    sellerUrl
  };
}

/**
 * 添加滚动事件监听
 */
function addScrollListener() {
  // 防抖动函数
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      // 检查是否有新的商品卡片
      const processedCards = document.querySelectorAll('[data-seller-type]');
      const allCards = getProductCards();
      
      // 找出未处理的卡片
      const unprocessedCards = Array.from(allCards).filter(card => {
        return !card.hasAttribute('data-seller-type');
      });
      
      if (unprocessedCards.length > 0) {
        console.log('发现新的未处理卡片:', unprocessedCards.length);
        // 处理新的卡片
        for (const card of unprocessedCards) {
          processProductCard(card);
        }
      }
    }, settings.scanDelay || 500);
  });
}

/**
 * 监听页面变化
 */
function observePageChanges() {
  // 如果已经在监听，则不重复添加
  if (observerActive) return;
  
  // 创建MutationObserver实例
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的商品卡片
    const processedCards = document.querySelectorAll('[data-seller-type]');
    const allCards = getProductCards();
    
    // 找出未处理的卡片
    const unprocessedCards = Array.from(allCards).filter(card => {
      return !card.hasAttribute('data-seller-type');
    });
    
    if (unprocessedCards.length > 0) {
      console.log('观察到DOM变化，发现新卡片:', unprocessedCards.length);
      // 处理新的卡片
      for (const card of unprocessedCards) {
        processProductCard(card);
      }
    }
  });
  
  // 配置观察选项
  const config = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };
  
  // 开始观察
  const targetNode = document.querySelector('#search') || document.querySelector('.s-main-slot') || document.body;
  observer.observe(targetNode, config);
  
  // 标记为已激活
  observerActive = true;
}

/**
 * 处理商品详情页
 */
function processProductPage() {
  // 提取卖家信息
  const sellerInfo = extractSellerInfoFromProductPage(document);
  
  if (!sellerInfo) {
    console.log('无法获取卖家信息');
    return;
  }
  
  // 使用SellerDetector类检查卖家是否为中国卖家
  const detector = new SellerDetector(settings);
  detector.checkIfChineseSeller(
    sellerInfo.sellerId, 
    sellerInfo.sellerName, 
    sellerInfo.sellerUrl
  ).then(result => {
    // 更新卖家缓存
    updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
    
    if (result.isChineseSeller) {
      // 标记中国卖家
      const sellerElement = document.querySelector('#merchant-info') || 
                           document.querySelector('#sellerProfileTriggerId');
      
      if (sellerElement) {
        sellerElement.classList.add('cn-seller-highlight');
        sellerElement.style.color = settings.highlightColor || '#ff0055';
        sellerElement.style.fontWeight = 'bold';
        sellerElement.style.textShadow = '0 0 3px ' + (settings.highlightColor || '#ff0055');
        
        // 添加标记
        const mark = document.createElement('span');
        mark.className = 'cn-seller-mark-inline';
        mark.textContent = ' [中国卖家]';
        mark.style.color = settings.highlightColor || '#ff0055';
        mark.style.fontWeight = 'bold';
        sellerElement.appendChild(mark);
      }
    }
  });
}

/**
 * 标记中国卖家
 * @param {Element} card - 商品卡片DOM元素
 * @param {Object} sellerInfo - 卖家信息
 * @param {Object} details - 识别详情
 */
function markChineseSeller(card, sellerInfo, details) {
  // 添加标记类
  card.classList.add('cn-seller-card');
  
  // 添加边框效果
  if (settings.showBorder) {
    card.classList.add('cyberpunk-border');
    // 增强边框效果
    card.style.boxShadow = `0 0 15px var(--highlight-color), inset 0 0 8px var(--highlight-color)`;
    card.style.border = `2px solid var(--highlight-color)`;
    card.style.borderRadius = '4px';
    card.style.transform = 'scale(1.02)';
    card.style.transition = 'all 0.3s ease';
    card.style.zIndex = '10';
  }
  
  // 查找商品标题
  const titleElement = card.querySelector('h2') || card.querySelector('.a-size-medium') || card.querySelector('.a-link-normal h2');
  if (titleElement) {
    titleElement.classList.add('cn-seller-title');
    // 增强标题效果
    titleElement.style.color = 'var(--highlight-color)';
    titleElement.style.textShadow = '0 0 5px var(--highlight-color)';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.letterSpacing = '0.5px';
    
    // 添加闪烁动画
    titleElement.style.animation = 'title-glow 2s infinite alternate';
  }
  
  // 添加中国卖家标记图标
  if (settings.showIcon) {
    const mark = document.createElement('div');
    mark.className = 'cn-seller-mark';
    mark.innerHTML = `<span class="mark-text">CN</span>`;
    mark.title = `卖家: ${sellerInfo.sellerName}\n识别为中国卖家`;
    
    // 增强图标效果
    mark.style.position = 'absolute';
    mark.style.top = '5px';
    mark.style.right = '5px';
    mark.style.backgroundColor = 'var(--highlight-color)';
    mark.style.color = 'white';
    mark.style.padding = '4px 8px';
    mark.style.borderRadius = '4px';
    mark.style.fontSize = '14px';
    mark.style.fontWeight = 'bold';
    mark.style.zIndex = '100';
    mark.style.boxShadow = '0 0 10px var(--highlight-color), 0 0 5px var(--highlight-color)';
    mark.style.animation = 'pulse 1.5s infinite';
    mark.style.textShadow = '0 0 3px white';
    
    // 添加到卡片
    const cardContainer = card.querySelector('.a-section') || card;
    cardContainer.style.position = 'relative';
    cardContainer.appendChild(mark);
  }
  
  // 应用筛选模式
  applyFilterToCard(card, true);
  
  // 添加闪烁效果
  setTimeout(() => {
    const markElement = card.querySelector('.cn-seller-mark');
    if (markElement) {
      markElement.style.animation = 'glitch 2s infinite alternate';
    }
  }, 1500);
  
  // 添加动画效果
  card.classList.add('filter-animation');
  
  // 添加高亮闪烁效果
  const flashOverlay = document.createElement('div');
  flashOverlay.className = 'cn-seller-flash-overlay';
  flashOverlay.style.position = 'absolute';
  flashOverlay.style.top = '0';
  flashOverlay.style.left = '0';
  flashOverlay.style.width = '100%';
  flashOverlay.style.height = '100%';
  flashOverlay.style.backgroundColor = 'var(--highlight-color)';
  flashOverlay.style.opacity = '0.3';
  flashOverlay.style.zIndex = '5';
  flashOverlay.style.pointerEvents = 'none';
  flashOverlay.style.borderRadius = '4px';
  
  // 确保卡片有相对定位，以便绝对定位的覆盖层正确显示
  if (window.getComputedStyle(card).position === 'static') {
    card.style.position = 'relative';
  }
  
  card.appendChild(flashOverlay);
  
  // 闪烁动画
  setTimeout(() => {
    flashOverlay.style.opacity = '0';
    flashOverlay.style.transition = 'opacity 0.5s ease';
  }, 100);
  
  setTimeout(() => {
    card.classList.remove('filter-animation');
    if (flashOverlay && flashOverlay.parentNode) {
      flashOverlay.remove();
    }
  }, 1000);
  
  // 添加价格标记（如果存在）
  const priceElement = card.querySelector('.a-price') || card.querySelector('.a-color-price');
  if (priceElement) {
    priceElement.style.color = 'var(--highlight-color)';
    priceElement.style.fontWeight = 'bold';
  }
}

/**
 * 更新卖家缓存
 * @param {string} sellerId - 卖家ID
 * @param {boolean} isChineseSeller - 是否为中国卖家
 * @param {number} confidence - 置信度
 * @param {Object} details - 详细信息
 */
function updateSellerCache(sellerId, isChineseSeller, confidence, details) {
  if (!sellerId || sellerId === 'unknown') return;
  
  // 获取现有缓存
  chrome.storage.local.get('sellerCache', data => {
    const cache = data.sellerCache || {};
    
    // 检查是否已存在相同数据，避免重复更新
    const existingEntry = cache[sellerId];
    if (existingEntry && 
        existingEntry.isChineseSeller === isChineseSeller && 
        existingEntry.confidence === confidence) {
      console.log(`卖家 ${sellerId} 数据未变化，跳过更新`);
      return;
    }
    
    // 更新缓存
    cache[sellerId] = {
      isChineseSeller,
      confidence,
      details,
      lastUpdated: new Date().toISOString()
    };
    
    // 保存缓存
    chrome.storage.local.set({ sellerCache: cache }, () => {
      console.log(`卖家 ${sellerId} 已${isChineseSeller ? '标记为中国卖家' : '不是中国卖家'}，置信度: ${confidence}`);
      
      // 立即更新卖家计数
      updateSellerCount();
      
      // 发送消息通知popup更新
      chrome.runtime.sendMessage({
        action: 'sellerCacheUpdated',
        data: {
          sellerId,
          isChineseSeller,
          confidence
        }
      });
    });
  });
}

// 注意：全局样式已移至utils/global-styles.js中的window.addGlobalStyles函数

/**
 * 从商品详情页获取卖家信息
 * @param {string} productUrl - 商品URL
 * @param {Element} card - 商品卡片DOM元素
 */
async function fetchSellerInfoFromProductPage(productUrl, card) {
  try {
    // 确保SellerDetector已加载
    await loadSellerDetector();
    
    // 直接获取页面内容
    const response = await fetch(productUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'User-Agent': navigator.userAgent
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // 解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 提取卖家信息
    const sellerInfo = extractSellerInfoFromProductPage(doc);
    
    if (sellerInfo) {
      // 检查SellerDetector是否可用
      if (typeof SellerDetector === 'undefined' || !window.SellerDetector) {
        console.error('SellerDetector类未加载，无法检测卖家');
        return;
      }
      
      // 使用SellerDetector类检查卖家是否为中国卖家
      const detector = new window.SellerDetector(settings);
      const result = await detector.checkIfChineseSeller(
        sellerInfo.sellerId, 
        sellerInfo.sellerName, 
        sellerInfo.sellerUrl
      );
      
      // 更新卖家缓存
      updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
      
      if (result.isChineseSeller) {
        // 标记中国卖家
        markChineseSeller(card, sellerInfo, result.details);
        
        // 根据筛选模式处理显示
        applyFilterToCard(card, true);
      } else {
        // 根据筛选模式处理显示
        applyFilterToCard(card, false);
      }
    }
  } catch (error) {
    console.error('获取商品详情页失败:', error);
  }
}

/**
 * 从商品详情页提取卖家信息
 * @param {Document} doc - 解析后的商品详情页文档
 * @return {Object|null} 卖家信息对象或null
 */
function extractSellerInfoFromProductPage(doc) {
  // 尝试多种选择器来提取卖家信息
  const sellerSelectors = [
    '#merchant-info',
    '#sellerProfileTriggerId',
    '.tabular-buybox-text a',
    '.offer-display-feature-text',
    '.a-row:contains("Sold by")',
    '.a-row:contains("Ships from")',
    '.a-row a[href*="seller="]'
  ];
  
  let sellerElement = null;
  let sellerText = '';
  
  // 尝试各种选择器找到卖家信息
  for (const selector of sellerSelectors) {
    try {
      if (selector.includes(':contains')) {
        const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
        const elements = Array.from(doc.querySelectorAll('.a-row, .a-section'));
        sellerElement = elements.find(el => el.textContent.includes(textToFind));
      } else {
        sellerElement = doc.querySelector(selector);
      }
      
      if (sellerElement) {
        sellerText = sellerElement.textContent.trim();
        break;
      }
    } catch (error) {
      console.warn('选择器解析错误:', error);
    }
  }
  
  if (!sellerElement) {
    return null;
  }
  
  // 提取卖家名称和链接
  let sellerName = '';
  let sellerUrl = '';
  let sellerId = 'unknown';
  
  // 查找卖家链接
  const sellerLink = sellerElement.querySelector('a[href*="seller="]') || 
                    sellerElement.closest('a[href*="seller="]');
  
  if (sellerLink) {
    sellerName = sellerLink.textContent.trim();
    sellerUrl = sellerLink.href;
    
    // 提取卖家ID
    if (sellerUrl.includes('seller=')) {
      sellerId = sellerUrl.split('seller=')[1].split('&')[0];
    }
  } else {
    // 尝试从文本中提取卖家名称
    const sellerText = sellerElement.textContent.trim();
    const byMatch = sellerText.match(/by\s+([^\n]+)/i);
    if (byMatch) {
      sellerName = byMatch[1].trim();
    } else {
      sellerName = sellerText;
    }
  }
  
  return {
    sellerId,
    sellerName,
    sellerUrl
  };
}

/**
 * 添加滚动事件监听
 */
function addScrollListener() {
  // 防抖动函数
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      // 检查是否有新的商品卡片
      const processedCards = document.querySelectorAll('[data-seller-type]');
      const allCards = getProductCards();
      
      // 找出未处理的卡片
      const unprocessedCards = Array.from(allCards).filter(card => {
        return !card.hasAttribute('data-seller-type');
      });
      
      if (unprocessedCards.length > 0) {
        console.log('发现新的未处理卡片:', unprocessedCards.length);
        // 处理新的卡片
        for (const card of unprocessedCards) {
          processProductCard(card);
        }
      }
    }, settings.scanDelay || 500);
  });
}

/**
 * 监听页面变化
 */
function observePageChanges() {
  // 如果已经在监听，则不重复添加
  if (observerActive) return;
  
  // 创建MutationObserver实例
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的商品卡片
    const processedCards = document.querySelectorAll('[data-seller-type]');
    const allCards = getProductCards();
    
    // 找出未处理的卡片
    const unprocessedCards = Array.from(allCards).filter(card => {
      return !card.hasAttribute('data-seller-type');
    });
    
    if (unprocessedCards.length > 0) {
      console.log('观察到DOM变化，发现新卡片:', unprocessedCards.length);
      // 处理新的卡片
      for (const card of unprocessedCards) {
        processProductCard(card);
      }
    }
  });
  
  // 配置观察选项
  const config = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };
  
  // 开始观察
  const targetNode = document.querySelector('#search') || document.querySelector('.s-main-slot') || document.body;
  observer.observe(targetNode, config);
  
  // 标记为已激活
  observerActive = true;
}

/**
 * 处理商品详情页
 */
function processProductPage() {
  // 提取卖家信息
  const sellerInfo = extractSellerInfoFromProductPage(document);
  
  if (!sellerInfo) {
    console.log('无法获取卖家信息');
    return;
  }
  
  // 使用SellerDetector类检查卖家是否为中国卖家
  const detector = new SellerDetector(settings);
  detector.checkIfChineseSeller(
    sellerInfo.sellerId, 
    sellerInfo.sellerName, 
    sellerInfo.sellerUrl
  ).then(result => {
    // 更新卖家缓存
    updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
    
    if (result.isChineseSeller) {
      // 标记中国卖家
      const sellerElement = document.querySelector('#merchant-info') || 
                           document.querySelector('#sellerProfileTriggerId');
      
      if (sellerElement) {
        sellerElement.classList.add('cn-seller-highlight');
        sellerElement.style.color = settings.highlightColor || '#ff0055';
        sellerElement.style.fontWeight = 'bold';
        sellerElement.style.textShadow = '0 0 3px ' + (settings.highlightColor || '#ff0055');
        
        // 添加标记
        const mark = document.createElement('span');
        mark.className = 'cn-seller-mark-inline';
        mark.textContent = ' [中国卖家]';
        mark.style.color = settings.highlightColor || '#ff0055';
        mark.style.fontWeight = 'bold';
        sellerElement.appendChild(mark);
      }
    }
  });
}

/**
 * 标记中国卖家
 * @param {Element} card - 商品卡片DOM元素
 * @param {Object} sellerInfo - 卖家信息
 * @param {Object} details - 识别详情
 */
function markChineseSeller(card, sellerInfo, details) {
  // 添加标记类
  card.classList.add('cn-seller-card');
  
  // 添加边框效果
  if (settings.showBorder) {
    card.classList.add('cyberpunk-border');
    // 增强边框效果
    card.style.boxShadow = `0 0 15px var(--highlight-color), inset 0 0 8px var(--highlight-color)`;
    card.style.border = `2px solid var(--highlight-color)`;
    card.style.borderRadius = '4px';
    card.style.transform = 'scale(1.02)';
    card.style.transition = 'all 0.3s ease';
    card.style.zIndex = '10';
  }
  
  // 查找商品标题
  const titleElement = card.querySelector('h2') || card.querySelector('.a-size-medium') || card.querySelector('.a-link-normal h2');
  if (titleElement) {
    titleElement.classList.add('cn-seller-title');
    // 增强标题效果
    titleElement.style.color = 'var(--highlight-color)';
    titleElement.style.textShadow = '0 0 5px var(--highlight-color)';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.letterSpacing = '0.5px';
    
    // 添加闪烁动画
    titleElement.style.animation = 'title-glow 2s infinite alternate';
  }
  
  // 添加中国卖家标记图标
  if (settings.showIcon) {
    const mark = document.createElement('div');
    mark.className = 'cn-seller-mark';
    mark.innerHTML = `<span class="mark-text">CN</span>`;
    mark.title = `卖家: ${sellerInfo.sellerName}\n识别为中国卖家`;
    
    // 增强图标效果
    mark.style.position = 'absolute';
    mark.style.top = '5px';
    mark.style.right = '5px';
    mark.style.backgroundColor = 'var(--highlight-color)';
    mark.style.color = 'white';
    mark.style.padding = '4px 8px';
    mark.style.borderRadius = '4px';
    mark.style.fontSize = '14px';
    mark.style.fontWeight = 'bold';
    mark.style.zIndex = '100';
    mark.style.boxShadow = '0 0 10px var(--highlight-color), 0 0 5px var(--highlight-color)';
    mark.style.animation = 'pulse 1.5s infinite';
    mark.style.textShadow = '0 0 3px white';
    
    // 添加到卡片
    const cardContainer = card.querySelector('.a-section') || card;
    cardContainer.style.position = 'relative';
    cardContainer.appendChild(mark);
  }
  
  // 应用筛选模式
  applyFilterToCard(card, true);
  
  // 添加闪烁效果
  setTimeout(() => {
    const markElement = card.querySelector('.cn-seller-mark');
    if (markElement) {
      markElement.style.animation = 'glitch 2s infinite alternate';
    }
  }, 1500);
  
  // 添加动画效果
  card.classList.add('filter-animation');
  
  // 添加高亮闪烁效果
  const flashOverlay = document.createElement('div');
  flashOverlay.className = 'cn-seller-flash-overlay';
  flashOverlay.style.position = 'absolute';
  flashOverlay.style.top = '0';
  flashOverlay.style.left = '0';
  flashOverlay.style.width = '100%';
  flashOverlay.style.height = '100%';
  flashOverlay.style.backgroundColor = 'var(--highlight-color)';
  flashOverlay.style.opacity = '0.3';
  flashOverlay.style.zIndex = '5';
  flashOverlay.style.pointerEvents = 'none';
  flashOverlay.style.borderRadius = '4px';
  
  // 确保卡片有相对定位，以便绝对定位的覆盖层正确显示
  if (window.getComputedStyle(card).position === 'static') {
    card.style.position = 'relative';
  }
  
  card.appendChild(flashOverlay);
  
  // 闪烁动画
  setTimeout(() => {
    flashOverlay.style.opacity = '0';
    flashOverlay.style.transition = 'opacity 0.5s ease';
  }, 100);
  
  setTimeout(() => {
    card.classList.remove('filter-animation');
    if (flashOverlay && flashOverlay.parentNode) {
      flashOverlay.remove();
    }
  }, 1000);
  
  // 添加价格标记（如果存在）
  const priceElement = card.querySelector('.a-price') || card.querySelector('.a-color-price');
  if (priceElement) {
    priceElement.style.color = 'var(--highlight-color)';
    priceElement.style.fontWeight = 'bold';
  }
}

/**
 * 更新卖家缓存
 * @param {string} sellerId - 卖家ID
 * @param {boolean} isChineseSeller - 是否为中国卖家
 * @param {number} confidence - 置信度
 * @param {Object} details - 详细信息
 */
function updateSellerCache(sellerId, isChineseSeller, confidence, details) {
  if (!sellerId || sellerId === 'unknown') return;
  
  // 获取现有缓存
  chrome.storage.local.get('sellerCache', data => {
    const cache = data.sellerCache || {};
    
    // 检查是否已存在相同数据，避免重复更新
    const existingEntry = cache[sellerId];
    if (existingEntry && 
        existingEntry.isChineseSeller === isChineseSeller && 
        existingEntry.confidence === confidence) {
      console.log(`卖家 ${sellerId} 数据未变化，跳过更新`);
      return;
    }
    
    // 更新缓存
    cache[sellerId] = {
      isChineseSeller,
      confidence,
      details,
      lastUpdated: new Date().toISOString()
    };
    
    // 保存缓存
    chrome.storage.local.set({ sellerCache: cache }, () => {
      console.log(`卖家 ${sellerId} 已${isChineseSeller ? '标记为中国卖家' : '不是中国卖家'}，置信度: ${confidence}`);
      
      // 立即更新卖家计数
      updateSellerCount();
      
      // 发送消息通知popup更新
      chrome.runtime.sendMessage({
        action: 'sellerCacheUpdated',
        data: {
          sellerId,
          isChineseSeller,
          confidence
        }
      });
    });
  });
}

// 注意：全局样式已移至utils/global-styles.js中的window.addGlobalStyles函数

/**
 * 从商品详情页获取卖家信息
 * @param {string} productUrl - 商品URL
 * @param {Element} card - 商品卡片DOM元素
 */
async function fetchSellerInfoFromProductPage(productUrl, card) {
  try {
    // 确保SellerDetector已加载
    await loadSellerDetector();
    
    // 直接获取页面内容
    const response = await fetch(productUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'User-Agent': navigator.userAgent
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // 解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 提取卖家信息
    const sellerInfo = extractSellerInfoFromProductPage(doc);
    
    if (sellerInfo) {
      // 检查SellerDetector是否可用
      if (typeof SellerDetector === 'undefined' || !window.SellerDetector) {
        console.error('SellerDetector类未加载，无法检测卖家');
        return;
      }
      
      // 使用SellerDetector类检查卖家是否为中国卖家
      const detector = new window.SellerDetector(settings);
      const result = await detector.checkIfChineseSeller(
        sellerInfo.sellerId, 
        sellerInfo.sellerName, 
        sellerInfo.sellerUrl
      );
      
      // 更新卖家缓存
      updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
      
      if (result.isChineseSeller) {
        // 标记中国卖家
        markChineseSeller(card, sellerInfo, result.details);
        
        // 根据筛选模式处理显示
        applyFilterToCard(card, true);
      } else {
        // 根据筛选模式处理显示
        applyFilterToCard(card, false);
      }
    }
  } catch (error) {
    console.error('获取商品详情页失败:', error);
  }
}

/**
 * 从商品详情页提取卖家信息
 * @param {Document} doc - 解析后的商品详情页文档
 * @return {Object|null} 卖家信息对象或null
 */
function extractSellerInfoFromProductPage(doc) {
  // 尝试多种选择器来提取卖家信息
  const sellerSelectors = [
    '#merchant-info',
    '#sellerProfileTriggerId',
    '.tabular-buybox-text a',
    '.offer-display-feature-text',
    '.a-row:contains("Sold by")',
    '.a-row:contains("Ships from")',
    '.a-row a[href*="seller="]'
  ];
  
  let sellerElement = null;
  let sellerText = '';
  
  // 尝试各种选择器找到卖家信息
  for (const selector of sellerSelectors) {
    try {
      if (selector.includes(':contains')) {
        const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
        const elements = Array.from(doc.querySelectorAll('.a-row, .a-section'));
        sellerElement = elements.find(el => el.textContent.includes(textToFind));
      } else {
        sellerElement = doc.querySelector(selector);
      }
      
      if (sellerElement) {
        sellerText = sellerElement.textContent.trim();
        break;
      }
    } catch (error) {
      console.warn('选择器解析错误:', error);
    }
  }
  
  if (!sellerElement) {
    return null;
  }
  
  // 提取卖家名称和链接
  let sellerName = '';
  let sellerUrl = '';
  let sellerId = 'unknown';
  
  // 查找卖家链接
  const sellerLink = sellerElement.querySelector('a[href*="seller="]') || 
                    sellerElement.closest('a[href*="seller="]');
  
  if (sellerLink) {
    sellerName = sellerLink.textContent.trim();
    sellerUrl = sellerLink.href;
    
    // 提取卖家ID
    if (sellerUrl.includes('seller=')) {
      sellerId = sellerUrl.split('seller=')[1].split('&')[0];
    }
  } else {
    // 尝试从文本中提取卖家名称
    const sellerText = sellerElement.textContent.trim();
    const byMatch = sellerText.match(/by\s+([^\n]+)/i);
    if (byMatch) {
      sellerName = byMatch[1].trim();
    } else {
      sellerName = sellerText;
    }
  }
  
  return {
    sellerId,
    sellerName,
    sellerUrl
  };
}

/**
 * 添加滚动事件监听
 */
function addScrollListener() {
  // 防抖动函数
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      // 检查是否有新的商品卡片
      const processedCards = document.querySelectorAll('[data-seller-type]');
      const allCards = getProductCards();
      
      // 找出未处理的卡片
      const unprocessedCards = Array.from(allCards).filter(card => {
        return !card.hasAttribute('data-seller-type');
      });
      
      if (unprocessedCards.length > 0) {
        console.log('发现新的未处理卡片:', unprocessedCards.length);
        // 处理新的卡片
        for (const card of unprocessedCards) {
          processProductCard(card);
        }
      }
    }, settings.scanDelay || 500);
  });
}

/**
 * 监听页面变化
 */
function observePageChanges() {
  // 如果已经在监听，则不重复添加
  if (observerActive) return;
  
  // 创建MutationObserver实例
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的商品卡片
    const processedCards = document.querySelectorAll('[data-seller-type]');
    const allCards = getProductCards();
    
    // 找出未处理的卡片
    const unprocessedCards = Array.from(allCards).filter(card => {
      return !card.hasAttribute('data-seller-type');
    });
    
    if (unprocessedCards.length > 0) {
      console.log('观察到DOM变化，发现新卡片:', unprocessedCards.length);
      // 处理新的卡片
      for (const card of unprocessedCards) {
        processProductCard(card);
      }
    }
  });
  
  // 配置观察选项
  const config = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };
  
  // 开始观察
  const targetNode = document.querySelector('#search') || document.querySelector('.s-main-slot') || document.body;
  observer.observe(targetNode, config);
  
  // 标记为已激活
  observerActive = true;
}

/**
 * 处理商品详情页
 */
function processProductPage() {
  // 提取卖家信息
  const sellerInfo = extractSellerInfoFromProductPage(document);
  
  if (!sellerInfo) {
    console.log('无法获取卖家信息');
    return;
  }
  
  // 使用SellerDetector类检查卖家是否为中国卖家
  const detector = new SellerDetector(settings);
  detector.checkIfChineseSeller(
    sellerInfo.sellerId, 
    sellerInfo.sellerName, 
    sellerInfo.sellerUrl
  ).then(result => {
    // 更新卖家缓存
    updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
    
    if (result.isChineseSeller) {
      // 标记中国卖家
      const sellerElement = document.querySelector('#merchant-info') || 
                           document.querySelector('#sellerProfileTriggerId');
      
      if (sellerElement) {
        sellerElement.classList.add('cn-seller-highlight');
        sellerElement.style.color = settings.highlightColor || '#ff0055';
        sellerElement.style.fontWeight = 'bold';
        sellerElement.style.textShadow = '0 0 3px ' + (settings.highlightColor || '#ff0055');
        
        // 添加标记
        const mark = document.createElement('span');
        mark.className = 'cn-seller-mark-inline';
        mark.textContent = ' [中国卖家]';
        mark.style.color = settings.highlightColor || '#ff0055';
        mark.style.fontWeight = 'bold';
        sellerElement.appendChild(mark);
      }
    }
  });
}

/**
 * 标记中国卖家
 * @param {Element} card - 商品卡片DOM元素
 * @param {Object} sellerInfo - 卖家信息
 * @param {Object} details - 识别详情
 */
function markChineseSeller(card, sellerInfo, details) {
  // 添加标记类
  card.classList.add('cn-seller-card');
  
  // 添加边框效果
  if (settings.showBorder) {
    card.classList.add('cyberpunk-border');
    // 增强边框效果
    card.style.boxShadow = `0 0 15px var(--highlight-color), inset 0 0 8px var(--highlight-color)`;
    card.style.border = `2px solid var(--highlight-color)`;
    card.style.borderRadius = '4px';
    card.style.transform = 'scale(1.02)';
    card.style.transition = 'all 0.3s ease';
    card.style.zIndex = '10';
  }
  
  // 查找商品标题
  const titleElement = card.querySelector('h2') || card.querySelector('.a-size-medium') || card.querySelector('.a-link-normal h2');
  if (titleElement) {
    titleElement.classList.add('cn-seller-title');
    // 增强标题效果
    titleElement.style.color = 'var(--highlight-color)';
    titleElement.style.textShadow = '0 0 5px var(--highlight-color)';
    titleElement.style.fontWeight = 'bold';
    titleElement.style.letterSpacing = '0.5px';
    
    // 添加闪烁动画
    titleElement.style.animation = 'title-glow 2s infinite alternate';
  }
  
  // 添加中国卖家标记图标
  if (settings.showIcon) {
    const mark = document.createElement('div');
    mark.className = 'cn-seller-mark';
    mark.innerHTML = `<span class="mark-text">CN</span>`;
    mark.title = `卖家: ${sellerInfo.sellerName}\n识别为中国卖家`;
    
    // 增强图标效果
    mark.style.position = 'absolute';
    mark.style.top = '5px';
    mark.style.right = '5px';
    mark.style.backgroundColor = 'var(--highlight-color)';
    mark.style.color = 'white';
    mark.style.padding = '4px 8px';
    mark.style.borderRadius = '4px';
    mark.style.fontSize = '14px';
    mark.style.fontWeight = 'bold';
    mark.style.zIndex = '100';
    mark.style.boxShadow = '0 0 10px var(--highlight-color), 0 0 5px var(--highlight-color)';
    mark.style.animation = 'pulse 1.5s infinite';
    mark.style.textShadow = '0 0 3px white';
    
    // 添加到卡片
    const cardContainer = card.querySelector('.a-section') || card;
    cardContainer.style.position = 'relative';
    cardContainer.appendChild(mark);
  }
  
  // 应用筛选模式
  applyFilterToCard(card, true);
  
  // 添加闪烁效果
  setTimeout(() => {
    const markElement = card.querySelector('.cn-seller-mark');
    if (markElement) {
      markElement.style.animation = 'glitch 2s infinite alternate';
    }
  }, 1500);
  
  // 添加动画效果
  card.classList.add('filter-animation');
  
  // 添加高亮闪烁效果
  const flashOverlay = document.createElement('div');
  flashOverlay.className = 'cn-seller-flash-overlay';
  flashOverlay.style.position = 'absolute';
  flashOverlay.style.top = '0';
  flashOverlay.style.left = '0';
  flashOverlay.style.width = '100%';
  flashOverlay.style.height = '100%';
  flashOverlay.style.backgroundColor = 'var(--highlight-color)';
  flashOverlay.style.opacity = '0.3';
  flashOverlay.style.zIndex = '5';
  flashOverlay.style.pointerEvents = 'none';
  flashOverlay.style.borderRadius = '4px';
  
  // 确保卡片有相对定位，以便绝对定位的覆盖层正确显示
  if (window.getComputedStyle(card).position === 'static') {
    card.style.position = 'relative';
  }
  
  card.appendChild(flashOverlay);
  
  // 闪烁动画
  setTimeout(() => {
    flashOverlay.style.opacity = '0';
    flashOverlay.style.transition = 'opacity 0.5s ease';
  }, 100);
  
  setTimeout(() => {
    card.classList.remove('filter-animation');
    if (flashOverlay && flashOverlay.parentNode) {
      flashOverlay.remove();
    }
  }, 1000);
  
  // 添加价格标记（如果存在）
  const priceElement = card.querySelector('.a-price') || card.querySelector('.a-color-price');
  if (priceElement) {
    priceElement.style.color = 'var(--highlight-color)';
    priceElement.style.fontWeight = 'bold';
  }
}

/**
 * 更新卖家缓存
 * @param {string} sellerId - 卖家ID
 * @param {boolean} isChineseSeller - 是否为中国卖家
 * @param {number} confidence - 置信度
 * @param {Object} details - 详细信息
 */
function updateSellerCache(sellerId, isChineseSeller, confidence, details) {
  if (!sellerId || sellerId === 'unknown') return;
  
  // 获取现有缓存
  chrome.storage.local.get('sellerCache', data => {
    const cache = data.sellerCache || {};
    
    // 检查是否已存在相同数据，避免重复更新
    const existingEntry = cache[sellerId];
    if (existingEntry && 
        existingEntry.isChineseSeller === isChineseSeller && 
        existingEntry.confidence === confidence) {
      console.log(`卖家 ${sellerId} 数据未变化，跳过更新`);
      return;
    }
    
    // 更新缓存
    cache[sellerId] = {
      isChineseSeller,
      confidence,
      details,
      lastUpdated: new Date().toISOString()
    };
    
    // 保存缓存
    chrome.storage.local.set({ sellerCache: cache }, () => {
      console.log(`卖家 ${sellerId} 已${isChineseSeller ? '标记为中国卖家' : '不是中国卖家'}，置信度: ${confidence}`);
      
      // 立即更新卖家计数
      updateSellerCount();
      
      // 发送消息通知popup更新
      chrome.runtime.sendMessage({
        action: 'sellerCacheUpdated',
        data: {
          sellerId,
          isChineseSeller,
          confidence
        }
      });
    });
  });
}

// 注意：全局样式已移至utils/global-styles.js中的window.addGlobalStyles函数

/**
 * 从商品详情页获取卖家信息
 * @param {string} productUrl - 商品URL
 * @param {Element} card - 商品卡片DOM元素
 */
async function fetchSellerInfoFromProductPage(productUrl, card) {
  try {
    // 确保SellerDetector已加载
    await loadSellerDetector();
    
    // 直接获取页面内容
    const response = await fetch(productUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'User-Agent': navigator.userAgent
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // 解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 提取卖家信息
    const sellerInfo = extractSellerInfoFromProductPage(doc);
    
    if (sellerInfo) {
      // 检查SellerDetector是否可用
      if (typeof SellerDetector === 'undefined' || !window.SellerDetector) {
        console.error('SellerDetector类未加载，无法检测卖家');
        return;
      }
      
      // 使用SellerDetector类检查卖家是否为中国卖家
      const detector = new window.SellerDetector(settings);
      const result = await detector.checkIfChineseSeller(
        sellerInfo.sellerId, 
        sellerInfo.sellerName, 
        sellerInfo.sellerUrl
      );
      
      // 更新卖家缓存
      updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
      
      if (result.isChineseSeller) {
        // 标记中国卖家
        markChineseSeller(card, sellerInfo, result.details);
        
        // 根据筛选模式处理显示
        applyFilterToCard(card, true);
      } else {
        // 根据筛选模式处理显示
        applyFilterToCard(card, false);
      }
    }
  } catch (error) {
    console.error('获取商品详情页失败:', error);
  }
}

/**
 * 从商品详情页提取卖家信息
 * @param {Document} doc - 解析后的商品详情页文档
 * @return {Object|null} 卖家信息对象或null
 */
function extractSellerInfoFromProductPage(doc) {
  // 尝试多种选择器来提取卖家信息
  const sellerSelectors = [
    '#merchant-info',
    '#sellerProfileTriggerId',
    '.tabular-buybox-text a',
    '.offer-display-feature-text',
    '.a-row:contains("Sold by")',
    '.a-row:contains("Ships from")',
    '.a-row a[href*="seller="]'
  ];
  
  let sellerElement = null;
  let sellerText = '';
  
  // 尝试各种选择器找到卖家信息
  for (const selector of sellerSelectors) {
    try {
      if (selector.includes(':contains')) {
        const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
        const elements = Array.from(doc.querySelectorAll('.a-row, .a-section'));
        sellerElement = elements.find(el => el.textContent.includes(textToFind));
      } else {
        sellerElement = doc.querySelector(selector);
      }
      
      if (sellerElement) {
        sellerText = sellerElement.textContent.trim();
        break;
      }
    } catch (error) {
      console.warn('选择器解析错误:', error);
    }
  }
  
  if (!sellerElement) {
    return null;
  }
  
  // 提取卖家名称和链接
  let sellerName = '';
  let sellerUrl = '';
  let sellerId = 'unknown';
  
  // 查找卖家链接
  const sellerLink = sellerElement.querySelector('a[href*="seller="]') || 
                    sellerElement.closest('a[href*="seller="]');
  
  if (sellerLink) {
    sellerName = sellerLink.textContent.trim();
    sellerUrl = sellerLink.href;
    
    // 提取卖家ID
    if (sellerUrl.includes('seller=')) {
      sellerId = sellerUrl.split('seller=')[1].split('&')[0];
    }
  } else {
    // 尝试从文本中提取卖家名称
    const sellerText = sellerElement.textContent.trim();
    const byMatch = sellerText.match(/by\s+([^\n]+)/i);
    if (byMatch) {
      sellerName = byMatch[1].trim();
    } else {
      sellerName = sellerText;
    }
  }
  
  return {
    sellerId,
    sellerName,
    sellerUrl
  };
}

/**
 * 添加滚动事件监听
 */
function addScrollListener() {
  // 防抖动函数
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      // 检查是否有新的商品卡片
      const processedCards = document.querySelectorAll('[data-seller-type]');
      const allCards = getProductCards();
      
      // 找出未处理的卡片
      const unprocessedCards = Array.from(allCards).filter(card => {
        return !card.hasAttribute('data-seller-type');
      });
      
      if (unprocessedCards.length > 0) {
        console.log('发现新的未处理卡片:', unprocessedCards.length);
        // 处理新的卡片
        for (const card of unprocessedCards) {
          processProductCard(card);
        }
      }
    }, settings.scanDelay || 500);
  });
}

/**
 * 监听页面变化
 */
function observePageChanges() {
  // 如果已经在监听，则不重复添加
  if (observerActive) return;
  
  // 创建MutationObserver实例
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的商品卡片
    const processedCards = document.querySelectorAll('[data-seller-type]');
    const allCards = getProductCards();
    
    // 找出未处理的卡片
    const unprocessedCards = Array.from(allCards).filter(card => {
      return !card.hasAttribute('data-seller-type');
    });
    
    if (unprocessedCards.length > 0) {
      console.log('观察到DOM变化，发现新卡片:', unprocessedCards.length);
      // 处理新的卡片
      for (const card of unprocessedCards) {
        processProductCard(card);
      }
    }
  });
  
  // 配置观察选项
  const config = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };
  
  // 开始观察
  const targetNode = document.querySelector('#search') || document.querySelector('.s-main-slot') || document.body;
  observer.observe(targetNode, config);
  
  // 标记为已激活
  observerActive = true;
}

/**
 * 处理商品详情页
 */
function processProductPage() {
  // 提取卖家信息
  const sellerInfo = extractSellerInfoFromProductPage(document);
  
  if (!sellerInfo) {
    console.log('无法获取卖家信息');
    return;
  }
  
  // 使用SellerDetector类检查卖家是否为中国卖家
  const detector = new SellerDetector(settings);
  detector.checkIfChineseSeller(
    sellerInfo.sellerId, 
    sellerInfo.sellerName, 
    sellerInfo.sellerUrl
  ).then(result => {
    // 更新卖家缓存
    updateSellerCache(sellerInfo.sellerId, result.isChineseSeller, result.confidence, result.details);
    
    if (result.isChineseSeller) {
      // 标记中国卖家
      const sellerElement = document.querySelector('#merchant-info') || 
                           document.querySelector('#sellerProfileTriggerId');
      
      if (sellerElement) {
        sellerElement.classList.add('cn-seller-highlight');
        sellerElement.style.color = settings.highlightColor || '#ff0055';
        sellerElement.style.fontWeight = 'bold';
        sellerElement.style.textShadow = '0 0 3px ' + (settings.highlightColor || '#ff0055');
        
        // 添加标记
        const mark = document.createElement('span');
        mark.className = 'cn-seller-mark-inline';
        mark.textContent = ' [中国卖家]';
        mark.style.color = settings.highlightColor || '#ff0055';
        mark.style.fontWeight = 'bold';
        sellerElement.appendChild(mark);
      }
    }
  });
}

/**
 * 标记中国卖家
 * @param {Element} card - 商品卡片DOM元素
 * @param {Object} sellerInfo - 卖家信息
 * @param {Object} details - 识别详情
 */
function markChineseSeller(card, sellerInfo, details) {
  // 添加标记类
  card.classList.add('cn-seller-card');
  
  // 添加边框效果
  if (settings.showBorder) {
    card.classList.add('cyberpunk-border');
    // 增强边框效果
    card.style.boxShadow = `0 0 10px var(--highlight-color), inset 0 0 5px var(--highlight-color)`;
    card.style.border = `1px solid var(--highlight-color)`;
  }
  
  // 查找商品标题
  const titleElement = card.querySelector('h2') || card.querySelector('.a-size-medium');
  if (titleElement) {
    titleElement.classList.add('cn-seller-title');
    // 增强标题效果
    titleElement.style.color = 'var(--highlight-color)';
    titleElement.style.textShadow = '0 0 3px var(--highlight-color)';
    titleElement.style.fontWeight = 'bold';
  }
  
  // 添加中国卖家标记图标
  if (settings.showIcon) {
    const mark = document.createElement('div');
    mark.className = 'cn-seller-mark';
    mark.innerHTML = `<span class="mark-text">CN</span>`;
    mark.title = `卖家: ${sellerInfo.sellerName}\n识别为中国卖家`;
    
    // 增强图标效果
    mark.style.position = 'absolute';
    mark.style.top = '5px';
    mark.style.right = '5px';
    mark.style.backgroundColor = 'var(--highlight-color)';
    mark.style.color = 'white';
    mark.style.padding = '4px 8px';
    mark.style.borderRadius = '4px';
    mark.style.fontSize = '14px';
    mark.style.fontWeight = 'bold';
    mark.style.zIndex = '100';
    mark.style.boxShadow = '0 0 10px var(--highlight-color), 0 0 5px var(--highlight-color)';
    mark.style.animation = 'pulse 1.5s infinite';
    mark.style.textShadow = '0 0 3px white';
    
    // 添加到卡片
    const cardContainer = card.querySelector('.a-section') || card;
    cardContainer.style.position = 'relative';
    cardContainer.appendChild(mark);
  }
  
  // 应用筛选模式
  applyFilterToCard(card, true);
  
  // 添加闪烁效果
  setTimeout(() => {
    const markElement = card.querySelector('.cn-seller-mark');
    if (markElement) {
      markElement.style.animation = 'glitch 2s infinite alternate';
    }
  }, 1500);
}