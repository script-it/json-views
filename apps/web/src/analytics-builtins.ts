import type { OpenDocument } from './document-model.js'

// Reviewed bundled identities only. Never match user filenames or restored IDs.
const catalog: Record<string, { id: string; views: string[] }> = {
  "About JSON Views.json": {
    "id": "json-views",
    "views": [
      "welcome",
      "articles"
    ]
  },
  "Task Management.json": {
    "id": "task-management",
    "views": [
      "task-board",
      "project-dashboard",
      "all-tasks",
      "open-tasks"
    ]
  },
  "Research Sprint.json": {
    "id": "research-sprint",
    "views": [
      "research-findings",
      "verification-board",
      "needs-verification"
    ]
  },
  "Decision Comparison.json": {
    "id": "decision-comparison",
    "views": [
      "option-comparison",
      "decision-board",
      "shortlist",
      "criteria"
    ]
  },
  "App Views/Gmail Message.json": {
    "id": "app-gmail",
    "views": [
      "gmail-message"
    ]
  },
  "App Views/HubSpot Contacts.json": {
    "id": "app-hubspot",
    "views": [
      "hubspot-contacts"
    ]
  },
  "App Views/Slack Channel.json": {
    "id": "app-slack",
    "views": [
      "slack-history"
    ]
  },
  "App Views/Notion Project.json": {
    "id": "app-notion",
    "views": [
      "notion-page"
    ]
  },
  "App Views/Stripe Payments.json": {
    "id": "app-stripe",
    "views": [
      "stripe-payments"
    ]
  },
  "App Views/LinkedIn Messages (Mock).json": {
    "id": "app-linkedin",
    "views": [
      "linkedin-message"
    ]
  },
  "Templates/Task Management.json": {
    "id": "task-management",
    "views": [
      "project-dashboard",
      "task-board",
      "all-tasks",
      "open-tasks"
    ]
  },
  "Templates/LLM Messages.json": {
    "id": "llm-messages",
    "views": [
      "conversation",
      "messages-by-role",
      "attachments",
      "tool-calls",
      "prompt-inputs",
      "model-outputs"
    ]
  },
  "Templates/Research Sprint.json": {
    "id": "research-sprint",
    "views": [
      "research-findings",
      "verification-board",
      "needs-verification"
    ]
  },
  "Templates/Decision Comparison.json": {
    "id": "decision-comparison",
    "views": [
      "option-comparison",
      "decision-board",
      "shortlist",
      "criteria"
    ]
  },
  "Templates/App Views/Gmail Message.json": {
    "id": "app-gmail",
    "views": [
      "gmail-message"
    ]
  },
  "Templates/App Views/HubSpot Contacts.json": {
    "id": "app-hubspot",
    "views": [
      "hubspot-contacts"
    ]
  },
  "Templates/App Views/Slack Channel.json": {
    "id": "app-slack",
    "views": [
      "slack-history"
    ]
  },
  "Templates/App Views/Notion Project.json": {
    "id": "app-notion",
    "views": [
      "notion-page"
    ]
  },
  "Templates/App Views/Stripe Payments.json": {
    "id": "app-stripe",
    "views": [
      "stripe-payments"
    ]
  },
  "Templates/App Views/LinkedIn Messages (Mock).json": {
    "id": "app-linkedin",
    "views": [
      "linkedin-message"
    ]
  }
}
const origins = new WeakMap<OpenDocument['controller'], { id: string; views: string[] }>()

export function registerAnalyticsBuiltin(document: OpenDocument, sourceFile: string): void {
  const entry = Object.hasOwn(catalog, sourceFile) ? catalog[sourceFile] : undefined
  if (entry) origins.set(document.controller, entry)
}

export function builtinAnalyticsProperties(document: OpenDocument): { template_id?: string } {
  const entry = origins.get(document.controller)
  return entry ? { template_id: entry.id } : {}
}

export function builtinViewAnalyticsProperties(document: OpenDocument, activeView: string): { template_id: string; view_id: string } | undefined {
  const entry = origins.get(document.controller)
  const view = activeView.startsWith('view:') ? activeView.slice(5) : activeView
  if (!entry || !['root', 'source', ...entry.views].includes(view)) return undefined
  return { template_id: entry.id, view_id: view }
}
