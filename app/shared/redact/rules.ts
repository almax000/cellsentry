/**
 * Rule detector for Chinese medical records. Most check-up reports are
 * "label：value" forms, so field labels carry most of the signal; number shapes
 * (ID checksum, mobile prefixes, Luhn) cover values outside labelled fields.
 * Staff names under explicit role labels are reviewable and replaced by
 * default. Hospitals, drugs and test results remain medical context.
 */
import type { Detector } from './detect'
import type { CandidateReason, Certainty, Decision, DraftCandidate, NameRole, PiiCategory, SourceDocument } from './types'
import { ADDRESS_QUOTES, balancedQuotes, cnIdChecksum, luhnValid, opensStraight } from './text'
import { dateAndTime, ESTATE_WORD, readsAsDate, readsAsSolidDate, readsAsYearMonth } from './values'

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
// Bare actions can hold statuses or treatment (审核：通过, 主治：药物治疗).
// Require a person/title, or an explicit name/signature suffix for those labels.
const DOCTOR_NAME = /(?:(?:医生|医师|(?:检查|检验|审核|评估|复核|报告|操作)[者人]|技师|护士)(?:姓名|签名|签字)?|(?:主检|主治|审核)(?:姓名|签名|签字))$/
// A bare 签名 or 签字 with no role in front: someone signed, usually the patient or family.
const SIGNATURE = /^(?:签名|签字|签署人)$/
const ADDRESS = /^(?:(?:家庭|现|户籍|通讯|联系|居住|常住)?(?:住址|地址|居住地)|户籍)$/
/** The kind of household a 户籍 field may hold instead of a place (农业户口, 非农业户口, 城镇居民, 集体户口). */
const HOUSEHOLD_KIND = /^(?:非?农业|城镇|农村|城市|集体|家庭|本地|外地|本市|外市|本省|外省)?(?:户口|户籍|人口|居民|户)$/
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
// The local number is solid or in two groups (021-4320-2031). Numbers from abroad (0065 9123 4567) read as one too.
const LANDLINE = /(?<!\d)(?:\(0\d{2,3}\)|0\d{2,3})(?:[ \t-]?\d{7,8}|[ \t-]\d{3,4}[ \t-]\d{4})(?!\d)/g
/**
 * A landline after +86, (+86) or 0086 drops the area code's 0: +86-21-83134703, +86 755 8312 3456.
 * Area codes are 10, 2x or three digits from 3 up, so a mobile (+86 139…) never reads as one; 400 and
 * 800 are service lines, not areas. A solid 0086… is more often a code than a phone.
 */
const LANDLINE_86 = /(?:\(\+86\)|(?<![\d+])\+86|(?<![\d+])0086(?=[ \t-]))[ \t-]{0,2}(?:\((?![48]00)(?:10|2\d|[3-9]\d{2})\)|(?![48]00)(?:10|2\d|[3-9]\d{2}))[ \t-]{0,2}\d{3,4}[ \t-]?\d{4}(?!\d)/g
/** A phone word right before a number, with at most a colon or spaces between (联系电话139\n12345678, 手机：). */
const PHONE_RIGHT_BEFORE = /(?:电话|手机|联系方式|座机|固话|(?<![A-Za-z])tel|phone|mobile)(?:号码|号)?[ \t:]*$/i
/** A phone word, then the start of a number (患者本人电话15346 962376, 电话 027-72 550495, 手机：+8 6…). */
const PHONE_WORD = /(?:电话|手机|联系方式|座机|固话|(?<![A-Za-z])(?:tel|phone|mobile)(?![A-Za-z]))(?:号码|号)?[为是]?[ \t]*:?[ \t]*(?=[+(\d])/gi
/**
 * Digit groups as OCR prints a phone number: spaces (two at most), tabs, dashes, middle dots, brackets and
 * a +, and line breaks. Sticky: set lastIndex.
 */
const PHONE_RUN = /[+(]{0,2}\d(?:(?:[ \t]{1,2}|[ \t]*[-()+\u00b7\u30fb\u2027]{1,2}[ \t]*|[ \t]*\n[ \t]*)?\d)*/y
/**
 * Area codes (without the 0) whose local numbers all have eight digits: 10 and 2x, and of the three-digit codes
 * these (zh.wikipedia 中国大陆固定电话号码, read 2026-10: 0532 青岛, 0755 深圳, 0731 长沙 …). Elsewhere seven or eight.
 */
const EIGHT_DIGIT_AREA = '(?:10|2\\d|311|37[179]|411|43[12]|451|51\\d|52[37]|53[12]|551|57[1345679]|59[15]|731|75[457]|760|769|791|851|871|898)'
/** Seven digits after such an area code: a number cut short, or one whose last digit is apart (0755 8312 345 6). */
const SEVEN_UNDER_EIGHT = new RegExp(`^(?:0|0086|86)${EIGHT_DIGIT_AREA}\\d{7}$`)
/** All the digits of a phone number: a mobile, or a landline with its area code (010, 02x, 0xxx), maybe after 86 or 0086. */
const WHOLE_PHONE = new RegExp(`^(?:(?:0086|86)?1[3-9]\\d{9}|(?:0|0086|86)(?:${EIGHT_DIGIT_AREA}\\d{8}|(?!${EIGHT_DIGIT_AREA})[3-9]\\d{2}\\d{7,8}))$`)
const MOBILE_DIGITS = /^(?:0086|86)?1[3-9]\d{9}$/
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
/** A word right before a number that names a card or an account, not just a payment (退至银行卡 6222…, 账号：6222…). */
const CARD_RIGHT_BEFORE = /(?:卡号?|账户|帐户|账号|帐号|银行|account|card)[ \t:(]{0,3}$/i
/** Words right after a number that make it a card (…5290(储蓄卡), …（中国农业银行）). */
const CARD_AFTER = /^[\s(]{0,2}[\u4e00-\u9fff]{0,6}(?:银行|卡|账户|信用社)/
/** A date inside a digit run (2025-08-14  134 …): such a run is a log line, not a card. */
const DATE_IN_RUN = /(?:19|20)\d{2}[ \t-]{1,2}(?:0?[1-9]|1[0-2])[ \t-]{1,2}(?:0?[1-9]|[12]\d|3[01])(?!\d)/
/** The same date in a phone's digit groups, from the start of a group: 0731-891948 8 6 holds no 1948-8-6. */
const DATE_IN_GROUPS = new RegExp(`(?<!\\d)${DATE_IN_RUN.source}`)
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
/** Words of a clause, not of an address, after a comma in running text (本月12号入院, 3号楼下摔倒). */
const CLAUSE_WORDS = /入院|出院|转院|摔|跌|撞/
/**
 * A place whose name starts with one of those words, where a place name may start (广州市天河区, 河南省周口市, 南山区科技园南路),
 * but not a clause that starts so and reaches a place word (周边乡镇, 周末回县城, 次日到市区, 天天在小区).
 */
const PLACE_LIKE_A_WORD = /(?:^|(?<=[省市区县镇乡道]))(?![天周科次][边围末天日内后前室一二三四五六七晨晚年月周气热亮刚未遭])[天周科次][\u4e00-\u9fff]{0,3}?(?:省|市|区|县|镇|乡|路|街|道|巷|园|城)/g

/** Whether a piece has words that make it part of the report, not of an address. */
function reportWords(piece: string): boolean {
  return NOT_ADDRESS_WORDS.test(piece.replace(PLACE_LIKE_A_WORD, ''))
}
/** A piece that starts with a place (无锡市…, 于洪区…), even when its first character also starts a clause. */
const PLACE_START = /^\s*[\u4e00-\u9fff]{1,4}(?:省|市|区|县|镇|乡)/
/** How the rest of an address ends: a number, a room or building, a street or an estate (皮下2层缝合 does not). */
const ADDRESS_ENDING = /(?:号|栋|幢|楼|单元|室|层|弄|\d|村|组|路|街|巷|道|苑|园|院|座|区|里|厦|寓|庭|府|城|湾|居|舍)$/
/** A street with no number yet (鼓楼区中山北路): the number may be on the line after. */
const STREET_END = /(?:路|街|巷|弄|道|村|组|胡同|号院)$/
/**
 * Words that start an address in running text: 家住江苏省南京市…，因…, 现住地为…, 居住在地处偏远的… The 现住 of 现住院 (in
 * hospital now), 现住址：or 现住地址：(labels) is not one; neither is a place with no street or district (家住农村, 住在市区).
 */
const LIVES_AT = /(?:(?:现住|现居|居住|家庭)地址[为是]|(?:现住|现居住|现居|家住|居住)地[为是]?(?![址点区方])|家住在|家住|现住于|现住在|现住|现居住于|现居住在|现居于|现居在|现居|居住于|居住在|住在|家庭住址为|家庭住址是|住址为|住址是)(?![址院处所否]|地址)[ \t]*:?[ \t]*/g
const NAMES_AN_ADDRESS = new RegExp(LIVES_AT.source)
/** An address in running text is never longer than this. */
const MAX_TEXT_ADDRESS = 80
/** Quotes around an address in running text, by the one that opens them. */
const QUOTE_CLOSE: Readonly<Record<string, string>> = { '“': '”', '「': '」', '『': '』', '"': '"' }
/** A named province, city, district, town, village or street: two characters or more, then the level. */
const PLACE_LEVEL = /[\u4e00-\u9fff]{2}(?:省|市|区|县|镇|乡|村|路|街|道|巷|弄)/g
const HOUSE_NUMBER = /\d[ \t]*(?:号|栋|幢|楼|单元|室)/
/** Where someone is staying, not where they live (住在本市第一人民医院, 住在…医院期间). */
const FACILITY = /医院|卫生院|卫生所|诊所|病房|病区|监护|养老院|宾馆|酒店|科$|中心$/
/** Finer than a district: a street, village or estate, or a house number. 家住上海市浦东新区 alone names no home. */
/** dd-mm-yyyy: a bare three-part number shaped like a date is no building, unit and room. */
const DATE_SHAPED = '(?!(?:0?[1-9]|[12]\\d|3[01])-(?:0?[1-9]|1[0-2])-(?:19|20)\\d{2}(?!\\d))'
const STREET_OR_HOUSE = new RegExp(`[\u4e00-\u9fff](?:路|街|巷|弄|道|村|组|胡同|小区|花园|新村|苑|大厦|公寓)|\\d[ \\t]*(?:号|栋|幢|楼|单元|室)|(?<!\\d)${DATE_SHAPED}\\d{1,3}-\\d{1,4}-\\d{1,5}(?!\\d)|${ESTATE_WORD}\\d{1,3}-\\d{1,4}-\\d{1,5}(?!\\d)`)
/** After a comma in running text, more of the address: a named place or a house number, not a new clause. */
const ADDRESS_PIECE = /^\s*(?:[\u4e00-\u9fff]{2,10}?(?:省|市|区|县|镇|乡|路|街|巷|弄|村|小区|花园|新村)|[\u4e00-\u9fff]{0,10}?\d[\d ]*(?:号|栋|幢|楼|单元|室))/
const NEW_CLAUSE = /^\s*(?:因|于|主诉|入院|就诊|自诉|自述|出现|伴|既往|来院|来诊|收入|收住|平素|否认|近|现|自|无|有|在|已|曾|务|从|退休|电话|手机|联系|性别|年龄|职业|婚姻|民族|当地|外院|发病|长期|社区医院|去|到|患者|患儿|家属|其[母父子女妻夫兄弟姐妹])/
/** A clause word that starts the name of a place or an estate instead (自来水厂宿舍, 无锡市, 有色金属公司宿舍, 近江小区). */
const CLAUSE_OR_PLACE = /^\s*[自无有现近][\u4e00-\u9fff]{0,6}?(?:市|区|县|镇|厂|宿舍|小区|公寓|花园|新村|家园|大院|家属院)/
/** An estate by its name, with no number after it (锦绣华庭, 电力局宿舍, 阳光公寓, 翠苑). */
const ESTATE_PIECE = new RegExp(`^[\u4e00-\u9fff]{1,10}${ESTATE_WORD}$`)
/** Building, unit and room with dashes, after an estate's name or in three parts (金色家园15-4-2003, 9-2-2204). */
const DASHED_HOUSE_PIECE = new RegExp(`^(?:[\u4e00-\u9fff]{0,10}${ESTATE_WORD}\\d{1,3}-\\d{1,4}(?:-\\d{1,5})?|${DATE_SHAPED}\\d{1,3}-\\d{1,4}-\\d{1,5})室?$`)
/** What may follow a bracket of address words: an estate and its building and room, or only those (3栋501室, 501房, 锦绣华庭3栋). */
const AFTER_BRACKET = new RegExp(`^(?=[\u4e00-\u9fff]*\\d|[\u4e00-\u9fff]+${ESTATE_WORD}$)(?:[\u4e00-\u9fff]{1,10}${ESTATE_WORD})?(?:\\d+(?:-\\d+)*(?:号楼|栋|幢|座|单元|层|楼|室|号|户|房))*(?:\\d+(?:-\\d+)*)?$`)
/** Words in front of an estate's name that make the piece a clause (夜班后睡宿舍, 今年搬进单位宿舍, 其女儿亦居此公寓, 平时住单位宿舍). */
const CLAUSE_BEFORE_ESTATE = /[在住是为有到去从于与睡宿搬迁入此亦曾已刚又还仍独婚租用返驻假]/
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
const CONTEXT_HEADER = /^(?:性别|年龄|民族|项目|检查项目|检验项目|结果|检查结果|检验结果|参考值|参考范围|参考区间|单位|结论|建议|备注|日期|检查日期|报告日期|科室)$/

function nameHeader(label: string): boolean {
  return PATIENT_NAME.test(label) || FAMILY_NAME.test(label) || SIGNATURE.test(label) || DOCTOR_NAME.test(label)
}

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
      const cellLabels = cells.map((cell) => normalizeLabel(cell.text))
      // Names and Chinese clinical values also have a header's shape. After a
      // person header, keep reading rows until another explicit header appears.
      const nameRow = header?.length === cells.length && header.some(nameHeader)
        && !cellLabels.some(nameHeader) && !cellLabels.some((label) => CONTEXT_HEADER.test(label))
      if (cells.every((cell) => HEADER_CELL.test(cell.text)) && !nameRow) {
        header = cellLabels
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
      // The patient in front of an address label is no part of it (患者户籍地址为「…」); other labels keep their words, and so
      // does 患者住址为, which running text reads past its quote marks.
      const written = normalizeLabel(match[1])
      const address = written.replace(/^(?:患者|病人|患儿|本人)(?=.)/, '')
      fields.push({ label: ADDRESS.test(address) && !/住址$/.test(address) ? address : written, valueStart, valueEnd: valueStart + match[2].length })
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

/** Finds on one page, in the order they were found. */
class Collector {
  readonly items: DraftCandidate[] = []
  /** The same finds by position. They never overlap, so this is the order of both start and end. */
  private readonly sorted: DraftCandidate[] = []
  constructor(private readonly doc: SourceDocument, private readonly page: number) {}

  /** The first find that ends after `start`. */
  private firstAfter(start: number): number {
    let low = 0
    let high = this.sorted.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (this.sorted[middle].end <= start) low = middle + 1
      else high = middle
    }
    return low
  }

  overlaps(start: number, end: number): boolean {
    const index = this.firstAfter(start)
    return index < this.sorted.length && this.sorted[index].start < end
  }

  /** Like add, but over finds that lie inside the span and that `drop` lets go. */
  addOver(start: number, end: number, category: PiiCategory, certainty: Certainty, reason: CandidateReason,
    extra: { label?: string }, drop: (item: DraftCandidate) => boolean): void {
    const first = this.firstAfter(start)
    let last = first
    while (last < this.sorted.length && this.sorted[last].start < end) last++
    const clashes = this.sorted.slice(first, last)
    if (!clashes.every((item) => start <= item.start && item.end <= end && drop(item))) return
    this.sorted.splice(first, last - first)
    for (const item of clashes) this.items.splice(this.items.indexOf(item), 1)
    this.add(start, end, category, certainty, reason, extra)
  }

  add(start: number, end: number, category: PiiCategory, certainty: Certainty, reason: CandidateReason,
    extra: { label?: string; role?: NameRole; suggestion?: Decision } = {}): void {
    if (end <= start || this.overlaps(start, end)) return
    const item: DraftCandidate = {
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
    }
    this.items.push(item)
    this.sorted.splice(this.firstAfter(start), 0, item)
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
  /** How much of `value` the first line holds. */
  first: number
  /** The page offset of an offset in `value`. */
  at(index: number): number
}

/**
 * The text an address may take, from `start`: up to `end`, and when that is the end of its line, on
 * through up to two more lines while each has no label and reads like the rest of an address (a narrow
 * column: 住址：…文三路100号2幢\n301室, …188号\n16-5-603). A short line that reads so only with the one
 * after it is taken with it where a second break cut a number or a word, so the first line looks cut too
 * (…单元2\n3\n01室, …56号东\n湖新村13号楼, …香港中路\n7\n80号); so is a blank line in the middle of a number
 * (…文三路62\n\n8号). Line breaks are left out of `value`; `first` is how much of it the first line holds.
 */
function addressText(text: string, start: number, end: number): AddressText {
  let value = text.slice(start, end)
  const pieces = [{ index: 0, page: start }]
  let cursor = end
  const take = (line: AddressLine): void => {
    value += text.slice(cursor, line.lineEnd).replace(/[ \t]+$/, '')
    pieces.push({ index: value.length, page: line.next })
    value += line.line
    cursor = line.next + line.line.length
  }
  // Up to two more lines: a long address in a narrow column can take three.
  for (let lines = 0; lines < 2; lines++) {
    const line = addressLine(text, cursor)
    if (!line) break
    // Pasted tables keep cells apart with tabs: the row below is another row, not the rest of a cell.
    if (lines === 0) {
      const before = text.slice(Math.max(0, start - 200), start)
      if ((before.slice(before.lastIndexOf('\n') + 1) + text.slice(start, line.lineEnd)).includes('\t')) break
    }
    const head = value + text.slice(cursor, line.lineEnd).replace(/[ \t]+$/, '')
    if (continuesAddress(head, line.words)) {
      take(line)
      if (line.stopped) break
      continue
    }
    const fragment = line.words.replace(/(?<=\d) +(?=\d)/g, '')
    if (lines > 0 || line.stopped || !/^[\u4e00-\u9fff\d#-]{0,8}$/.test(fragment)) break
    const after = addressLine(text, line.next + line.line.length)
    if (!after || FACILITY.test(line.words) || !looksCut(head, fragment, after.words) || !continuesAddress(head, line.words + after.words)) break
    take(line)
    take(after)
    break
  }
  return {
    value,
    first: end - start,
    at: (index) => {
      const piece = pieces.reduce((found, candidate) => (candidate.index <= index ? candidate : found))
      return piece.page + index - piece.index
    },
  }
}

/** A number that stops short: a street with digits but no 号 yet (…文三路62), or a unit with one or two digits (…1单元2). */
const NUMBER_STOPS_SHORT = /(?:路|街|巷|弄|道|胡同)\d{1,4}$|(?:号|栋|幢|楼|单元|层|座)\d{1,2}$/
const ENDS_IN_ESTATE = new RegExp(`${ESTATE_WORD}$`)

/**
 * Whether an address so far looks cut by a second line break, given the short line after it: a number that stops
 * short (…文三路62, …1单元2) when that line goes on with digits, a word broken off (…金色家, …1单), or a street or an
 * estate with no number yet where that line is digits (…香港中路\n7\n80号). A word line after a whole address or a
 * street (体检中心, 卫生院宿舍) is not.
 */
function looksCut(head: string, fragment: string, rest: string): boolean {
  if (NUMBER_STOPS_SHORT.test(head)) return fragment === '' || /^\d/.test(fragment)
  if (fragment === '') return false
  if (/^\d{1,4}$/.test(fragment) && (STREET_END.test(head) || ENDS_IN_ESTATE.test(head))) return true
  // After a whole place word or a comma, only more places are its rest (王庄\n乡李村), never a desk or a floor of the
  // hospital (…王庄乡\n体检中心\n2楼, …100号，\n收费处\n1楼).
  if (/(?:省|市|州|盟|旗|乡|镇|县|庄|寨|屯|堡|场|厂|[,;])$/.test(head)) return /[省市区县镇乡路街巷村组]/.test(fragment + rest)
  if (ADDRESS_ENDING.test(head)) return false
  // A word broken off makes an estate, a unit or a place word across the break (…金色家\n园, …1单\n元, …南京\n市), never a
  // desk, a queue number or a name of the report (…（锦绣华庭）\n导诊台\n1楼, …3社\n收费处\n3号, …门外\n张伟\n2楼).
  const word = /[\u4e00-\u9fff]{0,3}$/.exec(head)?.[0] ?? ''
  return word !== '' && (/^[省市区县镇乡]/.test(fragment)
    || [...(word + fragment + rest.slice(0, 2)).matchAll(BROKEN_WORD)].some((match) => (match.index ?? 0) < word.length && (match.index ?? 0) + match[0].length > word.length))
}
/** What a word broken off by a line break makes again with the next line. */
const BROKEN_WORD = new RegExp(`${ESTATE_WORD}|单元|号楼|[省市区县镇乡路街巷村组]`, 'g')

/**
 * An address up to where a phone, an e-mail or an ID starts (ADDRESS_END). Lines joined to it never move
 * that end onto the first line: digits joined across a break (…5栋1003\n12号) are no phone, and then the
 * first line is all there is.
 */
function addressWhole(value: string, first: number): string {
  const cut = ADDRESS_END.exec(value)
  if (!cut) return value
  if (cut.index >= first) return value.slice(0, cut.index)
  const own = ADDRESS_END.exec(value.slice(0, first))
  return value.slice(0, own ? own.index : first)
}

interface AddressLine {
  /** The line break before the line, where its words start, and the words an address may take. */
  lineEnd: number
  next: number
  line: string
  words: string
  /** A label or a gap before other words ended the line early. */
  stopped: boolean
}

/** The next line after `cursor`, when nothing but spaces or a comma is left before the line break; null for a table row. */
function addressLine(text: string, cursor: number): AddressLine | null {
  // Looked for close by, so long lines stay fast.
  const rest = /^[ \t,、]*\n/.exec(text.slice(cursor, cursor + 40))
  if (!rest) return null
  const lineEnd = cursor + rest[0].length - 1
  let next = lineEnd + 1
  while (next < text.length && (text[next] === ' ' || text[next] === '\t')) next++
  let line = text.slice(next, next + 200).split('\n')[0]
  if (line.includes('\t')) return null
  // Up to a label or a gap before words later on the line (301室  工作单位：…, 301室电话：…); OCR gaps
  // between digits stay.
  const stop = /[ ]{2,}(?=\D)|[\u4e00-\u9fffA-Za-z()/]{1,16}[ ]*:/.exec(line)
  if (stop && stop[0].includes(':')) {
    const glued = GLUED_LABEL.exec(stop[0].replace(/[ ]*:$/, ''))
    if (glued && glued.index > 0) stop.index += glued.index
  }
  const stopped = Boolean(stop && stop.index > 0)
  if (stop && stop.index > 0) line = line.slice(0, stop.index)
  return { lineEnd, next, line, words: line.replace(/^[\s,、]+/, ''), stopped }
}

/**
 * Whether the words on the next line read as the rest of the address in `head`. The words before the next
 * comma decide, and they must all be address words: a house number, building or room early on (2幢301室,
 * 号，阳光花园…), the rest of a number with dashes (16-5-\n2804, 12-4\n-1504), or a place (无锡市梁溪区…
 * 100号, 鼓楼区中山北路). A sentence that names its own address (患者居住于…188号) starts anew.
 */
function continuesAddress(head: string, words: string): boolean {
  const place = PLACE_START.test(words)
  if (LINE_LABEL.test(words) || (NEW_CLAUSE.test(words) && !place)) return false
  // Quote marks on the line are read by the caller (…西湖区\n文三路100号”3栋501室, …100号\n“阳光花园”3栋501室).
  const lead = words.split(/[,;。]/)[0].replace(/(?<=\d) +(?=\d)/g, '').replace(ADDRESS_QUOTES, '')
  // A line with a building's letter only as the building and its room right after a closing quote mark (…100号”\nB座501室); elsewhere
  // such a line is a place in the hospital (…100号\nB区305\n心内科).
  if (/[A-Za-z]/.test(lead)) return /[”"]$/.test(head) && BUILDING_AND_ROOM.test(lead)
  if (lead.length > 40 || !/^[\u4e00-\u9fff\d#-]+$/.test(lead) || !ADDRESS_ENDING.test(lead) || reportWords(lead)
    || SENTENCE_START.test(lead) || NAMES_AN_ADDRESS.test(lead)) return false
  const dashes = HOUSE_DASHES.test(lead) || (/\d-$/.test(head) && /^\d{1,5}室?$/.test(lead))
    || (/\d-\d{1,4}$/.test(head) && /^(?:-\d{1,5}|\d{1,4})室?$/.test(lead))
  const marker = ADDRESS_CONTINUES.exec(lead)
  return Boolean((marker && (marker.index <= 14 || place)) || dashes || (place && STREET_END.test(lead)))
}

/** Quote marks that may end an address, and the one that only closes (" may open or close). 「」『』 never end one. */
const QUOTE_MARK = /[“”"]/
const CLOSING_QUOTE = /[”]/
/** A part of an address no finer than a district or a 街道, which its street may follow after a quote mark. */
const COARSE_END = /(?:省|市|区|县|镇|乡|街道|旗|盟|州)$/
/** A piece that starts with a place or a street by name (西湖区…, 留下路100号), not a clause with a date (本月3号收住我院). */
const STREET_START = /^[\u4e00-\u9fff]{1,10}?(?:省|市|区|县|镇|乡|街道|路|街|巷|弄|道|村|胡同|小区|花园|新村)/
/** A lane, a village group or a courtyard after its street or village, with what follows (…张杨路”1200弄3号401室, …建新村”5组18号). */
const HOUSE_AFTER_STREET = /^(?:\d+(?:-\d+)*(?:号楼|号院|栋|幢|座|单元|层|楼|室|号|户|房|弄|组))+(?:\d+(?:-\d+)*)?$/
/** Where the piece after a quote mark ends. */
const QUOTE_PIECE_END = /[,;。 ()“”"「」『』]/
/** Shops and markets, whose names end like a city (某某超市旁, 菜市场): never more of a home past a quote mark. */
const MARKET = /超市|[菜夜集门股]市|市场|商场/
/**
 * A building by its number or letter with its room, maybe with a unit and a floor between, or a room alone (3栋501室, B座501室,
 * 3号楼2单元501, A区3栋501室, 501室): more of a home also after a comma, a space or a line break. A building with no room
 * (…”，3栋, B区, A座2楼, a ward or a desk of the hospital) or a number with 号 alone (…”，10号开始发热, 3号床) is not one.
 */
const BUILDING_AND_ROOM = /^(?:[A-Za-z]区(?=\d))?(?:\d{1,4}(?:号楼|栋|幢|座|单元)|[A-Za-z]\d?(?:号楼|栋|幢|座|单元))+(?:\d{1,3}(?:层|楼))?\d{2,5}(?:室|房|户|号)?$|^\d{2,5}室$/
/**
 * Words that start the name of a place in the hospital, maybe after a floor or a list mark: a department, a ward, a desk, an exam
 * room or a bed (心内科门诊, 2楼收费处, 发热门诊, 西药房, 12床), not a field's label (科别：, 门诊号：, 检验项目：).
 */
const HOSPITAL_START = /^[“"「『(【\[\-\d.、FfL楼层 \t]*(?:[一二三四五六七八九十]楼)?(?:[\u4e00-\u9fff]{1,6}科(?![室别目研号])|[\u4e00-\u9fff]{0,4}?(?:门诊(?!号)|急诊|病区|病房|住院部|住院处|收费|挂号|药房|取药|导诊|护士站|护理站|候诊区|留观|注射室|雾化室|检验(?!项目)|化验|放射|超声|彩超|影像|心电图|内镜|透析|血透|导管室|抢救|监护|手术室|治疗室|诊室|输液|采血|抽血|采样|核酸|接种|康复|体检中心|ICU|PICU|CCU|B超|CT(?!号)|MRI)|\d{1,3}床)/i
/** A next line that starts with such a place (…”\n5号楼201\n收费处): the line before it is that place's building and room. */
const HOSPITAL_LINE = new RegExp(`^[ \\t,;]*\\n[ \\t\\n]*${HOSPITAL_START.source.slice(1)}`, 'i')
/**
 * What may follow a building and room that comes after a gap: the end of a clause or of the value, not more words (…”，3号楼201
 * 输液室输液), nor a place of the hospital after a comma or on the next line (…”，2号楼301，护士站).
 */
const settles = (after: string): boolean => /^(?:$|[,;。!?\n”"」』])/.test(after) && !hospitalNext(after)
/** A place of the hospital next: on the line after, or after a comma or a semicolon (…，护士站, …；心内科门诊). */
const hospitalNext = (after: string): boolean => HOSPITAL_LINE.test(after)
  || (/^[ \t]*[,;]/.test(after) && HOSPITAL_START.test(after.replace(/^[ \t]*[,;][ \t]*/, '')))
/**
 * Whether an address read on past the closing mark at `mark` did so on a path base never took: a building and room after a gap
 * (with `lineBreak`, a line break counts as one) or by its letter. Only there a place of the hospital after it takes them back.
 */
function pastByGap(text: string, mark: number, lineBreak: boolean): boolean {
  const after = text.slice(mark + 1, mark + 40)
  const next = after.replace(/^[\s,]+/, '').split(/[,;。 \t\n()“”"「」『』]/)[0]
  return BUILDING_AND_ROOM.test(next) && ((lineBreak ? /^[\s,]/ : /^[ \t,]/).test(after) || /[A-Za-z]/.test(next))
}
/** A home that already has its room (…3栋501室): no more numbers of it after a comma or a space. */
const HAS_ROOM = /\d[ \t]*室/
/** A home up to its building, unit or floor, maybe with digits of its room (…3栋, …5单元160). */
const UP_TO_BUILDING = /\d(?:号楼|栋|幢|座|单元|层|楼)\d{0,5}$/
/** A building, unit, floor or room word: what a piece starting with digits needs to be more of a home that has its building. */
const UNIT_WORD = /号楼|栋|幢|座|单元|室|层|楼|户|房/
/** Digits that OCR's spaces split before their unit or room word (…3栋 5 01室, …2 单元 501室, …3栋，12 01号). */
const OCR_SPLIT_UNIT = /^\s*\d{1,4}(?:(?: \d{1,4})+ ?| )(?:号楼|栋|幢|座|单元|室|层|楼|户|房|号)/
/** A street of the home after a part no finer than a district, which ends like an address and is no facility (西湖区文三路100号). */
const streetOf = (piece: string): boolean => STREET_START.test(piece) && STREET_OR_HOUSE.test(piece) && ADDRESS_ENDING.test(piece) && !FACILITY.test(piece)
/** Up to a part no finer than a district, with no house number yet (浙江省杭州市, …西湖区留下街道). */
const coarseHead = (head: string): boolean => COARSE_END.test(head) && !HOUSE_NUMBER.test(head)

/**
 * Where an address in running text may stop, shortest first: a full stop, a bracket or a quote, a 、, a
 * tab or a wider gap, a label (…12号  职业：退休, …12号性别：男), or a comma or space before words that are
 * not more of the address. A comma or space before more of it (江苏省南京市，鼓楼区…; OCR's 江苏省 南京市)
 * goes on, and so does a bracket of address words with more of the address after it, or a quote mark that
 * closes a quote with more of the home after it or opens one that names a place or an estate (家住“浙江省杭州市”
 * 西湖区…, 住址为“…12号”3栋501室, …西湖区“阳光花园”3栋501室); every such point is also a place to stop, for a
 * caller that finds the longer reading is no address. `quoted` is the mark that closes a quote the value starts inside;
 * inside it a 、 before more of the address (“…鼓楼区、中山路12号”) or a bracket right before its closing mark
 * (“…12号（锦绣华庭）”3栋501室) goes on too.
 */
function narrativeClauseEnds(value: string, quoted?: string): number[] {
  const ends: number[] = []
  let end = value.length
  const colon = value.indexOf(':')
  if (colon >= 0) {
    const run = /[\u4e00-\u9fffA-Za-z()/]{1,16}$/.exec(value.slice(0, colon).trimEnd())
    const glued = run ? GLUED_LABEL.exec(run[0]) : null
    end = run ? run.index + (glued && glued.index > 0 ? glued.index : 0) : colon
  }
  const addressWords = (piece: string): boolean => /^[\u4e00-\u9fff\d#-]+$/.test(piece) && !reportWords(piece) && !CLAUSE_WORDS.test(piece)
    && !NAMES_AN_ADDRESS.test(piece)
  // More of the address: a place, a house number or an estate, not a new clause, unless the clause word starts the
  // name of a place and a number follows (自来水厂宿舍3栋501室, 无锡市梁溪区中山路100号).
  const moreAddress = (rest: string, piece: string): boolean => {
    const clause = NEW_CLAUSE.test(rest) && !(CLAUSE_OR_PLACE.test(rest) && ADDRESS_ENDING.test(piece)
      && (DASHED_HOUSE_PIECE.test(piece) || HOUSE_NUMBER.test(piece)))
    // An estate alone, with no place or number, has no verb in it (平时住单位宿舍, 单位在国贸大厦 are clauses).
    const estate = ESTATE_PIECE.test(piece) && !CLAUSE_BEFORE_ESTATE.test(piece.replace(new RegExp(`${ESTATE_WORD}$`), ''))
    return !clause && (ADDRESS_PIECE.test(rest) || estate || DASHED_HOUSE_PIECE.test(piece)) && addressWords(piece)
  }
  let resume = 0
  // The mark that closes the quote the value starts inside, while it is open.
  let open = quoted
  // OCR's wider gaps between two digits (中路5  41号) are no gap.
  for (const match of value.slice(0, end).matchAll(/[。;!?()“"”、\t]|(?<!\d) {2,}| {2,}(?!\d)|[, ]/g)) {
    const at = match.index ?? 0
    if (at < resume) continue
    // Past the longest address there is nothing more to look for.
    if (at > MAX_TEXT_ADDRESS) return [...ends, at]
    if (QUOTE_MARK.test(match[0])) {
      const mark = match[0]
      if (open !== undefined ? CLOSING_QUOTE.test(mark) || mark === '"' : CLOSING_QUOTE.test(mark)) {
        // Right after the closing mark, more of the home: its building and room after a street or an estate (…12号”3栋501室,
        // …阳光花园”3-2-1102, …12号”B座501室), also after a comma or a space (…12号”，3栋501室). After a part no finer than a
        // district, also after a comma or a space, the street of the home, which ends like an address (浙江省杭州市”西湖区文三路
        // 100号, …西湖区” 文三路100号3栋501室), never a clause with a place in it (…”，宁波市鄞州区某服装厂工人, …”10号开始发热,
        // …”，萧山区瓜沥镇卫生院转诊). A home already finer than a district ends at the mark before anything but its building and
        // room after a comma (…葛衙庄村”，今晨在村口被狗咬伤).
        const rest = value.slice(at + 1, end)
        const apart = /^[ ,]/.test(rest)
        const after = rest.replace(/^[ ,]+/, '')
        const piece = after.split(QUOTE_PIECE_END)[0]
        // A building and room only after the quote the value starts in, whose opening mark the code then takes too; after a gap or
        // by a letter, only where its clause ends with it.
        const building = open !== undefined && BUILDING_AND_ROOM.test(piece)
          && ((!apart && !/[A-Za-z]/.test(piece)) || settles(after.slice(piece.length)))
        if ((!building && !moreAddress(after, piece)) || MARKET.test(piece)
          || !(coarseHead(value.slice(0, at)) ? streetOf(piece) : building || (!apart && (AFTER_BRACKET.test(piece) || HOUSE_AFTER_STREET.test(piece))))) return [...ends, at]
        ends.push(at)
        open = undefined
        // Right before a mark that closes an outer quote, the home ends with its room (他说「家住“…12号”B座501室」).
        const pieceEnd = at + 1 + rest.length - after.length + piece.length
        // A newly accepted room after a gap or by a letter ends this reading. The following clause can name a clinical action or
        // another place (…”，3栋501室，建立静脉通路 / 今年搬至宁波市), without being more of this home.
        if (building && (apart || /[A-Za-z]/.test(piece))) return [...ends, pieceEnd]
        if (/^[”」』]/.test(value.slice(pieceEnd))) return [...ends, pieceEnd]
        continue
      }
      // A quote opened inside the address is more of it where it names a place or an estate, before its building and room
      // (…西湖区“阳光花园”3栋501室, …顺德区“碧桂园”3栋501室) or at the end (…12号“锦绣华庭”), never a note, a clause, a shop
      // or a hospital (…100号“近人民医院”, “某某超市旁”, “具体门牌号不详”, …文三路“疫区”).
      const close = open === undefined ? value.slice(at + 1, end).search(/[”"]/) : -1
      if (close >= 0) {
        const inner = value.slice(at + 1, at + 1 + close)
        const rest = value.slice(at + 2 + close, end)
        const piece = rest.split(QUOTE_PIECE_END)[0]
        if (/^[\u4e00-\u9fff\d#-]{2,16}$/.test(inner) && !SENTENCE_START.test(inner) && !FACILITY.test(inner) && !MARKET.test(inner)
          && !CLAUSE_WORDS.test(inner) && !NAMES_AN_ADDRESS.test(inner) && (!NEW_CLAUSE.test(inner) || CLAUSE_OR_PLACE.test(inner))) {
          // Before its building and room the name is an estate's, whatever words it holds (「万科城」2幢1单元302室).
          if (AFTER_BRACKET.test(piece) && moreAddress(rest, piece)) {
            ends.push(at)
            resume = at + 2 + close
            continue
          }
          if (addressWords(inner) && (ESTATE_PIECE.test(inner) || (HOUSE_NUMBER.test(inner) && ADDRESS_ENDING.test(inner))) && !/^\d/.test(rest)) {
            return [...ends, at, at + 2 + close]
          }
        }
      }
      return [...ends, at]
    }
    // Right after a closing mark the quote branch let through, a building and room goes on, also after OCR's wider gap
    // (…12号” B座501室, …12号”  3栋501室). Inside the quote the value starts in, a 、 between a district and its street goes on
    // (“江苏省南京市鼓楼区、中山路12号”).
    const afterMark = /[”"][ ,]*$/.test(value.slice(Math.max(0, at - 4), at))
    const gap = / {2}/.test(match[0]) && afterMark
    const listed = match[0] === '、' && (open === '”' || open === '"')
    if (match[0] === ',' || match[0] === ' ' || gap || listed) {
      const rest = value.slice(at + 1)
      const head = value.slice(0, at)
      const piece = rest.replace(/^\s+/, '').split(listed ? /[,;。 ”"、]/ : /[,;。 ”]/)[0]
      // After a home's building or room, numbers go on only with a building, unit or room word, or as a room by its 号 (…5单元160 2室,
      // …3栋，501号房, …3栋，1201号), never a date or a count (…3栋501室，10号开始发热, …3栋，2 周前). Places and estates go on as
      // before (…3栋501室，阳光小区).
      const digits = /^\d/.test(piece)
      const more = listed ? coarseHead(head) && streetOf(piece)
        : afterMark && BUILDING_AND_ROOM.test(piece) && settles(rest.replace(/^\s+/, '').slice(piece.length)) ? true
        : gap ? false
        : digits && (HAS_ROOM.test(head) || UP_TO_BUILDING.test(head)) && !UNIT_WORD.test(piece) && !/^\d{1,5}号(?:院|\d{1,5})?$/.test(piece)
          && !DASHED_HOUSE_PIECE.test(piece) && !OCR_SPLIT_UNIT.test(rest) ? false
        : moreAddress(rest, piece)
      if (more) {
        ends.push(at)
        continue
      }
    }
    // A bracket ends the address unless more of it follows (…12号（电力局宿舍）3栋501室, or the closing mark of the quote it is
    // in, which then decides: “…12号（锦绣华庭）”3栋501室) or it names the estate (…12号（锦绣华庭）), and then not right before
    // a digit, which would read as part of the code.
    if (match[0] === '(') {
      const close = value.indexOf(')', at + 1)
      const inner = close > 0 && close < end ? value.slice(at + 1, close) : ''
      if (/^[\u4e00-\u9fff\d#-]{2,16}$/.test(inner) && addressWords(inner) && !SENTENCE_START.test(inner)) {
        const rest = value.slice(close + 1)
        const piece = rest.split(QUOTE_PIECE_END)[0]
        // Before the quote's own closing mark, an estate's name, or a numbered part of one that the home's building and room follow
        // (（翠苑一区）”，2405室), never a note (（独居）”，3栋501室, （疫区）”，3栋501室, （近人民医院）”).
        const own = (open === '”' || open === '"') && rest.startsWith(open)
        const home = own && (ESTATE_PIECE.test(inner)
          || (/(?:[一二三四五六七八九十\d]区|苑|园|城|里|坊|湾|阁)$/.test(inner) && BUILDING_AND_ROOM.test(rest.slice(1).replace(/^[ ,]+/, '').split(QUOTE_PIECE_END)[0])))
        if ((AFTER_BRACKET.test(piece) && moreAddress(rest, piece)) || home) {
          ends.push(at)
          resume = close + 1
          continue
        }
        if (ESTATE_PIECE.test(inner) && !/^\d/.test(rest)) return [...ends, at, close + 1]
      }
    }
    return [...ends, at]
  }
  return [...ends, end]
}

/**
 * A quoted address under its label read on past the closing mark when more of the address follows (，住址为“浙江省杭州市”
 * 西湖区文三路100号，因…; …12号”，3栋501室; …12号”\n3栋501室), as in running text and also onto the next lines: the address
 * up to where it ends there, and the page offset of each of its offsets. Null where it ends at the mark.
 */
function pastQuote(text: string, field: Field): { whole: string; at: (index: number) => number } | null {
  const close = QUOTE_CLOSE[text[field.valueStart - 1]]
  // 「」 hold the whole value, as they always did.
  if (!close || text[field.valueEnd] !== close || !QUOTE_MARK.test(close)) return null
  const near = text.slice(field.valueStart, field.valueStart + 200)
  const line = near.split('\n')[0]
  const { value, at, first } = addressText(text, field.valueStart, field.valueStart + line.length)
  const whole = addressWhole(value, first)
  const ends = narrativeClauseEnds(whole, close)
  const kept = whole.slice(0, ends[ends.length - 1]).replace(ADDRESS_TAIL, '')
  const mark = field.valueEnd - field.valueStart
  // Onto the line after the mark, only a building and room (…12号”\n3栋501室), or the street after a district (…西湖区”\n文三路100号),
  // never a lone number or a place in the hospital (…100号”\n12号\n入院日期：…, …100号”\n3号楼\n门诊).
  const next = kept.slice(first).split(QUOTE_PIECE_END)[0]
  if (line.slice(mark + 1).trim() === '' && kept.length > first
    && !(BUILDING_AND_ROOM.test(next) || (coarseHead(line.slice(0, mark)) && streetOf(next)))) return null
  // More than the closing mark after the quoted words, and never a building and room of a place in the hospital named after it
  // (…”\n3号楼201\n门诊, …”，5号楼201，收费处).
  if (pastByGap(text, field.valueEnd, true) && hospitalNext(text.slice(at(kept.length - 1) + 1))) return null
  return kept.length > mark + 1 ? { whole: kept, at } : null
}

/**
 * Where the building and room right after an address from `start` to `end` end (…12号3栋501室, …12号”3栋501室 after its “,
 * …12号”，3栋501室, …12号\nB座501室); `end` where none follow. A "My info" address that holds only the street takes them too.
 */
export function houseAfter(text: string, start: number, end: number): number {
  // Past a closing mark only when its opening one is right before the address, which the code then takes too; then also after a
  // comma, a space or a line break. Elsewhere only glued to the address: a room after a gap may be one of the hospital
  // (…100号 302室 心电图). A straight " before the address opens a quote only after an even number of them (诊断"肺炎"… closes one).
  const opens = text[start - 1] !== '"' || opensStraight(text, start - 1)
  const mark = QUOTE_MARK.test(text[end] ?? '') && QUOTE_CLOSE[text[start - 1]] === text[end] && opens ? 1 : 0
  const gap = (mark ? /^ ?,? ?(?:\n[ \t]*)?/ : /^,?/).exec(text.slice(end + mark, end + mark + 8))?.[0] ?? ''
  const from = end + mark + gap.length
  const piece = text.slice(from, from + 30).split(/[,;。 \t\n()“”"「」『』]/)[0]
  // Glued, a house that ends in its room (digits, a date, a floor or a 号 alone are something after it: …100号120 mmHg, …100号”10号，
  // 开始发热, …261号3楼); after a gap, a building and its room (…100号，21号楼6单元1402室), a room alone only past the quote's mark.
  const glued = gap === '' && (BUILDING_AND_ROOM.test(piece) || (/\d[室房户]$/.test(piece) && (AFTER_BRACKET.test(piece) || HOUSE_AFTER_STREET.test(piece))))
  const head = text.slice(start, end)
  // A home already naming its building never takes a second building after a gap (…3幢1单元501”\n6号楼302).
  const secondBuilding = (UP_TO_BUILDING.test(head) || /\d-\d{2,5}$/.test(head))
    && /^(?:[A-Za-z]区)?(?:\d{1,4}|[A-Za-z]\d?)(?:号楼|栋|幢|座)/.test(piece)
  const house = glued || (mark === 1 && gap !== '' && BUILDING_AND_ROOM.test(piece) && !secondBuilding)
  // Only a street address takes one: a home that has its room, or a district alone, is all "My info" holds of it. After a gap the
  // clause or the line ends with it, and the line after is no place of the hospital.
  const street = STREET_OR_HOUSE.test(head) && !HAS_ROOM.test(head)
  const after = text.slice(from + piece.length, from + piece.length + 30)
  const settled = gap === '' || settles(after)
  return house && street && settled ? from + piece.length : end
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
    // 住址为“…”: the address is what the quotes hold; with no closing quote on the line, or more of the address right
    // after it (家住「浙江省杭州市」西湖区…), what follows the quote mark.
    const close = QUOTE_CLOSE[text[start]]
    let quoted = -1
    if (close) {
      // Only up to the line's end (at most 200 characters): an unclosed quote never sends the search to the end of the text.
      const found = text.slice(start + 1, lineEnd + 1).indexOf(close)
      quoted = found >= 0 ? start + 1 + found : -1
      start += 1
      const after = text.slice(quoted + 1, quoted + 30).replace(/^[\s,，-]+/, '')
      const house = after.split(QUOTE_PIECE_END)[0]
      if (quoted >= 0 && quoted <= lineEnd && !ADDRESS_PIECE.test(after) && !(/\d/.test(house) && AFTER_BRACKET.test(house))
        && !BUILDING_AND_ROOM.test(house)) lineEnd = quoted
    }
    const { value, at, first } = addressText(text, start, lineEnd)
    const whole = addressWhole(value, first)
    // The longest reading that is a home; where what going on added is not (a clinic, a clause past the longest
    // address), the reading before it, down to where the first line alone stops, so going on never loses an address a
    // stop there would keep. A reading that runs into a value found under a label is no address either.
    const ends = narrativeClauseEnds(whole, close)
    if (first < whole.length) for (const end of narrativeClauseEnds(whole.slice(0, first), close)) if (!ends.includes(end)) ends.push(end)
    for (const end of ends.sort((a, b) => b - a)) {
      const kept = whole.slice(0, end).replace(ADDRESS_TAIL, '')
      const levels = placeLevels(kept)
      // An address starts with a named place (家住3楼，无疫区接触史 is no address).
      if (kept.length > MAX_TEXT_ADDRESS || kept.replace(/\s/g, '').length < 4 || FACILITY.test(kept) || !STREET_OR_HOUSE.test(kept)
        || placeLevels(kept.split(/[,;]/)[0]) === 0 || !(levels >= 2 || (levels >= 1 && HOUSE_NUMBER.test(kept)))) continue
      const certainty: Certainty = levels >= 2 && HOUSE_NUMBER.test(kept) && kept.length <= 60 ? 'sure' : 'unsure'
      // Past the closing mark, the opening one too (家住“浙江省杭州市”西湖区… becomes 家住地址1); after a gap never onto a building
      // and room of a place in the hospital named on the line after (…”，\n5号楼201\n收费处). A line break counts after a bracket
      // newly allowed inside the quote; without that bracket the baseline already took numeric rooms across line breaks.
      if ((close === '”' || close === '"') && quoted >= 0 && at(kept.length - 1) > quoted
        && pastByGap(text, quoted, text[quoted - 1] === ')') && hospitalNext(text.slice(at(kept.length - 1) + 1))) continue
      const span = balancedQuotes(text, start, at(kept.length - 1) + 1)
      if (out.overlaps(span.start, span.end)) continue
      out.add(span.start, span.end, 'address', certainty, 'address_in_text', { label: match[0].replace(/[\s:]/g, '') })
      break
    }
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
      else out.add(name.start, name.end, 'name', 'unsure', 'doctor_label', { label, role: 'doctor' })
    } else if (ADDRESS.test(label)) {
      // 户籍 alone may hold the kind of household, not a place (户籍：农业户口, 患者户籍为“城镇居民”).
      if (label === '户籍' && HOUSEHOLD_KIND.test(text.slice(field.valueStart, field.valueEnd).trim())) continue
      // An address ends where a phone number or a phone label starts (住址：…路88号 电话139…). Read on past a closing mark as in
      // running text, it ends with its clause there too.
      const past = pastQuote(text, field)
      const own = addressText(text, field.valueStart, field.valueEnd)
      const { whole, at } = past ?? { whole: addressWhole(own.value, own.first).replace(ADDRESS_TAIL, ''), at: own.at }
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
      // Read on past a closing mark, it is an address in running text, whose street address is looked for too; with the closing
      // mark it takes the opening one (住址为“…12号”3栋501室 becomes 住址为地址1).
      if (length < 4) continue
      const span = balancedQuotes(text, field.valueStart, at(kept.length - 1) + 1)
      out.add(span.start, span.end, 'address', certainty, past ? 'address_in_text' : 'address_label', { label })
    } else {
      // A number under its label, maybe cut by line breaks: the longest reading first.
      for (const end of [...labelledTails(text, field), field.valueEnd]) {
        const kind = labelledNumber(label, text.slice(field.valueStart, end))
        if (kind) {
          out.add(field.valueStart, end, kind.category, 'sure', kind.reason, { label })
          break
        }
      }
    }
  }
}

/**
 * Where a labelled number ends when line breaks cut it, longest first. Under an ID label the lines join
 * when they make an ID with a valid checksum (身份证号：110105\n19491231\n002X); under other labels only a
 * next line of digits that is no date does, as before. A record or insurance number joins the next line
 * only where it is evidently cut (evidentlyCut). A number that may be whole keeps the next line, also when
 * its row goes on there (住院号：ZY2024011501\n001  床位费：…): the leftover check asks about digits that may
 * be its rest instead, since a wrong join would hide them and keep the number's copies from matching.
 */
function labelledTails(text: string, field: Field): number[] {
  const kept: number[] = []
  const idLabel = ID_LABEL.test(field.label) && !insuranceLabel(field.label)
  const head = text.slice(field.valueStart, field.valueEnd)
  const tails = numberTails(text, field.valueEnd)
  tails.forEach((tail, index) => {
    const compact = text.slice(field.valueStart, tail.end).replace(/[\s-]/g, '')
    const rest = text.slice(tail.start, tail.end)
    const id = /^\d{17}[\dXx]$/.test(compact) && cnIdChecksum(compact)
    // Elsewhere than under an ID label, as 8eeeeed: one line of plain digits that is no date, making an ID of the right shape.
    if (id && (idLabel || (index === 0 && !tail.date && tail.gap !== 1 && /^\d(?:[ \t-]?\d)*[Xx]?$/.test(rest)
      && ID_REGION.test(compact) && ID_BODY.test(compact)))) kept.push(tail.end)
    else if (index === 0 && !tail.date && evidentlyCut(text, field, head, rest)) kept.push(tail.end)
    // One to three letters alone on the label's line (a word such as EDTA is a tube), a short line of digits, then the
    // rest (病历号：MZ\n20\n2401150): six digits or more, and never a phone or an ID of its own on the last line
    // (门诊号：MZ\n1\n13912345678) or a lab value (HB\n3\n120).
    // The short line must hold those digits alone: digits with words after them number a row (MZ\n001  床位费：…\n002  …).
    else if (index === 1 && !tail.date && /^[A-Za-z]{1,3}$/.test(head.trim()) && /^\d{1,4}$/.test(text.slice(tails[0].start, tails[0].end))
      && /^[ \t]*(?:\n|$)/.test(text.slice(tails[0].end))
      && /^\d+$/.test(rest) && (text.slice(tails[0].start, tails[0].end) + rest).length >= 6 && !WHOLE_PHONE.test(rest)
      && !(/^\d{17}[\dXx]$/.test(rest) && cnIdChecksum(rest))
      && evidentlyCut(text, field, head, text.slice(tails[0].start, tail.end))) kept.push(tail.end)
  })
  return kept.reverse()
}

/** Labels that name no kind of number (编号, ID号): a short value under them may be all there is. */
const GENERIC_NUMBER_LABEL = /^(?:编号|ID号)$/i
/** The label as written before a value's colon (体检编号, where the field keeps only 编号). */
const LABEL_BEFORE = /([\u4e00-\u9fffA-Za-z()/]{1,16})[ \t]*:[ \t]*$/

/** What a form prints for an empty field (病历号：NA), never the start of a number. */
const EMPTY_VALUE = /^(?:NA|N\/A|NULL|NONE|NIL)$/i

/**
 * Whether the next line holds the rest of a record or insurance number that a line break evidently cut: the
 * value on the label's line is letters only (样本号：TJ\n2021069572) or ends in a dash after its first characters
 * (门诊号：MZ-2024-\n0115001), or it is too short to be a number of its kind (letters and one or two digits count as
 * that too) and the next line reads as the rest of one (oneSplitNumber: 住院号：ZY2\n01902352, 住院号：ZY2\n025591  10,
 * 样本号：877\n087615). One or two digits are a sample's place on a rack (样本号：15\n1250  3600), and four or five may
 * be whole (样本号：1023\n240115): the leftover check asks about the next line instead. Never under 编号 alone, and
 * never a whole phone or ID of its own on the next line.
 */
function evidentlyCut(text: string, field: Field, head: string, rest: string): boolean {
  const compact = head.replace(/[\s-]/g, '')
  const digits = rest.replace(/\D/g, '')
  if (compact === '' || EMPTY_VALUE.test(compact) || digits.length < 3 || WHOLE_PHONE.test(digits)
    || (/^\d{17}[\dXx]$/.test(rest.replace(/[\s-]/g, '')) && cnIdChecksum(rest.replace(/[\s-]/g, '')))) return false
  const written = LABEL_BEFORE.exec(text.slice(Math.max(0, field.valueStart - 24), field.valueStart))?.[1] ?? field.label
  if (GENERIC_NUMBER_LABEL.test(normalizeLabel(written))) return false
  // A date, or a date and a time, is never the rest of a number (样本号：TJ\n20240115 0830, 标本号：A12\n240115).
  if (dateAndTime(rest) || rest.split(/[ \t]+/).some((group) => YYMMDD.test(group) || readsAsSolidDate(group))) return false
  // Nor a day alone, after a year and month on the label's line (住院号：2024-01-\n15); more digits are the number's rest (…-\n15 001).
  if (readsAsYearMonth(head) && /^(?:0?[1-9]|[12]\d|3[01])$/.test(rest.trim())) return false
  if (/[0-9A-Za-z][ \t]*-$/.test(head.trimEnd())) return true
  // Letters alone (MZ, EDTA) join only digits that read as the rest of a number, never a row of values (120  80, 1250).
  // A rest over two lines (MZ\n2\n0240116007) is read as one.
  if (/^[A-Za-z]{1,4}$/.test(compact)) return oneSplitNumber(rest.replace(/[ \t]*\n[ \t]*/g, ''))
  // Under a sample label one or two digits alone are its place on a rack (样本号：15); letters and one or two digits are no number yet (MZ20).
  const rack = /^\d{1,2}$/.test(compact) && /样本|标本|检验|条形?码|申请单/.test(written + field.label)
  const tooShort = (labelledNumber(field.label, head) === null && !rack) || /^[A-Za-z]{1,4}\d{1,2}$/.test(compact)
  return tooShort && oneSplitNumber(rest)
}

/** A date written yymmdd (240115), as stamps on lab sheets print it. */
const YYMMDD = /^[12]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/


/**
 * Whether a next line reads as the rest of a number, whole or split once by OCR: six digits or more, in one group or in
 * two where one is short (one or two digits) or long (five or more): 025591  10, 5903071 7. Two groups alike are a row
 * of values (1250  3600), and a date and a time is no rest of a number (20240115 0830).
 */
function oneSplitNumber(rest: string): boolean {
  if (!/^\d+(?:[ \t]{1,2}\d+)?$/.test(rest)) return false
  const groups = rest.split(/[ \t]+/)
  if (groups.join('').length < 6 || (groups.length === 2 && !groups.some((group) => group.length <= 2 || group.length >= 5))) return false
  return !dateAndTime(rest)
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

/**
 * The rest of a number on the next line: digits with single spaces, tabs or dashes (or OCR's two spaces)
 * between them, maybe after the dash the break left, up to the line's end, or a space and a label: the
 * rest of a row (35246  床号：12).
 */
const NUMBER_TAIL = /^ *(-?\d(?:(?:[ \t-]| {2})?\d)*[Xx]?)(?: *$|( +)(?=[\u4e00-\u9fffA-Za-z()/]{1,16} *:))/

interface NumberTail {
  /** Where the rest of the number starts and would end on that line. */
  start: number
  end: number
  /** The line goes on with a label after the number: a row that a line break wrapped. */
  wrapped: boolean
  /** The spaces between the number and that label. */
  gap: number
  /** This line or one before it is a date (20240115): only an ID's checksum can take it. */
  date: boolean
}

/**
 * Where a labelled number may end when line breaks cut it (身份证号：4403051970\n03012210, 联系电话：
 * 133470\n6655, 身份证号：110105\n19491231\n0021): the value ends its line with a digit, a letter or a dash, and
 * the next line starts with more digits; a line of nothing but digits may be followed by one more.
 * Callers decide whether the lines make one number.
 */
function numberTails(text: string, end: number): NumberTail[] {
  const tails: NumberTail[] = []
  if (!/[\dA-Za-z-]/.test(text[end - 1] ?? '')) return tails
  let cursor = end
  let date = false
  while (tails.length < 2) {
    const lineEnd = text.indexOf('\n', cursor)
    if (lineEnd < 0 || text.slice(cursor, lineEnd).trim() !== '') break
    const nextEnd = text.indexOf('\n', lineEnd + 1)
    const line = text.slice(lineEnd + 1, nextEnd < 0 ? text.length : nextEnd)
    const tail = NUMBER_TAIL.exec(line)
    if (!tail) break
    date ||= readsAsDate(tail[1]) || readsAsSolidDate(tail[1])
    const start = lineEnd + 1 + line.indexOf(tail[1])
    cursor = start + tail[1].length
    tails.push({ start, end: cursor, wrapped: tail[2] !== undefined, gap: tail[2]?.length ?? 0, date })
    if (tail[2] !== undefined) break
  }
  return tails
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
    // The next lines join only when they make a whole phone number (联系电话：133470\n6655); over two lines, a mobile.
    // With OCR's gap inside the next line, the whole line only when it makes a whole phone, else the line up to the gap
    // (TEL：(021)8\n6865318  7  床号：42).
    const tails: number[] = []
    // Where a tail ends its line: only such a tail is the rest of a landline read short (0571-8812345\n6, not …\n2  入院诊断：).
    const alone = new Set<number>()
    numberTails(text, field.valueEnd).forEach((tail, index) => {
      const digitsTo = (end: number): string => text.slice(field.valueStart, end).replace(/\D/g, '')
      const gap = text.slice(tail.start, tail.end).search(/ {2}/)
      if (tail.date) return
      if (!tail.wrapped) alone.add(tail.end)
      if (gap < 0 ? (index === 0 ? PHONE_DIGITS : MOBILE_DIGITS).test(digitsTo(tail.end)) : WHOLE_PHONE.test(digitsTo(tail.end))) tails.push(tail.end)
      else if (gap > 0 && index === 0 && PHONE_DIGITS.test(digitsTo(tail.start + gap))) tails.push(tail.start + gap)
    })
    for (const end of [...tails.reverse(), field.valueEnd]) {
      const value = text.slice(field.valueStart, end).replace(/[ \t]*\n[ \t]*/g, '')
      if (/^[+()\d][\d ()+-]{6,19}$/.test(value) && value.replace(/\D/g, '').length >= 7) {
        // Over a landline read short on the label's line where its area's numbers have eight digits (0571-8812345\n6).
        const whole = end > field.valueEnd && alone.has(end) && WHOLE_PHONE.test(value.replace(/\D/g, ''))
        out.addOver(field.valueStart, end, 'phone', 'unsure', 'phone_under_label', { label: field.label },
          (item) => whole && item.category === 'phone' && !WHOLE_PHONE.test(text.slice(item.start, item.end).replace(/\D/g, '')))
        break
      }
    }
  }
  phonesInOddGroups(text, fields, out)
  phoneDigitsLeft(text, fields, out)
}

/** Words after the phone word that make the field a call, a score, a fee or a time, not a number (电话随访评分, 电话咨询费, 电话访视). */
const PHONE_ACTIVITY = /随访|回访|访视|评估|评分|调查|问卷|次数|频次|费|金额|价|时间|日期|时长/
/** Words before it that make the number a service line or a desk of the hospital (预约电话, 护士站电话, 检验科电话). */
const SERVICE_PHONE = /预约|咨询|服务|投诉|急救|热线|值班|总机|传真|分机|总台|前台|护士站|病区|科|住院部|门诊部|办公室|药房|医院|中心/
/** The label as written right before a value, and its colon. */
const LABEL_WORDS = /([\u4e00-\u9fffA-Za-z()（）/]{1,20})[ \t]*:?[ \t]*$/
/** The phone word a label or the words before a number end with, and what comes after it. */
const LAST_PHONE_WORD = /^.*(?:电话|手机|联系方式|座机|固话|(?<![A-Za-z])(?:tel|phone|mobile)(?![A-Za-z]))(?:号码|号)?/i
/** Digits of a service line: 400 and 800 numbers, and short numbers such as 95120, 12320 and 10086. */
const SERVICE_DIGITS = /^(?:[48]00\d{7}|(?:95|96|12|10)\d{3,4})$/
/**
 * Digit groups on one line as a phone is printed: spaces, dashes, middle dots, and a bracket closing the area code, but no
 * bracket opened inside, which starts a note (88123456（3次）). Sticky: set lastIndex.
 */
const PHONE_RUN_ON_LINE = /[+(]{0,2}\d(?:(?:[ \t]{1,2}|[ \t]*[-)\u00b7\u30fb\u2027]{1,2}[ \t]*)?\d)*/y

/**
 * Digits after a phone label or a phone word that no pass took, five or more with the lines of digits right under
 * them: a number OCR or a line break cut so that no reading makes it whole (联系电话：136-11\n1761\n71 次/分,
 * 联系方式：13  35 4 39 34  36). What is on the label's line is worth a look and replaced unless the user keeps it;
 * the leftover check asks about the digits under it. A guess after a phone word, or under a label with fewer than seven
 * digits, is never looked for elsewhere (detect.ts). Never a count after
 * the number (… 3次), a date, a year and month, a time or hours, a value with a unit, a bed, a row of small numbers that
 * makes no phone, a call, a score, a fee, a service line or a desk of the hospital.
 */
function phoneDigitsLeft(text: string, fields: Field[], out: Collector): void {
  const labelled = new Map<number, Field>()
  for (const field of fields) if (PHONE_LABEL.test(field.label)) labelled.set(field.valueStart, field)
  const starts = new Set(labelled.keys())
  PHONE_WORD.lastIndex = 0
  for (const match of text.matchAll(PHONE_WORD)) starts.add((match.index ?? 0) + match[0].length)
  for (const start of starts) {
    const field = labelled.get(start)
    // The label as written right before the number, without a note in brackets (检验科电话：, a field that keeps only 电话;
    // 家属电话（科室转告）：), never the words of the field before it (主治医师：王强 联系电话：).
    const back = text.slice(Math.max(0, start - 24), start)
    const label = LABEL_WORDS.exec(back)
    const words = (label?.[1] ?? '').replace(/[（(][^）)]*[）)]/g, '')
    // And the words before it on its line since an earlier field's colon (杭州市第一人民医院  电话 …, 咨询心内科护士站，电话 …).
    const clause = back.slice(0, label?.index ?? back.length).slice(-14)
    const own = clause.slice(Math.max(clause.lastIndexOf('\n'), clause.lastIndexOf(':'), clause.lastIndexOf('。')) + 1).replace(/[（(][^）)]*[）)]/g, '')
    if (BACKGROUND.test(words + own) || SERVICE_PHONE.test(words + own) || PHONE_ACTIVITY.test(words.replace(LAST_PHONE_WORD, ''))) continue
    PHONE_RUN_ON_LINE.lastIndex = start
    const run = PHONE_RUN_ON_LINE.exec(text)
    if (!run) continue
    // Up to a number another pass took on the same line (0571 8812 345 13912345678).
    const groups = [...run[0].matchAll(/\d+/g)].map((group) => start + (group.index ?? 0) + group[0].length)
    while (groups.length > 0 && out.overlaps(start, groups[groups.length - 1])) groups.pop()
    if (groups.length === 0) continue
    let from = start
    if (text[start] === '(' && !run[0].includes(')')) from = start + 1
    let written = text.slice(from, groups[groups.length - 1])
    // A short last group before a word or a list mark counts something (88123456 3次, … 6床, … 2.).
    const count = /[ \t]+\d{1,2}$/.exec(written)
    if (count && /^[ \t]*(?:[\u4e00-\u9fff]|[.、])/.test(text.slice(from + written.length, from + written.length + 3))
      && written.slice(0, count.index).replace(/\D/g, '').length >= 5) written = written.slice(0, count.index)
    const end = from + written.length
    const digits = written.replace(/\D/g, '')
    const under = /^[ \t]*(?:\n|$)/.test(text.slice(end, end + 40)) ? numberTails(text, end) : []
    const all = digits + under.map((tail) => text.slice(tail.start, tail.end).replace(/\D/g, '')).join('')
    if (digits.length < (under.length > 0 ? 3 : 5) || all.length < 5 || SERVICE_DIGITS.test(digits)) continue
    const parts = written.match(/\d+/g) ?? []
    // A date written solid or with its year apart (电话 20240115, 电话 2024 0115 1234, 电话访视：2024-01); a phone's first group
    // may read as a year too (19  47 0 52 …), so the month must follow as a group of its own.
    const year = /^(?:19|20)\d{2}$/.test(parts[0] ?? '') && (readsAsSolidDate(digits.slice(0, 8)) || /^(?:0?[1-9]|1[0-2])$/.test(parts[1] ?? ''))
    const solid = readsAsSolidDate(digits.slice(0, 8)) && (parts[0] ?? '').length >= 8
    const hours = parts.length === 2 && parts.every((part) => /^(?:[01]\d|2[0-3])[0-5]\d$/.test(part))
    // Small groups make a phone only all together or after an area code (13  35 4 39 34  36, 0571 8 8 1 2 3 4 5), never a
    // row of scores (3 2 1 0 2).
    const small = parts.filter((part) => part.length <= 2).length >= 3 && !WHOLE_PHONE.test(digits) && !/^0\d{2,3}$/.test(parts[0] ?? '')
    // After it a unit, a slash of a value (124/70; a slash before another number lists phones: …345/13912345678), a colon,
    // what to call it for (电话 86021 预约), or a bed or a count (电话 33456 床, 33456 次).
    const after = text.slice(end, end + 16)
    const unit = /^[ \t]*(?:[A-Za-z%:℃°]|\.\d|\/(?![ \t]*[+(]?\d(?:[ -]?\d){4})|\)[ \t]*:)/.test(after) || /^[ \t]*(?:预约|咨询|查询|挂号|转|号?床|次|元|天|岁)/.test(after)
    if (DATE_IN_GROUPS.test(written) || readsAsDate(written) || dateAndTime(written) || year || solid || hours || small || unit || timeThenDate(parts)) continue
    out.add(from, end, 'phone', 'unsure', 'phone_under_label', { label: field?.label })
  }
}

/** Groups of digits that start with a time of day (0830, 08 30) and go on with a date written solid (20240116, 202401 16). */
function timeThenDate(groups: string[]): boolean {
  const time = (hours: string, minutes: string): boolean => Number(hours) <= 23 && Number(minutes) <= 59
  const lead = groups[0].length === 4 && time(groups[0].slice(0, 2), groups[0].slice(2)) ? 1
    : groups.length > 1 && groups[0].length <= 2 && groups[1].length === 2 && time(groups[0], groups[1]) ? 2 : 0
  return lead > 0 && readsAsSolidDate(groups.slice(lead).join('').slice(0, 8))
}

/**
 * Phone numbers that OCR printed in odd groups (15346 962376, 027-72 550495, +8 6-10-20796698, (057\n1)45
 * 831356), after a phone word or under a phone label: the longest run of whole groups whose digits are all
 * of a mobile or of a landline with its area code. Pieces of the number other passes took are taken over;
 * a whole phone never is. Line breaks are crossed only while the number is not whole yet, and then the
 * number takes all the digits on that line, never a date or a value with a unit, a slash, a colon or a
 * bracket after it (124/70, 1  ml, 06:37); over two breaks only a mobile. A time and a date (电话 08 30
 * 20240116) is no phone, nor a row of small numbers that starts small (18 25 52 4 53 40). A last group of one digit, or of
 * two after a gap of two spaces or before a word or a list mark, is a count (… 6床, … 7 次, \n1. 血常规) where a
 * shorter number is whole. With none, it is the number's last digit at a line's or a sentence's end (0532-835543 0 1\n:
 * 青岛 numbers have eight), and the number takes over pieces of itself; before a word it still counts something
 * (0755 8312 345 6床), and no reading is taken here. Eleven digits one to a box make a mobile.
 */
function phonesInOddGroups(text: string, fields: Field[], out: Collector): void {
  const labelled = new Map<number, Field>()
  for (const field of fields) if (PHONE_LABEL.test(field.label)) labelled.set(field.valueStart, field)
  const starts = new Set(labelled.keys())
  PHONE_WORD.lastIndex = 0
  for (const match of text.matchAll(PHONE_WORD)) starts.add((match.index ?? 0) + match[0].length)
  for (const start of starts) {
    const field = labelled.get(start)
    // Looked at close by, so a long line with many phone words stays fast.
    const near = text.slice(Math.max(0, start - 10), start)
    if ((field && BACKGROUND.test(field.label)) || BACKGROUND.test(near.slice(near.lastIndexOf('\n') + 1))) continue
    PHONE_RUN.lastIndex = 0
    const run = PHONE_RUN.exec(text.slice(start, start + 60))
    if (!run) continue
    const groups = [...run[0].matchAll(/\d+/g)].map((group) => ({ start: start + (group.index ?? 0), end: start + (group.index ?? 0) + group[0].length }))
    const partOfIt = (item: DraftCandidate): boolean => item.category === 'phone' && !WHOLE_PHONE.test(text.slice(item.start, item.end).replace(/\D/g, ''))
    // Digits printed one to a box (1 3 9 1 2 3 4 5 6 7 8, or with OCR's two spaces): eleven single digits that make a
    // mobile and end the line or the run.
    const boxed = /^1(?:[ \t]{1,2}\d){10}(?=[ \t]*(?:\n|$))/.exec(run[0])
    // Never scores after a follow-up call (电话随访评分：1 3 1 2 2 2 3 4 4 2 5).
    if (boxed && MOBILE_DIGITS.test(boxed[0].replace(/\D/g, '')) && !/随访|回访|评分|次数|频次/.test(near + (field?.label ?? ''))) {
      out.addOver(start, start + boxed[0].length, 'phone', 'sure', 'mobile_phone', { label: field?.label }, partOfIt)
      continue
    }
    let digits = ''
    const ends: Array<{ end: number; count: boolean }> = []
    let breaks = 0
    let afterBreak = -1
    let small = 0
    for (let g = 0; g < groups.length; g++) {
      const { start: groupStart, end } = groups[g]
      const gap = g > 0 ? text.slice(groups[g - 1].end, groupStart) : ''
      if (gap.includes('\n')) {
        if (WHOLE_PHONE.test(digits) || ++breaks > 2) break
        afterBreak = groupStart
      }
      digits += text.slice(groupStart, end)
      // A row of small numbers after a phone word starts small too (电话号码 18 25  52 4  53 40); a phone OCR cut into
      // pairs starts with three digits or more (134-00\n72-57 46).
      if (g > 0 && end - groupStart <= 2 && ++small > 3 && groups[0].end - groups[0].start <= 2) break
      if (digits.length > 15) break
      if (!WHOLE_PHONE.test(digits) || (breaks === 2 && !MOBILE_DIGITS.test(digits))) continue
      const next = groups[g + 1]
      if (breaks > 0 && ((next && !text.slice(end, next.start).includes('\n')) || /^[ \t]*(?:[A-Za-z%\/:)\].℃°、]|-\d)/.test(text.slice(end, end + 4)))) continue
      const onNextLine = afterBreak >= 0 ? text.slice(afterBreak, end) : ''
      if (DATE_IN_GROUPS.test(text.slice(start, end)) || readsAsDate(onNextLine) || readsAsSolidDate(onNextLine.replace(/\D/g, ''))
        || timeThenDate(groups.slice(0, g + 1).map((group) => text.slice(group.start, group.end)))) continue
      // A short last group that ends its line or sentence and makes a mobile is its end (0086 15561669\n6  90, …042\n1。), not a count.
      // A lone digit on a new line ends a sentence only (…042\n1。), never before a comma, where it may number a list item.
      const mobileEnd = MOBILE_DIGITS.test(digits)
        && (end - groupStart === 1 && gap.includes('\n') ? /^[ \t]*(?:\n|$|[。;；])/ : /^[ \t]*(?:\n|$|[。，,;；])/).test(text.slice(end, end + 3))
      // So does a short group alone on its line that the number needs to be whole (0571 88 12345\n6: 杭州 numbers have eight).
      const endsItsLine = gap.includes('\n') && end - groupStart <= 2 && /^[ \t]*(?:\n|$)/.test(text.slice(end, end + 3))
      const count = g > 0 && !mobileEnd && !endsItsLine && (end - groupStart === 1 || (end - groupStart === 2
        && (/ {2}/.test(gap) || (/\s/.test(gap) && /^[ \t]*(?:[\u4e00-\u9fff]|[.、])/.test(text.slice(end, end + 4))))))
      // Past a line break a count is never taken (…\n1761\n71 次/分), nor a lone digit before a word after seven digits where
      // numbers have eight (010-1234567 8次未接通, 0755 8312 345 6床): the seven stay as the other passes read them.
      if (count && (breaks > 0 || (end - groupStart === 1 && SEVEN_UNDER_EIGHT.test(digits.slice(0, -1))
        && /^[ \t]*[一-鿿]/.test(text.slice(end, end + 4))))) continue
      ends.push({ end, count })
    }
    const last = ends.length > 1 && ends[ends.length - 1].count ? ends[ends.length - 2] : ends[ends.length - 1]
    if (!last) continue
    const mobile = MOBILE_DIGITS.test(text.slice(start, last.end).replace(/\D/g, ''))
    out.addOver(start, last.end, 'phone', mobile || field ? 'sure' : 'unsure', mobile ? 'mobile_phone' : 'landline_phone', { label: field?.label },
      (item) => (!last.count || ends.length === 1) && partOfIt(item))
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
  /** Where the first line ends in `text`; the last starts at `second`. */
  join: number
  second: number
  /** The page offset of an offset in `text`. */
  at(index: number): number
  /** The first line already ends with a whole number, so the next line starts something else. */
  complete: boolean
  /** Three lines joined over a middle line of digits. */
  three: boolean
  /** Over three lines, the digits of the middle line. */
  middle: string
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
    const before = (/[\d \t-]*$/.exec(head.slice(-40))?.[0] ?? '').replace(/\D/g, '').length
    const enough = before + (/^[\d \t-]*/.exec(tail.slice(0, 40))?.[0] ?? '').replace(/\D/g, '').length >= 10
    const complete = endsWithNumber(head)
    for (const glue of enough ? ['', ' '] : []) {
      const second = head.length + glue.length
      windows.push({
        text: head + glue + tail,
        join: head.length,
        second,
        at: (index) => (index < head.length ? lineStart + index : index < second ? cut : next + index - second),
        complete,
        three: false,
        middle: '',
      })
    }
    // A line of nothing but digits may be the middle of a number that a third line ends (身份证 110105\n19491231\n0021):
    // the three lines joined, unless the first two already end with a whole number.
    // Trimmed by hand: a regex anchored at the end retries from every character of a long run of spaces.
    let trimmed = tail.length
    while (trimmed > 0 && ' \t-'.includes(tail[trimmed - 1])) trimmed--
    const middle = tail.slice(0, trimmed)
    const cut2 = next + middle.length
    const break2 = /^[\d \t-]+$/.test(middle) ? /^[ \t-]*\n[ \t-]*(?=\d)/.exec(text.slice(cut2, cut2 + 20)) : null
    if (!break2 || complete) continue
    const next2 = cut2 + break2[0].length
    const end2 = text.indexOf('\n', next2)
    const third = text.slice(next2, end2 < 0 ? text.length : end2)
    if (before + middle.replace(/\D/g, '').length + (/^[\d \t-]*/.exec(third.slice(0, 40))?.[0] ?? '').replace(/\D/g, '').length < 10) continue
    for (const glue of ['', ' ']) {
      if (endsWithNumber(head + glue + middle, head.length)) continue
      for (const glue2 of ['', ' ']) {
        const mid = head.length + glue.length
        const second = mid + middle.length + glue2.length
        windows.push({
          text: head + glue + middle + glue2 + third,
          join: head.length,
          second,
          at: (index) => (index < head.length ? lineStart + index : index < mid ? cut : index < mid + middle.length ? next + index - mid
            : index < second ? cut2 : next2 + index - second),
          complete,
          three: true,
          middle: middle.replace(/\D/g, ''),
        })
      }
    }
  }
  return windows
}

/**
 * Numbers cut by a line break (身份证号：4403051970\n03012210; narrow columns, OCR): looked for in the
 * two lines joined (or three, over a middle line of digits), and kept only where they cross every break. Stricter than on one line, because the
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
        // Over three lines a number starts where its digits start, not inside another one (1589-1805938\n11\n15,
        // 1589   1805938, (1589)1805938, 1385\u00b71782765), unless the digits before it are a whole phone of their own.
        if (window.three) {
          const lead = /(?:\d[ \t]*(?:[^\s\dA-Za-z\u4e00-\u9fff][ \t]*){0,4})+$/.exec(window.text.slice(Math.max(0, from - 40), from))
          if (lead && !WHOLE_PHONE.test(lead[0].replace(/\D/g, ''))) continue
        }
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

    // Over three lines without an ID label, a sample or record number, a date and a time make an ID's shape (姓名：张伟
    // 标本号 100231\n20250815\n0830, 病人ID 348546\n…): no ID right after a record word, born in the last three years,
    // or with a date of its own for the middle line (a solid date or yymmdd); that is a date stamp.
    const stamp = (compact: string, before: string): boolean => window.three
      && (Number(compact.slice(6, 10)) >= new Date().getFullYear() - 3
        || /(?:样本|标本|检验|检查|体检|条码|申请单|病历|住院|门诊|病案|流水|报告单|处方|序)编?号?[ \t:]*$|编号[ \t:]*$|No\.?[ \t:]*$/i.test(before)
        || readsAsSolidDate(window.middle) || YYMMDD.test(window.middle))
    // Under an ID label too, over three lines the checksum must hold: the last line may start another number (0571 8812 3456).
    const underIdLabel = (label: string | undefined, compact: string): boolean =>
      label !== undefined && ID_LABEL.test(label) && (!window.three || cnIdChecksum(compact))
    scan(ID_SHAPE, (from, value, field, before) => {
      const label = field?.label
      // Over three lines a patient's name field alone is not enough: the number must be one.
      const underName = label !== undefined && PATIENT_NAME.test(label)
        && (!window.three || (cnIdChecksum(value) && ID_REGION.test(value) && !stamp(value, before)))
      if (underIdLabel(label, value) || underName) add(from, from + value.length, 'id_number', 'sure', 'id_under_label', label)
      else if (!(label && ID_LABEL.test(label)) && ID_CONTEXT.test(before) && cnIdChecksum(value) && ID_REGION.test(value) && !stamp(value, before)) {
        add(from, from + value.length, 'id_number', 'sure', 'id_checksum', label)
      }
    })
    scan(ID_RUN, (from, value, field, before) => {
      const label = field?.label
      for (const id of idsInRun(value)) {
        if (underIdLabel(label, id.compact)) add(from + id.start, from + id.end, 'id_number', 'sure', 'id_under_label', label)
        else if (!(label && ID_LABEL.test(label)) && ID_CONTEXT.test(before) && cnIdChecksum(id.compact) && !stamp(id.compact, before)) {
          add(from + id.start, from + id.end, 'id_number', 'sure', 'id_checksum', label)
        }
      }
    })
    scan(LONG_DIGITS, (from, value, field, before, after) => {
      const underLabel = Boolean(field && BANK_LABEL.test(field.label))
      if ((!underLabel && !CARD_CONTEXT.test(before) && !CARD_AFTER.test(after)) || DATE_IN_RUN.test(value)) return
      const card = cardInGroups(value, true)
      // Over three lines without a label, rows of 4-digit values after a payment word pass the checksum one time in
      // ten: a word right before must name a card or an account, and the card must take every group (退至银行卡
      // 6222 62\n51 9\n739 9499).
      if (card && window.three && !underLabel && !(CARD_RIGHT_BEFORE.test(before) && card.end === value.length)) return
      // Nor ever where the card would end inside a number on the third line (…624\n021-78084224) or the middle line is a date.
      const third = /^\d*/.exec(window.text.slice(window.second))?.[0] ?? ''
      if (card && window.three && (/^(?:[ \t-]{0,2}|[ \t]*[\u00b7\u30fb\u2027][ \t]*)\d/.test(window.text.slice(from + card.end, from + card.end + 4))
        || readsAsSolidDate(window.middle) || YYMMDD.test(window.middle) || readsAsSolidDate(third.slice(0, 8)))) return
      if (card) {
        add(from + card.start, from + card.end, 'bank_card', underLabel ? 'sure' : 'unsure', underLabel ? 'bank_card_under_label' : 'bank_card_luhn', field?.label)
      }
    })
    scan(MOBILE, (from, value, field, before, after) => {
      // Over three lines a mobile ends its line, or a sentence on it: never in front of a unit, a value or a list mark
      // there (…\n991\n3) 心电图, …\n1761\n71 次/分).
      if (window.three && !/^[ \t]*(?:$|\n|[。;；])/.test(after)) return
      if (phoneContext(field, before)) add(from, from + value.length, 'phone', 'sure', 'mobile_phone', field?.label)
    })
    // Over three lines only a mobile: short lines of digits after a phone word make a landline too easily.
    for (const regex of window.three ? [] : [LANDLINE_86, LANDLINE]) {
      scan(regex, (from, value, field, before) => {
        if (!phoneContext(field, before)) return
        add(from, from + value.length, 'phone', field && PHONE_LABEL.test(field.label) ? 'sure' : 'unsure', 'landline_phone', field?.label)
      })
    }
  }
}

/**
 * Whether `head` ends with a whole phone number, ID or card, so the next line starts something else. With `from`,
 * only a number that starts before it counts, and no card: two lines that only end as a card, or a line that is a
 * number of its own, may still be the start of a number a third line ends.
 */
function endsWithNumber(head: string, from?: number): boolean {
  const endsWith = (regex: RegExp, whole: (value: string) => boolean): boolean => {
    regex.lastIndex = 0
    for (const match of head.matchAll(regex)) {
      const at = match.index ?? 0
      if (at + match[0].length === head.length && (from === undefined || at < from) && whole(match[0])) return true
    }
    return false
  }
  return endsWith(MOBILE, () => true) || endsWith(LANDLINE, () => true) || endsWith(LANDLINE_86, () => true)
    || endsWith(ID_SHAPE, cnIdChecksum)
    || endsWith(ID_RUN, (value) => idsInRun(value).some((id) => id.end === value.length && cnIdChecksum(id.compact)))
    || (from === undefined && endsWith(LONG_DIGITS, (value) => cardInGroups(value)?.end === value.length))
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
