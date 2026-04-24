/**
 * CSV export helpers
 * Browser-side download — no server round trip needed.
 */

type CsvValue = string | number | boolean | null | undefined

export interface CsvColumn<Row> {
  header: string
  accessor: (row: Row) => CsvValue
}

function escapeCell(v: CsvValue): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Quote if the cell contains delimiter, quote, or newline
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv<Row>(rows: Row[], columns: CsvColumn<Row>[]): string {
  const lines: string[] = []
  lines.push(columns.map(c => escapeCell(c.header)).join(','))
  for (const row of rows) {
    lines.push(columns.map(c => escapeCell(c.accessor(row))).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
