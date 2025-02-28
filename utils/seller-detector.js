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
      'China', 'CN', 'PRC', 'People\'s Republic of China', 'Mainland China', 'Chinese',
      
      // 主要省份/直辖市（英文+拼音）
      'Guangdong', 'Guangzhou', 'Shenzhen', 'Dongguan', 'Foshan', 'Zhuhai', 'Huizhou', 'Zhongshan', 'Jiangmen',
      'Shanghai', 'Pudong', 'Puxi', 'Minhang', 'Baoshan', 'Jiading',
      'Beijing', 'Chaoyang', 'Haidian', 'Fengtai', 'Shijingshan', 'Mentougou',
      'Zhejiang', 'Hangzhou', 'Ningbo', 'Wenzhou', 'Jiaxing', 'Huzhou', 'Shaoxing', 'Jinhua', 'Yiwu',
      'Jiangsu', 'Nanjing', 'Suzhou', 'Wuxi', 'Changzhou', 'Nantong', 'Yangzhou', 'Zhenjiang', 'Taizhou',
      'Fujian', 'Fuzhou', 'Xiamen', 'Quanzhou', 'Putian', 'Longyan', 'Zhangzhou', 'Sanming', 'Nanping',
      'Tianjin', 'Hebei', 'Shandong', 'Henan', 'Hubei', 'Hunan', 'Anhui', 'Sichuan', 'Chongqing',
      'Liaoning', 'Jilin', 'Heilongjiang', 'Shanxi', 'Shaanxi', 'Gansu', 'Ningxia', 'Qinghai', 'Tibet',
      'Yunnan', 'Guizhou', 'Guangxi', 'Hainan', 'Xinjiang', 'Inner Mongolia', 'Neimenggu',
      
      // 主要城市（英文+拼音）
      'Guangdong', 'Guangzhou', 'Canton', 'Shenzhen', 'Shantou', 'Chaozhou', 'Jieyang', 'Zhanjiang',
      'Shanghai', 'Beijing', 'Tianjin', 'Chongqing', 'Chengdu', 'Wuhan', 'Xian', 'Qingdao', 'Dalian',
      'Hangzhou', 'Yiwu', 'Dongguan', 'Foshan', 'Ningbo', 'Suzhou', 'Wenzhou', 'Changsha', 'Fuzhou', 
      'Hefei', 'Nanchang', 'Nanjing', 'Jinan', 'Taiyuan', 'Zhengzhou', 'Shijiazhuang', 'Harbin', 
      'Changchun', 'Guiyang', 'Nanning', 'Haikou', 'Lanzhou', 'Kunming', 'Urumqi', 'Lasa', 'Hohhot',
      
      // 工业区/制造中心（英文+拼音）
      'Dongguan', 'Yiwu', 'Humen', 'Keqiao', 'Kunshan', 'Jiangmen', 'Zhongshan', 'Changshu', 'Ningbo',
      'Shunde', 'Nanhai', 'Haizhu', 'Panyu', 'Baiyun', 'Longgang', 'Nanshan', 'Huangpu', 'Pudong',
      'Guangming', 'Pingshan', 'Luohu', 'Futian', 'Baoan', 'Longhua', 'Songshan Lake', 'SongShanHu',
      'Xiasha', 'Binjiang', 'Qianjiang', 'Nangang', 'Jinqiao', 'Waigaoqiao', 'Zhangjiang', 
      'Lingang', 'Caohejing', 'Zhangdian', 'Jimo', 'Jiaozhou', 'Weihai', 'Rizhao', 'Zibo',
      'Dongying', 'Huangdao', 'Chengyang', 'Licang', 'Laoshan', 'Wenchang', 'Baoshui', 'Jinwan',
      'Zuopaotai', 'Doumen', 'Xiangzhou', 'Gongbei', 'Daliang', 'Ronggui', 'Hecheng', 'Lecong',
      'Lunjiao', 'Dali', 'Guicheng', 'Dengkeng', 'Lishui', 'Shiqi', 'Dongsheng', 'Xiaolan',
      'Xincheng', 'Dongcheng', 'Xicheng', 'Zengcheng', 'Conghua', 'Huadu', 'Nansha', 'Huangpu',
      
      // 主要电商集散地（英文+拼音）
      'Yiwu', 'Hangzhou', 'Guangzhou', 'Shenzhen', 'Qingdao', 'Dongguan',
      'Putian', 'Shanghai', 'Suzhou', 'Nanjing', 'Xiamen', 'Ningbo', 'Wenzhou',
      'Jinhua', 'Taizhou', 'Nanchang', 'Jiaxing', 'Shaoxing', 'Humen', 'Quanzhou',
      'Chengdu', 'Chongqing', 'Qingdao', 'Dalian', 'Kunming', 'Zhengzhou', 'Hainan',
      'Jinan', 'Shijiazhuang', 'Harbin', 'Guiyang', 'Nanning', 'Lanzhou', 'Urumqi',
      'Hohot', 'Lhasa', 'Nantong', 'Changzhou', 'Wuxi', 'Changchun', 'Pingxiang',
      'Zhuhai', 'Shantou', 'Yangzhou', 'Heyuan', 'Meizhou', 'Maoming', 'Fushun',
      'Tonghua', 'Baotou', 'Hohhot', 'Ordos', 'Liuzhou', 'Guilin', 'Xian', 'Xining',
      'Yantai', 'Xuzhou', 'Anqing', 'Putian', 'Nanping', 'Shangrao', 'Xinyu', 'Yingtan',
      'Jingdezhen', 'Jiujiang', 'Leshan', 'Yibin', 'Ziyang', 'Luzhou', 'Liaocheng',
      'Weifang', 'Linyi', 'Zaozhuang', 'Jining', 'Taian', 'Weihai', 'Rizhao', 'Binzhou',
      'Dezhou', 'Dongying', 'Zibo', 'Tangshan', 'Langfang', 'Baoding', 'Xingtai',
      'Handan', 'Cangzhou', 'Longyan', 'Zhangzhou', 'Nanyang', 'Xinxiang', 'Luoyang',
      'Jiaozuo', 'Kaifeng', 'Anyang', 'Hebi', 'Puyang', 'Shangqiu', 'Zhoukou', 'Zhumadian',
      'Fuyang', 'Bengbu', 'Huainan', 'Tongling', 'Wuhu', 'Luan', 'Bozhou', 'Huaibei',
      'Suqian', 'Huaian', 'Yancheng', 'Yangzhou', 'Zhenjiang', 'Taizhou', 'Lianyungang',
      
      // 特色制造区（英文+拼音）
      'Shajing', 'Tangjia', 'Jinwan', 'Guzhen', 'Xiaolan', 'Shatou', 'Qishi', 'Changan',
      'Qingxi', 'Shipai', 'Huangjiang', 'Shanxia', 'Dalingshan', 'Daojiao', 'Hengli',
      'Shilong', 'Dongkeng', 'Chashan', 'Shijie', 'Humen', 'Houjie', 'Changping', 'Tanzhou',
      'Sanshui', 'Huadu', 'Shiling', 'Xinan', 'Wenzhou', 'Datang', 'Jinxiang', 'Fanxing',
      'Liushi', 'Yueqing', 'Songtang', 'Xianjiang', 'Puzhou', 'Qiaotou', 'Pingyang',
      'Yuhuan', 'Ruian', 'Hongqiao', 'Jinhu', 'Pinghu', 'Xinchang', 'Zhuji', 'Dongyang',
      'Yongkang', 'Wuyi', 'Cixi', 'Fenghua', 'Yuyao', 'Shangyu', 'Jiangbei', 'Jiaxing',
      'Tongxiang', 'Jiashan', 'Pinghu', 'Yancheng', 'Changshu', 'Zhangjiagang', 'Taicang',
      'Kunshan', 'Wujiang', 'Qidong', 'Tongzhou', 'Haimen', 'Rugao', 'Donghai', 'Ganyu',
      'Xinyi', 'Pixian', 'Xindu', 'Wenjiang', 'Jianyang', 'Guanghan', 'Deyang', 'Mianyang',
      'Luzhou', 'Nanchong', 'Yibin', 'Zigong', 'Leshan', 'Meishan', 'Suining', 'Neijiang',
      'Zigong', 'Luzhou', 'Dazhou', 'Guangan', 'Zhijiang', 'Liling', 'Shaoyang', 'Xiangtan',
      
      // 常见出口制造业基地（英文+拼音）
      'Shenzhen Hi-Tech Park', 'Guangzhou Economic Zone', 'Shanghai Zhangjiang', 'Suzhou Industrial Park',
      'Hangzhou Bay', 'Qingdao Economic Zone', 'Tianjin Economic Zone', 'Yiwu Trade City',
      'Humen Garment District', 'Keqiao Textile Zone', 'Guzhen Lighting', 'Xiaolan Hardware',
      'Dongfeng Auto Zone', 'Baoan Electronics', 'Longgang Technology', 'Nanhai Ceramics', 
      'Chenghai Toys', 'Puning Textiles', 'Jieyang Stainless', 'Yangjiang Knives',
      'Foshan Furniture', 'Jiangmen Appliance', 'Shantou Plastics', 'Dongguan Electronics',
      'Zhongshan Lighting', 'Zhaoxing Print Zone', 'Guanlan Print Zone', 'Dafen Oil Painting',
      'Guangming Science City', 'Longhua Science Park', 'Songshan Lake Tech Zone', 'Qingxi Industrial',
      'Licheng Shoe City', 'Jinjiang Shoes', 'Chendai Clothes', 'Shishi Garment', 'Jinhu Hardware',
      'Datang Socks', 'Haining Leather', 'Pujiang Crystal', 'Dongyang Wood', 'Yongkang Hardware',
      'Jintan Tech City', 'Longteng E-Commerce', 'Lishui Furniture', 'Jinjiang Sports',
      'Quanzhou Bags', 'Huadu Leather', 'Pingyu Machinery', 
      
      // 中国常见贸易术语（英文+拼音）
      'Made in China', 'Made in PRC', 'Made in P.R.C.', 'China OEM', 'China Factory', 'China Supplier',
      'China Manufacturer', 'China Warehouse', 'Chinese Supplier', 'Chinese Factory', 'Chinese Export',
      'Zhongguo', 'Zhonghua', 'Mainland', 'CN Stock', 'CN Seller', 'CN Shipping',
      'Fast From China', 'Ship From China', 'Chinese Brand', 'Chinese Company', 'China Post',
      'China Registered', 'China Direct', 'China Wholesale', 'China Export', 'China Import',
      'Shenzhen Stock', 'Shanghai Stock', 'Guangzhou Stock', 'Yiwu Stock', 'Yiwu Shipping',
      'Shenzhen Shipping', 'Guangzhou Shipping', 'Chinese Quality', 'Chinese Style',
      'Chinese Warehouse', 'Chinese Logistics', 'Chinese Shipping', 'Chinese Dropshipping',
      
      // 中国地址关键词（中文）
      '中国', '广东', '深圳', '上海', '北京', '浙江', '杭州', '义乌', '东莞', '福建',
      '江苏', '南京', '广州', '天津', '山东', '河北', '中山', '江门', '佛山', '惠州',
      '厦门', '长沙', '福州', '合肥', '武汉', '宁波', '苏州', '温州', '金华', '台州',
      '南昌', '嘉兴', '绍兴', '虎门', '泉州', '成都', '重庆', '青岛', '大连', '昆明',
      '郑州', '海南', '济南', '石家庄', '哈尔滨', '贵阳', '南宁', '兰州', '乌鲁木齐',
      '呼和浩特', '拉萨', '南通', '常州', '无锡', '长春', '萍乡', '珠海', '汕头', 
      '扬州', '河源', '梅州', '茂名', '抚顺', '通化', '包头', '鄂尔多斯', '柳州', 
      '桂林', '西安', '西宁', '烟台', '徐州', '安庆', '莆田', '南平', '上饶', '新余', 
      '鹰潭', '景德镇', '九江', '乐山', '宜宾', '资阳', '泸州', '聊城', '潍坊', '临沂', 
      '枣庄', '济宁', '泰安', '威海', '日照', '滨州', '德州', '东营', '淄博', '唐山', 
      '廊坊', '保定', '邢台', '邯郸', '沧州', '龙岩', '漳州', '南阳', '新乡', '洛阳', 
      '焦作', '开封', '安阳', '鹤壁', '濮阳', '商丘', '周口', '驻马店', '阜阳', '蚌埠', 
      '淮南', '铜陵', '芜湖', '六安', '亳州', '淮北', '宿迁', '淮安', '盐城', '扬州', 
      '镇江', '泰州', '连云港', '丽水', '舟山', '嘉兴', '湖州', '绍兴', '衢州', '黄山', 
      '池州', '滁州', '宣城', '巢湖', '淄博', 
      
      // 中国行政区划（简称与缩写）
      '京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘', '皖', '鲁', '新', '苏',
      '浙', '赣', '鄂', '桂', '甘', '晋', '蒙', '陕', '吉', '闽', '贵', '粤', '青', '藏',
      '川', '宁', '琼',
      
      // 自定义关键词
      ...(this.settings.customKeywords || [])
    ];
    
    // 初始化过滤后的关键词列表，默认使用全部关键词
    this.filteredKeywords = [...this.chinaKeywords];
    
    // 中国邮政编码正则表达式（6位数字）
    this.chinaZipCodeRegex = /\b\d{6}\b/;
    
    // 中国电话号码模式
    this.chinaPhoneRegex = /\+?86[-\s]?1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8}/;
    
    // 中国卖家名称特征正则表达式
    this.chineseSellerNamePatterns = [
      // 拼音+数字组合 (非常常见的中国卖家模式)
      /[A-Za-z]+[0-9]+[A-Za-z]*/,
      
      // 双驼峰命名 (如 TianZun, XiaoMi)
      /^[A-Z][a-z]+[A-Z][a-z]+$/,
      
      // 混合大小写+数字 (如 ShenZhen2022, GuangDong365)
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[A-Z])(?=.*[a-z])/,
      
      // 常见中国卖家命名模式 (更全面的组合)
      /(?:trading|store|mall|tech|direct|official|flagship|home|life|world|best|top|good|new|first|great|china|cn|sz|gz|bj|sh|global|int|ecommerce|electronic|digital|fashion|beauty|smart|power|case|shop|battery|charger|cable|cover|screen|phone|laptop|computer|camera|watch|earphone|headphone|accessory|part|wholesale|retail)\s*(?:co|ltd|inc|limited|shop|store|mall|market|seller|trading|technology|electronic|group|international|official|global|export|import|manufacturer|supplier|industry|enterprise|factory)/i,
      
      // 常见拼音公司名模式 (如 XiaoMi, HuaWei)
      /(?:xiao|hua|feng|tian|hong|jin|bai|hei|lan|yi|shun|da|zhong|yuan|ming|tai|fu|shan|jia|he|wei|li|feng|lin|kai|teng|fei)(?:mi|wei|shun|ke|xing|tong|feng|cheng|tai|dong|fang|ming|yang|jin|tian|yu|quan|yuan|an|fa|run|xin)/i,
      
      // 中国卖家常用缩写 (如 SZKJ, GZSY)
      /\b(?:SZ|GZ|ZJ|JS|SD|HB|FJ|JX|HN|CQ|SC|YN|GS|SX|NX|GX|BJ|SH|TJ|HK|HZ)[A-Z]{2,4}\b/,
      
      // 中文字符 (直接包含中文)
      /[\u4e00-\u9fa5]/,
      
      // 中国地名+英文 (ShenzhenElectronic, GuangdongToys)
      /(?:shenzhen|guangzhou|shanghai|beijing|hangzhou|yiwu|dongguan|ningbo|suzhou|guangdong|zhejiang|jiangsu|fujian|tianjin)[a-z]+/i,
      
      // 英文+中国地名 (ElectronicShenzhen, ToysGuangdong)
      /[a-z]+(?:shenzhen|guangzhou|shanghai|beijing|hangzhou|yiwu|dongguan|ningbo|suzhou|guangdong|zhejiang|jiangsu|fujian|tianjin)/i,
      
      // 汉字拼音风格（不含数字）(如 LiNing, HuaXing)
      /^(?:[A-Z][a-z]{1,4}){2,4}$/,
      
      // 通用中国制造商模式
      /^(?:(?:[A-Z][a-z]+){1,3}|[A-Z]{2,5})(?:Tools|Electronics|Digital|Fashion|Toys|Hardware|Home|Kitchen|Beauty|Health|Sports|Outdoor|Parts|Accessories|Supply|Tech|Device|Product|Goods)$/i
    ];
    
    // 中国卖家公司结构正则 
    this.chineseCompanyPatterns = [
      // 常见中国公司类型
      /(?:co\.?\s*,?\s*ltd\.?|limited|company|corporation|enterprises?|technology|industry|industrial|manufacture|factory|workshop|group|trading)/i,
      
      // 具体的中国公司类型
      /(?:电子|科技|贸易|有限公司|有限责任公司|实业|工厂|制造|集团|商贸|商城|网络|信息技术|电器|机械|设备|工业|材料)/
    ];
    
    // 降低置信度阈值以捕获更多潜在的中国卖家
    this.confidenceThreshold = this.settings.confidenceThreshold || 0.4; // 默认降低到0.4
    
    // 加载缓存
    this.loadCache();
  }
  
  /**
   * 更新设置
   * @param {Object} newSettings - 新的设置对象
   */
  updateSettings(newSettings) {
    if (!newSettings) return;
    
    console.log('更新SellerDetector设置:', newSettings);
    
    // 更新设置
    this.settings = {
      ...this.settings,
      ...newSettings
    };
    
    // 如果有地区设置，处理地区关键词
    if (newSettings.regions && Array.isArray(newSettings.regions)) {
      // 处理自定义区域关键词
      this.applyRegionFilters(newSettings.regions);
    }
    
    // 如果有置信度阈值设置，更新阈值
    if (typeof newSettings.confidenceThreshold === 'number') {
      console.log(`更新置信度阈值: ${newSettings.confidenceThreshold}`);
      this.confidenceThreshold = newSettings.confidenceThreshold;
    }
    
    console.log('设置更新完成');
  }
  
  /**
   * 应用地区筛选
   * @param {Array} regions - 地区数组
   */
  applyRegionFilters(regions) {
    if (!regions || !Array.isArray(regions)) return;
    
    console.log('应用地区筛选:', regions);
    
    // 如果选择了"所有地区"，保留所有关键词
    if (regions.includes('all')) {
      console.log('保留所有地区关键词');
      return;
    }
    
    // 地区关键词映射
    const regionKeywordsMap = {
      'guangdong': [
        'Guangdong', 'Guangzhou', 'Canton', 'Shenzhen', 'Dongguan', 'Foshan', 
        'Zhuhai', 'Shantou', 'Chaozhou', 'Jieyang', 'Zhanjiang', 'Huizhou', 
        'Zhongshan', 'Jiangmen'
      ],
      'shanghai': [
        'Shanghai', 'Pudong', 'Puxi', 'Minhang', 'Baoshan', 'Jiading'
      ],
      'beijing': [
        'Beijing', 'Chaoyang', 'Haidian', 'Fengtai', 'Shijingshan', 'Mentougou'
      ],
      'zhejiang': [
        'Zhejiang', 'Hangzhou', 'Ningbo', 'Wenzhou', 'Jiaxing', 'Huzhou', 
        'Shaoxing', 'Jinhua', 'Yiwu'
      ],
      'jiangsu': [
        'Jiangsu', 'Nanjing', 'Suzhou', 'Wuxi', 'Changzhou', 'Nantong', 
        'Yangzhou', 'Zhenjiang', 'Taizhou'
      ],
      'fujian': [
        'Fujian', 'Fuzhou', 'Xiamen', 'Quanzhou', 'Putian', 'Longyan', 
        'Zhangzhou', 'Sanming', 'Nanping'
      ],
      'other': [
        'Tianjin', 'Hebei', 'Shandong', 'Henan', 'Hubei', 'Hunan', 'Anhui', 
        'Sichuan', 'Chongqing', 'Liaoning', 'Jilin', 'Heilongjiang', 'Shanxi', 
        'Shaanxi', 'Gansu', 'Ningxia', 'Qinghai', 'Tibet', 'Yunnan', 'Guizhou', 
        'Guangxi', 'Hainan', 'Xinjiang', 'Inner Mongolia', 'Neimenggu'
      ]
    };
    
    // 构建活跃地区的关键词列表
    let activeKeywords = [];
    
    regions.forEach(region => {
      if (regionKeywordsMap[region]) {
        activeKeywords = [...activeKeywords, ...regionKeywordsMap[region]];
      }
    });
    
    // 始终包括通用中国关键词
    const commonChineseKeywords = [
      'China', 'CN', 'PRC', 'People\'s Republic of China', 'Mainland China', 'Chinese'
    ];
    
    activeKeywords = [...activeKeywords, ...commonChineseKeywords];
    
    // 确保关键词唯一
    activeKeywords = [...new Set(activeKeywords)];
    
    console.log(`筛选后关键词数量: ${activeKeywords.length}`);
    
    // 创建新的筛选关键词数组
    this.filteredKeywords = activeKeywords;
    
    console.log('区域筛选应用完成');
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
    
    console.log(`开始检测卖家: ${sellerName} (ID: ${sellerId})`);
    
    // 基于卖家名称进行初步判断
    this._analyzeSellerName(sellerName, result);
    
    // 检查卖家URL是否包含中国关键词
    if (sellerUrl) {
      this._analyzeUrl(sellerUrl, result);
    }
    
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
        
        // 即使获取详情失败，也基于已有信息进行判断
        if (result.confidence >= 0.3) {
          result.isChineseSeller = true;
          result.details.fallbackDetection = true;
        }
      }
    }
    
    // 根据置信度确定最终结果
    result.isChineseSeller = result.confidence >= this.confidenceThreshold;
    
    console.log(`卖家检测结果: ${sellerName} - ${result.isChineseSeller ? '中国卖家' : '非中国卖家'} (置信度: ${result.confidence.toFixed(2)})`);
    
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
    
    // 记录原始置信度用于比较
    const originalConfidence = result.confidence;
    
    // 检查卖家名称是否包含中国关键词
    for (const keyword of this.filteredKeywords) {
      if (sellerName.toLowerCase().includes(keyword.toLowerCase())) {
        result.isChineseSeller = true;
        result.confidence += 0.5; // 提高置信度
        result.details.nameKeyword = keyword;
        console.log(`卖家名称包含中国关键词: ${keyword}`);
        break;
      }
    }
    
    // 检查卖家名称是否符合中国卖家命名模式
    for (const pattern of this.chineseSellerNamePatterns) {
      if (pattern.test(sellerName)) {
        result.isChineseSeller = true;
        result.confidence += 0.35; // 适当提高置信度
        result.details.namePattern = pattern.toString();
        console.log(`卖家名称符合中国卖家命名模式: ${pattern}`);
        break;
      }
    }
    
    // 检查是否包含公司结构词
    for (const pattern of this.chineseCompanyPatterns) {
      if (pattern.test(sellerName)) {
        result.isChineseSeller = true;
        result.confidence += 0.25;
        result.details.companyPattern = pattern.toString();
        console.log(`卖家名称包含公司结构词: ${pattern}`);
        break;
      }
    }
    
    // 卖家名称长度分析 - 中国卖家往往使用长名称
    if (sellerName.length > 15) {
      result.confidence += 0.1;
      result.details.longName = true;
      console.log(`卖家名称较长: ${sellerName.length}个字符`);
    }
    
    // 日志输出置信度变化
    if (result.confidence > originalConfidence) {
      console.log(`名称分析提高置信度: ${originalConfidence} -> ${result.confidence}`);
    }
  }
  
  /**
   * 分析卖家URL
   * @param {string} url - 卖家URL
   * @param {Object} result - 结果对象
   * @private
   */
  _analyzeUrl(url, result) {
    if (!url) return;
    
    // 检查URL是否包含中国关键词
    for (const keyword of this.filteredKeywords) {
      if (url.toLowerCase().includes(keyword.toLowerCase())) {
        result.isChineseSeller = true;
        result.confidence += 0.3;
        result.details.urlKeyword = keyword;
        console.log(`卖家URL包含中国关键词: ${keyword}`);
        break;
      }
    }
  }
  
  /**
   * 从卖家页面获取卖家详细信息
   * @param {string} url - 卖家URL
   * @return {Promise<Object>} 卖家详细信息
   * @private
   */
  async _fetchSellerDetails(url) {
    // 检查缓存
    if (this.sellerCache[url]) {
      console.log('使用缓存的卖家详情');
      return this.sellerCache[url];
    }
    
    console.log(`从URL获取卖家详情: ${url}`);
    
    try {
      // 获取卖家页面内容
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const html = await response.text();
      
      // 解析页面内容
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 提取卖家详细信息
      const details = {
        fullHtml: html,
        address: this._extractAddress(doc),
        businessType: this._extractBusinessType(doc),
        about: this._extractAboutSection(doc),
        phoneNumbers: this._extractPhoneNumbers(doc, html)
      };
      
      // 缓存结果
      this.sellerCache[url] = details;
      
      console.log('成功获取卖家详情');
      return details;
    } catch (error) {
      console.error('获取卖家详情出错:', error);
      return null;
    }
  }
  
  /**
   * 提取地址信息
   * @param {Document} doc - DOM文档
   * @return {string} 地址文本
   * @private
   */
  _extractAddress(doc) {
    // 尝试多种选择器找到地址信息
    const addressSelectors = [
      'div[data-cel-widget="ContactInfo"] .address',
      '.address',
      '.seller-address',
      '.location',
      '.contact-address',
      '#merchant-info address',
      'div[contains(text(), "Business Address")]',
      'div[contains(text(), "Location")]',
      '[data-feature-name="businessAddress"]',
      '.businessAddress',
      '.company-address',
      '.contact-info address',
      // 亚马逊店铺通常地址信息在特定位置
      '#sellerName ~ div',
      '#page-section-detail-seller-info address',
      '#page-section-detail-seller-info .a-spacing-mini',
      '.a-spacing-mini:contains("address")',
      'li:contains("Business Address")'
    ];
    
    let addressText = '';
    
    for (const selector of addressSelectors) {
      try {
        const element = doc.querySelector(selector) || 
                       doc.evaluate(`//*[contains(text(), "Address") or contains(text(), "Location")]/following-sibling::*`, 
                                   doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
        
        if (element) {
          addressText = element.textContent.trim();
          console.log(`找到地址信息: ${addressText}`);
          break;
        }
      } catch (e) {
        // 忽略选择器错误，继续尝试其他选择器
      }
    }
    
    // 如果上面的选择器都失败了，尝试在整个页面中搜索地址格式
    if (!addressText) {
      const addressRegex = /Address:?\s*([^<>\n]+)/i;
      const bodyText = doc.body.textContent || '';
      const match = bodyText.match(addressRegex);
      if (match && match[1]) {
        addressText = match[1].trim();
        console.log(`通过正则找到地址信息: ${addressText}`);
      }
    }
    
    return addressText;
  }
  
  /**
   * 提取业务类型信息
   * @param {Document} doc - DOM文档
   * @return {string} 业务类型文本
   * @private
   */
  _extractBusinessType(doc) {
    // 尝试多种选择器找到业务类型信息
    const typeSelectors = [
      '.business-type',
      '.seller-type',
      '#merchant-info .type',
      '.seller-info .type',
      'div[contains(text(), "Business Type")]',
      '[data-feature-name="businessType"]',
      '.businessType',
      '.company-type',
      // 亚马逊特定选择器
      '#page-section-detail-seller-info .a-spacing-mini:contains("Type")',
      'li:contains("Business Type")'
    ];
    
    let typeText = '';
    
    for (const selector of typeSelectors) {
      try {
        const element = doc.querySelector(selector) || 
                       doc.evaluate(`//*[contains(text(), "Business Type") or contains(text(), "Company Type")]/following-sibling::*`,
                                   doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
        
        if (element) {
          typeText = element.textContent.trim();
          console.log(`找到业务类型信息: ${typeText}`);
          break;
        }
      } catch (e) {
        // 忽略选择器错误
      }
    }
    
    // 正则表达式查找业务类型
    if (!typeText) {
      const typeRegex = /Business Type:?\s*([^<>\n]+)/i;
      const bodyText = doc.body.textContent || '';
      const match = bodyText.match(typeRegex);
      if (match && match[1]) {
        typeText = match[1].trim();
        console.log(`通过正则找到业务类型: ${typeText}`);
      }
    }
    
    return typeText;
  }
  
  /**
   * 提取关于部分信息
   * @param {Document} doc - DOM文档
   * @return {string} 关于部分文本
   * @private
   */
  _extractAboutSection(doc) {
    // 尝试多种选择器找到关于部分信息
    const aboutSelectors = [
      '.about',
      '.about-section',
      '.about-us',
      '.company-profile',
      '.seller-description',
      '.a-profile-description',
      '[data-feature-name="companyProfile"]',
      '#company-profile',
      // 亚马逊特定选择器
      '#page-section-detail-seller-info .a-spacing-extra-large',
      'div.a-spacing-large:contains("About")',
      '#aag-details-section'
    ];
    
    let aboutText = '';
    
    for (const selector of aboutSelectors) {
      try {
        const element = doc.querySelector(selector) || 
                       doc.evaluate(`//*[contains(text(), "About") or contains(text(), "Company Profile") or contains(text(), "Description")]/following-sibling::*`,
                                   doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
        
        if (element) {
          aboutText = element.textContent.trim();
          console.log(`找到关于部分: ${aboutText.substring(0, 50)}...`);
          break;
        }
      } catch (e) {
        // 忽略选择器错误
      }
    }
    
    return aboutText;
  }
  
  /**
   * 提取电话号码信息
   * @param {Document} doc - DOM文档
   * @param {string} html - 原始HTML文本
   * @return {Array<string>} 电话号码列表
   * @private
   */
  _extractPhoneNumbers(doc, html) {
    // 尝试多种选择器找到电话号码
    const phoneSelectors = [
      '.phone',
      '.telephone',
      '.contact-phone',
      'div[contains(text(), "Phone")]',
      '[data-feature-name="contactPhone"]',
      '.contact-info .phone',
      // 亚马逊特定选择器
      '#page-section-detail-seller-info .a-spacing-mini:contains("Phone")',
      'li:contains("Phone Number")'
    ];
    
    let phoneNumbers = [];
    
    // 通过选择器查找
    for (const selector of phoneSelectors) {
      try {
        const element = doc.querySelector(selector) || 
                       doc.evaluate(`//*[contains(text(), "Phone") or contains(text(), "Telephone") or contains(text(), "Contact")]/following-sibling::*`,
                                   doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
        
        if (element) {
          const phoneText = element.textContent.trim();
          if (this.chinaPhoneRegex.test(phoneText)) {
            phoneNumbers.push(phoneText);
            console.log(`找到中国电话号码: ${phoneText}`);
          }
        }
      } catch (e) {
        // 忽略选择器错误
      }
    }
    
    // 使用正则表达式在整个页面中查找中国电话号码
    if (phoneNumbers.length === 0) {
      const phoneMatches = html.match(this.chinaPhoneRegex) || [];
      if (phoneMatches.length > 0) {
        phoneNumbers = phoneMatches;
        console.log(`通过正则找到中国电话号码: ${phoneNumbers.join(', ')}`);
      }
    }
    
    return phoneNumbers;
  }
  
  /**
   * 分析卖家详情
   * @param {Object} details - 卖家详细信息
   * @param {Object} result - 结果对象
   * @private
   */
  _analyzeSellerDetails(details, result) {
    // 记录原始置信度用于比较
    const originalConfidence = result.confidence;
    
    // 检查邮政编码
    if (details.address && this.chinaZipCodeRegex.test(details.address)) {
      result.isChineseSeller = true;
      result.confidence = 0.95; // 邮政编码是很强的证据
      result.evidences.push(`Chinese postal code detected: ${details.address}`);
    }
    
    // 检查电话号码是否符合中国电话号码模式
    if (details.phoneNumbers && details.phoneNumbers.length > 0) {
      result.isChineseSeller = true;
      result.confidence += 0.5; // 大幅提高置信度
      result.details.hasChinesePhone = true;
      result.evidences.push(`Chinese phone numbers detected: ${details.phoneNumbers.join(', ')}`);
    }
    
    // 检查地址是否包含中国关键词
    if (details.address) {
      for (const keyword of this.filteredKeywords) {
        if (details.address.toLowerCase().includes(keyword.toLowerCase())) {
          result.isChineseSeller = true;
          result.confidence += 0.5; // 提高置信度
          result.details.addressKeyword = keyword;
          result.evidences.push(`Address contains Chinese keyword: "${keyword}"`);
          break;
        }
      }
    }
    
    // 检查业务类型是否含有中国相关关键词
    if (details.businessType) {
      for (const keyword of this.filteredKeywords) {
        if (details.businessType.toLowerCase().includes(keyword.toLowerCase())) {
          result.isChineseSeller = true;
          result.confidence += 0.4;
          result.details.businessTypeKeyword = keyword;
          result.evidences.push(`Business type contains Chinese keyword: "${keyword}"`);
          break;
        }
      }
      
      // 检查常见中国公司类型
      for (const pattern of this.chineseCompanyPatterns) {
        if (pattern.test(details.businessType)) {
          result.isChineseSeller = true;
          result.confidence += 0.3;
          result.details.businessTypePattern = pattern.toString();
          result.evidences.push(`Business type matches Chinese company pattern: "${pattern}"`);
          break;
        }
      }
    }
    
    // 检查关于部分是否含有中国相关关键词
    if (details.about) {
      for (const keyword of this.filteredKeywords) {
        if (details.about.toLowerCase().includes(keyword.toLowerCase())) {
          result.isChineseSeller = true;
          result.confidence += 0.3;
          result.details.aboutKeyword = keyword;
          result.evidences.push(`About section contains Chinese keyword: "${keyword}"`);
          break;
        }
      }
    }
    
    // 分析整个页面内容
    if (details.fullHtml) {
      let chineseKeywordCount = 0;
      
      // 计算中国关键词在页面中出现的次数
      for (const keyword of this.filteredKeywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = details.fullHtml.match(regex) || [];
        chineseKeywordCount += matches.length;
      }
      
      // 根据关键词出现频率提高置信度
      if (chineseKeywordCount > 0) {
        const frequencyBoost = Math.min(0.5, chineseKeywordCount * 0.05); // 最多提高0.5
        result.confidence += frequencyBoost;
        result.details.keywordFrequency = chineseKeywordCount;
        result.evidences.push(`Page contains ${chineseKeywordCount} Chinese keywords`);
      }
      
      // 检查是否有大量中文字符
      const chineseCharRegex = /[\u4e00-\u9fa5]/g;
      const chineseChars = details.fullHtml.match(chineseCharRegex) || [];
      if (chineseChars.length > 10) { // 超过10个中文字符视为显著特征
        result.isChineseSeller = true;
        result.confidence += 0.5;
        result.details.hasChineseText = true;
        result.evidences.push(`Page contains ${chineseChars.length} Chinese characters`);
      }
    }
    
    // 增强检测：检查页面整体内容中的中国关键词
    let keywordHits = 0;
    let highValueKeywords = 0;
    const highValueTerms = ['Made in China', 'China Factory', 'China OEM', 'China Manufacturer', 'Mainland China', 'Ship From China'];
    
    // 首先检查高价值关键词（这些关键词几乎确定是中国卖家）
    for (const term of highValueTerms) {
      if (details.fullHtml.includes(term)) {
        highValueKeywords++;
        result.evidences.push(`High-value keyword found: "${term}"`);
      }
    }
    
    // 如果找到高价值关键词，大幅提高置信度
    if (highValueKeywords > 0) {
      result.isChineseSeller = true;
      result.confidence = Math.max(result.confidence, 0.85 + (highValueKeywords * 0.03));
    }
    
    // 然后检查一般关键词
    for (const keyword of this.filteredKeywords) {
      // 忽略太短或太常见的关键词，避免误判
      if (keyword.length < 3) continue;
      
      // 完整词匹配，避免部分匹配导致的误判
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(details.fullHtml)) {
        keywordHits++;
        if (keywordHits <= 3) { // 只记录前3个，避免证据过多
          result.evidences.push(`Chinese location keyword found: "${keyword}"`);
        }
      }
    }
    
    // 根据关键词命中数量逐步提高置信度
    if (keywordHits > 0) {
      // 使用对数函数使置信度增长随命中数量增多而减缓
      const confidenceBoost = Math.min(0.3, 0.1 + (0.05 * Math.log2(keywordHits + 1)));
      result.confidence = Math.max(result.confidence, 0.6 + confidenceBoost);
      
      if (keywordHits >= 3 && !result.isChineseSeller) {
        result.isChineseSeller = true;
        result.evidences.push(`Multiple (${keywordHits}) Chinese location keywords found`);
      }
    }
    
    // 增强检测：检查联系方式
    const contactInfo = details.fullHtml.match(/\+86[0-9\-\s]{5,15}/);
    if (contactInfo) {
      result.isChineseSeller = true;
      result.confidence = Math.max(result.confidence, 0.9);
      result.evidences.push(`Chinese phone prefix detected: ${contactInfo[0]}`);
    }
    
    // 增强检测：检查常见的中国域名
    const chineseDomains = ['.cn', '.com.cn', '.alibaba.com', '.1688.com', '.taobao.com', '.tmall.com', '.jd.com'];
    const domainMatches = details.fullHtml.match(/https?:\/\/[^\s"')]+/g) || [];
    
    for (const url of domainMatches) {
      if (chineseDomains.some(domain => url.includes(domain))) {
        result.isChineseSeller = true;
        result.confidence = Math.max(result.confidence, 0.85);
        result.evidences.push(`Chinese domain detected in URL: ${url}`);
        break;
      }
    }
    
    // 增强检测：检查QQ、微信、支付宝等中国特有的通讯和支付方式
    const chinesePlatforms = ['WeChat', 'Wechat', '微信', 'QQ', 'Alipay', '支付宝', '淘宝', 'Taobao', '天猫', 'Tmall', '京东', 'JD.com'];
    for (const platform of chinesePlatforms) {
      if (details.fullHtml.includes(platform)) {
        result.isChineseSeller = true;
        result.confidence = Math.max(result.confidence, 0.85);
        result.evidences.push(`Chinese platform mentioned: ${platform}`);
        break;
      }
    }
    
    // 最终确认：如果置信度低但证据较多，适当提高置信度
    if (result.evidences.length >= 4 && result.confidence < 0.8) {
      result.confidence = Math.min(0.8, result.confidence + 0.1);
    }
    
    // 最终决策：基于置信度确定是否为中国卖家
    if (result.confidence >= 0.65 && !result.isChineseSeller) {
      result.isChineseSeller = true;
    }
    
    // 日志输出置信度变化
    if (result.confidence > originalConfidence) {
      console.log(`卖家详情分析提高置信度: ${originalConfidence} -> ${result.confidence}`);
    }
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SellerDetector;
} else {
  window.SellerDetector = SellerDetector;
}