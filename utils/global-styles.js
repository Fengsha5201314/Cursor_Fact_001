/**
 * 全局样式工具函数
 * 用于添加插件所需的全局CSS样式
 */

'use strict';

/**
 * 添加全局样式
 * @param {Object} settings - 插件设置对象
 */
window.addGlobalStyles = function(settings) {
  console.log('addGlobalStyles被调用，设置:', settings);
  
  // 检查是否已添加样式
  if (document.getElementById('cn-seller-global-styles')) {
    console.log('全局样式已存在，跳过添加');
    return;
  }
  
  // 创建样式元素
  const style = document.createElement('style');
  style.id = 'cn-seller-global-styles';
  
  // 设置CSS变量，确保settings存在
  const highlightColor = settings && settings.highlightColor ? settings.highlightColor : '#ff0055';
  console.log('设置高亮颜色:', highlightColor);
  document.documentElement.style.setProperty('--highlight-color', highlightColor);
  
  // 添加CSS样式
  style.textContent = `
    /* 基础样式 */
    .cn-seller-card {
      position: relative;
      transition: all 0.3s ease;
    }
    
    /* 赛博朋克边框效果 */
    .cyberpunk-border {
      border: 2px solid var(--highlight-color) !important;
      box-shadow: 0 0 15px var(--highlight-color), inset 0 0 8px var(--highlight-color) !important;
      border-radius: 4px !important;
      overflow: visible !important;
      z-index: 10 !important;
    }
    
    /* 中国卖家标记 */
    .cn-seller-mark {
      position: absolute;
      top: 5px;
      right: 5px;
      background-color: var(--highlight-color);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: bold;
      z-index: 100;
      box-shadow: 0 0 10px var(--highlight-color), 0 0 5px var(--highlight-color);
      animation: pulse 1.5s infinite;
      text-shadow: 0 0 3px white;
    }
    
    /* 内联标记 */
    .cn-seller-mark-inline {
      margin-left: 5px;
      color: var(--highlight-color);
      font-weight: bold;
      text-shadow: 0 0 3px var(--highlight-color);
    }
    
    /* 标题高亮 */
    .cn-seller-title {
      color: var(--highlight-color) !important;
      text-shadow: 0 0 5px var(--highlight-color) !important;
      font-weight: bold !important;
      letter-spacing: 0.5px !important;
      animation: title-glow 2s infinite alternate !important;
    }
    
    /* 控制面板样式 */
    #cn-seller-filter-controls {
      font-family: 'Rajdhani', 'Arial', sans-serif;
      letter-spacing: 0.5px;
      padding: 15px;
      border: 1px solid var(--highlight-color);
      background: linear-gradient(135deg, rgba(17, 17, 17, 0.95), rgba(34, 34, 34, 0.9));
      box-shadow: 0 0 10px var(--highlight-color), inset 0 0 10px rgba(0, 0, 0, 0.5);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      z-index: 9999;
      border-radius: 0;
      box-sizing: border-box;
      transform: none;
      overflow: visible;
    }
    
    /* 控制面板容器 */
    .controls-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      position: relative;
    }
    
    /* 控制面板头部 */
    .controls-header {
      display: flex;
      align-items: center;
      padding: 10px 15px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      position: relative;
    }
    
    .header-text {
      font-size: 18px;
      font-weight: bold;
      color: var(--highlight-color);
      text-shadow: 0 0 5px var(--highlight-color);
      letter-spacing: 1px;
      flex-grow: 1;
    }
    
    .header-decoration {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--highlight-color), transparent);
      animation: header-glow 3s infinite;
    }
    
    .close-button {
      font-size: 24px;
      color: var(--highlight-color);
      cursor: pointer;
      transition: all 0.3s ease;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }
    
    .close-button:hover {
      background-color: rgba(255, 0, 85, 0.3);
      box-shadow: 0 0 10px var(--highlight-color);
      transform: scale(1.1);
    }
    
    /* 控制面板主体 */
    .controls-body {
      padding: 15px;
    }
    
    /* 筛选按钮组 */
    .filter-buttons {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }
    
    /* 赛博朋克按钮 */
    .cyberpunk-button {
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      border: 1px solid var(--highlight-color);
      padding: 8px 15px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
      border-radius: 4px;
      letter-spacing: 0.5px;
      box-shadow: 0 0 5px var(--highlight-color);
      text-shadow: 0 0 3px var(--highlight-color);
    }
    
    .cyberpunk-button:hover {
      background-color: rgba(255, 0, 85, 0.2);
      box-shadow: 0 0 15px var(--highlight-color);
      transform: translateY(-2px);
    }
    
    .cyberpunk-button.active {
      background-color: var(--highlight-color);
      color: black;
      font-weight: bold;
      box-shadow: 0 0 15px var(--highlight-color), 0 0 5px white;
      text-shadow: none;
    }
    
    .button-glow {
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
      animation: button-glow 2s infinite;
    }
    
    /* 扫描按钮 */
    .scan-button {
      background-color: var(--highlight-color);
      color: black;
      font-weight: bold;
      padding: 10px 20px;
      margin-top: 10px;
      width: 100%;
      text-align: center;
      box-shadow: 0 0 15px var(--highlight-color);
      border: none;
    }
    
    .scan-button:hover {
      box-shadow: 0 0 20px var(--highlight-color), 0 0 10px white;
      transform: translateY(-2px) scale(1.02);
    }
    
    /* 浮动按钮 */
    .cyberpunk-floating-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      cursor: pointer;
    }
    
    .button-icon {
      width: 50px;
      height: 50px;
      background-color: var(--highlight-color);
      color: white;
      font-size: 18px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      box-shadow: 0 0 15px var(--highlight-color), 0 0 5px white;
      animation: pulse 2s infinite;
      transition: all 0.3s ease;
    }
    
    .button-icon:hover {
      transform: scale(1.1);
      box-shadow: 0 0 20px var(--highlight-color), 0 0 10px white;
    }
    
    /* 浮动菜单 */
    .floating-menu {
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
      border-left: 2px solid var(--highlight-color);
      text-align: left;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .floating-menu-item:hover {
      background-color: var(--highlight-color);
      transform: translateX(-5px);
    }
    
    /* 扫描状态 */
    .scan-status {
      display: block;
      padding: 15px;
      margin: 15px 0;
      background-color: rgba(0, 0, 0, 0.85);
      border-radius: 8px;
      border: 2px solid var(--highlight-color);
      box-shadow: 0 0 20px var(--highlight-color), inset 0 0 8px rgba(0, 0, 0, 0.9);
      transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
    }
    
    #scan-status-text {
      font-size: 16px;
      font-weight: bold;
      color: var(--highlight-color);
      text-shadow: 0 0 5px var(--highlight-color);
      margin-bottom: 10px;
      letter-spacing: 0.5px;
    }
    
    .scan-progress {
      display: block;
      height: 16px;
      margin-top: 12px;
      margin-bottom: 8px;
      background-color: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.7), inset 0 0 5px rgba(0, 0, 0, 0.7);
      position: relative;
    }
    
    .progress-bar {
      height: 100%;
      background-color: var(--highlight-color);
      width: 0%;
      transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      box-shadow: 0 0 15px var(--highlight-color), 0 0 5px #fff;
      border-radius: 4px;
      position: relative;
      overflow: hidden;
    }
    
    .progress-glow {
      position: absolute;
      top: 0;
      left: -15%;
      width: 15%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
      animation: progress-glow 1.5s infinite;
    }
    
    /* 动画效果 */
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.05); opacity: 0.8; }
      100% { transform: scale(1); opacity: 1; }
    }
    
    @keyframes glitch {
      0% { opacity: 1; transform: translateX(0); }
      10% { opacity: 0.8; transform: translateX(-2px); }
      20% { opacity: 1; transform: translateX(2px); }
      30% { opacity: 0.9; transform: translateX(-1px); }
      40% { opacity: 1; transform: translateX(1px); }
      50% { opacity: 1; transform: translateX(0); }
      60% { opacity: 0.7; transform: translateX(2px); }
      70% { opacity: 1; transform: translateX(-2px); }
      80% { opacity: 0.8; transform: translateX(0); }
      90% { opacity: 1; transform: translateX(-1px); }
      100% { opacity: 0.9; transform: translateX(0); }
    }
    
    @keyframes title-glow {
      0% { text-shadow: 0 0 5px var(--highlight-color); }
      50% { text-shadow: 0 0 10px var(--highlight-color), 0 0 15px var(--highlight-color); }
      100% { text-shadow: 0 0 5px var(--highlight-color); }
    }
    
    @keyframes button-glow {
      0% { left: -100%; }
      100% { left: 100%; }
    }
    
    @keyframes header-glow {
      0% { opacity: 0.3; }
      50% { opacity: 0.8; }
      100% { opacity: 0.3; }
    }
    
    @keyframes progress-glow {
      0% { left: -15%; }
      100% { left: 100%; }
    }
  `;
  
  // 将样式添加到文档头部
  document.head.appendChild(style);
}

// 自动执行函数，获取当前设置并应用样式
(function() {
  // 通知content脚本获取设置
  chrome.runtime.sendMessage({ action: 'getSettings' }, function(response) {
    if (response && response.settings) {
      // 应用全局样式
      window.addGlobalStyles(response.settings);
    } else {
      // 如果无法获取设置，使用默认设置
      window.addGlobalStyles({});
    }
  });
})();