import { useLayoutEffect, useRef, type ReactNode } from 'react'

interface CellEditorDialogProps {
  label: string
  onCancel: () => void
  children: ReactNode
}

/** Keep amount forms readable without changing the width of their table column. */
function CellEditorDialog({ label, onCancel, children }: CellEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef(document.activeElement)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus.current instanceof HTMLElement && previousFocus.current.isConnected) previousFocus.current.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onCancel={event => { event.preventDefault(); onCancel() }}
      className="budget-cell-editor rounded-xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/40 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
    >
      <h2 className="mb-4 text-base font-semibold">{label}</h2>
      {children}
    </dialog>
  )
}

export default CellEditorDialog
