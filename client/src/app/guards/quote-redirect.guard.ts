import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { of, firstValueFrom } from 'rxjs';
import { delay } from 'rxjs/operators';

export const quoteRedirectGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot
): Promise<boolean> => {
  const router = inject(Router);
  const authService = inject(AuthService);
  
  const quoteId = route.paramMap.get('id');
  
  if (!quoteId) {
    await firstValueFrom(of(true).pipe(delay(0)));
    router.navigate(['/dashboard']);
    return false;
  }

  // 确保AuthService已经初始化
  await new Promise(resolve => setTimeout(resolve, 0));

  if (authService.isLoggedIn()) {
    // 已登录，直接跳转到询价详情页
    console.log('Quote redirect guard - User logged in, navigating to quote:', quoteId);
    await firstValueFrom(of(true).pipe(delay(0)));
    router.navigate(['/quotes', quoteId]);
    return false;
  } else {
    // 未登录，跳转到登录页，并传递回调参数
    console.log('Quote redirect guard - User not logged in, navigating to login with redirectTo:', `/quotes/${quoteId}`);
    await firstValueFrom(of(true).pipe(delay(0)));
    router.navigate(['/login'], {
      queryParams: {
        redirectTo: `/quotes/${quoteId}`
      }
    });
    return false;
  }
};