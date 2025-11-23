#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 设置 Access Token + Refresh Token 系统...\n');

// 检查 package.json 中是否有 cookie-parser
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!packageJson.dependencies || !packageJson.dependencies['cookie-parser']) {
  console.log('❌ 缺少 cookie-parser 依赖');
  console.log('请运行: npm install cookie-parser');
  process.exit(1);
}

// 检查环境变量
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ 缺少 .env 文件');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
if (!envContent.includes('JWT_REFRESH_SECRET')) {
  console.log('❌ .env 文件中缺少 JWT_REFRESH_SECRET');
  console.log('请在 .env 文件中添加: JWT_REFRESH_SECRET=your_refresh_token_secret');
  process.exit(1);
}

// 检查必要文件
const requiredFiles = [
  'client/src/app/services/token.service.ts',
  'client/src/app/interceptors/auth.interceptor.ts',
  'utils/tokenUtils.js',
  'routes/auth.js'
];

for (const file of requiredFiles) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ 缺少文件: ${file}`);
    process.exit(1);
  }
}

console.log('✅ 所有文件检查通过');
console.log('\n📋 实现摘要:');
console.log('  • Access Token: 30分钟，存储在 localStorage');
console.log('  • Refresh Token: 3天，存储在 HttpOnly Cookie');
console.log('  • 自动刷新: 过期前5分钟自动刷新');
console.log('  • 静默刷新: 用户无感知的后台刷新');
console.log('  • 安全特性: HttpOnly Cookie + Token 轮换');

console.log('\n🚀 启动步骤:');
console.log('  1. npm install cookie-parser');
console.log('  2. npm run dev');
console.log('  3. 测试登录功能');
console.log('  4. 观察 token 自动刷新');

console.log('\n📖 详细文档: TOKEN_IMPLEMENTATION.md');
console.log('\n✨ Token 系统设置完成！');