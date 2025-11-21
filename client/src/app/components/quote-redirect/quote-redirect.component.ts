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
    
    console.log('QuoteRedirectComponent - quoteId:', quoteId);
    console.log('QuoteRedirectComponent - isLoggedIn:', this.authService.isLoggedIn());
    
    if (!quoteId) {
      console.log('QuoteRedirectComponent - No quoteId, redirecting to dashboard');
      this.router.navigate(['/dashboard']);
      return;
    }

    // 使用 setTimeout 确保组件完全初始化后再进行导航
    setTimeout(() => {
      if (this.authService.isLoggedIn()) {
        console.log('QuoteRedirectComponent - User logged in, navigating to quote:', quoteId);
        this.router.navigate(['/quotes', quoteId]);
      } else {
        console.log('QuoteRedirectComponent - User not logged in, navigating to login');
        const redirectTo = `/quotes/${quoteId}`;
        console.log('QuoteRedirectComponent - Setting redirectTo:', redirectTo);
        this.router.navigate(['/login'], {
          queryParams: {
            returnUrl: redirectTo
          }
        });
      }
    }, 100);
  }
}