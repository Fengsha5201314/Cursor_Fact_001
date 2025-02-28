/**
 * Amazon中国卖家识别器 - 卖家识别工具
 * 负责识别卖家是否来自中国的核心逻辑
 */

'use strict';

class SellerDetector {
  constructor(settings) {
    this.settings = settings || {};
    this.sellerCache = {};
    this.chinaKeywords = [
      // 中国地址关键词（英文）
      'China', 'CN', 'PRC', 'Guangdong', 'Shenzhen', 'Shanghai', 'Beijing', 'Zhejiang',
      'Hangzhou', 'Yiwu', 'Dongguan', 'Fujian', 'Jiangsu', 'Nanjing', 'Guangzhou',
      'Tianjin', 'Shandong', 'Hebei', 'Zhongshan', 'Jiangmen', 'Foshan', 'Huizhou',
      'Xiamen', 'Changsha', 'Fuzhou', 'Hefei', 'Wuhan', 'Ningbo', 'Suzhou', 'Wenzhou',
      'Jinhua', 'Taizhou', 'Nanchang', 'Jiaxing', 'Shaoxing', 'Humen', 'Quanzhou',
      // 中国地址关键词（中文）
      '中国', '广东', '深圳', '上海', '北京', '浙江', '杭州', '义乌', '东莞', '福建',
      '江苏', '南京', '广州', '天津', '山东', '河北', '中山', '江门', '佛山', '惠州',
      '厦门', '长沙', '福州', '合肥', '武汉', '宁波', '苏州', '温州', '金华', '台州',
      '南昌', '嘉兴', '绍兴', '虎门', '泉州',
      // 自定义关键词
      ...(this.settings.customKeywords || [])
    ];
    
    // 中国邮编正则表达式（6位数字）
    this.chinaZipCodeRegex = /\b\d{6}\b/;
    
    // 中国卖家名称特征正则表达式
    this.chineseSellerNamePatterns = [
      // 拼音+数字组合
      /[A-Za-z]+[0-9]+[A-Za-z]*/,
      // 双驼峰命名
      /^[A-Z][a-z]+[A-Z][a-z]+$/,
      // 混合大小写+数字
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[A-Z])(?=.*[a-z])/,
      // 常见中国卖家命名模式
      /(?:trading|store|mall|tech|direct|official|flagship|home|life|world|best|top|good|new|first|great)\s*(?:co|ltd|inc|shop|store)/i,
      // 中文字符
      /[\u4e00-\u9fa5]/
    ];
  }
  
  /**
   * 检查卖家是否为中国卖家
   * @param {string} sellerId - 卖家ID
   * @param {string} sellerName - 卖家名称
   * @param {string} sellerUrl - 卖家URL
   * @return {Promise<Object>} 检查结果，包含isChineseSeller和confidence
   */
  async checkIfChineseSeller(sellerId, sellerName, sellerUrl) {
    // 结果对象
    const result = {
      isChineseSeller: false,
      confidence: 0,
      details: {}
    };
    
    // 基于卖家名称进行初步判断
    this._analyzeSellerName(sellerName, result);
    
    // 如果有卖家ID和URL，尝试获取更多信息
    if (sellerId && sellerId !== 'unknown' && sellerUrl) {
      try {
        // 获取卖家详情页信息
        const sellerDetails = await this._fetchSellerDetails(sellerUrl);
        if (sellerDetails) {
          // 分析卖家详情
          this._analyzeSellerDetails(sellerDetails, result);
        }
      } catch (error) {
        console.error('获取卖家详情失败:', error);
      }
    }
    
    // 根据置信度确定最终结果
    result.isChineseSeller = result.confidence >= 0.5;
    
    return result;
  }
  
  /**
   * 分析卖家名称
   * @param {string} sellerName - 卖家名称
   * @param {Object} result - 结果对象
   * @private
   */
  _analyzeSellerName(sellerName, result) {
    if (!sellerName) return;
    
    // 检查卖家名称是否包含中国关键词
    for (const keyword of this.chinaKeywords) {
      if (sellerName.toLowerCase().includes(keyword.toLowerCase())) {
        result.isChineseSeller = true;
        result.confidence += 0.4;
        result.details.nameKeyword = keyword;
        break;
      }
    }
    
    // 检查卖家名称是否符合中国卖家命名模式
    for (const pattern of this.chineseSellerNamePatterns) {
      if (pattern.test(sellerName)) {
        result.isChineseSeller = true;
        result.confidence += 0.3;
        result.details.namePattern = true;
        break;
      }
    }
  }
  
  /**
   * 获取卖家详情页信息
   * @param {string} sellerUrl - 卖家URL
   * @return {Promise<Object>} 卖家详情
   * @private
   */
  async _fetchSellerDetails(sellerUrl) {
    try {
      // 确保URL是完整的
      if (!sellerUrl.startsWith('http')) {
        sellerUrl = `https://www.amazon.com${sellerUrl.startsWith('/') ? '' : '/'}${sellerUrl}`;
      }
      
      console.log('尝试获取卖家详情页:', sellerUrl);
      
      // 由于跨域限制，直接fetch可能会失败，改用消息传递给background.js处理
      // 这里我们先尝试直接获取，如果失败则回退到基于名称的分析
      try {
        // 获取卖家页面
        const response = await fetch(sellerUrl, {
          credentials: 'include', // 包含cookies以确保获取完整页面
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
        const details = this._extractSellerDetailsFromPage(doc);
        console.log('成功获取卖家详情:', details);
        return details;
      } catch (fetchError) {
        console.warn('直接获取卖家页面失败，尝试基于名称分析:', fetchError);
        // 如果fetch失败，我们返回一个基本的对象，让算法继续基于名称进行分析
        return {
          businessName: sellerUrl.split('/').pop() || '',
          businessAddress: '',
          businessType: '',
          hasChineseAddress: false,
          hasChineseZipCode: false,
          fetchFailed: true
        };
      }
    } catch (error) {
      console.error('获取卖家页面失败:', error);
      // 返回一个空对象而不是null，这样可以继续进行分析
      return {
        businessName: '',
        businessAddress: '',
        businessType: '',
        hasChineseAddress: false,
        hasChineseZipCode: false,
        fetchFailed: true
      };
    }
  }
  
  /**
   * 从卖家页面提取详细信息
   * @param {Document} doc - 解析后的卖家页面文档
   * @return {Object} 卖家详情
   * @private
   */
  _extractSellerDetailsFromPage(doc) {
    const details = {
      businessName: '',
      businessAddress: '',
      businessType: '',
      hasChineseAddress: false,
      hasChineseZipCode: false
    };
    
    // 提取商家名称 - 增加更多选择器
    const nameSelectors = [
      '#sellerName',
      '.a-row h1', 
      '.a-row h2',
      '.mbcMerchantName',
      '#merchant-info a',
      '#sellerProfileTriggerId',
      '.offer-display-feature-text',
      '.tabular-buybox-text a',
      '#tabular-buybox-seller-name'
    ];
    
    for (const selector of nameSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        details.businessName = element.textContent.trim();
        console.log('找到卖家名称:', details.businessName);
        break;
      }
    }
    
    // 如果没有找到名称，尝试从页面标题或其他元素提取
    if (!details.businessName) {
      const title = doc.querySelector('title');
      if (title && title.textContent.includes(':')) {
        details.businessName = title.textContent.split(':')[0].trim();
        console.log('从标题提取卖家名称:', details.businessName);
      }
    }
    
    // 提取商家地址 - 尝试多种选择器和方法
    // 1. 首先尝试直接查找包含地址关键词的元素
    const addressKeywords = ['Business Address', '地址', 'Address', 'Location', '商家地址', '卖家地址'];
    let addressElement = null;
    
    // 查找包含这些关键词的元素
    for (const keyword of addressKeywords) {
      const elements = Array.from(doc.querySelectorAll('.a-row, .a-section, .a-box-inner, .a-list-item'));
      addressElement = elements.find(el => el.textContent.includes(keyword));
      if (addressElement) {
        console.log('找到地址元素:', keyword);
        break;
      }
    }
    
    // 2. 如果上面方法失败，尝试更多的选择器
    if (!addressElement) {
      const addressSelectors = [
        '#page-section-detail-seller-info .a-box-inner',
        '.a-section:contains("Detailed Seller Information")',
        '.a-box-group .a-box .a-box-inner',
        '#merchant-info',
        '.tabular-buybox-container',
        '#aod-offer-soldBy',
        '.a-row .a-column'
      ];
      
      for (const selector of addressSelectors) {
        try {
          if (selector.includes(':contains')) {
            const textToFind = selector.match(/:contains\("(.+?)"\)/)[1];
            const elements = Array.from(doc.querySelectorAll('.a-row, .a-section'));
            addressElement = elements.find(el => el.textContent.includes(textToFind));
          } else {
            addressElement = doc.querySelector(selector);
          }
          
          if (addressElement) {
            console.log('通过选择器找到地址元素:', selector);
            break;
          }
        } catch (error) {
          console.warn('选择器解析错误:', error);
        }
      }
    }
    
    // 3. 如果仍然没找到，尝试查找所有可能包含地址的段落
    if (!addressElement) {
      const paragraphs = Array.from(doc.querySelectorAll('p, .a-row, .a-section'));
      for (const p of paragraphs) {
        const text = p.textContent.toLowerCase();
        // 查找可能包含地址的段落
        if ((text.includes('address') || text.includes('location') || text.includes('地址')) && 
            (text.length > 10 && text.length < 500)) {
          addressElement = p;
          console.log('从段落中找到可能的地址信息');
          break;
        }
      }
    }
    
    // 处理找到的地址元素
    if (addressElement) {
      details.businessAddress = addressElement.textContent.trim();
      console.log('提取到地址:', details.businessAddress);
      
      // 检查地址是否包含中国关键词
      for (const keyword of this.chinaKeywords) {
        if (details.businessAddress.toLowerCase().includes(keyword.toLowerCase())) {
          details.hasChineseAddress = true;
          details.addressKeyword = keyword;
          console.log('地址中包含中国关键词:', keyword);
          break;
        }
      }
      
      // 检查是否包含中国邮编
      if (this.chinaZipCodeRegex.test(details.businessAddress)) {
        details.hasChineseZipCode = true;
        details.zipCode = details.businessAddress.match(this.chinaZipCodeRegex)[0];
        console.log('地址中包含中国邮编:', details.zipCode);
      }
    } else {
      console.log('未找到地址元素');
    }
    
    // 提取商家类型
    try {
      const businessTypeElement = Array.from(doc.querySelectorAll('.a-row, .a-section'))
        .find(el => el.textContent.includes('Business Type') || el.textContent.includes('商家类型'));
      
      if (businessTypeElement) {
        details.businessType = businessTypeElement.textContent.trim();
        console.log('提取到商家类型:', details.businessType);
      }
    } catch (error) {
      console.warn('提取商家类型失败:', error);
    }
    
    // 检查整个页面内容是否包含中国关键词
    const pageText = doc.body ? doc.body.textContent : '';
    for (const keyword of this.chinaKeywords) {
      if (pageText.toLowerCase().includes(keyword.toLowerCase())) {
        details.hasChineseAddress = true;
        details.pageKeyword = keyword;
        console.log('页面内容包含中国关键词:', keyword);
        break;
      }
    }
    
    return details;
  }
  
  /**
   * 分析卖家详情
   * @param {Object} details - 卖家详情
   * @param {Object} result - 结果对象
   * @private
   */
  _analyzeSellerDetails(details, result) {
    // 分析商家名称
    if (details.businessName) {
      this._analyzeSellerName(details.businessName, result);
    }
    
    // 分析商家地址
    if (details.hasChineseAddress) {
      result.isChineseSeller = true;
      result.confidence += 0.6;
      result.details.addressKeyword = details.addressKeyword;
    }
    
    // 分析邮编
    if (details.hasChineseZipCode) {
      result.isChineseSeller = true;
      result.confidence += 0.4;
      result.details.zipCode = details.zipCode;
    }
    
    // 分析商家类型
    if (details.businessType && details.businessType.toLowerCase().includes('china')) {
      result.isChineseSeller = true;
      result.confidence += 0.5;
      result.details.businessTypeChina = true;
    }
    
    // 分析页面关键词
    if (details.pageKeyword) {
      result.isChineseSeller = true;
      result.confidence += 0.5;
      result.details.pageKeyword = details.pageKeyword;
    }
    
    // 如果fetch失败但有其他识别结果，降低置信度阈值
    if (details.fetchFailed && result.confidence > 0.3) {
      result.isChineseSeller = true;
    }
    
    // 调试信息
    console.log('卖家详情分析结果:', {
      sellerId: details.sellerId || 'unknown',
      sellerName: details.businessName || 'unknown',
      isChineseSeller: result.isChineseSeller,
      confidence: result.confidence,
      details: result.details
    });
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SellerDetector;
} else {
  window.SellerDetector = SellerDetector;
}