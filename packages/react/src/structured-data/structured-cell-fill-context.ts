import { createContext } from 'react'

/**
 * True inside a data cell of the tabular view, whose `<td>` carries no
 * padding: the value frame supplies the cell padding itself, so its hover
 * wash covers the full cell face instead of an inset box around the text.
 */
export const StructuredCellFillContext = createContext(false)
