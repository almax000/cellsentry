/**
 * Balance Rules — ported from src/rules/balance_rules.py
 *
 * All three rules only have check_text methods (LLM pipeline).
 * No check_excel or check_sheet. Registered as metadata stubs.
 */

import {
  BaseRule,
  ConfidenceLevel,
  IssueType,
} from '../types'
import { RuleRegistry } from '../registry'

const BalanceSheetEquationRule: BaseRule = {
  ruleId: 'BALANCE_SHEET_IMBALANCE',
  ruleName: '资产负债表平衡检测',
  issueType: IssueType.BALANCE_SHEET_IMBALANCE,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测资产负债表恒等式是否满足',
  supportsExcel: false,
}

const CashFlowBalanceRule: BaseRule = {
  ruleId: 'CASHFLOW_IMBALANCE',
  ruleName: '现金流量表平衡检测',
  issueType: IssueType.CASHFLOW_IMBALANCE,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测现金流量表三大活动净额之和是否等于现金净增加额',
  supportsExcel: false,
}

const ProfitBalanceCheckRule: BaseRule = {
  ruleId: 'PROFIT_BALANCE_ERROR',
  ruleName: '利润表勾稽检测',
  issueType: IssueType.PROFIT_BALANCE_ERROR,
  defaultConfidence: ConfidenceLevel.HIGH,
  description: '检测利润表与资产负债表的勾稽关系',
  supportsExcel: false,
}

// Register rules
RuleRegistry.register(BalanceSheetEquationRule)
RuleRegistry.register(CashFlowBalanceRule)
RuleRegistry.register(ProfitBalanceCheckRule)
