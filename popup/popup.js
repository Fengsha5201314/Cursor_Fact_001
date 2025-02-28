/**
 * Amazon中国卖家识别器 - 弹出窗口脚本
 */

'use strict';

// 初始化
document.addEventListener('DOMContentLoaded', init);

/**
 * 初始化函数
 */
async function init() {
  // 获取设置
  const settings = await getSettings();
  
  // 获取插件启用状态
  const pluginState = await getPluginState();
  
  // 更新UI状态
  updateUIState(settings, pluginState);
  
  // 获取卖家缓存统计
  updateSellerStats();
  
  // 添加事件监听
  addEventListeners();
  
  // 插件默认启用，不需要显示欢迎页面
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
 * 获取插件启用状态
 * @return {Promise<boolean>} 插件是否启用
 */
function getPluginState() {
  return new Promise(resolve => {
    chrome.storage.sync.get('pluginEnabled', data => {
      // 默认为启用状态
      resolve(data.pluginEnabled !== false);
    });
  });
}

/**
 * 更新UI状态
 * @param {Object} settings - 设置对象
 * @param {boolean} pluginEnabled - 插件是否启用
 */
function updateUIState(settings, pluginEnabled) {
  // 更新插件启用状态
  const pluginEnabledCheckbox = document.getElementById('plugin-enabled');
  pluginEnabledCheckbox.checked = pluginEnabled;
  
  // 更新开关文本
  const toggleText = pluginEnabledCheckbox.nextElementSibling.nextElementSibling;
  toggleText.textContent = pluginEnabled ? '已激活' : '未激活';
  
  // 更新筛选模式按钮
  document.querySelectorAll('.cyberpunk-button[data-mode]').forEach(button => {
    button.classList.remove('active');
  });
  
  const activeButton = document.querySelector(`.cyberpunk-button[data-mode="${settings.filterMode}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }
  
  // 更新筛选模式显示
  const filterModeText = {
    'all': '全部显示',
    'onlyChinese': '仅中国卖家',
    'hideChinese': '隐藏中国卖家'
  };
  
  document.getElementById('filter-mode').textContent = filterModeText[settings.filterMode] || '全部显示';
  
  // 更新颜色选择器
  document.querySelectorAll('.color-option').forEach(option => {
    option.classList.remove('active');
  });
  
  const activeColor = document.querySelector(`.color-option[data-color="${settings.highlightColor}"]`);
  if (activeColor) {
    activeColor.classList.add('active');
  } else {
    // 如果没有匹配的预设颜色，默认选择第一个
    document.querySelector('.color-option').classList.add('active');
  }
  
  // 更新根变量
  document.documentElement.style.setProperty('--highlight-color', settings.highlightColor);
}

/**
 * 更新卖家统计信息
 */
function updateSellerStats() {
  chrome.storage.local.get('sellerCache', data => {
    const cache = data.sellerCache || {};
    const sellerCount = Object.keys(cache).length;
    const chineseSellerCount = Object.values(cache).filter(item => item.isChineseSeller).length;
    
    const sellerCountElement = document.getElementById('seller-count');
    if (sellerCountElement) {
      sellerCountElement.textContent = `${chineseSellerCount}/${sellerCount}`;
    }
  });
}

/**
 * 添加事件监听
 */
function addEventListeners() {
  // 插件启用状态切换
  document.getElementById('plugin-enabled').addEventListener('click', async (e) => {
    const enabled = e.target.checked;
    
    // 更新开关文本
    const toggleText = e.target.nextElementSibling.nextElementSibling;
    toggleText.textContent = enabled ? '已激活' : '未激活';
    
    // 保存设置
    chrome.storage.sync.set({ pluginEnabled: enabled });
    
    // 通知内容脚本更新状态
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: enabled ? 'enablePlugin' : 'disablePlugin' 
        });
      }
    });
  });
  
  // 筛选模式按钮 - 直接应用设置
  document.querySelectorAll('#btn-all, #btn-chinese, #btn-others').forEach(button => {
    button.addEventListener('click', async function(e) {
      e.preventDefault();
      
      // 移除所有按钮的活动状态
      document.querySelectorAll('.cyberpunk-button[data-mode]').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // 添加当前按钮的活动状态
      this.classList.add('active');
      
      // 获取筛选模式
      const filterMode = this.getAttribute('data-mode');
      
      // 获取当前设置
      const settings = await getSettings();
      
      // 更新设置
      settings.filterMode = filterMode;
      
      // 保存设置
      chrome.storage.sync.set({ settings }, () => {
        console.log('筛选模式已保存:', filterMode);
        
        // 更新筛选模式显示
        const filterModeText = {
          'all': '全部显示',
          'onlyChinese': '仅中国卖家',
          'hideChinese': '隐藏中国卖家'
        };
        
        document.getElementById('filter-mode').textContent = filterModeText[filterMode] || '全部显示';
        
        // 更新卖家统计信息
        updateSellerStats();
      });
      
      // 通知内容脚本更新设置
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateSettings',
            settings: settings
          });
        }
      });
    });
  });
  
  // 颜色选择器 - 直接应用设置
  document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', async function(e) {
      e.preventDefault();
      
      // 移除所有颜色选项的活动状态
      document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('active');
      });
      
      // 添加当前颜色选项的活动状态
      this.classList.add('active');
      
      // 获取高亮颜色
      const highlightColor = this.getAttribute('data-color');
      
      // 更新根变量
      document.documentElement.style.setProperty('--highlight-color', highlightColor);
      
      // 获取当前设置
      const settings = await getSettings();
      
      // 更新设置
      settings.highlightColor = highlightColor;
      
      // 保存设置
      chrome.storage.sync.set({ settings }, () => {
        console.log('高亮颜色已保存:', highlightColor);
      });
      
      // 通知内容脚本更新设置
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateSettings',
            settings: settings
          });
        }
      });
    });
  });
  
  // 高级设置按钮
  document.getElementById('btn-options').addEventListener('click', function(e) {
    e.preventDefault();
    
    console.log('高级设置按钮点击');
    
    // 打开选项页面
    chrome.runtime.openOptionsPage();
  });
}

/**
 * 显示欢迎页面
 */
function showWelcomePage() {
  // 跳转到欢迎页面
  window.location.href = 'welcome.html';
}