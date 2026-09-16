import { createContext, useContext, useRef } from 'react'

/** Compare the saved source, so a failed optimistic save can still be retried. */
export const EditBaseContext = createContext<string | undefined>(undefined)

export function useEditBaseChanged(): boolean {
  const source = useContext(EditBaseContext)
  const initial = useRef(source)
  return source !== initial.current
}
