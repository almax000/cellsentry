/**
 * Does a name stand on its own in running Chinese text, or is it part of a
 * longer word? 张伟 in 张伟先生 or 患者张伟， stands alone; 张伟 in 张伟华, or
 * 张力 in 肌张力, does not. Chinese has no spaces, so this looks at what is
 * written right before and after the name.
 */
import { isCjk } from './text'

/** Single characters that commonly come right before a name. */
const BEFORE_ONE = /[者属人名叫是为和与及给对向被让把由请经同陪找其:]/
/**
 * Words that put a name right after them (其女儿李梅, 由丈夫王强陪同, 嘱张伟按时服药). After one of these the
 * name stands alone whatever follows it.
 */
const BEFORE_WORDS = [
  '嘱',
  '女儿', '儿子', '丈夫', '妻子', '配偶', '爱人', '母亲', '父亲', '孙子', '孙女', '外孙', '外孙女', '哥哥', '姐姐', '弟弟', '妹妹',
  '患儿', '告知', '委托', '医师', '医生', '护士', '主任',
]
/** Words that commonly follow a name in medical records. */
const AFTER_WORDS = [
  '先生', '女士', '小姐', '同志', '老师', '本人', '家属', '入院', '出院', '来院', '就诊', '复查', '复诊', '主诉', '自述', '自诉',
  '既往', '确诊', '诊断', '服用', '出现', '接受', '进行', '签字', '签名', '同意', '拒绝', '要求', '表示', '否认', '术后', '目前',
  '现在', '病情', '血压', '血糖', '体检', '检查', '陪同', '知情', '电话', '联系', '年龄', '性别',
]
/** Single characters that commonly follow a name. */
const AFTER_ONE = /[于在的是和与及说称今昨因已也将曾就还都又被把从向对给让为诉有无患感近男女岁年月日现经行予按遵]/

export type NameEdge = 'clear' | 'glued'

/** Whether the name at [start, end) stands alone. Non-Chinese neighbours always count as a boundary. */
export function nameEdge(text: string, start: number, end: number): NameEdge {
  const before = text[start - 1]
  const after = text[end]
  if (BEFORE_WORDS.some((word) => text.slice(start - word.length, start) === word)) return 'clear'
  const beforeClear = !isCjk(before) || BEFORE_ONE.test(before)
  const afterClear = !isCjk(after) || AFTER_ONE.test(after) || AFTER_WORDS.some((word) => text.startsWith(word, end))
  return beforeClear && afterClear ? 'clear' : 'glued'
}
