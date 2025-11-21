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



  downloadFile(fileType: string) {
    if (!this.quote) return;
    
    // 根据用户角色和询价单状态决定下载哪个文件
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    let actualFileType = fileType;
    
    if (user.role === 'customer') {
      // 客户：未报价时下载原文件，已报价时下载报价文件
      actualFileType = this.quote.status === 'quoted' ? 'quoter' : 'customer';
    }
    
    this.quoteService.downloadFile(this.quote._id, actualFileType).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 根据文件类型设置下载文件名
        let suffix = '';
        switch (actualFileType) {
          case 'customer':
            suffix = '_customer';
            break;
          case 'supplier':
            suffix = '_supplier';
            break;
          case 'quoter':
            suffix = '_quoted';
            break;
        }
        
        a.download = `${this.quote?.quoteNumber}${suffix}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('下载文件失败:', error);
        alert('下载文件失败');
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // 检查文件类型
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('请选择Excel文件 (.xlsx 或 .xls)');
        event.target.value = '';
        return;
      }
      
      // 检查文件大小 (10MB限制)
      if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过10MB');
        event.target.value = '';
        return;
      }
      
      const user = this.authService.getCurrentUser();
      if (user?.role === 'supplier') {
        this.uploadSupplierFile(file);
      } else {
        this.uploadQuoterFile(file);
      }
    }
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
      this.uploading = false;
      this.uploadProgress = 0;
      
      if (xhr.status === 200) {
        try {
          const updatedQuote = JSON.parse(xhr.responseText);
          console.log('上传成功，更新后的询价单:', updatedQuote);
          
          // 使用NgZone确保变更检测
          this.ngZone.run(() => {
            this.quote = updatedQuote;
          });
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
    
    // 监听错误和超时
    xhr.addEventListener('error', () => {
      this.uploading = false;
      this.uploadProgress = 0;
      console.error('网络错误');
      alert('网络错误，上传失败');
    });
    
    xhr.addEventListener('timeout', () => {
      this.uploading = false;
      this.uploadProgress = 0;
      console.error('上传超时');
      alert('上传超时，请重试');
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

  uploadSupplierFile(file: File) {
    this.uploadFile(file, '供应商报价文件上传成功', '上传供应商报价文件失败');
  }

  uploadQuoterFile(file: File) {
    this.uploadFile(file, '最终报价文件上传成功', '上传最终报价文件失败');
  }

  deleteFile(fileType: string) {
    if (!this.quote) return;
    
    const user = this.authService.getCurrentUser();
    if (!user) return;
    
    // 检查权限
    if (!this.permissionService.canDeleteFile(this.quote, fileType, user)) {
      alert('您没有权限删除此文件');
      return;
    }
    
    // 检查文件是否存在
    const fileExists = this.checkFileExists(fileType);
    if (!fileExists) {
      alert('文件不存在');
      return;
    }
    
    // 确认删除
    const fileTypeName = this.getFileTypeName(fileType);
    if (confirm(`确定要删除${fileTypeName}吗？`)) {
      const formData = new FormData();
      formData.append(fileType + 'File', ''); // 空值表示删除
      
      this.quoteService.updateQuote(this.quote._id, formData).subscribe({
        next: (quote) => {
          this.quote = quote;
          alert(`${fileTypeName}删除成功`);
        },
        error: (error) => {
          console.error('删除文件失败:', error);
          const errorMessage = error.error?.message || error.message || '删除文件失败';
          alert(errorMessage);
        }
      });
    }
  }
  
  private checkFileExists(fileType: string): boolean {
    if (!this.quote) return false;
    
    switch (fileType) {
      case 'customer':
        return !!this.quote.customerFile;
      case 'supplier':
        return !!this.quote.supplierFile;
      case 'quoter':
        return !!this.quote.quoterFile;
      default:
        return false;
    }
  }
  
  private getFileTypeName(fileType: string): string {
    switch (fileType) {
      case 'customer':
        return '询价文件';
      case 'supplier':
        return '供应商报价文件';
      case 'quoter':
        return '最终报价文件';
      default:
        return '文件';
    }
  }

  // 保留原有方法以兼容现有代码
  deleteQuoterFile() {
    this.deleteFile('quoter');
  }

  assignToQuoter(quoterId: string) {
    if (!this.quote) return;
    
    this.quoteService.assignQuote(this.quote._id, quoterId).subscribe({
      next: (quote) => {
        this.quote = quote;
        alert('分配成功');
      },
      error: (error) => {
        console.error('分配失败:', error);
        alert('分配失败');
      }
    });
  }

  assignSupplier() {
    if (!this.quote || !this.selectedSupplierId) return;
    
    this.assigning = true;
    this.quoteService.assignSupplier(this.quote._id, this.selectedSupplierId).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.assigning = false;
        this.selectedSupplierId = '';
        alert('供应商分配成功');
      },
      error: (error) => {
        console.error('分配供应商失败:', error);
        this.assigning = false;
        alert('分配供应商失败');
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
    Object.keys(this.quoteForm).forEach(key => {
      if (key !== '_id' && key !== 'customer' && key !== 'quoter') {
        formData.append(key, this.quoteForm[key]);
      }
    });

    this.quoteService.updateQuote(this.quote._id, formData).subscribe({
      next: (quote) => {
        this.quote = quote;
        this.editMode = false;
        alert('更新成功');
      },
      error: (error) => {
        console.error('更新失败:', error);
        alert('更新失败');
      }
    });
  }

  canEdit(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user || !this.quote) return false;
    return this.permissionService.canEditQuote(this.quote, user);
  }

  canReject(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user || !this.quote) return false;
    return this.permissionService.canRejectQuote(this.quote, user);
  }

  canDeleteFile(fileType: string): boolean {
    const user = this.authService.getCurrentUser();
    if (!user || !this.quote) return false;
    return this.permissionService.canDeleteFile(this.quote, fileType, user);
  }

  // Expose status utility to template
  getStatusDisplayName(status: string): string {
    return getStatusDisplayName(status);
  }

  rejectQuote() {
    if (!this.quote) return;
    
    const reason = prompt('请填写不予报价的理由：');
    if (!reason || reason.trim() === '') {
      return;
    }
    
    this.quoteService.rejectQuote(this.quote._id, reason.trim()).subscribe({
      next: (quote) => {
        this.quote = quote;
        alert('已标记为不予报价');
      },
      error: (error) => {
        console.error('不予报价失败:', error);
        alert('不予报价失败');
      }
    });
  }
}