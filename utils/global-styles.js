/**
 * 全局样式工具函数
 * 用于添加插件所需的全局CSS样式
 */

'use strict';

/**
 * 添加全局样式
 * @param {Object} settings - 插件设置
 */
window.addGlobalStyles = function(settings = {}) {
  // 检查全局样式是否已添加
  if (document.getElementById('amazon-cn-seller-detector-styles')) {
    return;
  }
  
  // 创建样式元素
  const style = document.createElement('style');
  style.id = 'amazon-cn-seller-detector-styles';
  
  // 设置高亮颜色变量
  const highlightColor = settings.highlightColor || '#ff0055';
  document.documentElement.style.setProperty('--highlight-color', highlightColor);
  
  // 定义样式
  style.textContent = `
    /* 设置全局CSS变量 */
    :root {
      --highlight-color: ${highlightColor};
      --bg-dark: #0c0c0c;
      --border-glow: 0 0 10px var(--highlight-color), 0 0 20px var(--highlight-color);
      --text-glow: 0 0 5px var(--highlight-color);
    }
    
    /* 中国卖家卡片样式 */
    .cn-seller-card {
      position: relative;
      z-index: 5;
      transition: all 0.3s ease;
    }
    
    /* 卡片边框样式 */
    .cyberpunk-border {
      border: 2px solid var(--highlight-color) !important;
      box-shadow: 0 0 15px var(--highlight-color), inset 0 0 8px var(--highlight-color) !important;
      border-radius: 4px !important;
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
      transform: scale(1.02) !important;
      z-index: 10 !important;
    }
    
    /* 标题样式 */
    .cn-seller-title {
      color: var(--highlight-color) !important;
      text-shadow: 0 0 5px var(--highlight-color) !important;
      font-weight: bold !important;
      letter-spacing: 0.5px !important;
    }
    
    /* 中国卖家标记 */
    .cn-seller-mark {
      position: absolute;
      top: 5px;
      right: 5px;
      background-color: var(--highlight-color);
      color: #000;
      font-weight: bold;
      padding: 3px 6px;
      border-radius: 3px;
      z-index: 10;
      box-shadow: 0 0 10px var(--highlight-color);
      animation: pulse 2s infinite;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    
    .mark-text {
      font-weight: bold;
      text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    }
    
    /* 控制面板容器 */
    .controls-container {
      background-color: rgba(0, 0, 0, 0.9);
      border: 2px solid var(--highlight-color);
      border-radius: 6px;
      box-shadow: 0 0 20px var(--highlight-color), inset 0 0 10px rgba(0, 0, 0, 0.8);
      padding: 15px;
      color: #fff;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      position: relative;
      z-index: 1000;
    }
    
    /* 控制面板头部 */
    .controls-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--highlight-color);
    }
    
    .header-text {
      font-size: 1.5em;
      font-weight: bold;
      color: var(--highlight-color);
      text-shadow: 0 0 10px var(--highlight-color);
      letter-spacing: 1px;
    }
    
    .close-button {
      cursor: pointer;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: var(--highlight-color);
      text-shadow: 0 0 5px var(--highlight-color);
      border: 1px solid var(--highlight-color);
      border-radius: 50%;
      background-color: rgba(0, 0, 0, 0.5);
      transition: all 0.3s ease;
    }
    
    .close-button:hover {
      background-color: var(--highlight-color);
      color: #000;
      box-shadow: 0 0 15px var(--highlight-color);
    }
    
    /* 控制面板按钮 */
    .cyberpunk-button {
      background-color: rgba(0, 0, 0, 0.7);
      color: #fff;
      border: 1px solid var(--highlight-color);
      border-radius: 4px;
      padding: 8px 15px;
      margin: 5px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: bold;
      letter-spacing: 0.5px;
      position: relative;
      overflow: hidden;
    }
    
    .cyberpunk-button:hover {
      box-shadow: 0 0 15px var(--highlight-color);
      background-color: rgba(255, 0, 85, 0.2);
      transform: translateY(-2px);
    }
    
    .cyberpunk-button.active {
      background-color: var(--highlight-color);
      color: #000;
      box-shadow: 0 0 15px var(--highlight-color);
    }
    
    .cyberpunk-button:active {
      transform: translateY(1px);
      box-shadow: 0 0 5px var(--highlight-color);
    }
    
    .button-glow {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(45deg, transparent, rgba(255, 0, 85, 0.3), transparent);
      transition: all 0.3s ease;
      filter: blur(5px);
      opacity: 0;
    }
    
    .cyberpunk-button:hover .button-glow {
      opacity: 1;
      animation: button-shine 1.5s infinite;
    }
    
    .cyberpunk-button.active .button-glow {
      opacity: 1;
      animation: button-pulse 2s infinite;
    }
    
    /* 筛选按钮区域 */
    .filter-buttons {
      display: flex;
      justify-content: center;
      margin-bottom: 15px;
    }
    
    /* 动画效果 */
    .filter-animation {
      animation: filter-highlight 0.5s ease-in-out;
    }
    
    /* 扫描状态容器 */
    .scan-status-container {
      margin-top: 15px;
      padding: 10px;
      background-color: rgba(0, 0, 0, 0.7);
      border: 1px solid var(--highlight-color);
      border-radius: 5px;
      color: #fff;
      box-shadow: 0 0 10px rgba(255, 0, 85, 0.3);
    }
    
    /* 扫描状态文本 */
    #scan-status-text {
      font-size: 14px;
      margin-bottom: 8px;
      text-align: center;
      color: #fff;
      text-shadow: 0 0 3px rgba(255, 255, 255, 0.5);
    }
    
    /* 扫描进度条容器 */
    .scan-progress {
      height: 20px;
      background-color: rgba(0, 0, 0, 0.5);
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
      position: relative;
      box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.7);
      border: 1px solid rgba(255, 0, 85, 0.3);
    }
    
    /* 进度条 */
    .cyberpunk-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(to right, var(--highlight-color), #ff3377);
      border-radius: 10px;
      transition: width 0.3s ease;
      position: relative;
      box-shadow: 0 0 10px var(--highlight-color);
    }
    
    /* 进度条发光效果 */
    .progress-glow {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.3), transparent);
      filter: blur(3px);
    }
    
    /* 进度条条纹动画 - 用于正在进行中的状态 */
    .scanning .cyberpunk-progress-bar,
    .filtering .cyberpunk-progress-bar,
    .scanning-progress {
      background: linear-gradient(45deg, 
        var(--highlight-color) 25%, 
        #ff3377 25%, 
        #ff3377 50%, 
        var(--highlight-color) 50%, 
        var(--highlight-color) 75%, 
        #ff3377 75%, 
        #ff3377);
      background-size: 20px 20px;
      animation: progress-stripe 1s linear infinite;
    }
    
    /* 浮动控制按钮 */
    #cn-seller-floating-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background-color: rgba(0, 0, 0, 0.9);
      border: 2px solid var(--highlight-color);
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 0 15px var(--highlight-color);
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    
    #cn-seller-floating-button:hover {
      transform: scale(1.1);
      box-shadow: 0 0 25px var(--highlight-color);
    }
    
    .button-icon {
      color: var(--highlight-color);
      font-size: 20px;
      font-weight: bold;
      text-shadow: 0 0 5px var(--highlight-color);
      transition: all 0.3s ease;
    }
    
    .button-icon.active {
      color: #000;
      background-color: var(--highlight-color);
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    
    /* 浮动菜单 */
    .floating-menu {
      position: absolute;
      bottom: 70px;
      right: 0;
      background-color: rgba(0, 0, 0, 0.9);
      border: 2px solid var(--highlight-color);
      border-radius: 8px;
      padding: 10px;
      display: none;
      width: 200px;
      box-shadow: 0 0 20px var(--highlight-color);
    }
    
    .floating-menu-item {
      display: block;
      width: 100%;
      padding: 10px;
      margin: 5px 0;
      text-align: left;
      background-color: rgba(0, 0, 0, 0.7);
      color: #fff;
      border: 1px solid var(--highlight-color);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: bold;
    }
    
    .floating-menu-item:hover {
      background-color: rgba(255, 0, 85, 0.2);
      transform: translateX(-5px);
      box-shadow: 0 0 10px var(--highlight-color);
    }
    
    .floating-menu-item.active {
      background-color: var(--highlight-color);
      color: #000;
      box-shadow: 0 0 10px var(--highlight-color);
    }
    
    /* 筛选结果信息样式 */
    .filter-result-info {
      margin-top: 10px;
      padding: 10px;
      background-color: rgba(0, 0, 0, 0.6);
      border-left: 3px solid var(--highlight-color);
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
      animation: slide-in 0.5s ease-out;
      border-radius: 0 4px 4px 0;
    }
    
    .result-count, .result-detail {
      margin: 5px 0;
      font-size: 14px;
      color: #ddd;
    }
    
    .count-highlight {
      color: var(--highlight-color);
      font-weight: bold;
      text-shadow: 0 0 5px var(--highlight-color);
      animation: pulse-text 2s infinite alternate;
    }
    
    /* 闪光覆盖效果 - 用于中国卖家商品 */
    .cn-flash-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: var(--highlight-color);
      opacity: 0.15;
      pointer-events: none;
      z-index: 2;
      border-radius: 4px;
      animation: flash-pulse 2s infinite alternate;
    }
    
    /* 卖家统计信息 */
    .seller-count-info {
      display: inline-block;
      padding: 3px 8px;
      background-color: rgba(0, 0, 0, 0.7);
      border: 1px solid var(--highlight-color);
      border-radius: 10px;
      color: #fff;
      font-size: 12px;
      margin-left: 10px;
      box-shadow: 0 0 5px var(--highlight-color);
      animation: count-update 0.8s ease;
    }
    
    /* Animations */
    @keyframes pulse {
      0% { opacity: 0.7; box-shadow: 0 0 5px var(--highlight-color); }
      50% { opacity: 1; box-shadow: 0 0 20px var(--highlight-color); }
      100% { opacity: 0.7; box-shadow: 0 0 5px var(--highlight-color); }
    }
    
    @keyframes glitch {
      0% { text-shadow: 0.05em 0 0 var(--highlight-color), -0.05em -0.025em 0 rgba(0, 255, 255, 0.75), -0.025em 0.05em 0 rgba(0, 255, 0, 0.75); }
      14% { text-shadow: 0.05em 0 0 var(--highlight-color), -0.05em -0.025em 0 rgba(0, 255, 255, 0.75), -0.025em 0.05em 0 rgba(0, 255, 0, 0.75); }
      15% { text-shadow: -0.05em -0.025em 0 var(--highlight-color), 0.025em 0.025em 0 rgba(0, 255, 255, 0.75), -0.05em -0.05em 0 rgba(0, 255, 0, 0.75); }
      49% { text-shadow: -0.05em -0.025em 0 var(--highlight-color), 0.025em 0.025em 0 rgba(0, 255, 255, 0.75), -0.05em -0.05em 0 rgba(0, 255, 0, 0.75); }
      50% { text-shadow: 0.025em 0.05em 0 var(--highlight-color), 0.05em 0 0 rgba(0, 255, 255, 0.75), 0 -0.05em 0 rgba(0, 255, 0, 0.75); }
      99% { text-shadow: 0.025em 0.05em 0 var(--highlight-color), 0.05em 0 0 rgba(0, 255, 255, 0.75), 0 -0.05em 0 rgba(0, 255, 0, 0.75); }
      100% { text-shadow: -0.025em 0 0 var(--highlight-color), -0.025em -0.025em 0 rgba(0, 255, 255, 0.75), -0.025em -0.05em 0 rgba(0, 255, 0, 0.75); }
    }
    
    @keyframes title-glow {
      0% { text-shadow: 0 0 5px var(--highlight-color); }
      100% { text-shadow: 0 0 10px var(--highlight-color), 0 0 20px var(--highlight-color); }
    }
    
    @keyframes filter-highlight {
      0% { transform: scale(1); box-shadow: none; }
      50% { transform: scale(1.05); box-shadow: 0 0 30px var(--highlight-color); }
      100% { transform: scale(1); box-shadow: 0 0 15px var(--highlight-color); }
    }
    
    @keyframes button-shine {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    @keyframes button-pulse {
      0% { opacity: 0.5; }
      50% { opacity: 1; }
      100% { opacity: 0.5; }
    }
    
    @keyframes progress-glow {
      0% { filter: brightness(1) blur(3px); }
      50% { filter: brightness(1.5) blur(5px); }
      100% { filter: brightness(1) blur(3px); }
    }
    
    @keyframes progress-stripe {
      0% { background-position: 0 0; }
      100% { background-position: 20px 0; }
    }
    
    @keyframes scanning-text {
      0% { opacity: 0.5; }
      50% { opacity: 1; }
      100% { opacity: 0.5; }
    }
    
    @keyframes count-update {
      0% { opacity: 0; transform: translateY(-5px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes slide-in {
      0% { opacity: 0; transform: translateX(-10px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    
    @keyframes pulse-text {
      0% { text-shadow: 0 0 5px var(--highlight-color); }
      100% { text-shadow: 0 0 15px var(--highlight-color), 0 0 20px var(--highlight-color); }
    }
    
    @keyframes flash-pulse {
      0% { opacity: 0.1; box-shadow: inset 0 0 5px var(--highlight-color); }
      100% { opacity: 0.3; box-shadow: inset 0 0 20px var(--highlight-color); }
    }
  `;
  
  // 添加样式到文档头部
  document.head.appendChild(style);
  
  console.log('全局样式已添加');
};

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