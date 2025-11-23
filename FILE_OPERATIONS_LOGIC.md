# 询价系统文件操作逻辑

## 核心原则
**什么角色上传的文件，出现在对应角色的文件列表**

## 文件分类存储结构

### 1. 客户文件 (`customerFiles`)
- **上传角色**: 客户 (`customer`)
- **存储位置**: `customerFiles` 数组
- **权限**: 只有客户可以上传
- **可见性**: 
  - 客户: 可见
  - 供应商: 可见（用于报价参考）
  - 报价员: 可见
  - 管理员: 可见

### 2. 供应商文件 (`supplierFiles`)
- **上传角色**: 供应商 (`supplier`)
- **存储位置**: `supplierFiles` 数组
- **权限**: 只有被分配的供应商可以上传
- **可见性**:
  - 客户: 不可见
  - 供应商: 仅当前分配的供应商可见
  - 报价员: 可见
  - 管理员: 可见

### 3. 报价员文件 (`quoterFiles`)
- **上传角色**: 报价员 (`quoter`) 或 管理员 (`admin`)
- **存储位置**: `quoterFiles` 数组
- **权限**: 只有报价员或管理员可以上传
- **可见性**:
  - 客户: 仅在状态为 `quoted` 时可见
  - 供应商: 不可见
  - 报价员: 可见
  - 管理员: 可见

## 业务流程

### 场景1: 客户创建询价后，报价员直接上传最终报价文件
```
客户创建询价 → 报价员上传最终报价文件 → 文件存储在 quoterFiles → 报价员文件列表显示
```
**逻辑**: 报价员角色上传 → 存储在 `quoterFiles` → 出现在报价员文件列表

### 场景2: 报价员分配供应商，供应商上传报价文件
```
报价员分配供应商 → 供应商上传报价文件 → 文件存储在 supplierFiles → 供应商文件列表显示
```
**逻辑**: 供应商角色上传 → 存储在 `supplierFiles` → 出现在供应商文件列表

### 场景3: 供应商报价后，报价员上传最终报价文件
```
供应商上传报价文件 → 报价员上传最终报价文件 → 文件存储在 quoterFiles → 报价员文件列表显示
```
**逻辑**: 报价员角色上传 → 存储在 `quoterFiles` → 出现在报价员文件列表

## 技术实现

### 文件上传路由 (`PUT /:id`)
```javascript
// 客户上传文件
if (allFiles && allFiles.length > 0 && req.user.role === 'customer') {
  // 存储到 customerFiles
}

// 供应商上传文件  
else if (allFiles && allFiles.length > 0 && req.user.role === 'supplier') {
  // 存储到 supplierFiles
}

// 报价员上传文件
else if (allFiles && allFiles.length > 0 && (req.user.role === 'quoter' || req.user.role === 'admin')) {
  // 存储到 quoterFiles
}
```

### 安全验证
每个文件上传路径都包含角色验证：
- 客户文件: `req.user.role === 'customer'`
- 供应商文件: `req.user.role === 'supplier'`
- 报价员文件: `['quoter', 'admin'].includes(req.user.role)`

### 数据过滤 (`filterQuoteData`)
根据用户角色过滤返回的文件数据：
```javascript
case 'customer':
  delete quoteObj.supplierFiles; // 客户看不到供应商文件
  if (quoteObj.status !== 'quoted') {
    delete quoteObj.quoterFiles; // 未完成时看不到报价员文件
  }
  
case 'supplier':
  delete quoteObj.quoterFiles; // 供应商看不到报价员文件
```

## 状态流转

```
pending → in_progress → supplier_quoted → quoted
```

- `pending`: 刚创建，等待分配
- `in_progress`: 已分配供应商，等待供应商报价
- `supplier_quoted`: 供应商已确认报价
- `quoted`: 报价员已确认最终报价

## 权限矩阵

| 操作 | 客户 | 供应商 | 报价员 | 管理员 |
|------|------|--------|--------|--------|
| 上传客户文件 | ✓ | ✗ | ✗ | ✗ |
| 上传供应商文件 | ✗ | ✓* | ✗ | ✗ |
| 上传报价员文件 | ✗ | ✗ | ✓ | ✓ |
| 下载客户文件 | ✓ | ✓* | ✓ | ✓ |
| 下载供应商文件 | ✗ | ✓* | ✓ | ✓ |
| 下载报价员文件 | ✓** | ✗ | ✓ | ✓ |

* 需要是当前分配的供应商  
** 仅在状态为 `quoted` 时

## 文件删除规则

删除询价单时会删除所有相关文件：
- `customerFiles`
- `supplierFiles`  
- `quoterFiles`

## 日志记录

所有文件操作都会记录详细日志：
- 上传角色验证
- 目标存储字段
- 文件信息（名称、大小）
- 操作结果