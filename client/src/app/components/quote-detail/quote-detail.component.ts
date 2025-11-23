import { Component, OnInit, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QuoteService, Quote } from '../../services/quote.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { PermissionService } from '../../services/permission.service';
import { getStatusDisplayName } from '../../utils/status.utils';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-quote-detail',
  templateUrl: './quote-detail.component.html',
  styleUrls: ['./quote-detail.component.scss']
})
export class QuoteDetailComponent implements OnInit {
  quote: Quote | null = null;
  loading = true;
  error = '';
  quoters: any[] = [];
  suppliers: any[] = [];
  editMode = false;
  quoteForm: any = {};
  uploading = false;
  uploadProgress = 0;
  assigning = false;
  selectedSupplierId = '';
  selectedFiles: File[] = [];

  constructor(
    private route: ActivatedRoute,
    private quoteService: QuoteService,
    public authService: AuthService,
    private userService: UserService,
    private permissionService: PermissionService,
    private ngZone: NgZone
  ) { }

  ngOnInit() {
    const quoteId = this.route.snapshot.paramMap.get('id');
    if (quoteId) {
      this.loadQuote(quoteId);
      if (this.authService.hasRole('admin')) {
        this.loadQuoters();
      }
      if (this.authService.hasRole('quoter') || this.authService.hasRole('admin')) {
        this.loadSuppliers();
      }
    }
  }

  loadQuote(id: string) {
    this.loading = true;
    this.quoteService.getQuoteById(id).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.quoteForm = { ...quote };
        this.loading = false;

      },
      error: () => {
        this.error = '加载询价单失败';
        this.loading = false;
      }
    });
  }

  loadQuoters() {
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.quoters = users.filter(user => user.role === 'quoter' && user.isActive);
      },
      error: (error) => {
        console.error('加载报价员失败:', error);
      }
    });
  }

  loadSuppliers() {
    this.userService.getSuppliers().subscribe({
      next: (suppliers) => {
        this.suppliers = suppliers;
      },
      error: (error) => {
        console.error('加载供应商列表失败:', error);
      }
    });
  }

  // 获取指定类型的文件列表
  getFiles(fileType: string): any[] {
    if (!this.quote) return [];
    
    // 使用新的多文件字段
    switch (fileType) {
      case 'customer':
        return this.quote.customerFiles || [];
      case 'supplier':
        return this.quote.supplierFiles || [];
      case 'quoter':
        return this.quote.quoterFiles || [];
      default:
        return [];
    }
  }

  // 检查是否有指定类型的文件
  hasFiles(fileType: string): boolean {
    return this.getFiles(fileType).length > 0;
  }

  downloadFile(fileType: string, fileIndex?: number) {
    if (!this.quote || this.uploading) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFile(this.quote._id, actualFileType, fileIndex).subscribe({
      next: (blob) => {
        this.ngZone.run(() => {
          try {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 获取文件名
            const files = this.getFiles(actualFileType);
            const targetFile = fileIndex !== undefined && files[fileIndex] 
              ? files[fileIndex] 
              : files[0];
            const originalName = targetFile?.originalName || `${this.quote?.quoteNumber}_${actualFileType}.xlsx`;
            
            a.download = originalName;
            
            // 使用setTimeout确保DOM操作完成
            setTimeout(() => {
              a.click();
              // 延迟清理URL和DOM元素
              setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }, 100);
            }, 0);
          } catch (error) {
            console.error('下载文件处理失败:', error);
            alert('下载文件处理失败');
          }
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('下载文件失败:', error);
          alert('下载文件失败');
        });
      }
    });
  }

  // 批量下载文件
  downloadFilesBatch(fileType: string) {
    if (!this.quote || this.uploading) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFilesBatch(this.quote._id, actualFileType).subscribe({
      next: (blob) => {
        this.ngZone.run(() => {
          try {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 生成ZIP文件名
            const zipFileName = `${this.quote?.quoteNumber}_${this.getFileTypeName(actualFileType)}文件.zip`;
            a.download = zipFileName;
            
            // 使用setTimeout确保DOM操作完成
            setTimeout(() => {
              a.click();
              // 延迟清理URL和DOM元素
              setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }, 100);
            }, 0);
          } catch (error) {
            console.error('批量下载文件处理失败:', error);
            alert('批量下载文件处理失败');
          }
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('批量下载文件失败:', error);
          alert('批量下载文件失败');
        });
      }
    });
  }

  // 获取文件类型的中文名称
  private getFileTypeName(fileType: string): string {
    switch (fileType) {
      case 'customer':
        return '客户询价';
      case 'supplier':
        return '供应商报价';
      case 'quoter':
        return '最终报价';
      default:
        return '文件';
    }
  }

  onFilesSelected(event: any) {
    const files = Array.from(event.target.files) as File[];
    if (files.length === 0) return;
    
    // 检查用户权限和状态
    const user = this.authService.getCurrentUser();
    if (user?.role === 'customer' && this.quote?.status !== 'pending') {
      alert('询价单不是待处理状态，无法选择文件');
      event.target.value = '';
      return;
    }
    
    if (user?.role === 'supplier' && !['in_progress', 'rejected'].includes(this.quote?.status || '')) {
      alert('询价单不是处理中或被拒绝状态，无法选择文件');
      event.target.value = '';
      return;
    }
    
    if ((user?.role === 'quoter' || user?.role === 'admin') && !['pending', 'supplier_quoted', 'in_progress'].includes(this.quote?.status || '')) {
      alert('询价单当前状态不允许上传最终报价文件');
      event.target.value = '';
      return;
    }
    
    // 检查所有文件类型和大小
    const validFiles: File[] = [];
    for (const file of files) {
      // 检查文件类型
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert(`文件 "${file.name}" 不是Excel文件，请选择 .xlsx 或 .xls 文件`);
        continue;
      }
      
      // 检查文件大小 (10MB限制)
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 "${file.name}" 大小超过10MB限制`);
        continue;
      }
      
      // 检查是否已经选择了同名文件
      const existingFile = this.selectedFiles.find(f => f.name === file.name);
      if (existingFile) {
        alert(`文件 "${file.name}" 已经在选择列表中`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    // 将有效文件追加到已选择的文件列表中
    if (validFiles.length > 0) {
      this.selectedFiles = [...this.selectedFiles, ...validFiles];
    }
    
    // 清空文件输入框，允许重复选择相同文件
    event.target.value = '';
  }

  // 通用的文件上传方法
  private uploadFile(file: File, successMessage: string, errorMessage: string) {
    if (!this.quote) return;
    
    this.uploading = true;
    this.uploadProgress = 0;
    
    const formData = new FormData();
    formData.append('file', file);
    
    // 创建带进度的HTTP请求
    const xhr = new XMLHttpRequest();
    
    // 监听上传进度
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        this.uploadProgress = Math.round((event.loaded / event.total) * 100);
      }
    });
    
    // 监听响应
    xhr.addEventListener('load', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        
        if (xhr.status === 200) {
          try {
            const updatedQuote = JSON.parse(xhr.responseText);
            console.log('上传成功，更新后的询价单:', updatedQuote);

            this.quote = updatedQuote;
            alert(successMessage);
          } catch (error) {
            console.error('解析响应失败:', error);
            alert('上传响应解析失败');
          }
        } else {
          console.error('上传失败:', xhr.status, xhr.responseText);
          alert(errorMessage);
        }
      });
    });
    
    // 监听错误和超时
    xhr.addEventListener('error', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        console.error('网络错误');
        alert('网络错误，上传失败');
      });
    });
    
    xhr.addEventListener('timeout', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        console.error('上传超时');
        alert('上传超时，请重试');
      });
    });
    
    // 配置请求
    xhr.timeout = 60000; // 60秒超时
    xhr.open('PUT', `${environment.apiUrl}/quotes/${this.quote._id}`);
    
    // 添加认证头
    const token = localStorage.getItem('token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    
    // 发送请求
    xhr.send(formData);
  }

  // 多文件上传方法
  private uploadFiles(files: File[], successMessage: string, errorMessage: string) {
    if (!this.quote) return;
    
    this.uploading = true;
    this.uploadProgress = 0;
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    
    // 创建带进度的HTTP请求
    const xhr = new XMLHttpRequest();
    
    // 监听上传进度
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        this.uploadProgress = Math.round((event.loaded / event.total) * 100);
      }
    });
    
    // 监听响应
    xhr.addEventListener('load', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        
        if (xhr.status === 200) {
          try {
            const updatedQuote = JSON.parse(xhr.responseText);
            console.log('上传成功，更新后的询价单:', updatedQuote);

            this.quote = updatedQuote;
            alert(successMessage);
          } catch (error) {
            console.error('解析响应失败:', error);
            alert('上传响应解析失败');
          }
        } else {
          console.error('上传失败:', xhr.status, xhr.responseText);
          alert(errorMessage);
        }
      });
    });
    
    // 监听错误和超时
    xhr.addEventListener('error', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        console.error('网络错误');
        alert('网络错误，上传失败');
      });
    });
    
    xhr.addEventListener('timeout', () => {
      this.ngZone.run(() => {
        this.uploading = false;
        this.uploadProgress = 0;
        console.error('上传超时');
        alert('上传超时，请重试');
      });
    });
    
    // 配置请求
    xhr.timeout = 120000; // 2分钟超时（多文件需要更长时间）
    xhr.open('PUT', `${environment.apiUrl}/quotes/${this.quote._id}`);
    
    // 添加认证头
    const token = localStorage.getItem('token');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    
    // 发送请求
    xhr.send(formData);
  }

  uploadCustomerFiles(files: File[]) {
    this.uploadFiles(files, `成功上传 ${files.length} 个询价文件`, '上传询价文件失败');
  }

  uploadSupplierFiles(files: File[]) {
    this.uploadFiles(files, `成功上传 ${files.length} 个报价文件`, '上传报价文件失败');
  }

  uploadQuoterFiles(files: File[]) {
    this.uploadFiles(files, `成功上传 ${files.length} 个最终报价文件`, '上传最终报价文件失败');
  }



  // 确认上传选择的文件
  confirmUpload() {
    if (this.selectedFiles.length === 0) return;
    
    const user = this.authService.getCurrentUser();
    if (user?.role === 'customer') {
      // 客户只能在待处理状态下上传文件
      if (this.quote?.status !== 'pending') {
        alert('询价单不是待处理状态，无法上传文件');
        return;
      }
      this.uploadCustomerFiles(this.selectedFiles);
    } else if (user?.role === 'supplier') {
      // 供应商只能在处理中或被拒绝状态下上传文件
      if (!['in_progress', 'rejected'].includes(this.quote?.status || '')) {
        alert('询价单不是处理中或被拒绝状态，无法上传文件');
        return;
      }
      this.uploadSupplierFiles(this.selectedFiles);
    } else {
      this.uploadQuoterFiles(this.selectedFiles);
    }
    
    // 清空选择的文件
    this.selectedFiles = [];
  }

  // 清除选择的文件
  clearSelectedFiles() {
    this.selectedFiles = [];
  }

  // 格式化文件大小
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  deleteFile(fileType: string, fileIndex?: number) {
    if (!this.quote) return;
    
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    // 检查权限
    if (!this.permissionService.canDeleteFile(this.quote, fileType, user)) {
      alert('您没有权限删除此文件');
      return;
    }

    // 确认删除
    const files = this.getFiles(fileType);
    const targetFile = fileIndex !== undefined && files[fileIndex] 
      ? files[fileIndex] 
      : files[0];
    
    if (!targetFile) {
      alert('文件不存在');
      return;
    }
    
    const confirmMessage = `确定要删除文件 "${targetFile.originalName}" 吗？`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    // 构建删除请求数据
    const formData = new FormData();
    formData.append('deleteFileIndex', fileIndex?.toString() || '0');
    formData.append('deleteFileType', fileType);
    
    this.quoteService.updateQuote(this.quote._id, formData).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert(`文件 "${targetFile.originalName}" 删除成功`);
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('删除文件失败:', error);
          const errorMessage = error.error?.message || error.message || '删除文件失败';
          alert(errorMessage);
        });
      }
    });
  }



  assignToQuoter(quoterId: string) {
    if (!this.quote) return;
    
    this.quoteService.assignQuote(this.quote._id, quoterId).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('分配成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('分配失败:', error);
          alert('分配失败');
        });
      }
    });
  }

  assignSupplier() {
    if (!this.quote || !this.selectedSupplierId) return;
    
    this.assigning = true;
    this.quoteService.assignSupplier(this.quote._id, this.selectedSupplierId).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          this.assigning = false;
          this.selectedSupplierId = '';
          alert('供应商分配成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('分配供应商失败:', error);
          this.assigning = false;
          alert('分配供应商失败');
        });
      }
    });
  }

  removeSupplierAssignment() {
    if (!this.quote || !this.quote.supplier) return;
    
    if (!confirm('确定要移除已分配的供应商吗？供应商将需要重新分配。')) {
      return;
    }
    
    this.assigning = true;
    this.quoteService.removeSupplierAssignment(this.quote._id).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          this.assigning = false;
          alert('供应商分配已移除');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('移除供应商分配失败:', error);
          this.assigning = false;
          alert('移除供应商分配失败');
        });
      }
    });
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.quoteForm = { ...this.quote };
    }
  }

  saveChanges() {
    if (!this.quote) return;
    
    const formData = new FormData();
    formData.append('title', this.quoteForm.title);
    formData.append('description', this.quoteForm.description);
    
    this.quoteService.updateQuote(this.quote._id, formData).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          this.editMode = false;
          alert('更新成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('更新失败:', error);
          alert('更新失败');
        });
      }
    });
  }

  canEdit(): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    return this.permissionService.canEditQuote(this.quote, user);
  }

  canReject(): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    return this.permissionService.canRejectQuote(this.quote, user);
  }

  canDeleteFile(fileType: string): boolean {
    if (!this.quote) return false;
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    
    return this.permissionService.canDeleteFile(this.quote, fileType, user);
  }

  rejectQuote() {
    if (!this.quote) return;
    
    const reason = prompt('请输入不予报价的理由:');
    if (!reason) return;
    
    this.quoteService.rejectQuote(this.quote._id, reason).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('不予报价理由已记录');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('记录不予报价理由失败:', error);
          alert('记录不予报价理由失败');
        });
      }
    });
  }

  confirmSupplierQuote() {
    if (!this.quote) return;
    
    this.quoteService.confirmSupplierQuote(this.quote._id).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('供应商报价确认成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('确认供应商报价失败:', error);
          alert('确认供应商报价失败');
        });
      }
    });
  }

  confirmFinalQuote() {
    if (!this.quote) return;
    
    this.quoteService.confirmFinalQuote(this.quote._id).subscribe({
      next: (quote) => {
        this.ngZone.run(() => {
          this.quote = quote;
          alert('最终报价确认成功');
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('确认最终报价失败:', error);
          alert('确认最终报价失败');
        });
      }
    });
  }

  getStatusDisplayName(status: string): string {
    return getStatusDisplayName(status);
  }

  // Helper methods for template status checks
  canShowSupplierUpload(): boolean {
    return !!(this.quote && (this.quote.status === 'in_progress' || this.quote.status === 'rejected'));
  }

  canShowQuoterUpload(): boolean {
    return !!(this.quote && ['pending', 'supplier_quoted', 'in_progress'].includes(this.quote.status));
  }

  canShowCustomerUpload(): boolean {
    return !!(this.quote && this.quote.status === 'pending');
  }

  isQuotedStatus(): boolean {
    return !!(this.quote && this.quote.status === 'quoted');
  }

  isPendingStatus(): boolean {
    return !!(this.quote && this.quote.status === 'pending');
  }
}