/**
 * Data Extraction Engine — Template definitions.
 *
 * Each template identifies a document type by keywords, defines key-value
 * field patterns for structured extraction, and specifies header patterns
 * for detecting line-item table regions.
 */

import { DocumentType } from './types'
import type { ExtractionTemplate } from './types'

const INVOICE_TEMPLATE: ExtractionTemplate = {
  docType: DocumentType.INVOICE,
  identifiers: [
    // zh
    '发票', '税票', '增值税', '销售发票',
    // zh-tw
    '發票',
    // en
    'invoice', 'tax invoice', 'sales invoice',
    // ja
    '請求書',
    // de
    'rechnung',
    // fr
    'facture',
    // es
    'factura',
    // pt
    'fatura',
    // it
    'fattura',
    // ko
    '송장', '인보이스',
    // ru
    'счёт-фактура', 'счет-фактура',
  ],
  fieldPatterns: [
    {
      key: 'invoice_number',
      label: 'Invoice Number',
      keywords: [
        '发票号', '发票编号', '发票号码', 'invoice no', 'invoice number',
        'invoice #', 'inv no', 'inv #', '請求書番号', 'rechnungsnr',
        'numéro de facture', 'número de factura',
      ],
      position: 'right',
    },
    {
      key: 'date',
      label: 'Date',
      keywords: [
        '日期', '开票日期', '发票日期', 'date', 'invoice date',
        '日付', 'datum', 'fecha', 'data',
      ],
      position: 'right',
    },
    {
      key: 'vendor',
      label: 'Vendor / Supplier',
      keywords: [
        '供应商', '卖方', '销售方', '供货商', 'vendor', 'supplier',
        'sold by', 'from', '仕入先', 'lieferant', 'fournisseur',
        'proveedor', 'fornecedor', 'fornitore',
      ],
      position: 'right',
    },
    {
      key: 'buyer',
      label: 'Buyer',
      keywords: [
        '购买方', '买方', '客户', 'buyer', 'bill to', 'sold to',
        'customer', '得意先', 'käufer', 'acheteur', 'comprador',
      ],
      position: 'right',
    },
    {
      key: 'subtotal',
      label: 'Subtotal',
      keywords: [
        '小计', '金额', 'subtotal', 'sub-total', 'sub total',
        'amount before tax', '小計', 'zwischensumme', 'sous-total',
      ],
      position: 'right',
    },
    {
      key: 'tax',
      label: 'Tax',
      keywords: [
        '税额', '税金', '增值税', 'tax', 'vat', 'tax amount',
        'gst', '消費税', 'steuer', 'tva', 'impuesto', 'iva',
      ],
      position: 'right',
    },
    {
      key: 'total',
      label: 'Total',
      keywords: [
        '合计', '总计', '总额', '价税合计', 'total', 'grand total',
        'amount due', 'total amount', 'balance due',
        '合計', 'gesamtbetrag', 'montant total', 'importe total',
      ],
      position: 'right',
    },
    {
      key: 'currency',
      label: 'Currency',
      keywords: [
        '币种', '货币', 'currency', 'ccy', '通貨', 'währung',
        'devise', 'moneda', 'moeda',
      ],
      position: 'right',
    },
  ],
  headerPatterns: [
    'item', 'description', 'quantity', 'qty', 'unit price', 'unit cost',
    'amount', 'line total', 'total',
    '品名', '品目', '名称', '描述', '数量', '单价', '金额',
    '品目', '数量', '単価', '金額',
    'bezeichnung', 'menge', 'einzelpreis',
    'désignation', 'quantité', 'prix unitaire',
    'descripción', 'cantidad', 'precio unitario',
  ],
}

const RECEIPT_TEMPLATE: ExtractionTemplate = {
  docType: DocumentType.RECEIPT,
  identifiers: [
    '收据', '收款收据', '收条',
    'receipt', 'sales receipt', 'payment receipt',
    '領収書', '領収証',
    'quittung', 'kassenbon',
    'reçu', 'ticket de caisse',
    'recibo',
    'ricevuta', 'scontrino',
    '영수증',
    'квитанция', 'чек',
  ],
  fieldPatterns: [
    {
      key: 'receipt_number',
      label: 'Receipt Number',
      keywords: [
        '收据号', '收据编号', 'receipt no', 'receipt number', 'receipt #',
        '領収書番号', 'quittungsnr', 'numéro de reçu',
      ],
      position: 'right',
    },
    {
      key: 'date',
      label: 'Date',
      keywords: [
        '日期', '收款日期', 'date', 'receipt date', 'transaction date',
        '日付', 'datum', 'fecha', 'data',
      ],
      position: 'right',
    },
    {
      key: 'merchant',
      label: 'Store / Merchant',
      keywords: [
        '商家', '店铺', '商户', '收款人', 'store', 'merchant', 'shop',
        'received from', '店舗', 'geschäft', 'magasin', 'tienda',
      ],
      position: 'right',
    },
    {
      key: 'total',
      label: 'Total',
      keywords: [
        '合计', '总计', '总额', '金额', 'total', 'amount', 'grand total',
        '合計', 'gesamtbetrag', 'montant total',
      ],
      position: 'right',
    },
    {
      key: 'payment_method',
      label: 'Payment Method',
      keywords: [
        '支付方式', '付款方式', '结算方式', 'payment method', 'paid by',
        'payment type', '支払方法', 'zahlungsart', 'mode de paiement',
        'método de pago', 'forma di pagamento',
      ],
      position: 'right',
    },
  ],
  headerPatterns: [
    'item', 'description', 'quantity', 'qty', 'price', 'amount',
    '品名', '数量', '单价', '金额',
    'bezeichnung', 'menge', 'preis',
    'désignation', 'quantité', 'prix',
  ],
}

const EXPENSE_REPORT_TEMPLATE: ExtractionTemplate = {
  docType: DocumentType.EXPENSE_REPORT,
  identifiers: [
    '费用报表', '费用报告', '报销单', '报销申请',
    'expense report', 'expense claim', 'reimbursement',
    '経費報告', '経費精算',
    'spesenabrechnung', 'reisekostenabrechnung',
    'note de frais',
    'informe de gastos',
    'relatório de despesas',
    'nota spese',
    '경비 보고서',
    'авансовый отчёт',
  ],
  fieldPatterns: [
    {
      key: 'employee',
      label: 'Employee',
      keywords: [
        '姓名', '员工', '报销人', '申请人', 'employee', 'name',
        'submitted by', 'claimant', '氏名', 'mitarbeiter', 'employé',
        'empleado',
      ],
      position: 'right',
    },
    {
      key: 'department',
      label: 'Department',
      keywords: [
        '部门', '科室', 'department', 'dept', '部署', 'abteilung',
        'département', 'departamento',
      ],
      position: 'right',
    },
    {
      key: 'period',
      label: 'Period',
      keywords: [
        '期间', '报销期间', '日期范围', 'period', 'date range', 'from/to',
        '期間', 'zeitraum', 'période', 'periodo',
      ],
      position: 'right',
    },
    {
      key: 'total',
      label: 'Total',
      keywords: [
        '合计', '总计', '报销金额', '总额', 'total', 'grand total',
        'total amount', '合計', 'gesamtbetrag', 'montant total',
      ],
      position: 'right',
    },
    {
      key: 'approval_status',
      label: 'Approval Status',
      keywords: [
        '审批状态', '审核', '批准', 'status', 'approval', 'approved',
        'approval status', '承認', 'genehmigung', 'approbation',
        'aprobación',
      ],
      position: 'right',
    },
  ],
  headerPatterns: [
    'date', 'category', 'description', 'amount', 'receipt',
    '日期', '类别', '描述', '金额', '凭证',
    'datum', 'kategorie', 'beschreibung', 'betrag',
    'catégorie', 'montant',
    'categoría', 'importe',
  ],
}

const PURCHASE_ORDER_TEMPLATE: ExtractionTemplate = {
  docType: DocumentType.PURCHASE_ORDER,
  identifiers: [
    '采购订单', '采购单', '订购单',
    'purchase order', 'po',
    '発注書', '注文書',
    'bestellung',
    'bon de commande',
    'orden de compra',
    'ordem de compra',
    'ordine di acquisto',
    '구매 주문서',
    'заказ на закупку',
  ],
  fieldPatterns: [
    {
      key: 'po_number',
      label: 'PO Number',
      keywords: [
        '订单号', '采购订单号', '订单编号', 'po number', 'po no', 'po #',
        'purchase order number', 'order no', '発注番号', 'bestellnr',
        'numéro de commande', 'número de orden',
      ],
      position: 'right',
    },
    {
      key: 'date',
      label: 'Date',
      keywords: [
        '日期', '订单日期', '下单日期', 'date', 'order date', 'po date',
        '日付', 'datum', 'fecha', 'data',
      ],
      position: 'right',
    },
    {
      key: 'vendor',
      label: 'Vendor',
      keywords: [
        '供应商', '卖方', '供货商', 'vendor', 'supplier', 'ship from',
        '仕入先', 'lieferant', 'fournisseur', 'proveedor', 'fornitore',
      ],
      position: 'right',
    },
    {
      key: 'ship_to',
      label: 'Ship To',
      keywords: [
        '收货地址', '送货地址', '收货方', 'ship to', 'deliver to',
        'shipping address', '届け先', 'lieferadresse', 'livrer à',
        'enviar a',
      ],
      position: 'right',
    },
    {
      key: 'total',
      label: 'Total',
      keywords: [
        '合计', '总计', '总额', '订单金额', 'total', 'grand total',
        'order total', 'total amount', '合計', 'gesamtbetrag',
        'montant total',
      ],
      position: 'right',
    },
  ],
  headerPatterns: [
    'item', 'description', 'quantity', 'qty', 'unit price', 'total',
    'line total', 'amount',
    '品名', '描述', '数量', '单价', '金额',
    'bezeichnung', 'menge', 'einzelpreis',
    'désignation', 'quantité', 'prix unitaire',
  ],
}

const PAYROLL_TEMPLATE: ExtractionTemplate = {
  docType: DocumentType.PAYROLL,
  identifiers: [
    '工资单', '工资表', '薪资表', '薪酬表',
    'payroll', 'salary', 'pay slip', 'payslip', 'wage',
    '給与', '給与明細', '賃金台帳',
    'gehaltsabrechnung', 'lohnabrechnung',
    'bulletin de paie', 'fiche de paie',
    'nómina', 'recibo de sueldo',
    'folha de pagamento',
    'busta paga', 'cedolino',
    '급여명세서', '급여',
    'расчётный лист', 'зарплата',
  ],
  fieldPatterns: [
    {
      key: 'period',
      label: 'Period',
      keywords: [
        '期间', '月份', '发薪月', '工资月份', 'period', 'pay period',
        'month', '期間', 'zeitraum', 'période', 'periodo',
      ],
      position: 'right',
    },
    {
      key: 'company',
      label: 'Company',
      keywords: [
        '公司', '单位', '企业', 'company', 'employer', 'organization',
        '会社', 'unternehmen', 'entreprise', 'empresa',
      ],
      position: 'right',
    },
    {
      key: 'total_gross',
      label: 'Total Gross',
      keywords: [
        '应发合计', '应发总额', '税前合计', 'gross total', 'total gross',
        'gross pay', '総支給額', 'bruttolohn', 'salaire brut',
        'salario bruto',
      ],
      position: 'right',
    },
    {
      key: 'total_net',
      label: 'Total Net',
      keywords: [
        '实发合计', '实发总额', '税后合计', 'net total', 'total net',
        'net pay', 'take home', '差引支給額', 'nettolohn',
        'salaire net', 'salario neto',
      ],
      position: 'right',
    },
    {
      key: 'total_deductions',
      label: 'Total Deductions',
      keywords: [
        '扣款合计', '扣除合计', '扣款总额', 'total deductions',
        'deductions', '控除合計', 'abzüge', 'déductions',
        'deducciones',
      ],
      position: 'right',
    },
  ],
  headerPatterns: [
    'employee', 'name', 'base salary', 'basic salary', 'bonus',
    'allowance', 'deductions', 'net pay', 'gross pay',
    '姓名', '基本工资', '底薪', '奖金', '津贴', '扣款', '实发',
    '氏名', '基本給', '手当', '控除', '支給額',
    'mitarbeiter', 'grundgehalt', 'zulagen', 'abzüge', 'netto',
    'nom', 'salaire de base', 'primes',
    'nombre', 'salario base', 'bonificación',
    '직원', '기본급', '상여', '공제', '실수령액',
  ],
}

export const EXTRACTION_TEMPLATES: ExtractionTemplate[] = [
  INVOICE_TEMPLATE,
  RECEIPT_TEMPLATE,
  EXPENSE_REPORT_TEMPLATE,
  PURCHASE_ORDER_TEMPLATE,
  PAYROLL_TEMPLATE,
]
