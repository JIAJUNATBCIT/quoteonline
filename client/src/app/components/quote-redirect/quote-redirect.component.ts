import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-quote-redirect',
  templateUrl: './quote-redirect.component.html',
  styleUrls: ['./quote-redirect.component.scss']
})
export class QuoteRedirectComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const quoteId = this.route.snapshot.paramMap.get('id');
    
    if (!quoteId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // 使用 setTimeout 确保组件完全初始化后再进行导航
    setTimeout(() => {
      if (this.authService.isLoggedIn()) {
        this.router.navigate(['/quotes', quoteId]);
      } else {
        const redirectTo = `/quotes/${quoteId}`;
        this.router.navigate(['/login'], {
          queryParams: {
            returnUrl: redirectTo
          }
        });
      }
    }, 100);
  }
}