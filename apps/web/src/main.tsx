import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@script-it/json-views-react/styles.css'
import '@script-it/json-views-react/standalone.css'
import './site.css'
import { JsonViewsDeviceProvider } from '@script-it/json-views-react'
import { App } from './App.js'

// Device emulation is available only in the local development preview.
const previewDevice = import.meta.env.DEV ? new URLSearchParams(location.search).get('previewDevice') : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <JsonViewsDeviceProvider device={previewDevice === 'mobile' || previewDevice === 'desktop' ? previewDevice : undefined}>
      <App />
    </JsonViewsDeviceProvider>
  </StrictMode>,
)
