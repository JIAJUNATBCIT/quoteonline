# 文件上传角色分类修复总结

## 问题描述

用户反映：客户创建询价后，报价员直接上传最终报价文件，还是出现在客户文件列表内。

## 修复原则

按照"哪个角色上传放到哪个角色文件列表"的原则进行修复，删除 `uploadedBy` 字段，根据当前登录用户的角色判断文件应该放在哪个文件列表。

## 修复内容

### 1. 数据模型修改

**文件**: `models/Quote.js`

- 删除 `customerFiles`、`quoterFiles`、`supplierFiles` 中的 `uploadedBy` 字段
- 保留 `uploadedAt` 字段用于记录上传时间

### 2. 后端逻辑修改

**文件**: `routes/quotes.js`

#### 删除的内容：
- `validateFileClassification()` 函数（用于验证文件分类）
- `filterQuoteData()` 函数中的文件分类验证逻辑

#### 修改的内容：
- 创建询价单时，删除客户文件中的 `uploadedBy` 字段
- 更新询价单时，重构文件上传逻辑：
  - 根据当前登录用户的角色（`req.user.role`）自动判断文件存储位置
  - 客户上传 → `customerFiles`
  - 供应商上传 → `supplierFiles`
  - 报价员/管理员上传 → `quoterFiles`

#### 新的文件上传逻辑：
```javascript
// 根据当前登录用户的角色决定文件存储位置
switch (req.user.role) {
  case 'customer':
    targetFileArray = 'customerFiles';
    break;
  case 'supplier':
    targetFileArray = 'supplierFiles';
    roleSpecificUpdate.supplier = req.user.userId;
    break;
  case 'quoter':
  case 'admin':
    targetFileArray = 'quoterFiles';
    roleSpecificUpdate.quoter = req.user.userId;
    break;
}
```

### 3. 前端接口修改

**文件**: `client/src/app/services/quote.service.ts`

- 删除 `QuoteFile` 接口中的 `uploadedBy` 字段
- 保留其他字段不变

## 修复效果

### 修复前的问题：
- 报价员上传的文件可能错误地出现在客户文件列表中
- 依赖 `uploadedBy` 字段进行文件分类验证，增加了复杂性

### 修复后的效果：
- ✅ 完全按照用户角色自动分类文件
- ✅ 客户上传的文件只存储在 `customerFiles`
- ✅ 供应商上传的文件只存储在 `supplierFiles`
- ✅ 报价员上传的文件只存储在 `quoterFiles`
- ✅ 简化了代码逻辑，移除了不必要的验证字段
- ✅ 提高了系统的可靠性和可维护性

## 测试验证

创建了测试脚本验证修复效果：

1. ✅ `uploadedBy` 字段已完全删除
2. ✅ 文件按照角色正确分类存储
3. ✅ 不同角色上传的文件存储在对应的文件列表中
4. ✅ 没有语法错误或逻辑错误

## 权限控制保持不变

文件可见性规则保持不变：

| 角色 | 客户文件 | 供应商文件 | 报价员文件 |
|------|----------|------------|------------|
| 客户 | ✅ 可见 | ❌ 不可见 | ✅ 仅 quoted 状态可见 |
| 供应商 | ✅ 可见 | ✅ 自己的可见 | ❌ 不可见 |
| 报价员 | ✅ 可见 | ✅ 可见 | ✅ 可见 |
| 管理员 | ✅ 可见 | ✅ 可见 | ✅ 可见 |

## 总结

通过这次修复：
1. 彻底解决了文件分类错误的问题
2. 简化了代码结构，提高了可维护性
3. 保持了原有的权限控制逻辑
4. 实现了真正的"哪个角色上传放到哪个角色文件列表"原则

修复后的系统更加可靠、简洁，完全符合用户的需求。