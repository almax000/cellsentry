/**
 * CellSentry Rule Registry
 *
 * Ported from src/rules/base.py RuleRegistry class.
 */

import { BaseRule, IssueType } from './types'

class RuleRegistryImpl {
  private rules = new Map<string, BaseRule>()
  private rulesByType = new Map<IssueType, BaseRule[]>()

  register(rule: BaseRule): void {
    this.rules.set(rule.ruleId, rule)
    const list = this.rulesByType.get(rule.issueType) ?? []
    list.push(rule)
    this.rulesByType.set(rule.issueType, list)
  }

  getRule(ruleId: string): BaseRule | undefined {
    return this.rules.get(ruleId)
  }

  getAllRules(): BaseRule[] {
    return [...this.rules.values()]
  }

  getExcelRules(): BaseRule[] {
    return [...this.rules.values()].filter((r) => r.supportsExcel)
  }

  getSheetRules(): BaseRule[] {
    return [...this.rules.values()].filter((r) => r.checkSheet !== undefined)
  }

  clear(): void {
    this.rules.clear()
    this.rulesByType.clear()
  }
}

export const RuleRegistry = new RuleRegistryImpl()
