# Access Token + Refresh Token 实现检查清单

## ✅ 已完成项目

### 前端 (Angular)
- [x] **类型定义更新** (`user.types.ts`)
  - [x] AuthResponse 接口包含 accessToken 和 refreshToken
  - [x] TokenResponse 接口定义

- [x] **Token 管理服务** (`token.service.ts`)
  - [x] Access Token 存储 (localStorage)
  - [x] 过期时间管理 (30分钟)
  - [x] 自动刷新机制 (过期前5分钟)
  - [x] 定时检查 (每分钟)
  - [x] 页面可见性监听
  - [x] 防重复刷新逻辑

- [x] **认证拦截器** (`auth.interceptor.ts`)
  - [x] 自动添加 Bearer Token
  - [x] 401 错误处理
  - [x] 自动 token 刷新
  - [x] 请求重试机制
  - [x] 刷新失败登出

- [x] **认证服务更新** (`auth.service.ts`)
  - [x] 登录/注册使用新 token 格式
  - [x] 登出清除所有 tokens
  - [x] 启动时检查 token 状态
  - [x] 路由跳转处理

### 后端 (Node.js)
- [x] **Token 工具函数** (`tokenUtils.js`)
  - [x] Access Token 生成 (30分钟)
  - [x] Refresh Token 生成 (3天)
  - [x] Token 验证函数
  - [x] Cookie 读取函数

- [x] **认证路由更新** (`auth.js`)
  - [x] 注册接口返回双 token
  - [x] 登录接口返回双 token
  - [x] Token 刷新接口 (`/refresh`)
  - [x] 登出接口清除 Cookie
  - [x] HttpOnly Cookie 设置

- [x] **服务器配置** (`server.js`)
  - [x] cookie-parser 中间件
  - [x] Cookie 解析支持

- [x] **环境配置** (`.env`)
  - [x] JWT_REFRESH_SECRET 配置
  - [x] 安全密钥设置

- [x] **依赖管理** (`package.json`)
  - [x] cookie-parser 依赖添加

## 🔄 需要手动完成的步骤

### 1. 安装依赖
```bash
npm install cookie-parser
```

### 2. 重启服务器
```bash
npm run dev
```

### 3. 测试功能
```bash
node test-token-auth.js
```

## 🧪 测试验证

### 基本功能测试
- [ ] 用户登录成功
- [ ] Access Token 存储在 localStorage
- [ ] Refresh Token 存储在 HttpOnly Cookie
- [ ] API 请求自动添加 Bearer Token

### 自动刷新测试
- [ ] Token 过期前5分钟自动刷新
- [ ] 刷新后获取新的 Access Token
- [ ] Refresh Token 轮换机制
- [ ] 页面重新激活时检查 token

### 错误处理测试
- [ ] 401 错误自动重试
- [ ] 刷新失败自动登出
- [ ] 网络错误处理
- [ ] 重复刷新防护

### 安全性测试
- [ ] HttpOnly Cookie 防止 XSS
- [ ] Token 轮换防重放
- [ ] CORS 配置正确
- [ ] HTTPS 生产环境配置

## 📁 文件清单

### 前端文件
```
client/src/app/
├── utils/user.types.ts (更新)
├── services/
│   ├── auth.service.ts (更新)
│   └── token.service.ts (新增)
├── interceptors/
│   └── auth.interceptor.ts (更新)
└── components/
    └── quote-detail/
        ├── quote-detail.component.ts (更新)
        └── quote-detail.component.html (更新)
```

### 后端文件
```
├── utils/tokenUtils.js (新增)
├── routes/auth.js (更新)
├── middleware/auth.js (无需修改)
├── server.js (更新)
├── .env (更新)
└── package.json (更新)
```

### 工具文件
```
├── TOKEN_IMPLEMENTATION.md (文档)
├── TOKEN_CHECKLIST.md (本文件)
├── setup-token-system.js (设置脚本)
└── test-token-auth.js (测试脚本)
```

## 🔧 故障排除

### 常见问题及解决方案

1. **Token 不自动刷新**
   - 检查 `token.service.ts` 中的定时器
   - 验证页面可见性监听器
   - 查看浏览器控制台错误

2. **401 错误不处理**
   - 检查 `auth.interceptor.ts` 错误处理
   - 验证 refresh token 接口
   - 查看 Network 面板请求

3. **Cookie 未设置**
   - 确认 `cookie-parser` 已安装
   - 检查服务器中间件配置
   - 验证 CORS 设置

4. **编译错误**
   - 运行 `ng build` 检查编译
   - 查看具体错误信息
   - 检查 TypeScript 类型

## 📊 性能考虑

### 优化建议
1. **减少刷新频率**: 根据用户活动调整检查间隔
2. **缓存策略**: 合理使用 localStorage 缓存
3. **网络优化**: 批量处理 token 刷新请求
4. **内存管理**: 及时清理定时器和事件监听器

### 监控指标
1. Token 刷新成功率
2. API 请求重试次数
3. 用户登出原因统计
4. Token 生命周期分析

## 🚀 部署注意事项

### 生产环境配置
1. **HTTPS**: 必须启用 HTTPS
2. **域名配置**: 设置正确的 CORS 域名
3. **密钥安全**: 使用强随机密钥
4. **日志记录**: 添加详细的操作日志

### 安全加固
1. **Token 黑名单**: 实现主动撤销机制
2. **IP 限制**: 添加 IP 白名单/黑名单
3. **设备指纹**: 增加设备识别
4. **异常检测**: 监控异常 token 使用

---

**状态**: ✅ 实现完成，等待测试验证
**下一步**: 安装依赖并运行测试脚本