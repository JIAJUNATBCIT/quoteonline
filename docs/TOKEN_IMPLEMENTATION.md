# Access Token + Refresh Token 静默刷新机制实现

## 已完成的功能

### 前端实现

#### 1. 类型定义更新 (`client/src/app/utils/user.types.ts`)
```typescript
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}
```

#### 2. Token 管理服务 (`client/src/app/services/token.service.ts`)
- ✅ Access Token 存储：localStorage
- ✅ 过期时间管理：30分钟有效期
- ✅ 自动刷新机制：过期前5分钟刷新
- ✅ 页面可见性监听：页面重新激活时检查
- ✅ 定时检查：每分钟检查一次 token 状态
- ✅ 防重复刷新：避免同时发起多个刷新请求

#### 3. 认证拦截器 (`client/src/app/interceptors/auth.interceptor.ts`)
- ✅ 自动添加 Bearer Token 到请求头
- ✅ 401 错误自动处理和 token 刷新
- ✅ 请求重试机制
- ✅ 刷新失败时自动登出

#### 4. 认证服务更新 (`client/src/app/services/auth.service.ts`)
- ✅ 使用新的 token 机制
- ✅ 登录/注册时存储 tokens
- ✅ 登出时清除所有 tokens
- ✅ 应用启动时检查和刷新过期 token

### 后端实现

#### 1. Token 工具函数 (`utils/tokenUtils.js`)
- ✅ Access Token 生成（30分钟）
- ✅ Refresh Token 生成（3天）
- ✅ Token 验证函数
- ✅ 从请求中获取 Refresh Token

#### 2. 认证路由更新 (`routes/auth.js`)
- ✅ 注册接口返回 access + refresh token
- ✅ 登录接口返回 access + refresh token
- ✅ Refresh Token 接口 (`/api/auth/refresh`)
- ✅ 登出接口清除 cookie
- ✅ HttpOnly Cookie 设置 Refresh Token

#### 3. 服务器配置 (`server.js`)
- ✅ 添加 cookie-parser 中间件
- ✅ 支持 HttpOnly Cookie 解析

#### 4. 环境变量配置 (`.env`)
- ✅ 添加 JWT_REFRESH_SECRET
- ✅ 配置安全密钥

#### 5. 依赖更新 (`package.json`)
- ✅ 添加 cookie-parser 依赖

## 安全特性

### 1. Token 存储策略
- **Access Token**: localStorage（便于 API 调用）
- **Refresh Token**: HttpOnly Cookie（防止 XSS 攻击）

### 2. 自动刷新机制
- **定时检查**: 每分钟检查 token 状态
- **提前刷新**: 过期前5分钟开始刷新
- **页面激活**: 页面从后台返回时检查 token

### 3. 错误处理
- **401 自动重试**: API 调用失败时自动刷新 token 并重试
- **刷新失败处理**: 自动登出并跳转登录页
- **防重复刷新**: 避免同时发起多个刷新请求

### 4. Token 轮换
- **Refresh Token 轮换**: 每次刷新生成新的 refresh token
- **旧 Token 失效**: 防止 token 重放攻击

## 使用说明

### 安装依赖
```bash
npm install cookie-parser
```

### 环境变量配置
确保 `.env` 文件包含：
```
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_token_secret
```

### 前端使用
```typescript
// 登录
this.authService.login(email, password).subscribe(response => {
  // tokens 自动存储，无需手动处理
});

// API 调用会自动处理 token 刷新
this.http.get('/api/protected').subscribe(data => {
  // 正常使用，token 已自动添加
});
```

### 后端 API
```javascript
// 登录
POST /api/auth/login
Response: {
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {...}
}

// 刷新 token
POST /api/auth/refresh
Response: {
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}

// 登出
POST /api/auth/logout
清除 HttpOnly Cookie 中的 refresh token
```

## 测试流程

### 1. 基本登录测试
1. 用户登录
2. 检查 localStorage 中是否有 access_token
3. 检查 Cookie 中是否有 refreshToken
4. 验证 access token 过期时间

### 2. 自动刷新测试
1. 等待 25-30 分钟
2. 观察 network 面板是否有刷新请求
3. 验证新的 access token 是否更新
4. 验证 refresh token 是否轮换

### 3. 页面激活测试
1. 将页面切换到后台超过 30 分钟
2. 重新激活页面
3. 验证是否自动刷新 token
4. 验证用户状态是否保持

### 4. API 调用测试
1. 发起 API 请求时 token 已过期
2. 观察是否自动刷新 token
3. 验证原请求是否自动重试
4. 验证最终是否成功获取数据

### 5. 安全性测试
1. 尝试通过 JavaScript 访问 refresh token（应该失败）
2. 验证 HttpOnly Cookie 属性
3. 测试 token 刷新失败时的登出机制

## 注意事项

1. **生产环境配置**：确保 HTTPS 以启用 HttpOnly Cookie 的 secure 属性
2. **CORS 配置**：确保前端域名在 CORS 白名单中
3. **密钥安全**：JWT 密钥应使用强随机字符串
4. **监控日志**：添加 token 刷新的日志记录
5. **性能考虑**：避免过于频繁的 token 刷新请求

## 故障排除

### 常见问题
1. **token 不刷新**：检查定时器和页面可见性监听
2. **401 错误**：验证 refresh token 是否有效
3. **Cookie 未设置**：检查 cookie-parser 中间件
4. **跨域问题**：检查 CORS 配置和 Cookie 属性

### 调试技巧
1. 使用浏览器开发者工具查看 localStorage 和 Cookie
2. 查看 Network 面板的 API 请求和响应
3. 检查 Console 面板的错误信息
4. 使用断点调试 token 刷新逻辑

## 下一步优化

1. **离线支持**：添加 Service Worker 支持
2. **多标签页同步**：使用 localStorage 事件同步 token 状态
3. **刷新失败重试**：添加指数退避重试机制
4. **性能监控**：添加 token 刷新性能指标
5. **安全审计**：定期检查 token 使用情况