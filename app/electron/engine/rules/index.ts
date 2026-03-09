/**
 * Rule barrel export — imports all rules and registers them.
 *
 * Auto-registers on import.
 */

import { RuleRegistry } from '../registry'

// Formula rules
import {
  CircularReferenceRule,
  FunctionSpellingRule,
  SumRangeRule,
  TypeMismatchRule,
} from './formula'

// Type rules
import { HiddenCharsRule, TextNumberRule } from './type'

// Balance rules — all check_text only, no rules to register
// (see balance.ts for explanation)

// Format rules
import {
  DateAmbiguityRule,
  PercentageFormatRule,
  UnitConsistencyRule,
} from './format'

// Reference rules
import { ExternalReferenceRule } from './reference'

// Consistency rules
import {
  InconsistentFormulaRule,
  EmptyCellReferencesRule,
  TwoDigitYearRule,
} from './consistency'

// Business rules (sheet-level)
import {
  MarginMissingDivRule,
  RatioMissingDivRule,
  DoublePercentageRule,
  HardcodedSummaryRule,
  HardcodedFormulaColRule,
  FormulaColInconsistencyRule,
} from './business'

export function registerAllRules(): void {
  RuleRegistry.clear()

  // Formula rules
  RuleRegistry.register(CircularReferenceRule)
  RuleRegistry.register(FunctionSpellingRule)
  RuleRegistry.register(SumRangeRule)
  RuleRegistry.register(TypeMismatchRule)

  // Type rules
  RuleRegistry.register(HiddenCharsRule)
  RuleRegistry.register(TextNumberRule)

  // Format rules
  RuleRegistry.register(DateAmbiguityRule)
  RuleRegistry.register(PercentageFormatRule)
  RuleRegistry.register(UnitConsistencyRule)

  // Reference rules
  RuleRegistry.register(ExternalReferenceRule)

  // Consistency rules
  RuleRegistry.register(InconsistentFormulaRule)
  RuleRegistry.register(EmptyCellReferencesRule)
  RuleRegistry.register(TwoDigitYearRule)

  // Business rules (sheet-level)
  RuleRegistry.register(MarginMissingDivRule)
  RuleRegistry.register(RatioMissingDivRule)
  RuleRegistry.register(DoublePercentageRule)
  RuleRegistry.register(HardcodedSummaryRule)
  RuleRegistry.register(HardcodedFormulaColRule)
  RuleRegistry.register(FormulaColInconsistencyRule)
}

// Auto-register on import
registerAllRules()

// Re-export all rules
export {
  CircularReferenceRule,
  FunctionSpellingRule,
  SumRangeRule,
  TypeMismatchRule,
  HiddenCharsRule,
  TextNumberRule,
  DateAmbiguityRule,
  PercentageFormatRule,
  UnitConsistencyRule,
  ExternalReferenceRule,
  InconsistentFormulaRule,
  EmptyCellReferencesRule,
  TwoDigitYearRule,
  MarginMissingDivRule,
  RatioMissingDivRule,
  DoublePercentageRule,
  HardcodedSummaryRule,
  HardcodedFormulaColRule,
  FormulaColInconsistencyRule,
}
