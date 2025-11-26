import { QuoteFile } from '../services/quote.service';
import { FILE_TYPES } from './constants';

export interface TempFile extends QuoteFile {
  isTemp: boolean;
  file?: File;
  tempIndex?: number;
}

/**
 * 文件处理工具类
 */
export class FileUtils {
  
  /**
   * 合并已上传文件和临时文件
   * @param uploadedFiles 已上传的文件数组
   * @param tempFiles 临时文件数组
   * @returns 合并后的文件数组
   */
  static mergeFiles(uploadedFiles: QuoteFile[] = [], tempFiles: TempFile[] = []): TempFile[] {
    const result: TempFile[] = uploadedFiles.map(file => ({ ...file, isTemp: false }));
    result.push(...tempFiles);
    return result;
  }

  /**
   * 获取指定类型的文件
   * @param quote 询价单对象
   * @param fileType 文件类型
   * @param tempFiles 临时文件映射
   * @returns 文件数组
   */
  static getFilesByType(
    quote: any, 
    fileType: string, 
    tempFiles: { [key: string]: TempFile[] } = {}
  ): TempFile[] {
    const uploadedFiles = quote[`${fileType}Files`] || [];
    const tempFileList = tempFiles[fileType] || [];
    return this.mergeFiles(uploadedFiles, tempFileList);
  }

  /**
   * 获取指定类型的临时文件
   * @param tempFiles 临时文件映射
   * @param fileType 文件类型
   * @returns 临时文件数组
   */
  static getTempFilesByType(tempFiles: { [key: string]: TempFile[] }, fileType: string): TempFile[] {
    return tempFiles[fileType] || [];
  }

  /**
   * 检查是否有指定类型的文件
   * @param quote 询价单对象
   * @param fileType 文件类型
   * @param tempFiles 临时文件映射
   * @returns 是否有文件
   */
  static hasFilesByType(
    quote: any, 
    fileType: string, 
    tempFiles: { [key: string]: TempFile[] } = {}
  ): boolean {
    const files = this.getFilesByType(quote, fileType, tempFiles);
    return files.length > 0;
  }

  /**
   * 移除文件
   * @param files 文件数组
   * @param index 索引
   * @returns 移除后的文件数组
   */
  static removeFile(files: TempFile[], index: number): TempFile[] {
    return files.filter((_, i) => i !== index);
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的文件大小
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取文件扩展名
   * @param filename 文件名
   * @returns 文件扩展名
   */
  static getFileExtension(filename: string): string {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  }

  /**
   * 检查是否为Excel文件
   * @param filename 文件名
   * @returns 是否为Excel文件
   */
  static isExcelFile(filename: string): boolean {
    const ext = this.getFileExtension(filename).toLowerCase();
    return ['xlsx', 'xls'].includes(ext);
  }

  /**
   * 创建临时文件对象
   * @param file 原始文件对象
   * @param tempIndex 临时文件索引
   * @returns 临时文件对象
   */
  static createTempFile(file: File, tempIndex?: number): TempFile {
    return {
      filename: '', // 将在上传时生成
      originalName: file.name,
      path: '',
      size: file.size,
      uploadedAt: new Date(),
      isTemp: true,
      file: file,
      tempIndex: tempIndex
    };
  }

  /**
   * 验证文件
   * @param file 文件对象
   * @param maxSize 最大文件大小
   * @returns 验证结果
   */
  static validateFile(file: File, maxSize: number = 10 * 1024 * 1024): { valid: boolean; error?: string } {
    if (!this.isExcelFile(file.name)) {
      return { valid: false, error: '只支持Excel文件 (.xlsx, .xls)' };
    }
    
    if (file.size > maxSize) {
      return { valid: false, error: `文件大小不能超过 ${this.formatFileSize(maxSize)}` };
    }
    
    return { valid: true };
  }
}