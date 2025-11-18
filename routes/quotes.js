const express = require('express');
const multer = require('multer');
const path = require('path');
const Quote = require('../models/Quote');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // 使用时间戳和随机数生成唯一文件名，避免冲突
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}_${randomSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    fieldSize: 10 * 1024 * 1024, // 10MB field size limit
    files: 1 // 只允许单个文件
  },
  fileFilter: (req, file, cb) => {
    // 更严格的文件类型检查
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持Excel文件 (.xlsx, .xls)'), false);
    }
  }
});

// Generate unique quote number
async function generateQuoteNumber() {
  const today = new Date();
  const dateStr = today.getFullYear() + 
                  String(today.getMonth() + 1).padStart(2, '0') + 
                  String(today.getDate()).padStart(2, '0');
  
  // Find the highest sequence number for today (使用索引优化查询)
  const todayPrefix = `Q-${dateStr}-`;
  const lastQuote = await Quote.findOne({ 
    quoteNumber: { $regex: `^${todayPrefix}` } 
  }).sort({ quoteNumber: -1 })
    .select('quoteNumber') // 只选择需要的字段
    .lean(); // 返回普通对象而不是Mongoose文档
  
  let sequence = 1;
  if (lastQuote) {
    const lastSequence = parseInt(lastQuote.quoteNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }
  
  return `${todayPrefix}${String(sequence).padStart(3, '0')}`;
}

// Create quote (customer only)
router.post('/', auth, authorize('customer'), upload.single('customerFile'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { title, description, customerMessage } = req.body;
    
    // 验证必填字段
    if (!title || title.trim() === '') {
      return res.status(400).json({ message: '请填写询价标题' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: '请上传Excel文件' });
    }

    logger.info(`开始创建询价单: ${title}`, { userId: req.user.userId });

    const dbStartTime = Date.now();
    const quoteNumber = await generateQuoteNumber();
    logger.database('生成询价号', 'quotes', { date: new Date() }, Date.now() - dbStartTime);

    const quote = new Quote({
      quoteNumber,
      customer: req.user.userId,
      title: title.trim(),
      description: description?.trim() || '',
      customerMessage: customerMessage?.trim() || '',
      customerFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      }
    });

    const saveStartTime = Date.now();
    await quote.save();
    await quote.populate('customer', 'name email company');
    logger.database('保存询价单', 'quotes', { quoteNumber: quote.quoteNumber }, Date.now() - saveStartTime);

    // 异步发送邮件通知供应商，不阻塞响应
    setImmediate(async () => {
      try {
        const suppliers = await User.find({ role: 'supplier', isActive: true })
          .select('email')
          .lean();
        
        if (suppliers.length === 0) {
          logger.warn('没有找到活跃的供应商');
          return;
        }

        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: quote._id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          description: quote.description,
          customerMessage: quote.customerMessage,
          createdAt: quote.createdAt,
          customerFile: quote.customerFile
          // 注意：不包含 customer 字段，保护客户隐私
        };

        const emailPromises = suppliers.map(supplier => 
          emailService.sendQuoteNotification(supplier.email, sanitizedQuote)
            .catch(error => logger.error(`发送邮件给供应商 ${supplier.email} 失败`, { error: error.message }))
        );
        
        const results = await Promise.allSettled(emailPromises);
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failCount = results.length - successCount;
        
        logger.info(`询价单 ${quote.quoteNumber} 供应商邮件通知发送完成`, { 
          successCount, 
          failCount, 
          totalSuppliers: suppliers.length 
        });
      } catch (error) {
        logger.error('批量发送供应商邮件失败', { error: error.message, stack: error.stack });
      }
    });

    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime);
    logger.info(`创建询价单响应完成: ${quote.quoteNumber}`, { totalTime: `${totalTime}ms` });

    res.status(201).json(quote);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime, error);
    
    // 根据错误类型返回不同的错误信息
    if (error.code === 11000) {
      // 重复键错误（询价号重复）
      return res.status(500).json({ message: '询价号生成冲突，请重试' });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: '数据验证失败', details: error.message });
    }
    
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get all quotes
router.get('/', auth, async (req, res) => {
  try {
    let quotes;
    
    if (req.user.role === 'customer') {
      // Customers can only see their own quotes, without quoter and supplier information
      quotes = await Quote.find({ customer: req.user.userId })
        .populate('customer', 'name email company')
        .sort({ createdAt: -1 });
      
      // Remove quoter and supplier information for customers
      quotes = quotes.map(quote => {
        const quoteObj = quote.toObject();
        delete quoteObj.quoter;
        delete quoteObj.supplier;
        // 客户只有在最终报价完成后才能看到报价文件
        if (quoteObj.status !== 'completed') {
          delete quoteObj.quoterFile;
        }
        delete quoteObj.supplierFile; // 客户永远看不到供应商文件
        return quoteObj;
      });
    } else if (req.user.role === 'supplier') {
      // Suppliers can see all pending quotes but without customer information
      quotes = await Quote.find({ status: 'pending' })
        .sort({ createdAt: -1 });
      
      // Remove customer information for suppliers
      quotes = quotes.map(quote => {
        const quoteObj = quote.toObject();
        delete quoteObj.customer;
        delete quoteObj.quoter;
        delete quoteObj.quoterFile;
        return quoteObj;
      });
    } else if (req.user.role === 'quoter') {
      // Quoters can see all quotes with customer information
      quotes = await Quote.find()
        .populate('customer', 'name email company')
        .populate('quoter', 'name email company')
        .populate('supplier', 'name email company')
        .sort({ createdAt: -1 });
    } else {
      // Admins can see all quotes with full information
      quotes = await Quote.find()
        .populate('customer', 'name email company')
        .populate('quoter', 'name email company')
        .populate('supplier', 'name email company')
        .sort({ createdAt: -1 });
    }

    res.json(quotes);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get quote by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('customer', 'name email company')
      .populate('quoter', 'name email company')
      .populate('supplier', 'name email company');

    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Customers can only see their own quotes
    if (req.user.role === 'customer' && quote.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // Suppliers can only see pending quotes
    if (req.user.role === 'supplier' && quote.status !== 'pending') {
      return res.status(403).json({ message: '该询价单已处理，无法查看' });
    }

    // Remove customer information for suppliers and quoters
    if (req.user.role === 'supplier') {
      const quoteObj = quote.toObject();
      delete quoteObj.customer;
      delete quoteObj.quoter;
      delete quoteObj.quoterFile;
      return res.json(quoteObj);
    }

    // Quoters can see customer information
    if (req.user.role === 'quoter') {
      const quoteObj = quote.toObject();
      return res.json(quoteObj);
    }

    // Remove quoter and supplier information for customers
    if (req.user.role === 'customer') {
      const quoteObj = quote.toObject();
      delete quoteObj.quoter;
      delete quoteObj.supplier;
      // 客户只有在最终报价完成后才能看到报价文件
      if (quoteObj.status !== 'completed') {
        delete quoteObj.quoterFile;
      }
      delete quoteObj.supplierFile; // 客户永远看不到供应商文件
      return res.json(quoteObj);
    }

    res.json(quote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Update quote (customer can update their own, quoter can update assigned, supplier can upload supplier file)
router.put('/:id', auth, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    logger.info(`开始更新询价单: ${req.params.id}`, { 
      userId: req.user.userId, 
      userRole: req.user.role,
      hasFile: !!req.file 
    });

    // 使用更高效的查询
    const quote = await Quote.findById(req.params.id).lean();
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'quoter' && quote.quoter && quote.quoter.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'supplier' && quote.status !== 'pending') {
      return res.status(403).json({ message: '该询价单已处理，无法上传' });
    }

    const updateData = { ...req.body };
    
    // 供应商上传文件
    if (req.file && req.user.role === 'supplier') {
      updateData.supplierFile = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      };
      updateData.status = 'supplier_quoted';
      updateData.supplier = req.user.userId;
      
      logger.info(`供应商报价文件上传完成`, { 
        quoteId: req.params.id,
        supplierId: req.user.userId,
        fileName: req.file.originalname,
        fileSize: req.file.size
      });
    }
    
    // 报价员上传最终报价文件
    if (req.file && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      updateData.quoterFile = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      };
      updateData.status = 'completed';
      updateData.quoter = req.user.userId;
      
      logger.info(`最终报价文件上传完成`, { 
        quoteId: req.params.id,
        fileName: req.file.originalname,
        fileSize: req.file.size
      });
    }
    
    // 处理删除报价文件的情况
    if (req.body.quoterFile === '' && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      // 删除物理文件
      if (quote.quoterFile && quote.quoterFile.path) {
        const fs = require('fs');
        if (fs.existsSync(quote.quoterFile.path)) {
          fs.unlinkSync(quote.quoterFile.path);
          logger.info(`删除报价文件`, { filePath: quote.quoterFile.path });
        }
      }
      // 直接更新字段，确保前端能正确识别
      updateData.quoterFile = null;
      updateData.status = quote.supplierFile ? 'supplier_quoted' : 'pending';
      updateData.quoter = undefined;
    }
    
    // 处理删除供应商文件的情况
    if (req.body.supplierFile === '' && (req.user.role === 'admin')) {
      // 删除物理文件
      if (quote.supplierFile && quote.supplierFile.path) {
        const fs = require('fs');
        if (fs.existsSync(quote.supplierFile.path)) {
          fs.unlinkSync(quote.supplierFile.path);
          logger.info(`删除供应商文件`, { filePath: quote.supplierFile.path });
        }
      }
      // 直接更新字段，确保前端能正确识别
      updateData.supplierFile = null;
      updateData.status = 'pending';
      updateData.supplier = undefined;
    }

    const dbStartTime = Date.now();
    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company');
    
    logger.database('更新询价单', 'quotes', { quoteId: req.params.id }, Date.now() - dbStartTime);

    // 如果供应商上传了报价文件，异步发送邮件通知报价员
    if (req.file && req.user.role === 'supplier') {
      // 不等待邮件发送完成，直接返回响应
      setImmediate(async () => {
        try {
          const quoters = await User.find({ role: 'quoter', isActive: true })
            .select('email')
            .lean();
          
          const emailPromises = quoters.map(quoter => 
            emailService.sendSupplierQuoteNotification(quoter.email, updatedQuote)
              .catch(error => logger.error(`发送供应商报价邮件给 ${quoter.email} 失败`, { error: error.message }))
          );
          
          await Promise.allSettled(emailPromises);
          logger.info(`供应商报价邮件发送完成`, { 
            quoteId: req.params.id,
            totalQuoters: quoters.length 
          });
        } catch (emailError) {
          logger.error('发送供应商报价邮件失败', { 
            error: emailError.message,
            quoteId: req.params.id 
          });
        }
      });
    }

    // 如果报价员上传了最终报价文件，异步发送邮件通知客户
    if (req.file && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      // 不等待邮件发送完成，直接返回响应
      setImmediate(async () => {
        try {
          await emailService.sendQuoteResponse(updatedQuote.customer.email, updatedQuote);
          logger.info(`最终报价邮件发送成功`, { 
            quoteId: req.params.id,
            customerEmail: updatedQuote.customer.email 
          });
        } catch (emailError) {
          logger.error('发送最终报价邮件失败', { 
            error: emailError.message,
            quoteId: req.params.id 
          });
        }
      });
    }

    // Remove customer information for suppliers
    if (req.user.role === 'supplier') {
      const quoteObj = updatedQuote.toObject();
      delete quoteObj.customer;
      delete quoteObj.quoter;
      delete quoteObj.quoterFile;
      
      const totalTime = Date.now() - startTime;
      logger.request(req, totalTime);
      logger.info(`供应商更新询价单完成`, { quoteId: req.params.id, totalTime: `${totalTime}ms` });
      
      return res.json(quoteObj);
    }

    // Quoters can see customer information
    if (req.user.role === 'quoter') {
      const quoteObj = updatedQuote.toObject();
      
      const totalTime = Date.now() - startTime;
      logger.request(req, totalTime);
      logger.info(`报价员更新询价单完成`, { quoteId: req.params.id, totalTime: `${totalTime}ms` });
      
      return res.json(quoteObj);
    }

    // Remove quoter and supplier information for customers
    if (req.user.role === 'customer') {
      const quoteObj = updatedQuote.toObject();
      delete quoteObj.quoter;
      delete quoteObj.supplier;
      // 客户只有在最终报价完成后才能看到报价文件
      if (quoteObj.status !== 'completed') {
        delete quoteObj.quoterFile;
      }
      delete quoteObj.supplierFile; // 客户永远看不到供应商文件
      
      const totalTime = Date.now() - startTime;
      logger.request(req, totalTime);
      logger.info(`客户更新询价单完成`, { quoteId: req.params.id, totalTime: `${totalTime}ms` });
      
      return res.json(quoteObj);
    }

    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime);
    logger.info(`管理员更新询价单完成`, { quoteId: req.params.id, totalTime: `${totalTime}ms` });
    
    res.json(updatedQuote);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime, error);
    logger.error('更新询价单失败', { 
      error: error.message,
      stack: error.stack,
      quoteId: req.params.id,
      userId: req.user.userId 
    });
    
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Reject quote (quoter or admin only)
router.patch('/:id/reject', auth, async (req, res) => {
  try {
    const { rejectReason } = req.body;
    
    if (!rejectReason || rejectReason.trim() === '') {
      return res.status(400).json({ message: '请填写不予报价的理由' });
    }
    
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer') {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'quoter' && quote.quoter && quote.quoter.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'rejected',
        rejectReason: rejectReason.trim(),
        quoter: req.user.userId
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company');

    // Quoters can see customer information
    if (req.user.role === 'quoter') {
      const quoteObj = updatedQuote.toObject();
      return res.json(quoteObj);
    }

    // Remove quoter information for customers
    if (req.user.role === 'customer') {
      const quoteObj = updatedQuote.toObject();
      delete quoteObj.quoter;
      return res.json(quoteObj);
    }

    res.json(updatedQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Assign quote to quoter (admin only)
router.patch('/:id/assign', auth, authorize('admin'), async (req, res) => {
  try {
    const { quoterId } = req.body;
    
    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        quoter: quoterId,
        status: 'in_progress' 
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company');

    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    res.json(quote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Delete quote (customer can delete their own, admin can delete all)
router.delete('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'quoter') {
      return res.status(403).json({ message: '报价员不能删除询价单' });
    }

    // Delete associated files
    const fs = require('fs');
    if (quote.customerFile && quote.customerFile.path) {
      if (fs.existsSync(quote.customerFile.path)) {
        fs.unlinkSync(quote.customerFile.path);
      }
    }
    if (quote.quoterFile && quote.quoterFile.path) {
      if (fs.existsSync(quote.quoterFile.path)) {
        fs.unlinkSync(quote.quoterFile.path);
      }
    }

    // Delete the quote
    await Quote.findByIdAndDelete(req.params.id);

    res.json({ message: '询价单删除成功' });
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Download file
router.get('/:id/download/:fileType', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // Suppliers can only download customer files for pending quotes
    if (req.user.role === 'supplier' && quote.status !== 'pending') {
      return res.status(403).json({ message: '该询价单已处理，无法下载' });
    }

    let filePath;
    if (req.params.fileType === 'customer' && quote.customerFile) {
      // 客户可以下载自己的文件，供应商可以下载待处理询价的客户文件
      if (req.user.role === 'customer' || (req.user.role === 'supplier' && quote.status === 'pending')) {
        filePath = quote.customerFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else if (req.params.fileType === 'quoter' && quote.quoterFile) {
      // 只有报价员和管理员可以下载最终报价文件，客户只能在完成后下载
      if (req.user.role === 'quoter' || req.user.role === 'admin' || 
          (req.user.role === 'customer' && quote.status === 'completed')) {
        filePath = quote.quoterFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else if (req.params.fileType === 'supplier' && quote.supplierFile) {
      // 只有报价员和管理员可以下载供应商文件
      if (req.user.role === 'quoter' || req.user.role === 'admin') {
        filePath = quote.supplierFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else {
      return res.status(404).json({ message: '文件不存在' });
    }

    res.download(filePath);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;