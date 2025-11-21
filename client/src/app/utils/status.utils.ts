// 状态名称映射
const STATUS_NAMES: { [key: string]: string } = {
  'pending': '待处理',
  'supplier_quoted': '供应商已报价',
  'in_progress': '处理中',
  'quoted': '已报价',
  'cancelled': '已取消',
  'rejected': '不报价'
};

// 获取状态显示名称
export function getStatusDisplayName(status: string): string {
  return STATUS_NAMES[status] || status;
}

// 获取所有可用状态
export function getAllStatuses(): Array<{ value: string; label: string }> {
  return Object.entries(STATUS_NAMES).map(([value, label]) => ({ value, label }));
}

// 检查是否为终态状态
export function isFinalStatus(status: string): boolean {
  return ['quoted', 'cancelled', 'rejected'].includes(status);
}

// 检查是否可以编辑
export function isEditableStatus(status: string): boolean {
  return ['pending', 'supplier_quoted', 'in_progress'].includes(status);
}