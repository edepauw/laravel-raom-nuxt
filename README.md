# laravel-raom-nuxt

**Laravel REST API Object Mapper** for Nuxt — an Active-Record–style client for backends built with [`lomkit/laravel-rest-api`](https://github.com/lomkit/laravel-rest-api).

Authored by **edepauw**.

Declare your API resources as decorated model classes, then read and mutate them with a typed, chainable query builder. The query builder maps directly onto lomkit's `search` / `mutate` / `actions` payloads, so you never hand-build `{ filters, includes, scopes }` objects or call `$fetch` against a resource endpoint yourself.

```ts
const [reports, pagination] = await Report.query()
  .where('status.slug', 'published')
  .include('creator')
  .orderBy('created_at', 'desc')
  .limit(25)
  .get()
```

---

## Table of contents

- [Why](#why)
- [Installation](#installation)
- [Setup](#setup)
- [Defining a model](#defining-a-model)
- [Reading data](#reading-data)
- [Accessing relations on an instance](#accessing-relations-on-an-instance)
- [Working with lists](#working-with-lists)
- [Creating and updating](#creating-and-updating)
- [Deleting](#deleting)
- [Custom actions](#custom-actions)
- [Resource metadata: `Model.details()`](#resource-metadata-modeldetails)
- [Identity map](#identity-map)
- [SSR and caching](#ssr-and-caching)
- [Anti-patterns](#anti-patterns)
- [Local development](#local-development)
- [Status and roadmap](#status-and-roadmap)

---

## Why

Traditional ORMs abstract a SQL database. This package applies the same idea to REST resources: models talk to an HTTP API instead of a DB. The transport changes (SQL → HTTP), but the developer model stays familiar:

- **The model is the single source of truth for a resource** — endpoint, fields, key, relations and pagination limits are declared once.
- **The query builder maps directly to lomkit's search payload** — `.where(...).include(...).withCount(...)` produces the exact shape the backend expects, with type-safety on field and relation names.
- **Mutations and relations are handled for you** — `attach` / `detach` / `sync` / `toggle`, nested `create`, and the `{ created, updated }` return shape are all driven through the model in a single round-trip.
- **An identity map keeps state consistent** — one primary key maps to one in-memory instance, so a change made on a detail page is visible in the list that rendered it.

---

## Installation

```bash
npx nuxt module add laravel-raom-nuxt
```

Or add it manually to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['laravel-raom-nuxt'],
})
```

---

## Setup

### 1. Enable decorators

The model layer is built on TC39 decorators. Enable them in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['laravel-raom-nuxt'],
  experimental: {
    decorators: true,
  },
})
```

Without this, `@Resource` / `@Field` / `@Key` silently fail to register and every model call breaks.

### 2. Provide a custom `fetch` (auth, base URL, error handling)

Every request the package makes — `search`, `mutate`, `delete`, `actions`, `details` — goes through a single `$fetch` instance. Provide it from a Nuxt plugin under `laravelRaom.fetch`. This is the **only** place you wire authentication, base URL, refresh-token logic or shared error handling.

```ts
// plugins/laravel-raom.ts
export default defineNuxtPlugin(() => {
  const { apiUrl } = useRuntimeConfig().public
  const { tryRefreshToken } = useAuthStore()

  const customFetch = $fetch.create({
    baseURL: `${apiUrl}/api`,
    onRequest: async ({ options }) => {
      options.headers.append('Authorization', `Bearer ${await tryRefreshToken()}`)
    },
  })

  return {
    provide: {
      laravelRaom: { fetch: customFetch },
    },
  }
})
```

If no custom fetch is provided, the package falls back to the global `$fetch`. Anything you would put in `$fetch` options (interceptors, retry, timeout, default headers) belongs here — never inside individual model calls.

### 3. Put models in your `models/` directory

The module auto-imports the `models/` directory of your app, so model classes are available everywhere without an explicit import.

---

## Defining a model

Models extend `Model` and use the decorators from `laravel-raom-nuxt/runtime`. Relations are declared as **instance property initializers** — no `@Relation` decorator is needed; relation builders self-register their metadata at bootstrap.

```ts
import {
  Model,
  Resource,
  Field,
  Key,
  HasMany,
  BelongsTo,
} from 'laravel-raom-nuxt/runtime'

@Resource('reports', { limits: [1, 10, 25, 50] })
export class Report extends Model {
  @Key()
  @Field()
  id!: number

  @Field()
  title!: string

  @Field()
  created_at!: string

  @Field()
  is_read?: boolean

  // Relations: lazy thunk `() => OtherModel`, then the backend relation name
  status = BelongsTo(() => Status, 'status')
  creator = BelongsTo(() => User, 'creator')
  subjects = HasMany(() => Subject, 'subjects')
}
```

### Decorator reference

| Decorator | Purpose |
| --- | --- |
| `@Resource(endpoint, { limits? })` | Marks the class as an API resource. `endpoint` matches lomkit's resource URI. `limits` mirrors the backend's allowed page sizes (default `[10, 25, 50]`) and is enforced by `.limit()`. |
| `@Key()` | Marks the primary key property. Required — almost always on `id`. |
| `@Field()` | Marks a property that maps to a backend column. Properties without `@Field()` will not round-trip (they are ignored on read and write). |

### Relation builders

| Builder | Cardinality | Resolved value |
| --- | --- | --- |
| `BelongsTo(() => T, name, options?)` | single | `T` |
| `HasOne(() => T, name, options?)` | single | `T` |
| `HasMany(() => T, name, options?)` | many | `T[]` |
| `BelongsToMany(() => T, name, options?)` | many | `T[]` |

- The lazy thunk (`() => User`) lets circular references between models resolve correctly.
- The second argument is the relation name **as exposed by the backend** (must match what lomkit declares, camelCase or snake_case).
- `BelongsToMany` accepts a `pivot` map in its options for pivot fields.

---

## Reading data

`Model.query()` returns a chainable `QueryBuilder<T>`.

```ts
// Paginated list — .get() always returns a [collection, pagination] tuple
const [reports, pagination] = await Report.query()
  .include('creator')
  .include('status')
  .limit(10)
  .get()

// Fetch by primary key — throws if not found
const report = await Report.query()
  .include('creator')
  .findByKey(id)

// First match, or null
const draft = await Status.query().where('slug', 'draft').first()
```

### Filtering

Filters use lomkit dot-notation, which crosses relations. **Filtering through a relation does not require including it** — they are independent decisions.

```ts
const [mine] = await Report.query()
  .where('creator.id', currentUser.getKey())
  .where('created_at', '>=', startOfMonth)
  .get()

// where(field, value) is shorthand for `=`
// where(field, operator, value) for the rest
Report.query().where('status.slug', 'in', ['published', 'draft'])
```

Available operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `like`, `not like`, `in`, `not in`, `between`, `not between`.

Combining conditions:

- chained `.where(...)` → `AND`
- `.orWhere(...)` → `OR`
- `.whereNested(q => ...)` → a parenthesized group, for mixing `AND` / `OR` safely

```ts
Report.query()
  .where('status.slug', 'published')
  .whereNested((q) => {
    q.where('creator.id', currentUser.getKey())
    q.orWhere('is_shared', true)
  })
```

### Full-text search

```ts
const [matches] = await Report.query().text('quarterly').get()
```

### Sorting

`orderBy` works on **flat fields only** — lomkit does not support dot-notation in sorts.

```ts
Report.query().orderBy('created_at', 'desc')
// Not supported: .orderBy('creator.name', 'asc')
```

### Including relations

Both a dot-notation string and a nested callback work. Pass a callback to constrain the included relation.

```ts
Report.query().include('creator')
Report.query().include('creator.company')                      // dot-notation
Report.query().include('creator', q => q.include('company'))   // nested callback

Report.query().include('subjects', (q) => {
  q.withCount('comments')
  q.select('id')
})
```

### Selecting fields

```ts
Report.query().select('id', 'title')
```

### Aggregates

```ts
Report.query().withCount('comments')
Report.query().withSum('items', 'amount')
Report.query().withAvg('reviews', 'score')
Report.query().withMin('items', 'price')
Report.query().withMax('items', 'price')
Report.query().withExists('attachments')

// Generic form
Report.query().aggregate('comments', 'count', undefined, 'comments_total')
```

### Scopes, instructions and gates

```ts
Report.query().scope('published')
Report.query().scope('createdBetween', start, end)
Report.query().instruction('recalculate', [{ name: 'mode', value: 'full' }])
Report.query().gate('viewAny', 'create')
```

### Pagination

```ts
const [page2, pagination] = await Report.query().getPage(2)
```

`.limit(n)` is validated against the model's `limits` and throws if `n` is not allowed.

### The `.get()` tuple

`.get()` and `.getPage()` resolve to `[collection, searchMeta]`:

- **`collection`** — the result set (see [Working with lists](#working-with-lists)).
- **`searchMeta`** — pagination/meta from lomkit: `current_page`, `last_page`, `per_page`, `from`, `to`, `total`, `total_pages`, `meta`.

```ts
const [reports, { total, last_page }] = await Report.query().get()
```

### Composing queries

Pass the builder around instead of restarting from `Model.query()` in each helper:

```ts
const baseQuery = () =>
  Report.query()
    .include('creator')
    .include('status')
    .limit(10)

const [data, pagination] = await baseQuery().where('is_read', false).get()
```

---

## Accessing relations on an instance

After `.include('relation')`, the relation is available as a **plain property** on the instance — no method call, no re-query.

```ts
const [reports] = await Report.query()
  .include('creator')
  .include('comments')
  .get()

const report = reports.at(0)

// BelongsTo / HasOne → single instance (or undefined if not included)
report?.creator?.getKey()
report?.creator?.name

// HasMany / BelongsToMany → array (or undefined if not included)
report?.comments?.[0]?.name
report?.comments?.length

// Nested — after .include('creator.company')
report?.creator?.company?.name
```

Rules:

- **Always optional-chain.** Relations return `undefined` when they were not `include()`'d. Reading a relation does **not** trigger a lazy fetch — there is no `load()` / `findOrFail` equivalent. If you need the data, add `.include(...)` upstream.
- `report.comments?.length === 0` is ambiguous on its own: it can mean "no comments" *or* "not included". If the distinction matters, check `report.comments === undefined` first.
- Relations are **instance properties, not methods**.
- To read an instance's primary key in app code, prefer `instance.getKey()` over `instance.id` so custom keys keep working.

---

## Working with lists

### List typing: use `ModelCollection<T>`

`.get()` / `.getPage()` return a **plain array during SSR** (raw, un-hydrated data) and a **`ModelList<T>` once hydrated on the client**. The exported `ModelCollection<T>` interface unifies both — the read API (`at`, `map`, `filter`, `find`, `forEach`, `some`, `every`, `length`, iteration, indexing) is identical across them, so the field-access path `list[0].title` is the same on server and client.

```ts
import type { ModelCollection, Report } from '...'

const reports = ref<ModelCollection<Report>>([])

const [data] = await Report.query().get()
reports.value = data
```

Never type the ref as plain `Report[]` only: it type-checks during SSR but breaks on the client, where the value is actually a `ModelList`.

### `ModelList` auto-hides deleted instances

A `ModelList<T>` behaves like an array but transparently hides any instance deleted client-side (via `instance.delete()`).

- Do **not** manually `splice` / `filter` your ref after a `.delete()` — the list updates itself.
- Do **not** rely on `.length` for "items returned by the API" — use `pagination.total` from the tuple.

### Model instances are not serializable

A model instance carries methods, relation proxies and internal state. Vue cannot stringify it and SSR cannot serialize it. Render the **fields**, which are plain values:

```vue
<!-- Don't: breaks SSR / renders [object Object] -->
{{ report }}
<pre>{{ JSON.stringify(report) }}</pre>

<!-- Do -->
{{ report.title }}
{{ report.creator?.name }}
<time :datetime="report.created_at">{{ formatDate(report.created_at) }}</time>
```

For inspection, use `console.log(report)` — devtools show the instance correctly.

---

## Creating and updating

`Model.create({...})` (alias `Model.new({...})`) returns a **local instance** — it is not persisted until `.save()`.

```ts
// Create, including HasMany children in the same round-trip
const report = Report.create({ title: 'Q2 review' })
report.creator.attach(currentUser.getKey())  // BelongsTo by key value
report.status.attach(draftStatus)            // or by instance
report.subjects.attach(subjectAId)           // HasMany — queue children before save
report.subjects.attach(subjectBId)
const { created } = await report.save()       // created: number[] — single request

// Update: fetch, mutate, save
const report = await Report.query().findByKey(id)
report.title = 'New title'
report.users_shared.attach(userId)
report.users_shared.detach(otherUserId)
await report.save()
```

Relation operations (queued, then flushed on `.save()`):

| Operation | Available on | Notes |
| --- | --- | --- |
| `attach(target, cb?, options?)` | all | By instance, key, `{ id }`, or an array of those. Optional callback mutates the related model; options (e.g. pivot data) are sent to the backend. |
| `detach(target)` | all | By instance or key. Throws on a not-yet-persisted (`_isNew`) model. |
| `set(target)` | `BelongsTo` / `HasOne` | Clears pending ops, then attaches — convenient for replacing a single relation. |
| `sync(target, cb?, options?)` | `HasMany` / `BelongsToMany` | Expects persisted, non-deleted models. Use `{ withoutDetaching: true }` to keep existing links. |
| `toggle(target, options?)` | all | Toggles the link. |
| `create(attributes, cb?)` | all | Creates and queues a new related model. |
| `clear()` | all | Empties the loaded value. |

Key semantics:

- `.attach()` on a `BelongsTo` already pointing somewhere **replaces silently** — no need to `.detach()` first.
- Both `BelongsTo` and `HasMany` mutations travel in a **single** `save()`, including on a freshly `create()`'d parent that has not been persisted yet.
- `.save()` returns `{ created: number[], updated: number[] }` — useful when you need a new id (e.g. for redirect).
- `.save()` on an instance with **no dirty fields and no pending relation ops is a no-op** — no network round-trip. Safe to call defensively in a submit handler.
- Option keys are camelCase in your code and are converted to snake_case on the wire (`withoutDetaching` → `without_detaching`).

When wiring a form to a model, keep the form state and the model instance separate: the form is an edit buffer, the model is what you persist. Apply form values to the model only on submit.

`.applyChanges()` exists — it promotes pending changes to persisted fields **without** calling the backend. Avoid it unless you know exactly why you want the shared local copy to advance without a round-trip; the default is `.save()`.

---

## Deleting

```ts
await report.delete()
```

Fetch (or already have) the instance and call `delete()`. There is no `Model.delete(id)` helper. The instance is marked deleted, removed from the identity map, and auto-hidden from any `ModelList` holding it.

---

## Custom actions

`Model.actions(name, fields?, queryCallback?)` calls a lomkit action and returns `{ data: { impacted: number } }`.

```ts
// Fields, no filter
await Report.actions('mark-as-read', [
  { name: 'report_id', value: reportId },
])

// Filter, no fields — the callback builds the standard search payload that scopes the action
await Notification.actions('mark-notification-as-read', undefined, q =>
  q.where('id', 'in', notifications.map(n => n.getKey())),
)

// Both
await Report.actions('publish', [{ name: 'id', value: reportId }])
```

`fields` is the `{ name, value }[]` array lomkit expects. The query callback uses the same builder as `.query()`.

---

## Resource metadata: `Model.details()`

`Model.details()` hits lomkit's details endpoint and returns the resource metadata — declared fields, relations, available actions, scopes, instructions and authorization rules.

```ts
const details = await Report.details()
// details.actions, details.fields, details.relations, details.scopes, details.limits, details.rules
```

Reach for it when you need to know which actions exist before calling them, or when building a UI driven by backend-declared fields/relations. Don't call it on every render — fetch once and reuse.

---

## Identity map

Without an identity map, multiple API calls produce multiple JS instances for the same resource. With it:

- One primary key maps to one instance in memory.
- Mutations are visible everywhere in the app — edit a report on a detail page and the list that rendered it re-renders with the new value.
- Hydration reuses existing instances and their shared field state.

A direct field assignment (`report.title = 'X'`) is local dirty state on that instance; other holders of the same record see the change only after `.save()` (or `.applyChanges()`).

---

## SSR and caching

To avoid fetching the same data twice (once on the server, again on client hydration), search responses are cached during SSR and transferred to the client through the Nuxt payload. The client reuses the cached response instead of re-hitting the API. The cache is invalidated automatically on `save()` and `delete()` for the affected resource.

As a deliberate design choice, the server returns **raw, un-hydrated data** (hydrating full model graphs server-side would be expensive). Hydration into `Model` instances happens on the client. Field access works identically in both contexts — `list[0].title` is the same — but instance methods (`save`, `getKey`, …) are only available client-side.

---

## Anti-patterns

These look right coming from Eloquent, but do not exist here — refuse them and rewrite through the model:

```ts
// Direct HTTP against a lomkit endpoint
await useFetch('/api/reports', { query: { ... } })
await $fetch('/api/reports/search', { method: 'POST', body: { ... } })

// Hand-built lomkit payload
await $fetch('/api/reports/search', {
  method: 'POST',
  body: { filters: [{ field: 'status.slug', value: 'draft' }] },
})

// Eloquent muscle memory
await Report.find(id)                          // → Report.query().findByKey(id)
Report.query().with(['creator', 'comments'])   // → chained .include() calls
report.creator().first()                       // → report.creator (after include)
report.comments().get()                        // → report.comments (after include)
Report.query().whereHas('creator', q => ...)   // → .where('creator.field', value)
```

The replacement is always `Model.query()….get()`, `Model.query().findByKey(id)`, `Model.create(...)`, `instance.save()`, `instance.delete()`, `Model.actions(...)`.

---

## Local development

```bash
# Install dependencies
npm install

# Prepare module stubs
npm run dev:prepare

# Playground
npm run dev
npm run dev:build

# Quality checks
npm run lint
npm run test
npm run test:watch
```

---

## Status and roadmap

The core architecture is implemented and covered by an automated test suite. The module is under active development and not yet production-ready.

Implemented:

- Decorator metadata (`@Resource`, `@Field`, `@Key`)
- Identity map + hydration
- Proxy-based dirty tracking (`_fields` / `_changes`)
- `save()` with deferred commit on mutation success
- Relation builders: `HasMany`, `BelongsTo`, `HasOne`, `BelongsToMany`
- Relation operations: `attach`, `detach`, `set`, `sync`, `toggle`, `create`
- Nested/recursive relation mutation payloads
- Query builder: filters, sorts, includes, selects, aggregates, scopes, instructions, gates, pagination
- SSR payload cache with client transfer

Planned:

- Fake query mode (`User.fake().findByKey(1)`) for dev/tests without a backend
- Morph relation support (`morphTo`, `morphMany`, `morphOne`)
- Lifecycle hooks (`beforeSave`, `afterHydrate`, `afterDelete`)
- Typed include-aware return types
- Query caching + smart invalidation, optimistic UI + rollback

## Contributing

Contributions are welcome, especially around the fake engine, morph relations, lifecycle hooks, and integration tests with `lomkit/laravel-rest-api`.
