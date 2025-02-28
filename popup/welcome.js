/**
 * Amazon中国卖家识别器 - 欢迎页面脚本
 */

'use strict';

// 初始化
document.addEventListener('DOMContentLoaded', init);

/**
 * 初始化函数
 */
function init() {
  // 添加事件监听
  document.getElementById('enable-plugin').addEventListener('click', enablePlugin);
  document.getElementById('disable-plugin').addEventListener('click', disablePlugin);
}

/**
 * 启用插件
 */
function enablePlugin() {
  // 设置插件状态为启用
  chrome.storage.sync.set({ pluginEnabled: true }, () => {
    console.log('插件已启用');
    
    // 通知内容脚本更新状态
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'enablePlugin' });
      }
    });
    
    // 跳转到主弹出窗口
    window.location.href = 'popup.html';
  });
}

/**
 * 禁用插件
 */
function disablePlugin() {
  // 设置插件状态为禁用
  chrome.storage.sync.set({ pluginEnabled: false }, () => {
    console.log('插件已禁用');
    
    // 通知内容脚本更新状态
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'disablePlugin' });
      }
    });
    
    // 跳转到主弹出窗口
    window.location.href = 'popup.html';
  });
}