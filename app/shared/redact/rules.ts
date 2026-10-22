/**
 * Rule detector for Chinese medical records. Most check-up reports are
 * "label：value" forms, so field labels carry most of the signal; number shapes
 * (ID checksum, mobile prefixes, Luhn) cover values outside labelled fields.
 * Doctors, hospitals, drugs and test results are context the AI needs and are
 * never proposed for replacement by default.
 */
import type { Detector } from './detect'
import type { CandidateReason, Certainty, Decision, DraftCandidate, NameRole, PiiCategory, SourceDocument } from './types'
import { cnIdChecksum, luhnValid } from './text'
import { readsAsDate, readsAsSolidDate } from './values'

interface Field {
  label: string
  valueStart: number
  valueEnd: number
}

// A field label: up to 16 characters right before a full- or half-width colon.
const LABEL = /([\u4e00-\u9fffA-Za-z（）()/]{1,16})[ \t\u3000]*[：:]/g
// Labels that commonly follow a value with no space in between (姓名：张伟性别：男).
const GLUED_LABEL = /(姓名|性别|年龄|出生日期|民族|职业|婚姻|电话|手机|联系电话|住址|地址|身份证号|证件号码|科室|床号|编号|日期)$/

const BACKGROUND = /医生|医师|医院|机构|科室|单位|药|参考|项目|指标|结果|设备|仪器|订单|物流|快递|教学|测试|校验|示例|样例|发票|批号|型号|热线|客服|厂家|公司/
const PATIENT_NAME = /^(?:(?:患者|病人|就诊人|受检人|受检者|体检人|体检者|客户|本人|参保人|参保人员)(?:姓名|签名|签字)?|姓名|名字)$/
const FAMILY_NAME = /^(?:家属|联系人|紧急联系人|监护人|代理人|委托人|配偶|父亲|母亲|儿子|女儿|子女|丈夫|妻子|亲属|陪同人)(?:姓名|签名|签字)?$/
const DOCTOR_NAME = /(?:医生|医师|主检|主治|审核|报告人|检查者|操作者|技师|护士)(?:姓名|签名|签字)?$/
// A bare 签名 or 签字 with no role in front: someone signed, usually the patient or family.
const SIGNATURE = /^(?:签名|签字|签署人)$/
const ADDRESS = /^(?:(?:家庭|现|户籍|通讯|联系|居住|常住)?(?:住址|地址|居住地)|户籍)$/
const SOCIAL_SECURITY = /社保|社会保障|社会保险|医保|医疗保险|参保/
/**
 * Insurance labels that hold a date, a place, a kind, a count or an amount, not a number (参保日期,
 * 首次参保年月, 医保统筹支付), unless the label still ends in a number word (医保报销单号, 统筹区参保号).
 */
const NOT_AN_INSURANCE_NUMBER = /日期|时间|年份|年度|年月|月份|起始|开始|截止|所属期|月数|类型|类别|险种|地|金额|费|支付|报销|统筹|比例|状态/
/** Codes of an employer, an agency, a region or a drug catalogue, never a person's number (参保单位代码, 医保编码). */
const INSURANCE_CODE = /单位|机构|登记证|区划|目录|编码|代码/
const insuranceLabel = (label: string): boolean => Boolean(SOCIAL_SECURITY.test(label) && !INSURANCE_CODE.test(label)
  && (!NOT_AN_INSURANCE_NUMBER.test(label) || /(?:号|号码|编号)$/.test(label)))
const RECORD = /^(?:(?:体检|报告|病历|病案|门诊|住院|就诊|档案|条码|条形码|样本|标本|登记|检验|检查|申请|健康)(?:编号|单号|号码|号|卡号|ID)|编号|档案号|ID号)$/i
const ID_LABEL = /身份证|证件|身份号|公民身份/
// tel only as a word: Platelet and Telmisartan are not phones.
const PHONE_LABEL = /电话|手机|联系方式|座机|固话|(?<![A-Za-z])tel(?![A-Za-z])|phone|mobile/i
const BANK_LABEL = /银行|卡号|账号|账户|储蓄|信用卡|借记卡/

const CJK_NAME = /^(?:[\u4e00-\u9fff]{2,4}|[\u4e00-\u9fff]{1,8}(?:[\u00b7\u2022\u30fb][\u4e00-\u9fff]{1,10}){1,2})(?=$|[\s，,、；;（(男女])/
/** OCR splits printed names: 张 伟, 卢 国庆. The part after the space is never a lone gender. */
const SPACED_NAME = /^[\u4e00-\u9fff][ \u3000](?![男女](?:$|[\s，,]))[\u4e00-\u9fff]{1,3}(?=$|[\s，,、；;（(])/
const LATIN_NAME = /^[A-Za-z][A-Za-z .'-]{1,38}[A-Za-z]$/
// Words that follow 患者 in free text but are not names (患者主诉, 患者自述 …).
const NOT_A_NAME = /^(?:主诉|自述|自诉|既往|否认|一般|目前|本次|入院|出院|术后|病情|情况|本人|家属|姓名|标识|信息|资料|身份|电话|地址|住址|签名|签字|同意|知情|病史|编号|号码|隐私|居住|家住|家庭|单位|工作|办公|住宅|固定|常用|备用|紧急|关系|母亲|父亲|配偶|子女|儿子|女儿|丈夫|妻子|监护|亲属|联系|手机|座机|证件|医保|社保|参保|户籍|籍贯|职业|民族|性别|年龄|出生|[无有于因诉已未及与和的在为是系经行予给需应可仍再又也均现近平今昨明曾或住])/

// The leading boundary keeps this linear: without it a long run with no @ is retried from every position.
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,128}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g
// Letters may touch an ID (ID11010…), digits may not.
const ID_SHAPE = /(?<!\d)\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![0-9])/g
/** A run of digit groups (maybe ending in X) that may hold a grouped ID; idsInRun finds it inside. */
const ID_RUN = /(?<!\d)\d(?:[ \t-]{0,2}\d){16,}(?:[ \t-]{0,2}[Xx])?(?![0-9])/g
/** How IDs are printed in groups: on copies, by OCR, or with the check character apart. */
const ID_LAYOUTS: ReadonlySet<string> = new Set(['6-8-4', '6-4-4-4', '4-4-4-4-2', '3-3-4-4-4', '6-8-3-1'])
/** The first two digits of every mainland, Hong Kong, Macao and Taiwan ID: a province or region. */
const ID_REGION = /^(?:1[1-5]|2[1-3]|3[1-7]|4[1-6]|5[0-4]|6[1-5]|71|8[1-3]|91)/
const ID_BODY = /^\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/
// Up to two spaces between groups: OCR joins neighbouring boxes with two spaces.
// Spaces, dashes and middle dots only: commas and slashes join lists of amounts (入 150, 1800, 2000 ml).
const MOBILE = /(?<![\d+])(?:(?:\+|00)?86[ \t\-\u00b7\u30fb\u2027]{0,2})?1[3-9]\d(?:[ \t\-\u00b7\u30fb\u2027]{0,2}\d{4}){2}(?!\d)/g
// Cards are checked first, so a card's tail (62222 00666480087) is never taken for a landline.
// The local number is solid or in two groups (021-4320-2031).
const LANDLINE = /(?<!\d)(?:\(0\d{2,3}\)|0\d{2,3})(?:[ \t-]?\d{7,8}|[ \t-]\d{3,4}[ \t-]\d{4})(?!\d)/g
/**
 * A landline after +86, (+86) or 0086 drops the area code's 0: +86-21-83134703, +86 755 8312 3456.
 * Area codes are 10, 2x or three digits from 3 up, so a mobile (+86 139…) never reads as one; 400 and
 * 800 are service lines, not areas. A solid 0086… is more often a code than a phone.
 */
const LANDLINE_86 = /(?:\(\+86\)|(?<![\d+])\+86|(?<![\d+])0086(?=[ \t-]))[ \t-]{0,2}(?:\((?![48]00)(?:10|2\d|[3-9]\d{2})\)|(?![48]00)(?:10|2\d|[3-9]\d{2}))[ \t-]{0,2}\d{3,4}[ \t-]?\d{4}(?!\d)/g
/** A phone word right before a number, with at most a colon or spaces between (联系电话139\n12345678, 手机：). */
const PHONE_RIGHT_BEFORE = /(?:电话|手机|联系方式|座机|固话|(?<![A-Za-z])tel|phone|mobile)(?:号码|号)?[ \t:]*$/i
/** Words that name an ID a few characters before it (身份证 4403051970\n03012210). */
const ID_CONTEXT = /身份证|证件|身份号|公民身份|(?<![A-Za-z])ID(?![A-Za-z])/i
// Cards are printed solid or with spaces or dashes. Dots, commas and slashes are left out on purpose:
// a row of lab values (4.52 135 0.41 …) or a list of dates must never add up to a "card".
const LONG_DIGITS = /(?<!\d)\d(?:[ \t-]{0,2}\d){11,22}(?!\d)/g
/**
 * Where an address stops: a phone, e-mail or ID label followed by its value, a
 * mobile number, or any other number of six digits or more (a landline, an ID):
 * house and room numbers are shorter. Labels must be followed by a colon or a
 * number, so 电话局宿舍 and Hotel Road stay part of the address.
 */
const ADDRESS_END = /\s*(?:(?:联系电话|联系方式|电话号码|手机号码|手机号|电话|手机|座机|固话)(?=\s*[:：+\d(（])|(?:电子邮箱|邮箱)(?=\s*[:：A-Za-z0-9])|(?<![A-Za-z])(?:tel|phone|mobile)(?![A-Za-z])(?=\s*[:：.]?\s*[+\d(（])|(?<![A-Za-z])e-?mail(?![A-Za-z])(?=\s*[:：])|(?:身份证号?|证件号码?)(?=\s*[:：\d]))|(?<!\d)1[3-9]\d(?:[ \t-]?\d{4}){2}(?!\d)|(?<![\d-])(?:\(?0\d{2,3}\)?[ \t-]?)?\d{6,}/i
/**
 * An address under its label also ends with its clause: 现住址：…301室，因胸痛入院 keeps the complaint.
 * Only a full stop, or a comma or semicolon before words that start a new clause, ends it, so commas
 * inside an address (北京，朝阳区…) stay. Rules see normalized text, where ， and ； are already , and ;.
 */
const CLAUSE_END = /。|[,;](?=\s*(?:因|于\d|主诉|入院|就诊|自诉|出现|伴|既往|来院|来诊|收入|收住|性别|年龄|职业|婚姻|民族|\d{1,3}\s*岁))/
/** Words that put a number in a payment context, a few characters before it (退款账户 622202 1234567890128). */
const CARD_CONTEXT = /卡|账户|帐户|账号|帐号|银行|转账|转入|存入|汇入|划入|到账|入账|退款|退费|退回|退至|原路|名下|打款|返还|还款|收款|付款|缴费|支付|汇款|户名|开户|account|card/i
/** Words right after a number that make it a card (…5290(储蓄卡), …（中国农业银行）). */
const CARD_AFTER = /^[\s(]{0,2}[\u4e00-\u9fff]{0,6}(?:银行|卡|账户|信用社)/
/** A date inside a digit run (2025-08-14  134 …): such a run is a log line, not a card. */
const DATE_IN_RUN = /(?:19|20)\d{2}[ \t-]{1,2}(?:0?[1-9]|1[0-2])[ \t-]{1,2}(?:0?[1-9]|[12]\d|3[01])(?!\d)/
/** Punctuation and spaces left at the end of an address after the cut (住址：…100号，电话…). */
const ADDRESS_TAIL = /[\s，,。；;、]+$/
/** A line that starts with a label (住院号：…), so it is never the rest of an address. */
const LINE_LABEL = /^[\u4e00-\u9fffA-Za-z()/]{1,16}[ \t]*:/
/** A house number, building, unit or room (…2幢\n301室): what makes the next line the rest of an address. */
const ADDRESS_CONTINUES = /\d[ \t]*(?:号|栋|幢|楼|单元|室|层|弄)|^(?:号|栋|幢|楼|单元|室)/
/** Building, unit and room with dashes, the whole piece (16-5-603, -1-2101); a date starts with a year. */
const HOUSE_DASHES = /^-?\d{1,3}-\d{1,4}(?:-\d{1,5})?室?$/
/** Words that start a sentence or a section, never the rest of an address on the line before. */
const SENTENCE_START = /^(?:患者|病人|家属|其|本人|门诊|入院|出院|主诉|现病史|既往|诊断|处理|建议|医嘱|嘱|注|备注|签名|复查|随访)/
/** Words that make a next line part of the report, not of an address (床号 12, 12号窗口, 3号诊室, 门诊2楼, 21号染色体). */
const NOT_ADDRESS_WORDS = /^第|窗口|诊室|检查|门诊|住院|病|科|医|染色体|床|药|天|周|岁|次|报告|取|血|尿|治疗|手术|分钟|小时|页|片|粒|出差|打工|工作|附近|ml|mg/i
/** A piece that starts with a place (无锡市…, 于洪区…), even when its first character also starts a clause. */
const PLACE_START = /^\s*[\u4e00-\u9fff]{1,4}(?:省|市|区|县|镇|乡)/
/** How the rest of an address ends: a number, a room or building, a street or an estate (皮下2层缝合 does not). */
const ADDRESS_ENDING = /(?:号|栋|幢|楼|单元|室|层|弄|\d|村|组|路|街|巷|道|苑|园|院|座|区|里|厦|寓|庭|府|城|湾|居|舍)$/
/** A street with no number yet (鼓楼区中山北路): the number may be on the line after. */
const STREET_END = /(?:路|街|巷|弄|道|村|组|胡同|号院)$/
/**
 * Words that start an address in running text: 家住江苏省南京市…，因… The 现住 of 现住院 (in hospital
 * now) or 现住址：(a label) is not one; neither is a place with no street or district (家住农村, 住在市区).
 */
const LIVES_AT = /(?:家住在|家住|现住于|现住在|现住|现居住于|现居住在|现居于|现居在|现居|居住于|居住在|住在|家庭住址为|家庭住址是|住址为|住址是)(?![址院处所否])[ \t]*:?[ \t]*/g
const NAMES_AN_ADDRESS = new RegExp(LIVES_AT.source)
/** An address in running text is never longer than this. */
const MAX_TEXT_ADDRESS = 80
/** A named province, city, district, town, village or street: two characters or more, then the level. */
const PLACE_LEVEL = /[\u4e00-\u9fff]{2}(?:省|市|区|县|镇|乡|村|路|街|道|巷|弄)/g
const HOUSE_NUMBER = /\d[ \t]*(?:号|栋|幢|楼|单元|室)/
/** Where someone is staying, not where they live (住在本市第一人民医院, 住在…医院期间). */
const FACILITY = /医院|卫生院|卫生所|诊所|病房|病区|监护|养老院|宾馆|酒店|科$|中心$/
/** Finer than a district: a street, village or estate, or a house number. 家住上海市浦东新区 alone names no home. */
const STREET_OR_HOUSE = /[\u4e00-\u9fff](?:路|街|巷|弄|道|村|组|胡同|小区|花园|新村|苑|大厦|公寓)|\d[ \t]*(?:号|栋|幢|楼|单元|室)/
/** After a comma in running text, more of the address: a named place or a house number, not a new clause. */
const ADDRESS_PIECE = /^\s*(?:[\u4e00-\u9fff]{2,10}?(?:省|市|区|县|镇|乡|路|街|巷|弄|村|小区|花园|新村)|[\u4e00-\u9fff]{0,10}?\d[\d ]*(?:号|栋|幢|楼|单元|室))/
const NEW_CLAUSE = /^\s*(?:因|于|主诉|入院|就诊|自诉|自述|出现|伴|既往|来院|来诊|收入|收住|平素|否认|近|现|自|无|有|在|已|曾|务|从|退休|电话|手机|联系|性别|年龄|职业|婚姻|民族|当地|外院|发病|长期|社区医院|去|到)/
// A name in running text ends at punctuation, a gender, or a verb that usually follows it.
const FREE_TEXT_NAME = /(患者|病人|家属|联系人)[：:]?[ \t]*([\u4e00-\u9fff]{2,3})(?=[，,。；;、\s（(男女]|$|陪|签|同意|知情|告知|表示|要求|拒绝|电话|联系)/g

function normalizeLabel(label: string): string {
  return label.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '')
}

interface Cell {
  text: string
  start: number
  end: number
}

/**
 * Table cells: tab-separated, or (for OCR output) separated by two or more
 * spaces when the line has at least three cells and no colon.
 */
function splitCells(line: string): Cell[] {
  const separator = line.includes('\t') ? /\t+/g : !/[：:]/.test(line) ? /[ \u3000]{2,}/g : null
  if (!separator) return []
  const cells: Cell[] = []
  let cursor = 0
  const pushCell = (from: number, to: number): void => {
    let start = from
    let end = to
    while (start < end && /\s/.test(line[start])) start++
    while (end > start && /\s/.test(line[end - 1])) end--
    cells.push({ text: line.slice(start, end), start, end })
  }
  for (const match of line.matchAll(separator)) {
    pushCell(cursor, match.index ?? 0)
    cursor = (match.index ?? 0) + match[0].length
  }
  pushCell(cursor, line.length)
  const minimum = line.includes('\t') ? 2 : 3
  return cells.length >= minimum ? cells : []
}

const HEADER_CELL = /^[\u4e00-\u9fffA-Za-z（）()/ ]{1,16}$/

// "患者姓名为“赵青嘉”": a label, then 为 or 是, then the value in quotes.
const QUOTED = /([\u4e00-\u9fff]{1,12})(?:为|是)[“「"]([^”」"\n]{1,80})[”」"]/g

/** Split the text into fields: "label：value" pairs, table cells under a header row, and quoted values. */
export function parseFields(text: string): Field[] {
  const fields: Field[] = []
  let lineStart = 0
  let header: string[] | null = null
  for (const line of text.split('\n')) {
    const cells = splitCells(line)
    if (cells.length > 0) {
      if (cells.every((cell) => HEADER_CELL.test(cell.text))) {
        header = cells.map((cell) => normalizeLabel(cell.text))
      } else if (header && cells.length === header.length) {
        const labels = header
        cells.forEach((cell, index) => {
          if (cell.end > cell.start) fields.push({ label: labels[index], valueStart: lineStart + cell.start, valueEnd: lineStart + cell.end })
        })
      }
      // Text pasted from Word or Excel keeps "label：value" pairs between tabs (姓名：张伟\t性别：男).
      if (!/[：:]/.test(line)) {
        lineStart += line.length + 1
        continue
      }
    }
    if (line.trim() === '') header = null

    QUOTED.lastIndex = 0
    for (const match of line.matchAll(QUOTED)) {
      const valueStart = lineStart + (match.index ?? 0) + match[0].length - match[2].length - 1
      fields.push({ label: normalizeLabel(match[1]), valueStart, valueEnd: valueStart + match[2].length })
    }

    const labels: Array<{ label: string; start: number; valueStart: number }> = []
    LABEL.lastIndex = 0
    for (const match of line.matchAll(LABEL)) {
      let label = match[1]
      let start = match.index ?? 0
      const glued = label.length > 2 ? GLUED_LABEL.exec(label) : null
      if (glued && glued.index > 0) {
        // After a gap or a comma, words in front of the label cannot belong to a value with no Chinese in it
        // (体检编号：TJ001  体检日期：…), so that value ends at the gap. A value in Chinese may go on there:
        // an OCR-split name (姓名：张 伟性别：男) or an address (…太康县 王庄村电话：…).
        const previous = labels[labels.length - 1]
        const before = previous ? line.slice(previous.valueStart - lineStart, start).trim() : ''
        const apart = start > 0 && /[ \t,;、|。]/.test(line[start - 1])
        const gap = apart && before !== '' && !/[\u4e00-\u9fff]/.test(before)
        // 医师姓名, 家属姓名 apart from the value before: the words in front say whose name it is, and stay out of that value.
        const whole = normalizeLabel(label)
        const own = (apart || !previous) && glued[1] === '姓名' && (DOCTOR_NAME.test(whole) || FAMILY_NAME.test(whole))
        if (!gap && !own) start += glued.index
        if (!own) label = glued[1]
      }
      labels.push({ label, start: lineStart + start, valueStart: lineStart + (match.index ?? 0) + match[0].length })
    }
    labels.forEach((entry, index) => {
      const next = index + 1 < labels.length ? labels[index + 1].start : lineStart + line.length
      let end = next
      while (end > entry.valueStart && /[\s，,。；;、]/.test(text[end - 1])) end--
      let start = entry.valueStart
      while (start < end && /[ \t\u3000]/.test(text[start])) start++
      if (end > start) fields.push({ label: normalizeLabel(entry.label), valueStart: start, valueEnd: end })
    })
    lineStart += line.length + 1
  }
  return fields
}

class Collector {
  readonly items: DraftCandidate[] = []
  constructor(private readonly doc: SourceDocument, private readonly page: number) {}

  overlaps(start: number, end: number): boolean {
    return this.items.some((item) => start < item.end && item.start < end)
  }

  add(start: number, end: number, category: PiiCategory, certainty: Certainty, reason: CandidateReason,
    extra: { label?: string; role?: NameRole; suggestion?: Decision } = {}): void {
    if (end <= start || this.overlaps(start, end)) return
    this.items.push({
      docId: this.doc.id,
      page: this.page,
      start,
      end,
      category,
      source: reason === 'model' ? 'model' : extra.label ? 'label' : 'rule',
      certainty,
      reason,
      suggestion: extra.suggestion ?? 'replace',
      ...(extra.role && { role: extra.role }),
      ...(extra.label && { label: extra.label }),
    })
  }
}

function fieldAt(fields: Field[], start: number, end: number): Field | undefined {
  return fields.find((field) => field.valueStart <= start && end <= field.valueEnd)
}

/** Without a label, a background word just before the value (订单号13800…) still counts. */
function backgroundNear(text: string, start: number, field: Field | undefined): boolean {
  if (field) return BACKGROUND.test(field.label) && !DOCTOR_NAME.test(field.label)
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  return BACKGROUND.test(text.slice(Math.max(lineStart, start - 10), start))
}

function nameFromValue(text: string, field: Field): { start: number; end: number } | null {
  const value = text.slice(field.valueStart, field.valueEnd)
  const cjk = CJK_NAME.exec(value) ?? SPACED_NAME.exec(value)
  if (cjk) return { start: field.valueStart, end: field.valueStart + cjk[0].length }
  if (LATIN_NAME.test(value)) return { start: field.valueStart, end: field.valueEnd }
  return null
}

interface AddressText {
  value: string
  /** The page offset of an offset in `value`. */
  at(index: number): number
}

/**
 * The text an address may take, from `start`: up to `end`, and when that is the end of its line, on
 * through up to two more lines while each has no label and reads like the rest of an address (a narrow
 * column: 住址：…文三路100号2幢\n301室, …188号\n16-5-603). Line breaks are left out of `value`.
 */
function addressText(text: string, start: number, end: number): AddressText {
  let value = text.slice(start, end)
  const pieces = [{ index: 0, page: start }]
  let cursor = end
  // Up to two more lines: a long address in a narrow column can take three.
  for (let lines = 0; lines < 2; lines++) {
    // Only spaces or a comma left on the line (looked for close by, so long lines stay fast).
    const rest = /^[ \t,、]*\n/.exec(text.slice(cursor, cursor + 40))
    if (!rest) break
    const lineEnd = cursor + rest[0].length - 1
    // Pasted tables keep cells apart with tabs: the row below is another row, not the rest of a cell.
    if (lines === 0) {
      const before = text.slice(Math.max(0, start - 200), start)
      if ((before.slice(before.lastIndexOf('\n') + 1) + text.slice(start, lineEnd)).includes('\t')) break
    }
    let next = lineEnd + 1
    while (next < text.length && (text[next] === ' ' || text[next] === '\t')) next++
    let line = text.slice(next, next + 200).split('\n')[0]
    if (line.includes('\t')) break
    // Up to a label or a gap before words later on the line (301室  工作单位：…, 301室电话：…); OCR gaps
    // between digits stay.
    const stop = /[ ]{2,}(?=\D)|[\u4e00-\u9fffA-Za-z()/]{1,16}[ ]*:/.exec(line)
    if (stop && stop[0].includes(':')) {
      const glued = GLUED_LABEL.exec(stop[0].replace(/[ ]*:$/, ''))
      if (glued && glued.index > 0) stop.index += glued.index
    }
    if (stop && stop.index > 0) line = line.slice(0, stop.index)
    const words = line.replace(/^[\s,、]+/, '')
    const place = PLACE_START.test(words)
    if (LINE_LABEL.test(words) || (NEW_CLAUSE.test(words) && !place)) break
    const head = value + text.slice(cursor, lineEnd).replace(/[ \t]+$/, '')
    // The words before the next comma decide, and they must all be address words: a house number,
    // building or room early on (2幢301室, 号，阳光花园…), the rest of a number with dashes (16-5-\n2804,
    // 12-4\n-1504), or a place (无锡市梁溪区…100号, 鼓楼区中山北路). A sentence that names its own
    // address (患者居住于…188号) starts anew.
    const lead = words.split(/[,;。]/)[0].replace(/(?<=\d) +(?=\d)/g, '')
    if (lead.length > 40 || !/^[\u4e00-\u9fff\d#-]+$/.test(lead) || !ADDRESS_ENDING.test(lead) || NOT_ADDRESS_WORDS.test(lead)
      || SENTENCE_START.test(lead) || NAMES_AN_ADDRESS.test(lead)) break
    const dashes = HOUSE_DASHES.test(lead) || (/\d-$/.test(head) && /^\d{1,5}室?$/.test(lead))
      || (/\d-\d{1,4}$/.test(head) && /^(?:-\d{1,5}|\d{1,4})室?$/.test(lead))
    const marker = ADDRESS_CONTINUES.exec(lead)
    if (!((marker && (marker.index <= 14 || place)) || dashes || (place && STREET_END.test(lead)))) break
    pieces.push({ index: head.length, page: next })
    value = head + line
    cursor = next + line.length
    if (stop && stop.index > 0) break
  }
  return {
    value,
    at: (index) => {
      const piece = pieces.reduce((found, candidate) => (candidate.index <= index ? candidate : found))
      return piece.page + index - piece.index
    },
  }
}

/**
 * Where an address in running text stops: a full stop, a bracket or a quote, a 、, a tab or a wider
 * gap, a label (…12号  职业：退休, …12号性别：男), or a comma or space before words that are not more
 * of the address. A comma or space before more of it (江苏省南京市，鼓楼区…; OCR's 江苏省 南京市) does not.
 */
function narrativeClauseEnd(value: string): number {
  let end = value.length
  const colon = value.indexOf(':')
  if (colon >= 0) {
    const run = /[\u4e00-\u9fffA-Za-z()/]{1,16}$/.exec(value.slice(0, colon).trimEnd())
    const glued = run ? GLUED_LABEL.exec(run[0]) : null
    end = run ? run.index + (glued && glued.index > 0 ? glued.index : 0) : colon
  }
  // OCR's wider gaps between two digits (中路5  41号) are no gap.
  for (const match of value.slice(0, end).matchAll(/[。;!?()“"”、\t]|(?<!\d) {2,}| {2,}(?!\d)|[, ]/g)) {
    const at = match.index ?? 0
    // Past the longest address there is nothing more to look for.
    if (at > MAX_TEXT_ADDRESS) return at
    if (match[0] === ',' || match[0] === ' ') {
      const rest = value.slice(at + 1)
      const piece = rest.replace(/^\s+/, '').split(/[,;。 ]/)[0]
      if (!NEW_CLAUSE.test(rest) && ADDRESS_PIECE.test(rest) && /^[\u4e00-\u9fff\d#-]+$/.test(piece) && !NOT_ADDRESS_WORDS.test(piece)
        && !NAMES_AN_ADDRESS.test(piece)) continue
    }
    return at
  }
  return end
}

function placeLevels(value: string): number {
  return value.match(PLACE_LEVEL)?.length ?? 0
}

/**
 * Addresses in running text (家住江苏省南京市鼓楼区香港中路746号，因…; 现住, 住在, 居住于). The words in
 * front work like a label. The address must name two places, or one and a house number, and be finer
 * than a district (a street, a village, an estate or a house number), so 家住农村, 住在市区 and 家住上海市
 * 浦东新区 stay; so does a stay in a hospital. Sure with a house number and two places; otherwise worth a
 * look. At most 80 characters: running text is never one long address.
 */
function narrativeAddresses(text: string, out: Collector): void {
  // Up to the end of the line, looked for close by: an address is never longer than this.
  const lineEndNear = (from: number): number => {
    const near = text.slice(from, from + 200)
    const at = near.indexOf('\n')
    return at < 0 ? from + near.length : from + at
  }
  LIVES_AT.lastIndex = 0
  for (const match of text.matchAll(LIVES_AT)) {
    let start = (match.index ?? 0) + match[0].length
    let lineEnd = lineEndNear(start)
    // 现居住于 at the end of a line: the address is on the next one.
    if (text.slice(start, lineEnd).trim() === '' && text[lineEnd] === '\n') {
      start = lineEnd + 1
      while (start < text.length && (text[start] === ' ' || text[start] === '\t')) start++
      lineEnd = lineEndNear(start)
    }
    const { value, at } = addressText(text, start, lineEnd)
    const cut = ADDRESS_END.exec(value)
    const whole = cut ? value.slice(0, cut.index) : value
    const kept = whole.slice(0, narrativeClauseEnd(whole)).replace(ADDRESS_TAIL, '')
    const levels = placeLevels(kept)
    // An address starts with a named place (家住3楼，无疫区接触史 is no address).
    if (kept.length > MAX_TEXT_ADDRESS || kept.replace(/\s/g, '').length < 4 || FACILITY.test(kept) || !STREET_OR_HOUSE.test(kept)
      || placeLevels(kept.split(/[,;]/)[0]) === 0 || !(levels >= 2 || (levels >= 1 && HOUSE_NUMBER.test(kept)))) continue
    const certainty: Certainty = levels >= 2 && HOUSE_NUMBER.test(kept) && kept.length <= 60 ? 'sure' : 'unsure'
    out.add(start, at(kept.length - 1) + 1, 'address', certainty, 'address_in_text', { label: match[0].replace(/[\s:]/g, '') })
  }
}

function labelledFields(text: string, fields: Field[], out: Collector): void {
  for (const field of fields) {
    const { label } = field
    const value = text.slice(field.valueStart, field.valueEnd)
    const isSignature = SIGNATURE.test(label)
    if (PATIENT_NAME.test(label) || FAMILY_NAME.test(label) || isSignature || (DOCTOR_NAME.test(label) && !/日期|时间/.test(label))) {
      const name = nameFromValue(text, field)
      if (!name) continue
      // Patient and family labels are checked first, so 患者签名 is never taken for a doctor.
      if (PATIENT_NAME.test(label)) out.add(name.start, name.end, 'name', 'sure', 'name_label', { label, role: 'patient' })
      else if (FAMILY_NAME.test(label)) out.add(name.start, name.end, 'name', 'unsure', 'family_label', { label, role: 'family' })
      else if (isSignature) out.add(name.start, name.end, 'name', 'unsure', 'name_label', { label, role: 'other' })
      else out.add(name.start, name.end, 'name', 'unsure', 'doctor_label', { label, role: 'doctor', suggestion: 'keep' })
    } else if (ADDRESS.test(label)) {
      // An address ends where a phone number or a phone label starts (住址：…路88号 电话139…).
      const { value: full, at } = addressText(text, field.valueStart, field.valueEnd)
      const cut = ADDRESS_END.exec(full)
      const whole = (cut ? full.slice(0, cut.index) : full).replace(ADDRESS_TAIL, '')
      const clause = CLAUSE_END.exec(whole)
      let kept = clause ? whole.slice(0, clause.index).replace(ADDRESS_TAIL, '') : whole
      // Never drop an address: if the clause cut leaves too little, keep the whole value and ask.
      let certainty: Certainty = 'sure'
      if (kept.replace(/\s/g, '').length < 4 && whole.replace(/\s/g, '').length >= 4) {
        kept = whole
        certainty = 'unsure'
      }
      const length = kept.replace(/\s/g, '').length
      // A very long value is still replaced, only marked for a look: dropping it would leak the address.
      if (length > 200) certainty = 'unsure'
      if (length >= 4) out.add(field.valueStart, at(kept.length - 1) + 1, 'address', certainty, 'address_label', { label })
    } else {
      // A number under its label. A line break may cut an ID (身份证号：4403051970\n03012210, also under
      // 参保号): the next line joins only when the two lines make an ID with a valid checksum.
      const tail = numberTail(text, field.valueEnd)
      const joined = tail === null ? '' : text.slice(field.valueStart, tail).replace(/[\s-]/g, '')
      const id = /^\d{17}[\dXx]$/.test(joined) && cnIdChecksum(joined)
      for (const end of tail !== null && id ? [tail, field.valueEnd] : [field.valueEnd]) {
        const kind = labelledNumber(label, text.slice(field.valueStart, end))
        if (kind) {
          out.add(field.valueStart, end, kind.category, 'sure', kind.reason, { label })
          break
        }
      }
    }
  }
}

/** What a value under a number label is, or null: an ID in any grouping (1101 0519 4912 3100 2X), an insurance or a record number. */
function labelledNumber(label: string, value: string): { category: PiiCategory; reason: CandidateReason } | null {
  const compact = value.replace(/[\s-]/g, '')
  if (ID_LABEL.test(label) && !insuranceLabel(label) && /^[\d\s-]+[\dXx]$/.test(value) && /^\d{17}[\dXx]$/.test(compact) && cnIdChecksum(compact)) {
    return { category: 'id_number', reason: 'id_under_label' }
  }
  if (insuranceLabel(label) && /^[A-Za-z0-9-]{6,24}$/.test(value.replace(/\s/g, ''))) return { category: 'social_security', reason: 'social_security_label' }
  if (RECORD.test(label) && /^[A-Za-z0-9-]{4,30}$/.test(value.replace(/\s/g, ''))) return { category: 'record_number', reason: 'record_label' }
  return null
}

/** The rest of a number on the next line: digits only, with single spaces, tabs or dashes, up to the line's end or a gap and a label. */
const NUMBER_TAIL = /^ *(\d(?:[ \t-]?\d)*[Xx]?)(?: *$| {2,}(?=[\u4e00-\u9fffA-Za-z()/]{1,16} *:))/

/**
 * Where a labelled number ends when a line break may have cut it (身份证号：4403051970\n03012210,
 * 联系电话：133470\n6655): the value ends its line with a digit, and the next line is nothing but more
 * digits, not a date. Callers decide whether the two lines make one number. Returns null otherwise.
 */
function numberTail(text: string, end: number): number | null {
  if (!/\d/.test(text[end - 1] ?? '')) return null
  const lineEnd = text.indexOf('\n', end)
  if (lineEnd < 0 || text.slice(end, lineEnd).trim() !== '') return null
  const nextEnd = text.indexOf('\n', lineEnd + 1)
  const line = text.slice(lineEnd + 1, nextEnd < 0 ? text.length : nextEnd)
  const tail = NUMBER_TAIL.exec(line)
  if (!tail || readsAsDate(tail[1]) || readsAsSolidDate(tail[1])) return null
  return lineEnd + 1 + line.indexOf(tail[1]) + tail[1].length
}

/** A whole phone number in digits: a mobile or a landline, with or without the country code. */
const PHONE_DIGITS = /^(?:(?:0086|86)?1[3-9]\d{9}|0\d{9,11}|(?:0086|86)(?:10|2\d|[3-9]\d{2})\d{7,8})$/

function structuredValues(text: string, fields: Field[], out: Collector): void {
  const each = (regex: RegExp, handle: (start: number, end: number, value: string, field: Field | undefined) => void): void => {
    regex.lastIndex = 0
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0
      const end = start + match[0].length
      const field = fieldAt(fields, start, end)
      if (backgroundNear(text, start, field)) continue
      handle(start, end, match[0], field)
    }
  }

  each(EMAIL, (start, end, _value, field) => out.add(start, end, 'email', 'sure', 'email', { label: field?.label }))
  // Before the numbers on one line, so a cut-off piece of a number is never taken on its own.
  joinedNumbers(text, fields, out)
  // An ID under an insurance label is still an ID; when the label took the whole value as its number, that came first.
  each(ID_SHAPE, (start, end, value, field) => {
    const label = field?.label
    if (cnIdChecksum(value)) out.add(start, end, 'id_number', 'sure', 'id_checksum', { label })
    else if (label && (ID_LABEL.test(label) || PATIENT_NAME.test(label))) out.add(start, end, 'id_number', 'sure', 'id_under_label', { label })
    else out.add(start, end, 'id_number', 'unsure', 'id_shape', { label })
  })
  each(ID_RUN, (start, _end, value, field) => {
    const label = field?.label
    const underLabel = Boolean(label && ID_LABEL.test(label))
    for (const id of idsInRun(value)) {
      if (underLabel) out.add(start + id.start, start + id.end, 'id_number', 'sure', 'id_under_label', { label })
      // Without a label, a "birth date" from this year or last is a date stamp (标本号 100231 20250815 0830).
      else if (cnIdChecksum(id.compact) && Number(id.compact.slice(6, 10)) < new Date().getFullYear() - 1) {
        out.add(start + id.start, start + id.end, 'id_number', 'sure', 'id_checksum', { label })
      }
    }
  })
  // Cards first: a card's digits must not be taken apart into a phone number and the rest.
  each(LONG_DIGITS, (start, end, value, field) => {
    const digits = value.replace(/\D/g, '')
    const underLabel = Boolean(field && BANK_LABEL.test(field.label))
    const inPaymentContext = CARD_CONTEXT.test(text.slice(Math.max(0, start - 12), start)) || CARD_AFTER.test(text.slice(end, end + 12))
    // Under a card label: a card from the first group on, with whatever follows left alone (an amount);
    // otherwise the whole run, even with a stray group in front (0102 6222 0000 1111 2223).
    const leading = underLabel && digits.length > 19 ? cardInGroups(value) : null
    if (leading && leading.start === 0) {
      out.add(start, start + leading.end, 'bank_card', 'sure', 'bank_card_under_label', { label: field?.label })
    } else if (underLabel && digits.length >= 12 && digits.length <= 23) {
      out.add(start, end, 'bank_card', 'sure', 'bank_card_under_label', { label: field?.label })
    } else if (digits.length >= 16 && digits.length <= 19 && luhnValid(digits) && plausibleCard(value, inPaymentContext, aloneOnLine(text, start, end))) {
      out.add(start, end, 'bank_card', 'unsure', 'bank_card_luhn', { label: field?.label })
    } else if (underLabel || inPaymentContext) {
      // A card next to another number (转账 6222 0000 1111 2223 100.00 元): look for whole groups that make a card.
      // Only with a card label or payment words: rows of 4-digit lab values pass the checksum one window in ten.
      const card = cardInGroups(value)
      if (card) {
        out.add(start + card.start, start + card.end, 'bank_card', underLabel ? 'sure' : 'unsure',
          underLabel ? 'bank_card_under_label' : 'bank_card_luhn', { label: field?.label })
      }
    }
  })
  each(MOBILE, (start, end, _value, field) => out.add(start, end, 'phone', 'sure', 'mobile_phone', { label: field?.label }))
  // A landline is sure under a phone label, with or without +86, so one decision covers both spellings.
  for (const regex of [LANDLINE_86, LANDLINE]) {
    each(regex, (start, end, _value, field) => {
      const certainty: Certainty = field && PHONE_LABEL.test(field.label) ? 'sure' : 'unsure'
      out.add(start, end, 'phone', certainty, 'landline_phone', { label: field?.label })
    })
  }
  // A phone label in front of an unusual number format still means a phone, also when a line break cut it.
  for (const field of fields) {
    if (!PHONE_LABEL.test(field.label) || BACKGROUND.test(field.label)) continue
    // The next line joins only when the two lines make a whole phone number (联系电话：133470\n6655).
    const tail = numberTail(text, field.valueEnd)
    const whole = tail !== null && PHONE_DIGITS.test(text.slice(field.valueStart, tail).replace(/\D/g, ''))
    for (const end of tail !== null && whole ? [tail, field.valueEnd] : [field.valueEnd]) {
      const value = text.slice(field.valueStart, end).replace(/[ \t]*\n[ \t]*/, '')
      if (/^[+()\d][\d ()+-]{6,19}$/.test(value) && value.replace(/\D/g, '').length >= 7) {
        out.add(field.valueStart, end, 'phone', 'unsure', 'phone_under_label', { label: field.label })
        break
      }
    }
  }
}

/**
 * Grouped IDs inside a run of digit groups: every window of whole groups
 * that is 18 characters, printed in an ID layout, starts with a region code
 * and holds a birth date. A short number in front (an age, a bed number)
 * does not hide the ID behind it. Solid IDs are left to ID_SHAPE.
 */
function idsInRun(value: string): Array<{ start: number; end: number; compact: string }> {
  const groups = [...value.matchAll(/\d+[Xx]?|[Xx]/g)].map((match) => ({ start: match.index ?? 0, text: match[0] }))
  const found: Array<{ start: number; end: number; compact: string }> = []
  for (let first = 0; first < groups.length; first++) {
    let compact = ''
    for (let last = first; last < groups.length; last++) {
      compact += groups[last].text
      if (compact.length > 18) break
      if (compact.length < 18) continue
      const layout = groups.slice(first, last + 1).map((group) => group.text.length).join('-')
      if (ID_LAYOUTS.has(layout) && ID_REGION.test(compact) && ID_BODY.test(compact)) {
        found.push({ start: groups[first].start, end: groups[last].start + groups[last].text.length, compact })
        first = last
      }
      break
    }
  }
  return found
}

/**
 * Whether a 16-19 digit run that passes the checksum reads as a card: never
 * a line with a date in it; in any grouping when payment words come right
 * before it; printed solid; or in groups like a card with single gaps, on a
 * line of its own. Rows of 4-digit lab values (7694 9267 3343 5152, with one
 * or two spaces or tabs) pass the checksum one time in ten, but they sit
 * after the test's name and never have those words.
 */
function plausibleCard(value: string, inPaymentContext: boolean, alone: boolean): boolean {
  if (DATE_IN_RUN.test(value)) return false
  if (inPaymentContext) return true
  if (/[ \t-]/.test(value) && !alone) return false
  return cardShaped(value) && !/[ \t-]{2}/.test(value)
}

/** Nothing but the number on its line, apart from spaces and punctuation. */
function aloneOnLine(text: string, start: number, end: number): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEnd = text.indexOf('\n', end)
  return !/[0-9A-Za-z\u4e00-\u9fff]/.test(text.slice(lineStart, start) + text.slice(end, lineEnd < 0 ? text.length : lineEnd))
}

interface JoinedLines {
  text: string
  /** Where the first line ends in `text`; the second starts at `second`. */
  join: number
  second: number
  /** The page offset of an offset in `text`. */
  at(index: number): number
  /** The first line already ends with a whole number, so the next line starts something else. */
  complete: boolean
}

/**
 * Every line break with a digit right before and after it (spaces and dashes allowed) and enough digits
 * around it for a phone number, as the two lines joined there: once with nothing between them (4403051970\n03012210), once with a space, because the
 * break often takes the place of the gap between two groups (110105 19491231\n002X).
 */
function joinedLines(text: string): JoinedLines[] {
  const windows: JoinedLines[] = []
  for (const match of text.matchAll(/(?<=\d)[ \t-]*\n[ \t-]*(?=\d)/g)) {
    const cut = match.index ?? 0
    const lineStart = text.lastIndexOf('\n', cut - 1) + 1
    const next = cut + match[0].length
    const nextEnd = text.indexOf('\n', next)
    const head = text.slice(lineStart, cut)
    const tail = text.slice(next, nextEnd < 0 ? text.length : nextEnd)
    // Too few digits around the break for any number looked for here (a phone has 10 or more).
    const digits = (/[\d \t-]*$/.exec(head.slice(-40))?.[0] ?? '') + (/^[\d \t-]*/.exec(tail.slice(0, 40))?.[0] ?? '')
    if (digits.replace(/\D/g, '').length < 10) continue
    const complete = endsWithNumber(head)
    for (const glue of ['', ' ']) {
      const second = head.length + glue.length
      windows.push({
        text: head + glue + tail,
        join: head.length,
        second,
        at: (index) => (index < head.length ? lineStart + index : index < second ? cut : next + index - second),
        complete,
      })
    }
  }
  return windows
}

/**
 * Numbers cut by a line break (身份证号：4403051970\n03012210; narrow columns, OCR): looked for in the
 * two lines joined, and kept only where they cross the break. Stricter than on one line, because the
 * end of one line and the start of the next are more often two numbers than one. Nothing is joined
 * when the first line already ends with a whole number (…158 0198 1216\n2025年…); an ID needs its
 * label, or ID words before it and a valid checksum; a card its label or payment words, the checksum,
 * and its first group on the first line; a phone a phone label or a phone word right before it.
 */
function joinedNumbers(text: string, fields: Field[], out: Collector): void {
  for (const window of joinedLines(text)) {
    if (window.complete) continue
    const firstLineEnd = window.at(window.join - 1) + 1
    const scan = (regex: RegExp, handle: (from: number, value: string, field: Field | undefined, before: string, after: string) => void): void => {
      regex.lastIndex = 0
      for (const match of window.text.matchAll(regex)) {
        const from = match.index ?? 0
        if (from >= window.join || from + match[0].length <= window.second) continue
        const start = window.at(from)
        const end = window.at(from + match[0].length - 1) + 1
        const field = fieldAt(fields, start, firstLineEnd)
        if (backgroundNear(text, start, field)) continue
        handle(from, match[0], field, text.slice(Math.max(0, start - 12), start), text.slice(end, end + 12))
      }
    }
    const add = (from: number, to: number, category: PiiCategory, certainty: Certainty, reason: CandidateReason, label?: string): void => {
      if (from < window.join && to > window.second) out.add(window.at(from), window.at(to - 1) + 1, category, certainty, reason, { label })
    }
    const phoneContext = (field: Field | undefined, before: string): boolean => Boolean(field && PHONE_LABEL.test(field.label)) || PHONE_RIGHT_BEFORE.test(before)

    scan(ID_SHAPE, (from, value, field, before) => {
      const label = field?.label
      if (label && (ID_LABEL.test(label) || PATIENT_NAME.test(label))) add(from, from + value.length, 'id_number', 'sure', 'id_under_label', label)
      else if (ID_CONTEXT.test(before) && cnIdChecksum(value) && ID_REGION.test(value)) add(from, from + value.length, 'id_number', 'sure', 'id_checksum', label)
    })
    scan(ID_RUN, (from, value, field, before) => {
      const label = field?.label
      for (const id of idsInRun(value)) {
        if (label && ID_LABEL.test(label)) add(from + id.start, from + id.end, 'id_number', 'sure', 'id_under_label', label)
        else if (ID_CONTEXT.test(before) && cnIdChecksum(id.compact)) add(from + id.start, from + id.end, 'id_number', 'sure', 'id_checksum', label)
      }
    })
    scan(LONG_DIGITS, (from, value, field, before, after) => {
      const underLabel = Boolean(field && BANK_LABEL.test(field.label))
      if ((!underLabel && !CARD_CONTEXT.test(before) && !CARD_AFTER.test(after)) || DATE_IN_RUN.test(value)) return
      const card = cardInGroups(value, true)
      if (card) {
        add(from + card.start, from + card.end, 'bank_card', underLabel ? 'sure' : 'unsure', underLabel ? 'bank_card_under_label' : 'bank_card_luhn', field?.label)
      }
    })
    scan(MOBILE, (from, value, field, before) => {
      if (phoneContext(field, before)) add(from, from + value.length, 'phone', 'sure', 'mobile_phone', field?.label)
    })
    for (const regex of [LANDLINE_86, LANDLINE]) {
      scan(regex, (from, value, field, before) => {
        if (!phoneContext(field, before)) return
        add(from, from + value.length, 'phone', field && PHONE_LABEL.test(field.label) ? 'sure' : 'unsure', 'landline_phone', field?.label)
      })
    }
  }
}

/** Whether `head` ends with a whole phone number, ID or card, so the next line starts something else. */
function endsWithNumber(head: string): boolean {
  const endsWith = (regex: RegExp, whole: (value: string) => boolean): boolean => {
    regex.lastIndex = 0
    for (const match of head.matchAll(regex)) {
      if ((match.index ?? 0) + match[0].length === head.length && whole(match[0])) return true
    }
    return false
  }
  return endsWith(MOBILE, () => true) || endsWith(LANDLINE, () => true) || endsWith(LANDLINE_86, () => true)
    || endsWith(ID_SHAPE, cnIdChecksum)
    || endsWith(ID_RUN, (value) => idsInRun(value).some((id) => id.end === value.length && cnIdChecksum(id.compact)))
    || endsWith(LONG_DIGITS, (value) => cardInGroups(value)?.end === value.length)
}

function groupsLookLikeCard(sizes: number[]): boolean {
  return sizes.length === 1 || sizes.slice(0, -1).every((size) => size === 4)
}

/** A number printed like a card: solid, or in groups of four with a shorter last group. */
function cardShaped(value: string): boolean {
  return groupsLookLikeCard([...value.matchAll(/\d+/g)].map((match) => match[0].length))
}

/**
 * Whole digit groups that make a card: 16 to 19 digits passing the checksum,
 * printed solid or in groups of four (the last group may be shorter, as in
 * 19-digit cards). Of those, the longest wins, so a card never keeps its last
 * digits visible; at worst a 3-digit amount right after it is replaced too.
 * With `fromFirst`, only windows from the first group count.
 */
function cardInGroups(value: string, fromFirst = false): { start: number; end: number } | null {
  const groups = [...value.matchAll(/\d+/g)].map((match) => ({ start: match.index ?? 0, digits: match[0] }))
  let best: { start: number; end: number; length: number } | null = null
  for (let first = 0; first < (fromFirst ? Math.min(1, groups.length) : groups.length); first++) {
    let digits = ''
    for (let last = first; last < groups.length; last++) {
      digits += groups[last].digits
      if (digits.length > 19) break
      if (digits.length < 16 || !luhnValid(digits)) continue
      const sizes = groups.slice(first, last + 1).map((group) => group.digits.length)
      // Equal length: the later window wins, so a stray group in front never leaves the card's end visible.
      if (!groupsLookLikeCard(sizes) || (best && best.length > digits.length)) continue
      best = { start: groups[first].start, end: groups[last].start + groups[last].digits.length, length: digits.length }
    }
  }
  return best && { start: best.start, end: best.end }
}

function freeTextNames(text: string, fields: Field[], out: Collector): void {
  FREE_TEXT_NAME.lastIndex = 0
  for (const match of text.matchAll(FREE_TEXT_NAME)) {
    const name = match[2]
    if (NOT_A_NAME.test(name)) continue
    const start = (match.index ?? 0) + match[0].length - name.length
    const end = start + name.length
    if (fieldAt(fields, start, end)) continue
    const family = match[1] === '家属' || match[1] === '联系人'
    out.add(start, end, 'name', 'unsure', family ? 'family_label' : 'name_label', { role: family ? 'family' : 'patient' })
  }
}

export function detectRules(doc: SourceDocument): DraftCandidate[] {
  const all: DraftCandidate[] = []
  for (const page of doc.pages) {
    const fields = parseFields(page.text)
    const out = new Collector(doc, page.page)
    labelledFields(page.text, fields, out)
    narrativeAddresses(page.text, out)
    structuredValues(page.text, fields, out)
    freeTextNames(page.text, fields, out)
    all.push(...out.items)
  }
  return all
}

export function ruleDetector(): Detector {
  return { id: 'rules', detect: detectRules }
}
