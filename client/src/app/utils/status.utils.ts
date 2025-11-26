import { QUOTE_STATUS, QUOTE_STATUS_NAMES } from './constants';

// 获取状态显示名称
export function getStatusDisplayName(status: string): string {
  return QUOTE_STATUS_NAMES[status as keyof typeof QUOTE_STATUS_NAMES] || status;
}

// 获取所有可用状态
export function getAllStatuses(): Array<{ value: string; label: string }> {
  return Object.entries(QUOTE_STATUS_NAMES).map(([value, label]) => ({ value, label }));
}

// 检查是否为终态状态
export function isFinalStatus(status: string): boolean {
  return [QUOTE_STATUS.QUOTED, QUOTE_STATUS.CANCELLED, QUOTE_STATUS.REJECTED].includes(status as any);
}

// 检查是否可以编辑
export function isEditableStatus(status: string): boolean {
  return [QUOTE_STATUS.PENDING, QUOTE_STATUS.SUPPLIER_QUOTED, QUOTE_STATUS.IN_PROGRESS].includes(status as any);
}