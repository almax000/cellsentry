/**
 * Mock Sidecar Server for E2E Testing
 *
 * Lightweight HTTP server that mimics the Python sidecar's API.
 * Returns canned responses for all endpoints so Playwright tests
 * can run without the real backend or ML model.
 */

import http from 'http'
import { join } from 'path'

// ── State (mutable for test control) ───────────────────────────────────

let modelLoaded = true

// ── Fixture Data ───────────────────────────────────────────────────────

const FIXTURE_FILE = 'mixed_errors.xlsx'
const FIXTURE_PATH = join(__dirname, '..', '..', 'data', 'corpus', 'en', FIXTURE_FILE)

const MOCK_ISSUES = [
  {
    sheet_name: 'Sheet1',
    cell_address: 'B5',
    severity: 'high',
    rule_id: 'circular_ref',
    message: 'Circular reference detected: B5 references itself through B3',
    suggestion: 'Break the circular dependency by using an intermediate cell',
    confidence: 0.95,
    category: 'reference',
    layer: 'rule'
  },
  {
    sheet_name: 'Sheet1',
    cell_address: 'C10',
    severity: 'high',
    rule_id: 'function_spelling',
    message: 'Unknown function SUMF — did you mean SUM?',
    suggestion: 'Replace SUMF with SUM',
    confidence: 0.99,
    category: 'syntax',
    layer: 'rule'
  },
  {
    sheet_name: 'Sheet1',
    cell_address: 'D15',
    severity: 'medium',
    rule_id: 'inconsistent_formula',
    message: 'Formula pattern breaks at D15: expected SUM(B15:C15) but found hardcoded value 1500',
    suggestion: 'Replace hardcoded value with SUM(B15:C15) to match adjacent cells',
    confidence: 0.87,
    category: 'consistency',
    layer: 'rule'
  },
  {
    sheet_name: 'Sheet1',
    cell_address: 'E3',
    severity: 'medium',
    rule_id: 'type_mismatch',
    message: 'Cell E3 contains text "N/A" but column expects numeric values',
    suggestion: 'Use NA() function or 0 instead of text "N/A"',
    confidence: 0.82,
    category: 'data_type',
    layer: 'rule'
  },
  {
    sheet_name: 'Sheet1',
    cell_address: 'F8',
    severity: 'low',
    rule_id: 'date_ambiguity',
    message: 'Ambiguous date format: 01/02/2024 could be Jan 2 or Feb 1',
    suggestion: 'Use unambiguous format like 2024-01-02 or Jan 2, 2024',
    confidence: 0.75,
    category: 'format',
    layer: 'rule'
  },
  {
    sheet_name: 'Sheet1',
    cell_address: 'G20',
    severity: 'medium',
    rule_id: 'hardcoded_total',
    message: 'Hardcoded total 45000 may become stale if source values change',
    suggestion: 'Replace with =SUM(G2:G19)',
    confidence: 0.90,
    category: 'financial',
    layer: 'ai'
  },
  {
    sheet_name: 'Sheet2',
    cell_address: 'A5',
    severity: 'low',
    rule_id: 'external_ref',
    message: "External reference to '[Budget.xlsx]Sheet1'!A1 may break if file is moved",
    suggestion: 'Consider copying the value or using a named range',
    confidence: 0.70,
    category: 'reference',
    layer: 'ai'
  }
]

const MOCK_FILE_INFO = {
  success: true,
  exists: true,
  name: FIXTURE_FILE,
  fileName: FIXTURE_FILE,
  size: '24.5 KB',
  fileSize: 25088,
  sheets: [
    { name: 'Sheet1', rows: 25, columns: 8, cells: 200 },
    { name: 'Sheet2', rows: 10, columns: 5, cells: 50 }
  ],
  cellCount: 250,
  totalCells: 250
}

const MOCK_CELLS = {
  success: true,
  columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  rows: Array.from({ length: 20 }, (_, rowIdx) =>
    Array.from({ length: 8 }, (_, colIdx) => ({
      value: rowIdx === 0 ? `Header ${colIdx + 1}` : `${(rowIdx * 100 + colIdx * 10).toFixed(2)}`,
      formula: rowIdx > 0 && colIdx > 0 ? `=B${rowIdx}+${colIdx * 10}` : ''
    }))
  ),
  sheetName: 'Sheet1'
}

// ── Route Handlers ─────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
  })
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
) => Promise<void> | void

const routes: Record<string, RouteHandler> = {
  'GET /health': (_req, res) => {
    json(res, { status: 'ok', version: '2.0.0-mock', model_loaded: modelLoaded })
  },

  'GET /model/status': (_req, res) => {
    json(res, {
      loaded: modelLoaded,
      name: 'cellsentry-1.5b-v3-4bit-g32',
      size: '920MB',
      backend: 'mlx'
    })
  },

  'GET /model/check': (_req, res) => {
    json(res, { exists: true, type: 'mlx_fused' })
  },

  'POST /model/download': (_req, res) => {
    json(res, { success: true, status: 'already_exists' })
  },

  'POST /analyze': async (req, res) => {
    const body = await parseBody(req)
    let filePath = FIXTURE_PATH
    try {
      const parsed = JSON.parse(body)
      if (parsed.filePath) filePath = parsed.filePath
    } catch { /* use default */ }

    const fileName = filePath.split('/').pop() || FIXTURE_FILE

    const issues = MOCK_ISSUES

    const summary = {
      errors: issues.filter((i) => i.severity === 'high').length,
      warnings: issues.filter((i) => i.severity === 'medium').length,
      info: issues.filter((i) => i.severity === 'low').length,
      total: issues.length
    }

    json(res, {
      success: true,
      filePath,
      fileName,
      issues,
      total_issues: issues.length,
      summary,
      scannedAt: new Date().toISOString(),
      duration: 1.23
    })
  },

  'POST /file/info': async (req, res) => {
    const body = await parseBody(req)
    let fileName = FIXTURE_FILE
    try {
      const parsed = JSON.parse(body)
      if (parsed.filePath) fileName = parsed.filePath.split('/').pop() || FIXTURE_FILE
    } catch { /* use default */ }
    json(res, { ...MOCK_FILE_INFO, name: fileName, fileName })
  },

  'GET /file/cells': (_req, res, url) => {
    const sheet = url.searchParams.get('sheet') || 'Sheet1'
    json(res, { ...MOCK_CELLS, sheetName: sheet })
  },

  'POST /report/generate': async (req, res) => {
    const body = await parseBody(req)
    let fileName = 'report'
    try {
      const parsed = JSON.parse(body)
      if (parsed.fileName) fileName = parsed.fileName
    } catch { /* ignore */ }

    const html = `<!DOCTYPE html><html><head><title>CellSentry Report - ${fileName}</title></head>
<body><h1>CellSentry Audit Report</h1><p>File: ${fileName}</p>
<p>Issues found: ${MOCK_ISSUES.length}</p></body></html>`
    json(res, html)
  },

  'GET /folder/scan': (_req, res, url) => {
    const folderPath = url.searchParams.get('path') || '/tmp'
    json(res, {
      success: true,
      files: [
        { path: `${folderPath}/budget.xlsx`, name: 'budget.xlsx', size: 25088 },
        { path: `${folderPath}/report.xlsx`, name: 'report.xlsx', size: 18432 },
        { path: `${folderPath}/data.csv`, name: 'data.csv', size: 4096 }
      ],
      total: 3
    })
  },

  // ── Test Control Endpoints ──

  'POST /test/set-model-loaded': async (req, res) => {
    const body = await parseBody(req)
    try {
      const parsed = JSON.parse(body)
      modelLoaded = !!parsed.loaded
      json(res, { success: true, loaded: modelLoaded })
      return
    } catch { /* fall through */ }
    json(res, { success: false }, 400)
  },

  'POST /test/reset': (_req, res) => {
    modelLoaded = true
    json(res, { success: true })
  }
}

// ── Server ─────────────────────────────────────────────────────────────

export interface MockSidecar {
  port: number
  close: () => Promise<void>
}

export async function startMockSidecar(port = 0): Promise<MockSidecar> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`)
    const key = `${req.method} ${url.pathname}`

    const handler = routes[key]
    if (handler) {
      Promise.resolve(handler(req, res, url)).catch((err) => {
        console.error(`[mock-sidecar] Error in ${key}:`, err)
        json(res, { error: String(err) }, 500)
      })
    } else {
      json(res, { error: `Unknown route: ${key}` }, 404)
    }
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      const assignedPort = typeof addr === 'object' && addr ? addr.port : port
      console.log(`[mock-sidecar] Listening on port ${assignedPort}`)
      resolve({
        port: assignedPort,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          })
      })
    })
  })
}
