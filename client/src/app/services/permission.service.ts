import { Injectable } from '@angular/core';
import { Quote } from './quote.service';
import { User } from '../utils/user.types';

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  
  // 检查用户是否可以编辑询价单
  canEditQuote(quote: Quote, user: User): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id === user.id || quote.customer === user.id;
      case 'supplier':
        return (quote.status === 'in_progress' && quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id)) ||
               (quote.status === 'rejected' && quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id)); // 供应商只能编辑分配给自己的询价单
      case 'quoter':
        return quote.status === 'pending' || 
               quote.status === 'supplier_quoted' || 
               quote.status === 'in_progress';
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  // 检查用户是否可以删除询价单
  canDeleteQuote(quote: Quote, user: User): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id === user.id || quote.customer === user.id;
      case 'admin':
        return true;
      default:
        return false; // quoter和supplier不能删除询价单
    }
  }

  // 检查用户是否可以拒绝询价单
  canRejectQuote(quote: Quote, user: User): boolean {
    if (!user) return false;
    
    // 客户不能拒绝报价
    if (user.role === 'customer') {
      return false;
    }
    
    // 供应商只能拒绝待处理的询价单
    if (user.role === 'supplier') {
      return (quote.status === 'in_progress' && quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id)) ||
             (quote.status === 'rejected' && quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id));
    }
    
    // 报价员和管理员可以拒绝待处理、供应商已报价或处理中的询价单
    return ['pending', 'supplier_quoted', 'in_progress'].includes(quote.status);
  }

  // 检查用户是否可以分配询价单
  canAssignQuote(user: User): boolean {
    return user?.role === 'admin';
  }

  // 检查用户是否可以查看询价单
  canViewQuote(quote: Quote, user: User): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        return quote.customer._id === user.id || quote.customer === user.id;
      case 'supplier':
        return quote.status === 'pending' || 
               quote.status === 'rejected' ||
               (quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id));
      case 'quoter':
      case 'admin':
        return true;
      default:
        return false;
    }
  }

  // 检查用户是否可以上传供应商文件
  canUploadSupplierFile(quote: Quote, user: User): boolean {
    return user?.role === 'supplier' && 
           (quote.status === 'in_progress' || quote.status === 'rejected') &&
           quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id);
  }

  // 检查用户是否可以上传最终报价文件
  canUploadFinalQuote(quote: Quote, user: User): boolean {
    return (user?.role === 'quoter' || user?.role === 'admin') && 
           ['pending', 'supplier_quoted', 'in_progress'].includes(quote.status);
  }

  // 检查用户是否可以下载文件
  canDownloadFile(quote: Quote, fileType: string, user: User): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        if (fileType === 'customer') {
          return quote.customer._id === user.id || quote.customer === user.id;
        }
        if (fileType === 'quoter') {
          return quote.status === 'quoted' && 
                 (quote.customer._id === user.id || quote.customer === user.id);
        }
        return false; // 客户永远不能下载供应商文件
      case 'supplier':
        // 供应商可以下载：1. 待处理的询价单的客户文件 2. 自己已报价的询价单的客户文件 3. 自己上传的供应商文件
        return (fileType === 'customer' && 
                (quote.status === 'pending' || 
                 (quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id)))) ||
               (fileType === 'supplier' && 
                quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id));
      case 'quoter':
      case 'admin':
        return true; // 报价员和管理员可以下载所有文件
      default:
        return false;
    }
  }

  // 检查用户是否可以删除文件
  canDeleteFile(quote: Quote, fileType: string, user: User): boolean {
    if (!user) return false;
    
    switch (user.role) {
      case 'customer':
        // 客户只能删除自己上传的客户文件
        return fileType === 'customer' && 
               (quote.customer._id === user.id || quote.customer === user.id);
      case 'supplier':
        // 供应商只能删除自己上传的供应商文件，且在确认报价前
        return fileType === 'supplier' && 
               quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id) &&
               !['supplier_quoted', 'quoted'].includes(quote.status);
      case 'quoter':
        // 报价员只能删除自己上传的报价文件
        return fileType === 'quoter' && 
               quote.quoter && (quote.quoter._id === user.id || quote.quoter === user.id);
      case 'admin':
        // 管理员可以删除任何文件，但不能删除已确认报价的供应商文件
        if (fileType === 'supplier' && ['supplier_quoted', 'quoted'].includes(quote.status)) {
          return false;
        }
        return true;
      default:
        return false;
    }
  }
}