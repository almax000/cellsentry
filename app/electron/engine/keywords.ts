/**
 * Centralized multi-language keywords for rule engine matching.
 *
 * Ported from src/rules/keywords.py.
 * All keywords are lowercase for case-insensitive matching.
 * Supported languages: zh, en, ja, de, fr, es, pt, it, ko, ru
 */

// Summary row labels — used by isSummaryRow(), HardcodedSummaryRule, SumRangeRule
export const SUMMARY_KEYWORDS: ReadonlySet<string> = new Set([
  // zh (simplified)
  '合计', '总计', '小计', '汇总', '总额',
  // ja (traditional kanji)
  '合計', '総計', '小計',
  // en
  'total', 'subtotal', 'sum', 'grand total', 'sub-total', 'totals', 'net total',
  // de
  'gesamt', 'gesamtsumme', 'zwischensumme',
  // fr
  'sous-total', 'somme',
  // es
  'suma total',
  // pt
  'soma',
  // it
  'totale', 'subtotale', 'somma',
  // ko
  '합계', '총계', '소계',
  // ru
  'итого', 'всего', 'подитог',
])

// Ratio/proportion indicators — used by isRatioHeader(), RatioMissingDivRule
export const RATIO_KEYWORDS: ReadonlySet<string> = new Set([
  // zh
  '率', '比', '占', '比例', '比率', '占比', '毛利率', '净利率', '利润率',
  '增长率', '变动率', '回报率', '收益率', '百分比',
  // en
  'ratio', 'margin', 'rate', '%', 'percentage', 'proportion',
  'growth rate', 'return on', 'yield', 'markup', 'gross margin',
  'profit margin', 'operating margin', 'net margin',
  // ja
  '利益率', '割合', '百分率',
  // de
  'gewinnmarge', 'anteil', 'prozent',
  // fr
  'marge', 'taux de croissance', 'pourcentage',
  // es
  'margen', 'porcentaje', 'tasa',
  // pt
  'margem', 'porcentagem', 'taxa',
  // it
  'margine', 'percentuale', 'tasso',
  // ko
  '이익률', '비율', '퍼센트',
  // ru
  'маржа', 'процент', 'доля',
])

// Margin-specific subset — used by MarginMissingDivRule
export const MARGIN_KEYWORDS: ReadonlySet<string> = new Set([
  // zh
  '毛利率', '净利率', '利润率',
  // en
  'margin', 'profit rate', 'gross margin', 'profit margin',
  'operating margin', 'net margin',
  // ja
  '利益率',
  // de
  'gewinnmarge',
  // fr
  'marge',
  // es
  'margen',
  // pt
  'margem',
  // it
  'margine',
  // ko
  '이익률',
  // ru
  'маржа',
])

// Ratio-specific keywords for RatioMissingDivRule (plain keyword + regex patterns)
export const RATIO_ROW_KEYWORDS: readonly string[] = [
  '占比', '比例', '占收入', '占总',
  'ratio', 'proportion',
  '割合',             // ja
  'anteil',           // de
  'pourcentage',      // fr
  'porcentaje',       // es
  'porcentagem',      // pt
  'percentuale',      // it
  '비율',             // ko
  'доля', 'процент',  // ru
] as const

// Regex patterns for RatioMissingDivRule (kept separate since they need regex)
export const RATIO_ROW_PATTERNS: readonly string[] = [
  '占.*比',
] as const

// Headers to skip in HardcodedFormulaColRule
export const SKIP_HEADERS: ReadonlySet<string> = new Set([
  // zh
  '日期', '时间', '几号', '哪天', '备注', '说明', '品名', '商品', '项目',
  '干啥', '月份',
  // en
  'date', 'note', 'name', 'time',
  // ja
  '日付', '備考',
  // de
  'datum', 'bemerkung',
  // fr
  'remarque',
  // es
  'fecha', 'nota',
  // pt
  'data',
  // ko
  '날짜', '비고',
  // ru
  'дата', 'примечание',
])

// Sub-header keywords for HardcodedFormulaColRule double-header detection
export const NON_FORMULA_KEYWORDS: ReadonlySet<string> = new Set([
  // zh
  '余额', '金额', '收入', '支出', '入库', '出货', '存货',
  // en
  'balance', 'amount', 'income', 'expense',
  // ja
  '金額', '残高',
  // de
  'betrag', 'saldo',
  // fr
  'montant', 'solde',
  // es
  'importe', 'saldo',
  // pt
  'valor', 'saldo',
  // it
  'importo', 'saldo',
  // ko
  '금액', '잔액',
  // ru
  'сумма', 'остаток',
])

// Financial statement headers — used by isFinancialHeader()
export const FINANCIAL_KEYWORDS: ReadonlySet<string> = new Set([
  // zh
  '资产', '负债', '权益', '收入', '成本', '费用', '利润',
  '现金流', '应收', '应付', '存货', '固定资产',
  // en
  'asset', 'liability', 'equity', 'revenue', 'cost', 'expense', 'profit',
  'cash flow', 'receivable', 'payable', 'inventory', 'fixed asset',
  'income', 'earnings', 'sales', 'capital', 'retained',
  // ja
  '資産', '負債', '収益', '費用',
  // de
  'vermögen', 'verbindlichkeit', 'eigenkapital', 'umsatz', 'kosten', 'gewinn',
  // fr
  'actif', 'passif', 'capitaux', "chiffre d'affaires", 'charges', 'bénéfice',
  // es
  'activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'ganancia',
  // pt
  'ativo', 'passivo', 'receita', 'despesa', 'lucro',
  // it
  'attivo', 'passivo', 'ricavo', 'costo', 'utile',
  // ko
  '자산', '부채', '수익', '비용',
  // ru
  'актив', 'пассив', 'выручка', 'расход', 'прибыль',
])
