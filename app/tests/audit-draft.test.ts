import { describe, expect, it } from 'vitest'
import { auditDraftIdentity, auditAiStatusKey } from '../src/utils/auditDraft'
import type { AnalysisResult } from '../src/types'

const result: AnalysisResult = { success:true,filePath:'/synthetic/cash.xlsx',fileName:'cash.xlsx',sourceFingerprint:'a'.repeat(64),scannedAt:'2026-10-29T00:00:00Z',duration:1,summary:{errors:1,warnings:0,info:0,total:1},issues:[{id:'issue-0',sheetName:'Cash',cell:'F12',formula:'=SUM(F4:F10)',ruleId:'SUM_RANGE_INCOMPLETE',severity:'error',confidence:0.9,message:'Total omits F11',suggestion:'Include F11',category:'Formula',layer:'rule'}] }

describe('local review draft identity',()=>{
  it('distinguishes AI abstention requiring human review from AI never running',()=>{
    expect(auditAiStatusKey({...result.issues[0],llmReviewRequired:true})).toBe('aiReviewRequired')
  })
  it('never applies a human decision to changed rule evidence in the same workbook bytes',()=>{
    const revised={...result,issues:result.issues.map(issue=>({...issue,message:'Total range requires business confirmation',severity:'warning' as const}))}
    expect(auditDraftIdentity(revised)).not.toBe(auditDraftIdentity(result))
  })
  it('keeps the same decision when optional AI opinions arrive',()=>{
    const ai={...result,scannedAt:'2026-10-29T00:00:02Z',issues:result.issues.map(issue=>({...issue,llmDisputed:true,llmReasoning:'Could be intentional'}))}
    expect(auditDraftIdentity(ai)).toBe(auditDraftIdentity(result))
  })
  it('isolates changed source content and legacy results from another scan',()=>{
    expect(auditDraftIdentity({...result,sourceFingerprint:'b'.repeat(64)})).not.toBe(auditDraftIdentity(result))
    expect(auditDraftIdentity({...result,sourceFingerprint:undefined,scannedAt:'other scan'})).not.toBe(auditDraftIdentity({...result,sourceFingerprint:undefined}))
  })
})
