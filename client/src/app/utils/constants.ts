/**
 * 应用常量定义
 */

export const QUOTE_STATUS = {
  PENDING: 'pending',
  SUPPLIER_QUOTED: 'supplier_quoted',
  IN_PROGRESS: 'in_progress',
  QUOTED: 'quoted',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected'
} as const;

export const QUOTE_STATUS_NAMES = {
  [QUOTE_STATUS.PENDING]: '待处理',
  [QUOTE_STATUS.SUPPLIER_QUOTED]: '核价中',
  [QUOTE_STATUS.IN_PROGRESS]: '处理中',
  [QUOTE_STATUS.QUOTED]: '已报价',
  [QUOTE_STATUS.CANCELLED]: '已取消',
  [QUOTE_STATUS.REJECTED]: '不报价'
} as const;

export const USER_ROLES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  QUOTER: 'quoter',
  ADMIN: 'admin'
} as const;

export const USER_ROLE_NAMES = {
  [USER_ROLES.CUSTOMER]: '客户',
  [USER_ROLES.SUPPLIER]: '供应商',
  [USER_ROLES.QUOTER]: '报价员',
  [USER_ROLES.ADMIN]: '管理员'
} as const;

export const FILE_TYPES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  QUOTER: 'quoter'
} as const;

export const FILE_TYPE_NAMES = {
  [FILE_TYPES.CUSTOMER]: '客户询价文件',
  [FILE_TYPES.SUPPLIER]: '供应商报价文件',
  [FILE_TYPES.QUOTER]: '报价员文件'
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 20, 50, 100],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES_COUNT: 10
} as const;

export const UPLOAD_LIMITS = {
  FILE_SIZE: 10 * 1024 * 1024, // 10MB
  FIELD_SIZE: 10 * 1024 * 1024, // 10MB
  FILES_COUNT: 10,
  ALLOWED_MIMES: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/excel'
  ],
  ALLOWED_EXTENSIONS: ['.xlsx', '.xls']
} as const;