import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScan } from '../context/ScanContext'
import { TASKS, type TaskId } from '../tasks'

export interface PickedFile {
  path: string
  name: string
  size: number
}

/**
 * Start a task on one or more files. Layout moves to the scanning page once the
 * scan has started; this hook covers a scan that fails before it starts (for
 * example an unreadable file), so the error is still shown. Navigating first
 * would let ScanningPage see the idle state and bounce back to the home page.
 */
export function useTaskStarter(): (task: TaskId, files: PickedFile[]) => void {
  const navigate = useNavigate()
  const { runSeq, errorSeq, startScan, startBatchScan } = useScan()
  const latest = useRef({ runSeq, errorSeq })
  latest.current = { runSeq, errorSeq }
  const pending = useRef<{ runSeq: number; errorSeq: number } | null>(null)

  useEffect(() => {
    const started = pending.current
    if (!started) return
    if (runSeq !== started.runSeq) pending.current = null
    else if (errorSeq !== started.errorSeq) {
      pending.current = null
      navigate('/scanning')
    }
  }, [runSeq, errorSeq, navigate])

  return useCallback((task: TaskId, files: PickedFile[]) => {
    if (files.length === 0) return
    pending.current = { ...latest.current }
    if (files.length > 1 && TASKS[task].allowsBatch) startBatchScan(files)
    else startScan(files[0].path)
  }, [startScan, startBatchScan])
}
