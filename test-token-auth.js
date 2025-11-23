#!/usr/bin/env node

/**
 * Token 认证机制测试脚本
 * 用于验证 Access Token + Refresh Token 机制
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

async function testTokenFlow() {
  console.log('🧪 开始测试 Token 认证机制...\n');

  try {
    // 1. 测试登录
    console.log('1️⃣ 测试登录...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });

    const { accessToken, refreshToken, user } = loginResponse.data;
    console.log('✅ 登录成功');
    console.log(`   Access Token: ${accessToken.substring(0, 20)}...`);
    console.log(`   Refresh Token: ${refreshToken.substring(0, 20)}...`);
    console.log(`   用户: ${user.name} (${user.role})`);

    // 2. 测试受保护的 API
    console.log('\n2️⃣ 测试受保护的 API...');
    const protectedResponse = await axios.get(`${API_BASE}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    console.log('✅ 受保护 API 访问成功');
    console.log(`   用户信息: ${protectedResponse.data.name}`);

    // 3. 测试 Token 刷新
    console.log('\n3️⃣ 测试 Token 刷新...');
    
    // 模拟浏览器 Cookie
    const refreshResponse = await axios.post(`${API_BASE}/auth/refresh`, {}, {
      withCredentials: true
    });

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = refreshResponse.data;
    console.log('✅ Token 刷新成功');
    console.log(`   新 Access Token: ${newAccessToken.substring(0, 20)}...`);
    console.log(`   新 Refresh Token: ${newRefreshToken.substring(0, 20)}...`);

    // 4. 测试新 Token
    console.log('\n4️⃣ 测试新 Token...');
    const newProtectedResponse = await axios.get(`${API_BASE}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${newAccessToken}`
      }
    });
    console.log('✅ 新 Token 工作正常');
    console.log(`   用户信息: ${newProtectedResponse.data.name}`);

    // 5. 测试登出
    console.log('\n5️⃣ 测试登出...');
    await axios.post(`${API_BASE}/auth/logout`, {}, {
      withCredentials: true
    });
    console.log('✅ 登出成功');

    console.log('\n🎉 所有测试通过！Token 认证机制工作正常。');

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 提示: 可能需要先创建测试用户或检查服务器配置');
    }
    
    process.exit(1);
  }
}

// 检查服务器是否运行
async function checkServer() {
  try {
    await axios.get(`${API_BASE}/auth/me`, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('🔍 检查服务器状态...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ 服务器未运行');
    console.log('请先启动服务器: npm run dev');
    process.exit(1);
  }

  console.log('✅ 服务器运行正常\n');
  await testTokenFlow();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testTokenFlow, checkServer };