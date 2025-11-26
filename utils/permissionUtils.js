/**
 * 权限检查工具类
 * 统一前后端权限检查逻辑
 */

class PermissionUtils {
  
  /**
   * 根据用户角色过滤询价单数据（后端使用）
   * @param {Object} quote 原始询价单对象
   * @param {string} userRole 用户角色
   * @returns {Object} 过滤后的询价单对象
   */
  static filterQuoteData(quote, userRole) {
    const quoteObj = quote.toObject ? quote.toObject() : quote;
    
    switch (userRole) {
      case 'customer':
        delete quoteObj.quoter;
        delete quoteObj.supplier;
        delete quoteObj.supplierFiles;
        if (quoteObj.status !== 'quoted') {
          delete quoteObj.quoterFiles;
        }
        break;
      case 'supplier':
        delete quoteObj.quoter;
        delete quoteObj.quoterFiles;
        break;
      case 'quoter':
        // 报价员可以看到所有信息
        break;
      // admin 可以看到所有信息
    }
    
    return quoteObj;
  }

  /**
   * 检查用户是否可以查看询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以查看
   */
  static canViewQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id?.toString() === user.userId?.toString() || 
               quote.customer?.toString() === user.userId?.toString();
      case 'supplier':
        return quote.supplier?._id?.toString() === user.userId?.toString() || 
               quote.supplier?.toString() === user.userId?.toString() || 
               ['pending', 'rejected', 'in_progress'].includes(quote.status);
      case 'quoter':
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以编辑询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以编辑
   */
  static canEditQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id?.toString() === user.userId?.toString() || 
               quote.customer?.toString() === user.userId?.toString();
      case 'supplier':
        return (quote.status === 'supplier_quoted' && quote.supplier && 
                (quote.supplier._id?.toString() === user.userId?.toString() || 
                 quote.supplier?.toString() === user.userId?.toString())) ||
               (quote.status === 'rejected' && quote.supplier && 
                (quote.supplier._id?.toString() === user.userId?.toString() || 
                 quote.supplier?.toString() === user.userId?.toString()));
      case 'quoter':
        return ['pending', 'supplier_quoted', 'in_progress'].includes(quote.status);
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以删除询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以删除
   */
  static canDeleteQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id?.toString() === user.userId?.toString() || 
               quote.customer?.toString() === user.userId?.toString();
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以拒绝询价单
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以拒绝
   */
  static canRejectQuote(quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return false;
      case 'supplier':
        return quote.supplier && 
               (quote.supplier._id?.toString() === user.userId?.toString() || 
                quote.supplier?.toString() === user.userId?.toString());
      case 'quoter':
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  /**
   * 检查用户是否可以删除文件
   * @param {string} fileType 文件类型
   * @param {Object} quote 询价单对象
   * @param {Object} user 用户对象
   * @returns {boolean} 是否可以删除
   */
  static canDeleteFile(fileType, quote, user) {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return fileType === 'customer' && 
               (quote.customer._id?.toString() === user.userId?.toString() || 
                quote.customer?.toString() === user.userId?.toString()) &&
               quote.status === 'pending';
      case 'supplier':
        // 供应商可以在最终报价前删除自己上传的文件
        return fileType === 'supplier' && 
               quote.supplier && 
               (quote.supplier._id?.toString() === user.userId?.toString() || 
                quote.supplier?.toString() === user.userId?.toString()) &&
               ['in_progress', 'rejected', 'supplier_quoted'].includes(quote.status);
      case 'quoter':
        return fileType === 'quoter' && ['quoter', 'admin'].includes(user.role);
      case 'admin':
        return true;
      default:
        return false;
    }
  }
}

module.exports = PermissionUtils;