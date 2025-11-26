import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { QuoteService, Quote } from '../../services/quote.service';
import { PermissionService } from '../../services/permission.service';
import { getStatusDisplayName } from '../../utils/status.utils';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  quotes: Quote[] = [];
  filteredQuotes: Quote[] = [];
  paginatedQuotes: Quote[] = [];
  loading = true;
  error = '';
  searchTerm = '';
  sortColumn = 'createdAt';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // 分页相关属性
  currentPage = 1;
  itemsPerPage = 10;
  totalItems = 0;
  totalPages = 0;
  
  // 可选的每页显示数量
  itemsPerPageOptions = [5, 10, 20, 50, 100];

  constructor(
    private router: Router,
    public authService: AuthService,
    private quoteService: QuoteService,
    private permissionService: PermissionService
  ) { }

  ngOnInit() {
    this.loadQuotes();
  }

  loadQuotes() {
    this.loading = true;
    this.quoteService.getAllQuotes().subscribe({
      next: (quotes) => {
        // 根据用户权限过滤询价
        const user = this.authService.getCurrentUser();
        if (user) {
          // 如果是供应商，确保能看到所有pending和rejected状态的询价和自己处理过的询价
          if (user.role === 'supplier') {
            this.quotes = quotes.filter(quote => 
              quote.status === 'pending' || 
              quote.status === 'rejected' ||
              (quote.supplier && (quote.supplier._id === user.id || quote.supplier === user.id))
            );
          } else {
            this.quotes = quotes.filter(quote => 
              this.permissionService.canViewQuote(quote, user)
            );
          }
        } else {
          this.quotes = quotes;
        }
        this.applyFiltersAndSort();
        this.loading = false;
      },
      error: (error) => {
        this.error = '加载询价单失败';
        this.loading = false;
        console.error(error);
      }
    });
  }

  applyFiltersAndSort() {
    // 应用搜索过滤
    let filtered = this.quotes;
    
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase().trim();
      filtered = this.quotes.filter(quote => 
        quote.quoteNumber.toLowerCase().includes(searchLower) ||
        quote.title.toLowerCase().includes(searchLower) ||
        (quote.description && quote.description.toLowerCase().includes(searchLower)) ||
        (quote.customer?.name && quote.customer.name.toLowerCase().includes(searchLower)) ||
        (quote.quoter?.name && quote.quoter.name.toLowerCase().includes(searchLower)) ||
        (quote.supplier?.name && quote.supplier.name.toLowerCase().includes(searchLower)) ||
        this.getStatusDisplayName(quote.status).toLowerCase().includes(searchLower)
      );
    }
    
    // 应用排序
    filtered = this.sortQuotes(filtered, this.sortColumn, this.sortDirection);
    
    this.filteredQuotes = filtered;
    
    // 重置到第一页
    this.currentPage = 1;
    
    // 应用分页
    this.updatePagination();
  }

  sortQuotes(quotes: Quote[], column: string, direction: 'asc' | 'desc'): Quote[] {
    return [...quotes].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (column) {
        case 'quoteNumber':
          aValue = a.quoteNumber;
          bValue = b.quoteNumber;
          break;
        case 'title':
          aValue = a.title;
          bValue = b.title;
          break;
        case 'customer':
          aValue = a.customer?.name || '';
          bValue = b.customer?.name || '';
          break;
        case 'quoter':
          aValue = a.quoter?.name || '';
          bValue = b.quoter?.name || '';
          break;
        case 'supplier':
          aValue = a.supplier?.name || '';
          bValue = b.supplier?.name || '';
          break;
        case 'status':
          aValue = this.getStatusDisplayName(a.status);
          bValue = this.getStatusDisplayName(b.status);
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          aValue = (a as any)[column];
          bValue = (b as any)[column];
      }
      
      if (aValue < bValue) {
        return direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  onSort(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFiltersAndSort();
  }

  onSearchChange() {
    this.applyFiltersAndSort();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'bi bi-arrow-down-up';
    }
    return this.sortDirection === 'asc' ? 'bi bi-arrow-up' : 'bi bi-arrow-down';
  }

  // 分页相关方法
  updatePagination() {
    this.totalItems = this.filteredQuotes.length;
    this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
    
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    
    this.paginatedQuotes = this.filteredQuotes.slice(startIndex, endIndex);
  }

  onPageChange(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  onItemsPerPageChange() {
    this.currentPage = 1;
    this.updatePagination();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (this.totalPages <= maxVisiblePages) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      const startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
      const endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }





  getQuoteCountByStatus(status: string): number {
    return this.quotes.filter(quote => quote.status === status).length;
  }

  canEditQuote(quote: Quote): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    return this.permissionService.canEditQuote(quote, user);
  }

  canDeleteQuote(quote: Quote): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;
    return this.permissionService.canDeleteQuote(quote, user);
  }

  // Expose status utility to template
  getStatusDisplayName(status: string): string {
    return getStatusDisplayName(status);
  }

  deleteQuote(quote: Quote) {
    if (confirm(`确定要删除询价单"${quote.title}"吗？此操作不可撤销。`)) {
      this.quoteService.deleteQuote(quote._id).subscribe({
        next: () => {
          // 从列表中移除已删除的询价单
          this.quotes = this.quotes.filter(q => q._id !== quote._id);
          this.applyFiltersAndSort();
        },
        error: (error) => {
          console.error('删除询价单失败:', error);
          alert('删除询价单失败，请重试');
        }
      });
    }
  }

  navigateToQuoteDetail(quoteId: string) {
    this.router.navigate(['/quotes', quoteId]);
  }

  // 批量下载文件（一键下载）
  downloadFilesBatch(quoteId: string, fileType: string) {
    // 先获取询价单详情以获取询价单号和权限信息
    this.quoteService.getQuoteById(quoteId).subscribe({
      next: (quote) => {
        // 根据用户角色和询价单状态决定下载哪个文件
        const user = this.authService.getCurrentUser();
        if (!user) return;
        
        let actualFileType = fileType;
        
        if (user.role === 'customer') {
          // 客户：未报价时下载原文件，已报价时下载报价文件
          actualFileType = quote.status === 'quoted' ? 'quoter' : 'customer';
        }
        
        // 检查是否有文件可下载
        const files = this.getFilesByType(quote, actualFileType);
        if (!files || files.length === 0) {
          alert('没有可下载的文件');
          return;
        }
        
        // 显示下载提示
        const fileTypeName = this.getFileTypeName(actualFileType);
        const confirmMessage = `确定要下载询价单 ${quote.quoteNumber} 的${fileTypeName}文件吗？`;
        
        if (!confirm(confirmMessage)) {
          return;
        }
        
        this.quoteService.downloadFilesBatch(quoteId, actualFileType).subscribe({
          next: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            
            // 生成ZIP文件名（使用英文避免字符编码问题）
            const zipFileName = `${quote.quoteNumber}_${actualFileType}_files.zip`;
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
          },
          error: (error) => {
            console.error('批量下载文件失败:', error);
            const errorMessage = error.error?.message || error.message || '批量下载文件失败';
            alert(`下载失败: ${errorMessage}`);
          }
        });
      },
      error: (error) => {
        console.error('获取询价单详情失败:', error);
        const errorMessage = error.error?.message || error.message || '获取询价单详情失败';
        alert(`获取询价单详情失败: ${errorMessage}`);
      }
    });
  }

  // 辅助方法：根据文件类型获取文件列表
  private getFilesByType(quote: Quote, fileType: string): any[] {
    switch (fileType) {
      case 'customer':
        return quote.customerFiles || [];
      case 'supplier':
        return quote.supplierFiles || [];
      case 'quoter':
        return quote.quoterFiles || [];
      default:
        return [];
    }
  }

  // 辅助方法：获取文件类型的中文名称
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

  // 保留原有的单个文件下载方法（如果需要的话）
  downloadFile(quoteId: string, fileType: string) {
    // 先获取询价单详情以获取询价单号
    this.quoteService.getQuoteById(quoteId).subscribe({
      next: (quote) => {
        this.quoteService.downloadFile(quoteId, fileType).subscribe({
          next: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // 根据文件类型设置下载文件名
            let suffix = '';
            switch (fileType) {
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
            
            a.download = `${quote.quoteNumber}${suffix}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
          },
          error: (error) => {
            console.error('下载文件失败:', error);
            alert('下载文件失败');
          }
        });
      },
      error: (error) => {
        console.error('获取询价单详情失败:', error);
        alert('获取询价单详情失败');
      }
    });
  }


}