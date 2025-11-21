const mongoose = require('mongoose');

const QuoteSchema = new mongoose.Schema({
  quoteNumber: {
    type: String,
    required: true,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quoter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  customerFile: {
    filename: String,
    originalName: String,
    path: String,
    size: Number
  },
  quoterFile: {
    filename: String,
    originalName: String,
    path: String,
    size: Number
  },
  supplierFile: {
    filename: String,
    originalName: String,
    path: String,
    size: Number
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'supplier_quoted', 'in_progress', 'quoted', 'cancelled', 'rejected'],
    default: 'pending'
  },
  customerMessage: {
    type: String
  },
  quoterMessage: {
    type: String
  },
  rejectReason: {
    type: String
  },
  price: {
    type: Number
  },
  currency: {
    type: String,
    default: 'CNY'
  },
  validUntil: {
    type: Date
  }
}, {
  timestamps: true
});

// 创建索引以提高查询性能
QuoteSchema.index({ customer: 1 });
QuoteSchema.index({ quoter: 1 });
QuoteSchema.index({ supplier: 1 });
QuoteSchema.index({ status: 1 });
QuoteSchema.index({ createdAt: -1 });

// 复合索引优化常用查询
QuoteSchema.index({ customer: 1, status: 1 });
QuoteSchema.index({ quoter: 1, status: 1 });
QuoteSchema.index({ supplier: 1, status: 1 });
QuoteSchema.index({ status: 1, createdAt: -1 });
QuoteSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('Quote', QuoteSchema);