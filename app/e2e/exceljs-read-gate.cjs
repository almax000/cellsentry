// Loaded only by Electron E2E through --require. When a test supplies the
// gate path, delay the second real .xlsx read (the analysis read after metadata).
const fs = require('fs')
const ExcelJS = require('exceljs')
const gatePath = process.env.CELLSENTRY_E2E_XLSX_GATE
if (gatePath) {
  const proto = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx)
  const original = proto.readFile
  let reads = 0
  proto.readFile = async function gatedReadFile(filePath) {
    reads += 1
    if (reads === 2) {
      await new Promise((resolve) => {
        const poll = () => fs.existsSync(gatePath) ? resolve() : setTimeout(poll, 10)
        poll()
      })
    }
    return original.call(this, filePath)
  }
}
