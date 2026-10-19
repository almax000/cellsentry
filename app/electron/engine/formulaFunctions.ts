/** Existing rule-engine vocabulary; intentionally not an exhaustive Excel catalog. */
export const VALID_FUNCTIONS: ReadonlySet<string> = new Set([
  // Math
  'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT',
  'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS',
  'COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'COUNTBLANK',
  'MAX', 'MIN', 'LARGE', 'SMALL',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'CEILING', 'FLOOR',
  'ABS', 'SQRT', 'POWER', 'MOD', 'INT', 'TRUNC',
  // Logic
  'IF', 'IFS', 'IFERROR', 'IFNA',
  'AND', 'OR', 'NOT', 'XOR',
  'TRUE', 'FALSE', 'SWITCH', 'CHOOSE',
  // Lookup
  'VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'LOOKUP',
  'INDEX', 'MATCH', 'OFFSET',
  'INDIRECT', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS',
  // Text
  'LEFT', 'RIGHT', 'MID', 'LEN',
  'UPPER', 'LOWER', 'PROPER', 'TRIM', 'CLEAN',
  'CONCATENATE', 'CONCAT', 'TEXTJOIN',
  'TEXT', 'VALUE', 'FIXED',
  'FIND', 'SEARCH', 'SUBSTITUTE', 'REPLACE',
  // Date
  'DATE', 'DATEVALUE', 'TODAY', 'NOW',
  'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'WEEKNUM',
  'HOUR', 'MINUTE', 'SECOND',
  'DATEDIF', 'EDATE', 'EOMONTH', 'NETWORKDAYS', 'WORKDAY',
  // Finance
  'PMT', 'PPMT', 'IPMT', 'CUMIPMT', 'CUMPRINC',
  'PV', 'FV', 'NPV', 'IRR', 'MIRR', 'XIRR', 'XNPV',
  'RATE', 'NPER', 'SLN', 'SYD', 'DDB', 'DB', 'VDB',
  'EFFECT', 'NOMINAL', 'RECEIVED', 'DISC', 'INTRATE',
  'ACCRINT', 'ACCRINTM', 'PRICE', 'YIELD',
  // Statistics
  'MEDIAN', 'MODE', 'STDEV', 'VAR',
  'PERCENTILE', 'QUARTILE', 'RANK',
  // Other
  'ISBLANK', 'ISERROR', 'ISNA', 'ISNUMBER', 'ISTEXT',
  'NA', 'ERROR.TYPE',
])

export const COMMON_MISSPELLINGS: ReadonlyMap<string, string> = new Map([
  ['SUMM', 'SUM'], ['SUME', 'SUM'], ['SUOM', 'SUM'],
  ['AVRG', 'AVERAGE'], ['AVERGE', 'AVERAGE'], ['AVRAGE', 'AVERAGE'],
  ['CONUT', 'COUNT'], ['COUNTT', 'COUNT'], ['CCOUNT', 'COUNT'],
  ['VLOKUP', 'VLOOKUP'], ['VLOOUP', 'VLOOKUP'], ['VLOOKPU', 'VLOOKUP'],
  ['HLOKUP', 'HLOOKUP'],
  ['IDEX', 'INDEX'],
  ['MACH', 'MATCH'], ['MACTH', 'MATCH'], ['MATCG', 'MATCH'],
  ['IFERR', 'IFERROR'], ['IFFEROR', 'IFERROR'],
  ['CONCATENTE', 'CONCATENATE'], ['CONCATINATE', 'CONCATENATE'],
  ['DATEDIFF', 'DATEDIF'],
  ['ROUNDOWN', 'ROUNDDOWN'],
  ['ROUDUP', 'ROUNDUP'],
])
