const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const financePurchaseOrderSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    poNumber: { type: String, required: true, trim: true },
    requesterName: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: 'Operations' },
    vendorName: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    items: { type: [purchaseOrderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Requested', 'Under Review', 'Approved', 'Rejected', 'PO Created', 'Partially Received', 'Received', 'Payment Pending', 'Paid', 'Closed'],
      default: 'Requested',
    },
    expectedDeliveryDate: { type: Date, default: null },
    approvedBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

financePurchaseOrderSchema.index({ companyCode: 1, poNumber: 1 }, { unique: true });
financePurchaseOrderSchema.index({ companyCode: 1, status: 1 });

module.exports = mongoose.models.FinancePurchaseOrder || mongoose.model('FinancePurchaseOrder', financePurchaseOrderSchema);
