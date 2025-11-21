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

// 根据用户角色过滤询价单数据
function filterQuoteData(quote, userRole) {
  const quoteObj = quote.toObject ? quote.toObject() : quote;
  
  switch (userRole) {
    case 'customer':
      delete quoteObj.quoter;
      delete quoteObj.supplier;
      delete quoteObj.supplierFile; // 客户永远看不到供应商文件
      if (quoteObj.status !== 'quoted') {
        delete quoteObj.quoterFile;
      }
      break;
    case 'supplier':
      delete quoteObj.customer;
      delete quoteObj.quoter;
      delete quoteObj.quoterFile;
      break;
    case 'quoter':
      // 报价员可以看到所有信息（除了某些敏感字段）
      break;
    // admin 可以看到所有信息
  }
  
  return quoteObj;
}

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
    if (!req.file) {
      return res.status(400).json({ message: '请上传Excel文件' });
    }

    // 如果没有提供标题，从文件名生成
    let quoteTitle = title;
    if (!quoteTitle || quoteTitle.trim() === '') {
      const originalName = req.file.originalname;
      quoteTitle = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    }

    logger.info(`开始创建询价单: ${title}`, { userId: req.user.userId });

    const dbStartTime = Date.now();
    const quoteNumber = await generateQuoteNumber();
    logger.database('生成询价号', 'quotes', { date: new Date() }, Date.now() - dbStartTime);

    // 使用询价号码作为文件名，保留原始文件扩展名
    const ext = path.extname(req.file.originalname);
    const storedFileName = `${quoteNumber}${ext}`;

    const quote = new Quote({
      quoteNumber,
      customer: req.user.userId,
      title: quoteTitle.trim(),
      description: description?.trim() || '',
      customerMessage: customerMessage?.trim() || '',
      customerFile: {
        filename: req.file.filename,
        originalName: storedFileName, // 使用询价号码作为文件名
        path: req.file.path,
        size: req.file.size
      }
    });

    const saveStartTime = Date.now();
    await quote.save();
    await quote.populate('customer', 'name email company');
    logger.database('保存询价单', 'quotes', { quoteNumber: quote.quoteNumber }, Date.now() - saveStartTime);

    // 异步发送邮件通知报价员分配供应商，不阻塞响应
    setImmediate(async () => {
      try {
        const quoters = await User.find({ role: 'quoter', isActive: true })
          .select('email')
          .lean();
        
        if (quoters.length === 0) {
          logger.warn('没有找到活跃的报价员');
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

        const emailPromises = quoters.map(quoter => 
          emailService.sendQuoterAssignmentNotification(quoter.email, sanitizedQuote)
            .catch(error => logger.error(`发送邮件给报价员 ${quoter.email} 失败`, { error: error.message }))
        );
        
        const results = await Promise.allSettled(emailPromises);
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failCount = results.length - successCount;
        
        logger.info(`询价单 ${quote.quoteNumber} 报价员分配通知邮件发送完成`, { 
          successCount, 
          failCount, 
          totalQuoters: quoters.length 
        });
      } catch (error) {
        logger.error('批量发送报价员邮件失败', { error: error.message, stack: error.stack });
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
    let query = {};
    let populates = [];
    
    // 根据用户角色设置查询条件和populate
    switch (req.user.role) {
      case 'customer':
        query = { customer: req.user.userId };
        populates = [{ path: 'customer', select: 'name email company' }];
        break;
      case 'supplier':
        query = { 
          $or: [
            { supplier: req.user.userId },
            { status: 'in_progress' } // 显示处理中的询价单（供应商可以看到但可能无法操作）
          ]
        };
        break;
      case 'quoter':
      case 'admin':
        populates = [
          { path: 'customer', select: 'name email company' },
          { path: 'quoter', select: 'name email company' },
          { path: 'supplier', select: 'name email company' }
        ];
        break;
    }
    
    // 执行查询
    let quotesQuery = Quote.find(query).sort({ createdAt: -1 });
    
    // 添加populate
    populates.forEach(populate => {
      quotesQuery = quotesQuery.populate(populate);
    });
    
    const quotes = await quotesQuery;
    
    // 过滤数据
    const filteredQuotes = quotes.map(quote => filterQuoteData(quote, req.user.role));
    
    res.json(filteredQuotes);
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

    // 权限检查
    if (req.user.role === 'customer' && quote.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'supplier' && 
        quote.status !== 'in_progress' && 
        quote.status !== 'rejected' &&
        (!quote.supplier || quote.supplier._id.toString() !== req.user.userId)) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 使用通用过滤函数处理数据
    const filteredQuote = filterQuoteData(quote, req.user.role);
    
    res.json(filteredQuote);
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
      hasFile: !!req.file,
      requestBody: req.body,
      quoterFileValue: req.body.quoterFile
    });

    // 使用更高效的查询
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 报价员权限检查：允许未分配的报价员操作，或者已分配的报价员操作自己的询价单
    // 但是删除文件时有特殊的权限检查，所以在这里只检查非删除文件操作
    const isDeletingQuoterFile = req.body.quoterFile === '';
    if (req.user.role === 'quoter' && !isDeletingQuoterFile && quote.quoter && quote.quoter._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 供应商权限检查：允许上传或删除文件
    if (req.user.role === 'supplier') {
      const hasFileUpload = req.file; // 正在上传文件
      const isDeletingFile = req.body.supplierFile === ''; // 正在删除文件
      
      // 只有被分配的供应商才能上传文件
      if (quote.supplier && quote.supplier._id?.toString() !== req.user.userId) {
        return res.status(403).json({ message: '您未被分配到此询价单' });
      }
      
      // 只有在上传文件且状态不允许时才拒绝
      if (hasFileUpload && quote.status !== 'in_progress' && quote.status !== 'rejected') {
        return res.status(403).json({ message: '该询价单尚未分配给供应商，无法上传' });
      }
      
      // 只有在删除文件且不是文件所有者时才拒绝
      if (isDeletingFile && quote.supplier && quote.supplier._id?.toString() !== req.user.userId) {
        return res.status(403).json({ message: '权限不足' });
      }
    }

    const updateData = { ...req.body };
    
    // 清除删除文件的字段，避免与 $unset 冲突
    if (req.body.customerFile === '') {
      delete updateData.customerFile;
    }
    if (req.body.supplierFile === '') {
      delete updateData.supplierFile;
    }
    if (req.body.quoterFile === '') {
      delete updateData.quoterFile;
    }
    
    // 客户上传文件
    if (req.file && req.user.role === 'customer') {
      const ext = path.extname(req.file.originalname);
      const storedFileName = `${quote.quoteNumber}_customer${ext}`;
      
      updateData.customerFile = {
        filename: req.file.filename,
        originalName: storedFileName,
        path: req.file.path,
        size: req.file.size
      };
      
      logger.info(`客户文件上传完成`, { 
        quoteId: req.params.id,
        customerId: req.user.userId,
        fileName: storedFileName,
        fileSize: req.file.size
      });
    }
    
    // 供应商上传文件
    if (req.file && req.user.role === 'supplier') {
      const ext = path.extname(req.file.originalname);
      const storedFileName = `${quote.quoteNumber}_supplier${ext}`;
      
      updateData.supplierFile = {
        filename: req.file.filename,
        originalName: storedFileName,
        path: req.file.path,
        size: req.file.size
      };
      
      // 如果之前是拒绝状态，清除拒绝理由并设置为供应商已报价状态
      if (quote.status === 'rejected') {
        updateData.status = 'supplier_quoted';
        // 使用 $unset 完全移除字段
        if (!updateData.$unset) {
          updateData.$unset = {};
        }
        updateData.$unset.rejectReason = 1;
        logger.info(`供应商重新上传文件，清除拒绝理由并更新为供应商已报价状态`, { 
          quoteId: req.params.id,
          supplierId: req.user.userId
        });
      } else {
        updateData.status = 'supplier_quoted';
      }
      
      updateData.supplier = req.user.userId;
      
      logger.info(`供应商报价文件上传完成`, { 
        quoteId: req.params.id,
        supplierId: req.user.userId,
        fileName: storedFileName,
        fileSize: req.file.size,
        newStatus: updateData.status
      });
    }
    
    // 报价员上传最终报价文件
    if (req.file && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      const ext = path.extname(req.file.originalname);
      const storedFileName = `${quote.quoteNumber}_final${ext}`;
      
      updateData.quoterFile = {
        filename: req.file.filename,
        originalName: storedFileName,
        path: req.file.path,
        size: req.file.size
      };
      updateData.status = 'quoted';
      updateData.quoter = req.user.userId;
      
      // 如果之前有拒绝理由，清除它
      if (quote.rejectReason) {
        if (!updateData.$unset) {
          updateData.$unset = {};
        }
        updateData.$unset.rejectReason = 1;
        logger.info(`清除拒绝理由，上传最终报价文件`, { 
          quoteId: req.params.id,
          quoterId: req.user.userId
        });
      }
      
      logger.info(`最终报价文件上传完成`, { 
        quoteId: req.params.id,
        fileName: storedFileName,
        fileSize: req.file.size
      });
    }
    
    // 处理删除报价文件的情况
    if (req.body.quoterFile === '' && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      logger.info(`开始删除报价员文件`, { 
        quoteId: req.params.id,
        userId: req.user.userId,
        userRole: req.user.role,
        hasQuoterFile: !!quote.quoterFile,
        quoterId: quote.quoter,
        quoterIdType: typeof quote.quoter,
        userIdType: typeof req.user.userId
      });
      
      // 报价员权限检查：只有文件上传者或管理员可以删除
      if (req.user.role === 'quoter') {
        // 如果没有分配报价员，允许删除
        if (!quote.quoter) {
          logger.info(`未分配报价员，允许删除文件`, { 
            quoteId: req.params.id,
            userId: req.user.userId
          });
        } else if (quote.quoter._id?.toString() !== req.user.userId) {
          logger.warn(`报价员删除文件权限不足`, { 
            quoteId: req.params.id,
            userId: req.user.userId,
            quoterId: quote.quoter,
            quoterIdString: quote.quoter._id?.toString(),
            comparison: quote.quoter._id?.toString() !== req.user.userId
          });
          return res.status(403).json({ message: '权限不足，只能删除自己上传的报价文件' });
        } else {
          logger.info(`报价员权限验证通过`, { 
            quoteId: req.params.id,
            userId: req.user.userId,
            quoterId: quote.quoter,
            quoterIdString: quote.quoter._id?.toString()
          });
        }
      }
      
      // 删除物理文件
      if (quote.quoterFile && quote.quoterFile.filename && quote.quoterFile.path) {
        const fs = require('fs');
        if (fs.existsSync(quote.quoterFile.path)) {
          fs.unlinkSync(quote.quoterFile.path);
          logger.info(`删除报价文件`, { filePath: quote.quoterFile.path });
        }
      }
      
      // 使用 $unset 完全移除字段
      if (!updateData.$unset) {
        updateData.$unset = {};
      }
      updateData.$unset.quoterFile = 1;
      updateData.$unset.quoter = 1;
      
      // 根据是否有供应商报价文件来决定状态
      // 检查是否有实际的文件内容（filename 和 path 都存在）
      if (quote.supplierFile && quote.supplierFile.filename && quote.supplierFile.path) {
        updateData.status = 'supplier_quoted';
      } else {
        updateData.status = 'pending';
      }
      
      logger.info(`报价员删除最终报价文件，状态更新`, { 
        quoteId: req.params.id,
        newStatus: updateData.status,
        hasSupplierFile: !!quote.supplierFile
      });
    }
    
    // 处理删除客户文件的情况
    if (req.body.customerFile === '' && (req.user.role === 'customer' || req.user.role === 'admin')) {
      // 删除物理文件
      if (quote.customerFile && quote.customerFile.filename && quote.customerFile.path) {
        const fs = require('fs');
        if (fs.existsSync(quote.customerFile.path)) {
          fs.unlinkSync(quote.customerFile.path);
          logger.info(`删除客户文件`, { filePath: quote.customerFile.path });
        }
      }
      // 使用 $unset 完全移除字段，保持一致性
      if (!updateData.$unset) {
        updateData.$unset = {};
      }
      updateData.$unset.customerFile = 1;
    }
    
    // 处理删除供应商文件的情况
    if (req.body.supplierFile === '' && (req.user.role === 'admin' || 
          (req.user.role === 'supplier' && (!quote.supplier || quote.supplier._id?.toString() === req.user.userId)))) {
      
      // 检查是否已有报价员的最终报价文件
      if (quote.quoterFile && quote.quoterFile.filename && req.user.role === 'supplier') {
        return res.status(403).json({ message: '已有最终报价文件，无法删除供应商报价文件' });
      }
      
      // 删除物理文件
      if (quote.supplierFile && quote.supplierFile.filename && quote.supplierFile.path) {
        const fs = require('fs');
        if (fs.existsSync(quote.supplierFile.path)) {
          fs.unlinkSync(quote.supplierFile.path);
          logger.info(`删除供应商文件`, { filePath: quote.supplierFile.path, userId: req.user.userId });
        }
      }
      
      // 使用 $unset 完全移除字段
      if (!updateData.$unset) {
        updateData.$unset = {};
      }
      updateData.$unset.supplierFile = 1;
      updateData.$unset.rejectReason = 1;
      // 注意：不删除供应商信息，保持供应商分配
      
      // 根据是否有报价员的最终报价文件来决定状态
      if (quote.quoterFile && quote.quoterFile.filename) {
        updateData.status = 'quoted';
      } else {
        updateData.status = 'in_progress'; // 供应商删除文件后状态退回到处理中
      }
      
      logger.info(`供应商删除报价文件，状态更新`, { 
        quoteId: req.params.id,
        newStatus: updateData.status,
        hasQuoterFile: !!quote.quoterFile,
        userRole: req.user.role
      });
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

    // 使用通用过滤函数处理响应数据
    const filteredQuote = filterQuoteData(updatedQuote, req.user.role);
    
    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime);
    logger.info(`${req.user.role}更新询价单完成`, { quoteId: req.params.id, totalTime: `${totalTime}ms` });
    
    res.json(filteredQuote);
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

    // 报价员权限检查：允许未分配的报价员操作，或者已分配的报价员操作自己的询价单
    // 但是删除文件时有特殊的权限检查，所以在这里只检查非删除文件操作
    const isDeletingQuoterFile = req.body.quoterFile === '';
    if (req.user.role === 'quoter' && !isDeletingQuoterFile && quote.quoter && quote.quoter._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 根据用户角色设置对应的字段
    const updateData = {
      status: 'rejected',
      rejectReason: rejectReason.trim()
    };
    
    if (req.user.role === 'supplier') {
      updateData.supplier = req.user.userId;
    } else if (req.user.role === 'quoter' || req.user.role === 'admin') {
      updateData.quoter = req.user.userId;
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company');

    // 使用通用过滤函数处理响应数据
    const filteredQuote = filterQuoteData(updatedQuote, req.user.role);
    res.json(filteredQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Assign quote to supplier (quoter or admin only)
router.patch('/:id/assign-supplier', auth, async (req, res) => {
  try {
    const { supplierId } = req.body;
    
    // 验证权限：只有报价员和管理员可以分配供应商
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // 验证供应商
    const supplier = await User.findById(supplierId);
    if (!supplier || supplier.role !== 'supplier') {
      return res.status(400).json({ message: '无效的供应商' });
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        supplier: supplierId,
        status: 'in_progress'
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('supplier', 'name email company');

    // 异步发送邮件通知被选中的供应商
    setImmediate(async () => {
      try {
        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: updatedQuote._id,
          quoteNumber: updatedQuote.quoteNumber,
          title: updatedQuote.title,
          description: updatedQuote.description,
          customerMessage: updatedQuote.customerMessage,
          createdAt: updatedQuote.createdAt,
          customerFile: updatedQuote.customerFile
          // 注意：不包含 customer 字段，保护客户隐私
        };

        await emailService.sendQuoteNotification(supplier.email, sanitizedQuote);
        
        logger.info(`询价单 ${updatedQuote.quoteNumber} 供应商分配邮件发送完成`, { 
          supplierEmail: supplier.email,
          supplierName: supplier.name 
        });
      } catch (error) {
        logger.error('发送供应商分配邮件失败', { 
          error: error.message,
          quoteId: updatedQuote._id,
          supplierId: supplierId 
        });
      }
    });

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
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'quoter') {
      return res.status(403).json({ message: '报价员不能删除询价单' });
    }

    // Delete associated files
    const fs = require('fs');
    if (quote.customerFile && quote.customerFile.filename && quote.customerFile.path) {
      if (fs.existsSync(quote.customerFile.path)) {
        fs.unlinkSync(quote.customerFile.path);
      }
    }
    if (quote.quoterFile && quote.quoterFile.filename && quote.quoterFile.path) {
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
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // Suppliers can download customer files for pending quotes or their own quoted quotes
    if (req.user.role === 'supplier' && 
        quote.status !== 'pending' && 
        quote.supplier._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    let filePath;
    if (req.params.fileType === 'customer' && quote.customerFile && quote.customerFile.filename) {
      // 客户可以下载自己的文件，供应商可以下载待处理询价的客户文件或自己已报价的客户文件
      if (req.user.role === 'customer' || 
          (req.user.role === 'supplier' && 
           (quote.status === 'pending' || quote.supplier._id?.toString() === req.user.userId))) {
        filePath = quote.customerFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else if (req.params.fileType === 'quoter' && quote.quoterFile && quote.quoterFile.filename) {
      // 只有报价员和管理员可以下载最终报价文件，客户只能在完成后下载
      if (req.user.role === 'quoter' || req.user.role === 'admin' || 
          (req.user.role === 'customer' && quote.status === 'quoted')) {
        filePath = quote.quoterFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else if (req.params.fileType === 'supplier' && quote.supplierFile && quote.supplierFile.filename) {
      // 供应商可以下载自己上传的文件，报价员和管理员可以下载所有供应商文件
      if (req.user.role === 'supplier' && quote.supplier._id?.toString() === req.user.userId) {
        filePath = quote.supplierFile.path;
      } else if (req.user.role === 'quoter' || req.user.role === 'admin') {
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