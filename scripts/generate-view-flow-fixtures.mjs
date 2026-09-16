import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../examples/view-flow/', import.meta.url))
mkdirSync(outputDirectory, { recursive: true })

const statuses = ['Backlog', 'Ready', 'In progress', 'Blocked', 'Review', 'Done']
const priorities = ['Low', 'Medium', 'High', 'Urgent']
const teams = ['Platform', 'Growth', 'Design', 'Data', 'Security', 'Support']
const regions = ['North America', 'Europe', 'Asia Pacific', 'Middle East', 'Latin America']
const industries = ['SaaS', 'Fintech', 'Retail', 'Healthcare', 'Media', 'Logistics']
const channels = ['Email', 'Chat', 'Phone', 'Web', 'Partner']
const products = ['Atlas', 'Beacon', 'Canvas', 'Delta', 'Echo', 'Forge', 'Helix', 'Ion']

const pad = (value, width = 3) => String(value).padStart(width, '0')
const date = (index, offset = 0) => {
  const value = new Date(Date.UTC(2026, 0, 1 + ((index * 3 + offset) % 330)))
  return value.toISOString().slice(0, 10)
}
const timestamp = (index) => `${date(index)}T${pad((index * 7) % 24, 2)}:${pad((index * 13) % 60, 2)}:00Z`
const money = (index, multiplier = 1) => Math.round((125 + ((index * 7919) % 24000)) * multiplier * 100) / 100
const writeJson = (filename, value) => writeFileSync(`${outputDirectory}/${filename}`, `${JSON.stringify(value, null, 2)}\n`)

const people = Array.from({ length: 30 }, (_, index) => ({
  id: `person-${pad(index + 1)}`,
  name: ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Katherine', 'Edsger', 'Radia', 'Barbara', 'Donald'][index % 10] + ` ${index + 1}`,
  email: `person${index + 1}@example.com`,
  team: teams[index % teams.length],
  active: index % 9 !== 0,
  location: { city: ['New York', 'London', 'Tel Aviv', 'Tokyo', 'Berlin', 'Toronto'][index % 6], region: regions[index % regions.length] },
  skills: [products[index % products.length], products[(index + 3) % products.length]],
}))

const workItems = Array.from({ length: 140 }, (_, index) => ({
  id: `WI-${pad(index + 1, 4)}`,
  title: `${['Build', 'Review', 'Design', 'Migrate', 'Test', 'Document'][index % 6]} ${products[index % products.length]} workflow ${index + 1}`,
  status: statuses[index % statuses.length],
  priority: priorities[(index * 3) % priorities.length],
  team: teams[index % teams.length],
  owner: people[index % people.length].name,
  ownerEmail: people[index % people.length].email,
  estimate: 1 + ((index * 5) % 21),
  progress: (index * 17) % 101,
  blocked: statuses[index % statuses.length] === 'Blocked',
  created: date(index, -20),
  due: date(index, 28),
  tags: [products[index % products.length], index % 2 ? 'Customer' : 'Internal', priorities[index % priorities.length]],
  links: { brief: `https://example.com/work/${index + 1}`, repository: `https://github.com/example/project-${(index % 12) + 1}` },
  notes: index % 11 === 0 ? null : `Acceptance notes for item ${index + 1}`,
}))

writeJson('01-object-root-operations.json', {
  $jsonviews: {
    version: 1,
    schema: {
      '$.workItems[*].status': { type: 'select', title: 'Status', options: statuses },
      '$.workItems[*].priority': { type: 'select', title: 'Priority', options: priorities },
      '$.workItems[*].team': { type: 'select', title: 'Team', options: teams },
      '$.workItems[*].ownerEmail': { type: 'email', title: 'Owner email' },
      '$.workItems[*].due': { type: 'date', title: 'Due date' },
      '$.workItems[*].blocked': { type: 'checkbox', title: 'Blocked' },
      '$.workItems[*].progress': { type: 'number', title: 'Progress', minimum: 0, maximum: 100 },
      '$.workItems[*].tags': { type: 'multi-select', title: 'Tags' },
    },
    views: [
      { id: 'all-work', name: 'All work', path: '$.workItems' },
      { id: 'work-board', name: 'Work board', path: '$.workItems', display: 'kanban', groupBy: '$.workItems[*].status' },
    ],
  },
  workspace: { name: 'Northstar Operations', planningCycle: '2026 H2', public: false },
  workItems,
  people,
  releases: Array.from({ length: 12 }, (_, index) => ({
    id: `release-${index + 1}`,
    name: `${products[index % products.length]} ${2026 + Math.floor(index / 4)}.${(index % 4) + 1}`,
    status: statuses[(index + 2) % statuses.length],
    targetDate: date(index, 60),
    itemIds: workItems.slice(index * 8, index * 8 + 12).map((item) => item.id),
  })),
})

const catalog = Array.from({ length: 48 }, (_, index) => ({
  sku: `SKU-${pad(index + 1, 4)}`,
  name: `${products[index % products.length]} ${['Starter', 'Pro', 'Team', 'Enterprise'][index % 4]}`,
  category: ['Software', 'Services', 'Hardware', 'Training'][index % 4],
  price: money(index, 0.12),
  cost: money(index, 0.045),
  active: index % 10 !== 0,
  attributes: { color: ['Slate', 'Blue', 'Green', 'Amber'][index % 4], seats: 1 + ((index * 5) % 100), edition: 2025 + (index % 3) },
}))
const customers = Array.from({ length: 70 }, (_, index) => ({
  id: `CUS-${pad(index + 1, 4)}`,
  company: `${['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark', 'Wayne', 'Wonka'][index % 7]} ${industries[index % industries.length]} ${index + 1}`,
  industry: industries[index % industries.length],
  region: regions[index % regions.length],
  tier: ['Free', 'Pro', 'Business', 'Enterprise'][index % 4],
  joined: date(index, -100),
  contacts: [people[index % people.length], people[(index + 7) % people.length]].map(({ id, name, email }) => ({ id, name, email })),
}))
const orders = Array.from({ length: 180 }, (_, index) => ({
  orderId: `ORD-${pad(index + 1, 5)}`,
  customerId: customers[index % customers.length].id,
  company: customers[index % customers.length].company,
  status: ['Draft', 'Pending', 'Paid', 'Packed', 'Shipped', 'Delivered', 'Refunded'][index % 7],
  channel: channels[index % channels.length],
  placedAt: timestamp(index),
  currency: ['USD', 'EUR', 'GBP', 'ILS', 'JPY'][index % 5],
  subtotal: money(index, 0.8),
  tax: money(index, 0.08),
  discount: index % 4 === 0 ? money(index, 0.03) : 0,
  expedited: index % 13 === 0,
  shippingAddress: { city: ['Austin', 'Paris', 'Manchester', 'Haifa', 'Osaka'][index % 5], country: ['US', 'FR', 'GB', 'IL', 'JP'][index % 5] },
  items: Array.from({ length: 1 + (index % 4) }, (_, itemIndex) => ({
    sku: catalog[(index + itemIndex * 7) % catalog.length].sku,
    quantity: 1 + ((index + itemIndex) % 5),
    unitPrice: catalog[(index + itemIndex * 7) % catalog.length].price,
  })),
}))
writeJson('02-object-root-commerce.json', {
  store: { name: 'Meridian Market', defaultCurrency: 'USD', regions, launched: '2024-05-10' },
  orders,
  customers,
  catalog,
  dailyMetrics: Array.from({ length: 90 }, (_, index) => ({ date: date(index), orders: 20 + ((index * 17) % 90), revenue: money(index, 7), conversionRate: ((index * 7) % 85) / 10 })),
})

const ticketsById = Object.fromEntries(Array.from({ length: 80 }, (_, index) => {
  const id = `TKT-${pad(index + 1, 4)}`
  return [id, {
    id,
    subject: `${['Login', 'Billing', 'Export', 'Performance', 'Permissions', 'Integration'][index % 6]} issue for account ${index + 1}`,
    status: ['New', 'Open', 'Waiting', 'Resolved'][index % 4],
    severity: priorities[index % priorities.length],
    account: customers[index % customers.length].company,
    requester: people[index % people.length].email,
    assignee: people[(index + 11) % people.length].name,
    createdAt: timestamp(index),
    firstResponseMinutes: index % 10 === 0 ? null : 3 + ((index * 19) % 240),
    satisfaction: index % 5 === 0 ? null : 1 + (index % 5),
    labels: [teams[index % teams.length], channels[index % channels.length]],
    latestMessage: { author: index % 2 ? 'customer' : 'agent', body: `Latest update for ${id}`, internal: index % 7 === 0 },
  }]
}))
writeJson('03-object-root-object-map.json', {
  queue: { name: 'Global support', timezone: 'UTC', slaHours: 24 },
  ticketsById,
  agentsByEmail: Object.fromEntries(people.slice(0, 18).map((person, index) => [person.email, { ...person, capacity: 3 + (index % 8), onCall: index % 6 === 0 }])),
})

writeJson('04-object-root-single-record.json', {
  id: 'ORG-0001',
  name: 'Lighthouse Analytics',
  website: 'https://example.com/lighthouse',
  primaryContact: people[0],
  plan: 'Enterprise',
  active: true,
  annualValue: 185000,
  renewalDate: '2027-03-15',
  health: { score: 82, trend: 'Up', lastReviewed: '2026-09-08' },
  products: ['Atlas', 'Beacon', 'Forge'],
  locations: regions.map((region, index) => ({ region, employees: 20 + index * 17, office: index % 2 === 0 })),
  notes: Array.from({ length: 35 }, (_, index) => ({ id: `note-${index + 1}`, date: date(index), author: people[index % people.length].name, text: `Account note ${index + 1}`, private: index % 8 === 0 })),
  invoices: Array.from({ length: 48 }, (_, index) => ({ number: `INV-${pad(index + 1, 4)}`, issued: date(index, -60), due: date(index, -30), amount: money(index, 2.3), paid: index % 7 !== 0 })),
})

writeJson('05-array-root-work-items.json', Array.from({ length: 220 }, (_, index) => ({
  id: `AR-${pad(index + 1, 4)}`,
  name: `${products[index % products.length]} initiative ${index + 1}`,
  status: statuses[index % statuses.length],
  priority: priorities[index % priorities.length],
  team: teams[index % teams.length],
  owner: people[index % people.length].name,
  ownerEmail: people[index % people.length].email,
  region: regions[index % regions.length],
  score: (index * 23) % 101,
  estimate: 1 + ((index * 7) % 34),
  budget: money(index, 4.5),
  active: index % 9 !== 0,
  startDate: date(index, -20),
  dueDate: date(index, 45),
  tags: [teams[index % teams.length], products[index % products.length]],
  customer: { id: customers[index % customers.length].id, name: customers[index % customers.length].company, tier: customers[index % customers.length].tier },
  links: { brief: `https://example.com/brief/${index + 1}`, dashboard: `https://example.com/dashboard/${index + 1}` },
  description: `A detailed description for array-root work item ${index + 1}.`,
})))

writeJson('06-array-root-edge-cases.json', Array.from({ length: 120 }, (_, index) => ({
  id: index + 1,
  label: index % 9 === 0 ? `Quoted \"record\" ${index + 1}` : `Record ${index + 1}`,
  category: index % 7 === 0 ? null : industries[index % industries.length],
  optionalOwner: index % 4 === 0 ? undefined : people[index % people.length].name,
  emptyText: index % 3 === 0 ? '' : `Value ${index}`,
  zeroOrNumber: index % 5 === 0 ? 0 : index * 1.25,
  enabled: index % 2 === 0,
  nullableBoolean: index % 6 === 0 ? null : index % 2 === 0,
  tags: index % 8 === 0 ? [] : [products[index % products.length], teams[index % teams.length]],
  measurements: [index, index + 0.5, null],
  nested: { level: index % 5, flag: index % 3 === 0, note: index % 10 === 0 ? null : `Nested ${index}` },
  longText: index % 12 === 0 ? `This intentionally long value checks wrapping and truncation behavior for record ${index + 1}. `.repeat(4) : `Short note ${index + 1}`,
  weirdKeyObject: { 'display name': `Display ${index + 1}`, 'cost.usd': money(index, 0.2) },
})))

writeJson('07-array-root-events.json', Array.from({ length: 400 }, (_, index) => ({
  eventId: `EVT-${pad(index + 1, 5)}`,
  occurredAt: timestamp(index),
  eventType: ['page_view', 'signup', 'trial_started', 'purchase', 'upgrade', 'cancelled'][index % 6],
  userId: `USR-${pad((index % 137) + 1, 4)}`,
  sessionId: `SES-${pad((index % 83) + 1, 4)}`,
  source: ['Direct', 'Google', 'LinkedIn', 'Partner', 'Newsletter'][index % 5],
  campaign: index % 4 === 0 ? null : `campaign-${(index % 12) + 1}`,
  country: ['US', 'GB', 'IL', 'DE', 'JP', 'BR', 'AU'][index % 7],
  device: ['Desktop', 'Mobile', 'Tablet'][index % 3],
  durationSeconds: (index * 37) % 900,
  value: index % 6 === 3 ? money(index, 0.5) : 0,
  converted: index % 6 === 3 || index % 6 === 4,
  experiment: { name: `onboarding-${(index % 3) + 1}`, variant: ['Control', 'A', 'B'][index % 3] },
  properties: { page: `/product/${products[index % products.length].toLowerCase()}`, referrer: index % 5 === 0 ? null : `https://example.com/ref/${index % 20}` },
})))

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
const writeCsv = (filename, headers, rows) => {
  const source = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  writeFileSync(`${outputDirectory}/${filename}`, source)
}

const salesHeaders = ['sale_id', 'order_date', 'company', 'contact_email', 'region', 'country', 'industry', 'channel', 'campaign', 'product', 'edition', 'sales_rep', 'status', 'quantity', 'unit_price', 'discount_pct', 'tax_pct', 'shipping', 'subtotal', 'total', 'currency', 'renewal', 'tags', 'notes']
writeCsv('08-csv-wide-sales-350x24.csv', salesHeaders, Array.from({ length: 350 }, (_, index) => {
  const unitPrice = money(index, 0.18)
  const quantity = 1 + ((index * 7) % 25)
  const discount = index % 5 === 0 ? 15 : index % 3 === 0 ? 5 : 0
  const tax = [0, 7, 17, 20][index % 4]
  const subtotal = Math.round(unitPrice * quantity * 100) / 100
  const total = Math.round((subtotal * (1 - discount / 100) * (1 + tax / 100) + (index % 4) * 12.5) * 100) / 100
  return [
    `SALE-${pad(index + 1, 5)}`, date(index), index % 17 === 0 ? `Acme, ${industries[index % industries.length]}` : customers[index % customers.length].company,
    people[index % people.length].email, regions[index % regions.length], ['US', 'GB', 'IL', 'DE', 'JP', 'BR'][index % 6], industries[index % industries.length], channels[index % channels.length],
    `FY26-${(index % 12) + 1}`, products[index % products.length], ['Starter', 'Pro', 'Team', 'Enterprise'][index % 4], people[(index + 5) % people.length].name,
    ['Prospecting', 'Qualified', 'Proposal', 'Won', 'Lost'][index % 5], quantity, unitPrice, discount, tax, (index % 4) * 12.5, subtotal, total,
    ['USD', 'EUR', 'GBP', 'ILS', 'JPY'][index % 5], date(index, 180), `${teams[index % teams.length]};${products[index % products.length]}`,
    index % 23 === 0 ? `Customer said \"send a revised quote\", follow up next week.` : `Sales note ${index + 1}`,
  ]
}))

const supportHeaders = ['ticket_id', 'created_at', 'updated_at', 'company', 'requester', 'requester_email', 'region', 'plan', 'channel', 'category', 'subcategory', 'status', 'priority', 'assignee', 'team', 'first_response_min', 'resolution_min', 'reopens', 'satisfaction', 'subject']
writeCsv('09-csv-wide-support-600x20.csv', supportHeaders, Array.from({ length: 600 }, (_, index) => [
  `CASE-${pad(index + 1, 6)}`, timestamp(index), timestamp(index + 2), customers[index % customers.length].company,
  people[index % people.length].name, people[index % people.length].email, regions[index % regions.length], ['Free', 'Pro', 'Business', 'Enterprise'][index % 4],
  channels[index % channels.length], ['Account', 'Billing', 'Data', 'Performance', 'Security', 'Integration'][index % 6],
  ['How-to', 'Bug', 'Request', 'Incident'][index % 4], ['New', 'Open', 'Waiting', 'Resolved', 'Closed'][index % 5], priorities[index % priorities.length],
  people[(index + 13) % people.length].name, teams[index % teams.length], index % 19 === 0 ? '' : 2 + ((index * 11) % 180),
  index % 5 < 2 ? '' : 30 + ((index * 47) % 4000), index % 7, index % 6 === 0 ? '' : 1 + (index % 5),
  index % 29 === 0 ? `Export includes commas, quotes \"and\" unusual values` : `${products[index % products.length]} ${['login', 'billing', 'export', 'latency'][index % 4]} question ${index + 1}`,
]))

console.log(`Generated view-flow fixtures in ${outputDirectory}`)
