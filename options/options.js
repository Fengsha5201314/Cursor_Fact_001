/**
 * Amazon中国卖家识别器 - 高级设置脚本
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
  scanDelay: 500,           // 扫描延迟（毫秒）
  customKeywords: [         // 自定义识别关键词
    'China', 'CN', '中国', 'Shenzhen', 'Guangdong', 'Shanghai', 'Hangzhou', 'Yiwu'
  ],
  cacheExpiration: 7        // 缓存过期天数
};

// 初始化
document.addEventListener('DOMContentLoaded', init);

/**
 * 初始化函数
 */
async function init() {
  // 获取设置
  const settings = await getSettings();
  
  // 更新UI状态
  updateUIState(settings);
  
  // 添加事件监听
  addEventListeners();
}

/**
 * 获取插件设置
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
 * 更新UI状态
 * @param {Object} settings - 设置对象
 */
function updateUIState(settings) {
  // 更新颜色选择器
  document.querySelectorAll('.color-option').forEach(option => {
    option.classList.remove('active');
  });
  
  if (settings.highlightColor.startsWith('#')) {
    const activeColor = document.querySelector(`.color-option[data-color="${settings.highlightColor}"]`);
    if (activeColor) {
      activeColor.classList.add('active');
    } else {
      // 如果是自定义颜色
      const customColorOption = document.querySelector('.color-option.custom');
      customColorOption.classList.add('active');
      document.getElementById('custom-color').value = settings.highlightColor;
    }
  }
  
  // 更新边框样式
  document.querySelectorAll('.style-option').forEach(option => {
    option.classList.remove('active');
  });
  
  const activeStyle = document.querySelector(`.style-option[data-style="${settings.borderStyle}"]`);
  if (activeStyle) {
    activeStyle.classList.add('active');
  }
  
  // 更新复选框
  document.getElementById('show-icon').checked = settings.showIcon;
  document.getElementById('show-border').checked = settings.showBorder;
  document.getElementById('animation-enabled').checked = settings.animationEnabled;
  document.getElementById('dark-mode').checked = settings.darkMode;
  document.getElementById('glitch-effect').checked = settings.glitchEffect;
  document.getElementById('floating-control-visible').checked = settings.floatingControlVisible;
  document.getElementById('auto-scan').checked = settings.autoScan;
  
  // 更新扫描延迟滑块
  document.getElementById('scan-delay').value = settings.scanDelay;
  document.getElementById('scan-delay-value').textContent = settings.scanDelay;
  
  // 更新缓存过期天数
  document.getElementById('cache-expiration').value = settings.cacheExpiration;
  document.getElementById('expiration-days').textContent = settings.cacheExpiration;
  
  // 更新关键词列表
  updateKeywordsList(settings.customKeywords);
  
  // 更新根变量
  document.documentElement.style.setProperty('--highlight-color', settings.highlightColor);
}

/**
 * 更新关键词列表
 * @param {Array} keywords - 关键词数组
 */
function updateKeywordsList(keywords) {
  const keywordsList = document.getElementById('keywords-list');
  keywordsList.innerHTML = '';
  
  keywords.forEach(keyword => {
    const keywordTag = document.createElement('div');
    keywordTag.className = 'keyword-tag';
    keywordTag.innerHTML = `
      <span class="keyword-text">${keyword}</span>
      <span class="keyword-remove" data-keyword="${keyword}">×</span>
    `;
    keywordsList.appendChild(keywordTag);
  });
  
  // 添加删除关键词的事件监听
  document.querySelectorAll('.keyword-remove').forEach(removeBtn => {
    removeBtn.addEventListener('click', async () => {
      const keyword = removeBtn.getAttribute('data-keyword');
      await removeKeyword(keyword);
    });
  });
}

/**
 * 添加事件监听
 */
function addEventListeners() {
  // 颜色选择器
  document.querySelectorAll('.color-option:not(.custom)').forEach(option => {
    option.addEventListener('click', async () => {
      const color = option.getAttribute('data-color');
      await updateSetting('highlightColor', color);
      
      // 更新UI
      document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('active');
      });
      option.classList.add('active');
      
      // 更新根变量
      document.documentElement.style.setProperty('--highlight-color', color);
      
      // 显示保存状态
      showSaveStatus('设置已更新');
    });
  });
  
  // 自定义颜色选择器
  const customColorInput = document.getElementById('custom-color');
  customColorInput.addEventListener('change', async () => {
    const color = customColorInput.value;
    await updateSetting('highlightColor', color);
    
    // 更新UI
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.classList.remove('active');
    });
    document.querySelector('.color-option.custom').classList.add('active');
    
    // 更新根变量
    document.documentElement.style.setProperty('--highlight-color', color);
    
    // 显示保存状态
    showSaveStatus('设置已更新');
  });
  
  // 边框样式选择
  document.querySelectorAll('.style-option').forEach(option => {
    option.addEventListener('click', async () => {
      const style = option.getAttribute('data-style');
      await updateSetting('borderStyle', style);
      
      // 更新UI
      document.querySelectorAll('.style-option').forEach(opt => {
        opt.classList.remove('active');
      });
      option.classList.add('active');
      
      // 显示保存状态
      showSaveStatus('设置已更新');
    });
  });
  
  // 复选框设置
  document.getElementById('show-icon').addEventListener('change', async (e) => {
    await updateSetting('showIcon', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  document.getElementById('show-border').addEventListener('change', async (e) => {
    await updateSetting('showBorder', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  document.getElementById('animation-enabled').addEventListener('change', async (e) => {
    await updateSetting('animationEnabled', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  document.getElementById('dark-mode').addEventListener('change', async (e) => {
    await updateSetting('darkMode', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  document.getElementById('glitch-effect').addEventListener('change', async (e) => {
    await updateSetting('glitchEffect', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  document.getElementById('floating-control-visible').addEventListener('change', async (e) => {
    await updateSetting('floatingControlVisible', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  document.getElementById('auto-scan').addEventListener('change', async (e) => {
    await updateSetting('autoScan', e.target.checked);
    showSaveStatus('设置已更新');
  });
  
  // 扫描延迟滑块
  document.getElementById('scan-delay').addEventListener('input', (e) => {
    document.getElementById('scan-delay-value').textContent = e.target.value;
  });
  
  document.getElementById('scan-delay').addEventListener('change', async (e) => {
    await updateSetting('scanDelay', parseInt(e.target.value));
    showSaveStatus('设置已更新');
  });
  
  // 缓存过期天数
  document.getElementById('cache-expiration').addEventListener('input', (e) => {
    document.getElementById('expiration-days').textContent = e.target.value;
  });
  
  document.getElementById('cache-expiration').addEventListener('change', async (e) => {
    await updateSetting('cacheExpiration', parseInt(e.target.value));
    showSaveStatus('设置已更新');
  });
  
  // 清除缓存
  document.getElementById('clear-cache').addEventListener('click', () => {
    chrome.storage.local.set({ sellerCache: {} }, () => {
      showSaveStatus('缓存已清除');
    });
  });
  
  // 添加关键词
  document.getElementById('add-keyword').addEventListener('click', async () => {
    const newKeyword = document.getElementById('new-keyword').value.trim();
    if (newKeyword) {
      await addKeyword(newKeyword);
      document.getElementById('new-keyword').value = '';
    }
  });
  
  // 按回车添加关键词
  document.getElementById('new-keyword').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const newKeyword = e.target.value.trim();
      if (newKeyword) {
        await addKeyword(newKeyword);
        e.target.value = '';
      }
    }
  });
  
  // 导出设置
  document.getElementById('export-settings').addEventListener('click', async () => {
    const settings = await getSettings();
    const dataStr = JSON.stringify(settings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportLink = document.createElement('a');
    exportLink.setAttribute('href', dataUri);
    exportLink.setAttribute('download', 'amazon-cn-seller-detector-settings.json');
    exportLink.click();
  });
  
  // 导入设置
  document.getElementById('import-settings').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  
  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const settings = JSON.parse(event.target.result);
          await saveSettings(settings);
          updateUIState(settings);
          showSaveStatus('设置已导入');
        } catch (error) {
          showSaveStatus('导入失败：无效的设置文件', true);
        }
      };
      reader.readAsText(file);
    }
  });
  
  // 重置设置
  document.getElementById('reset-settings').addEventListener('click', async () => {
    if (confirm('确定要恢复默认设置吗？这将覆盖您的所有自定义设置。')) {
      await saveSettings(DEFAULT_SETTINGS);
      updateUIState(DEFAULT_SETTINGS);
      showSaveStatus('已恢复默认设置');
    }
  });
  
  // 保存设置按钮
  document.getElementById('save-settings').addEventListener('click', () => {
    showSaveStatus('所有设置已保存');
  });
}

/**
 * 更新设置
 * @param {string} key - 设置键名
 * @param {any} value - 设置值
 * @return {Promise} 更新完成的Promise
 */
function updateSetting(key, value) {
  return new Promise(resolve => {
    chrome.storage.sync.get('settings', data => {
      const settings = data.settings || DEFAULT_SETTINGS;
      settings[key] = value;
      
      chrome.storage.sync.set({ settings: settings }, () => {
        resolve();
      });
    });
  });
}

/**
 * 保存整个设置对象
 * @param {Object} settings - 设置对象
 * @return {Promise} 保存完成的Promise
 */
function saveSettings(settings) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ settings: settings }, () => {
      resolve();
    });
  });
}

/**
 * 添加关键词
 * @param {string} keyword - 关键词
 * @return {Promise} 添加完成的Promise
 */
async function addKeyword(keyword) {
  const settings = await getSettings();
  
  // 检查是否已存在
  if (!settings.customKeywords.includes(keyword)) {
    settings.customKeywords.push(keyword);
    await saveSettings(settings);
    updateKeywordsList(settings.customKeywords);
    showSaveStatus('关键词已添加');
  } else {
    showSaveStatus('关键词已存在', true);
  }
}

/**
 * 删除关键词
 * @param {string} keyword - 关键词
 * @return {Promise} 删除完成的Promise
 */
async function removeKeyword(keyword) {
  const settings = await getSettings();
  
  const index = settings.customKeywords.indexOf(keyword);
  if (index !== -1) {
    settings.customKeywords.splice(index, 1);
    await saveSettings(settings);
    updateKeywordsList(settings.customKeywords);
    showSaveStatus('关键词已删除');
  }
}

/**
 * 显示保存状态
 * @param {string} message - 状态消息
 * @param {boolean} isError - 是否为错误消息
 */
function showSaveStatus(message, isError = false) {
  const statusElement = document.getElementById('save-status');
  statusElement.textContent = message;
  statusElement.className = 'save-status' + (isError ? ' error' : ' success');
  
  // 显示动画
  statusElement.style.opacity = '1';
  statusElement.style.transform = 'translateY(0)';
  
  // 3秒后隐藏
  setTimeout(() => {
    statusElement.style.opacity = '0';
    statusElement.style.transform = 'translateY(-10px)';
  }, 3000);
}