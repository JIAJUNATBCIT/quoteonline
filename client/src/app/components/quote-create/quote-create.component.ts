import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { QuoteService } from '../../services/quote.service';

@Component({
  selector: 'app-quote-create',
  templateUrl: './quote-create.component.html',
  styleUrls: ['./quote-create.component.scss']
})
export class QuoteCreateComponent {
  quoteForm: FormGroup;
  loading = false;
  error = '';
  selectedFile: File | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private quoteService: QuoteService
  ) {
    this.quoteForm = this.formBuilder.group({
      description: [''],
      customerMessage: ['']
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // 检查文件类型
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        this.error = '请选择Excel文件 (.xlsx 或 .xls)';
        event.target.value = '';
        return;
      }
      
      // 检查文件大小 (10MB限制)
      if (file.size > 10 * 1024 * 1024) {
        this.error = '文件大小不能超过10MB';
        event.target.value = '';
        return;
      }
      
      this.selectedFile = file;
      this.error = '';
    }
  }

  onSubmit() {
    if (!this.selectedFile) {
      this.error = '请选择Excel文件';
      return;
    }

    this.loading = true;
    this.error = '';

    // 从文件名生成标题（去掉扩展名）
    const fileName = this.selectedFile.name;
    const title = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', this.quoteForm.get('description')?.value || '');
    formData.append('customerMessage', this.quoteForm.get('customerMessage')?.value || '');
    formData.append('customerFile', this.selectedFile);

    this.quoteService.createQuote(formData).subscribe({
      next: () => {
        this.router.navigate(['/quotes']);
      },
      error: (error) => {
        this.error = error.error?.message || '创建询价单失败';
        this.loading = false;
      }
    });
  }
}