const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const root = path.resolve(__dirname, '..')
const esbuild = require(path.join(root, 'app/node_modules/esbuild'))
fs.mkdirSync(path.join(root, '.runtime/tests'), { recursive: true })
function bundled(name) {
  const outfile = path.join(root, `.runtime/tests/policy-test-${name}.cjs`)
  esbuild.buildSync({ entryPoints: [path.join(root, `app/electron/llm/${name}.ts`)], outfile, bundle: true, platform: 'node', format: 'cjs' })
  return require(outfile)
}
const { cancellationAction } = bundled('cancellationPolicy')
const { parseAudit } = bundled('protocol')
test('storage and ratio cancellations abstain regardless of model confidence or formula text', () => {
  for (const rule of ['storage', 'TEXT_NUMBER', 'type_mismatch', 'ratio', 'MARGIN_MISSING_DIV', 'RATIO_MISSING_DIV', 'DOUBLE_PERCENTAGE', 'PERCENTAGE_FORMAT']) {
    assert.equal(cancellationAction(rule, '=A1/B1', false).action, 'review')
    assert.equal(cancellationAction(rule, '=A1/B1', true).action, 'retain')
  }
})
test('spelling preserves builtin calls, rejects unknown UDFs without calling them errors', () => {
  for (const formula of ['=SUM(A1:A3)', '=count(A1:A3)', '=AVERAGE(A1,A2)', '=IF(TRUE(),SUM(A1:A3),0)']) {
    assert.equal(cancellationAction('FUNCTION_SPELLING', formula, false).action, 'cancel')
  }
  for (const formula of ['=SSUM(A1:A3)', '=AVERRAGE(A1:A3)', '=MYFUNC(A1)', '=SUM(MYFUNC(A1))', '', '=A1+1', '="SUM("', '=SUM("unterminated)']) {
    assert.equal(cancellationAction('spelling', formula, false).action, 'review')
  }
  assert.equal(cancellationAction('spelling', '=SUM("AVERRAGE(""X"")",A1)', false).action, 'cancel')
})
test('other rule decisions are unchanged; model cannot spoof local policy status', () => {
  assert.equal(cancellationAction('division_zero', '=A1/B1', false).action, 'cancel')
  const issue = { ruleId: 'storage', cellAddress: 'A1', formula: '=SUM(B1:B3)' }
  const raw = [{ ...issue, isValid: false, reasoning: 'normal', adjustedConfidence: 1, requiresReview: false }]
  const result = parseAudit(JSON.stringify(raw), issue)[0]
  assert.equal(result.isValid, false)
  assert.equal(result.requiresReview, true)
  assert.equal(result.reviewReason, 'storage_evidence_required')
  const other = { ...issue, ruleId: 'division_zero' }
  assert.equal(parseAudit(JSON.stringify([{ ...raw[0], ...other, requiresReview: true }]), other)[0].requiresReview, undefined)
})
test('merge retains original finding and displays abstention without claiming error or false positive', async () => {
  const mergeBundle = path.join(root, '.runtime/tests/policy-test-merge.cjs')
  await esbuild.build({ entryPoints: [path.join(root, 'app/electron/llm/lifecycle.ts')], outfile: mergeBundle,
    bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'isolate-electron-lifecycle', setup(build) {
      build.onResolve({ filter: /^(electron|\.\/bridge)$/ }, args => ({ path: args.path, namespace: 'lifecycle-stub' }))
      build.onLoad({ filter: /.*/, namespace: 'lifecycle-stub' }, () => ({ contents: 'export const app = {}; export const llmBridge = {};' }))
    } }] })
  const { mergeJudgments } = require(mergeBundle)
  // Judgments are bound to their worksheet; an unbound judgment is ignored.
  const issue = { ruleId: 'storage', cellAddress: 'A1', sheet: 'Sheet1', formula: '=SUM(B1:B3)', confidence: .8 }
  const judgment = { ruleId: issue.ruleId, cellAddress: issue.cellAddress, sheetName: issue.sheet, isValid: false,
    adjustedConfidence: .99, reasoning: 'model cancellation' }
  const result = mergeJudgments([issue], [judgment])[0]
  assert.equal(result.llmVerified, undefined)
  assert.equal(result.llmReviewRequired, true)
  assert.equal(result.confidence, .8)
  assert.equal(result.llmReasoning, judgment.reasoning)
  assert.equal(judgment.isValid, false)
  const other = { ...issue, ruleId: 'division_zero' }
  assert.equal(mergeJudgments([other], [{ ...judgment, ruleId: other.ruleId }])[0].llmVerified, false)
  assert.deepEqual(mergeJudgments([issue], []), [issue])
})
