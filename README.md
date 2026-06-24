# Laravel REST API Object Mapper 🚀

TypeScript/Nuxt module providing an ORM-like developer experience for APIs exposed by [`lomkit/laravel-rest-api`](https://github.com/lomkit/laravel-rest-api).

Authored by **edepauw**.

## Why an ORM-like Architecture for REST APIs?

Traditional ORMs abstract SQL databases. This module applies the same idea to REST resources: models communicate with an HTTP API instead of a DB.

The transport changes (SQL → HTTP), but the developer model stays familiar:

- decorator-based domain models
- typed relation builders
- expressive query builder
- identity map for in-memory consistency

Business logic stays in models; network details remain an infrastructure concern.

## Packaging Direction 📦

Today this project is a Nuxt module.

Long-term target:

- a framework-agnostic core package (SDK)
- a thin Nuxt integration on top

## Vision ✨

- 🧩 Decorator-based model system (`@Resource`, `@Field`, `@Key`)
- 🗺️ Identity Map — one primary key = one in-memory instance
- 🔎 Expressive typed Query Builder
- 🧪 Fake query mode (`User.fake().findByKey(1)`) for dev/tests without a backend
- 🔄 Proxy-based dirty tracking with deferred relation mutations (`attach`, `detach`, `sync`, `toggle`, `create`)
- 🧬 Morph relation support (planned)

## Current Status ⚠️

The core architecture is implemented and covered by an automated test suite (88 tests passing). The module is still under active development and not yet considered production-ready.

- ✅ Decorator metadata (`@Resource`, `@Field`, `@Key`)
- ✅ Identity Map + hydration
- ✅ Proxy-based dirty tracking (`_fields` / `_changes`)
- ✅ `save()` with deferred commit on mutation success
- ✅ Relation builders: `HasMany`, `BelongsTo`, `HasOne`, `BelongsToMany`
- ✅ Relation operations: `attach`, `detach`, `sync`, `toggle`, `create`
- ✅ Nested/recursive relation mutation payloads
- ✅ Query Builder (filters, sorts, includes, pagination)
- 🚧 Fake engine (planned)
- 🚧 Morph relations (planned)
- 🚧 Lifecycle hooks (planned)

## Usage Example 🛠️

Relations are declared as typed property initializers. No `@Relation` decorator is needed — relation builders self-register their metadata at bootstrap time.

```ts
import {
    Model,
    Resource,
    Field,
    Key,
    HasMany,
    BelongsTo,
} from 'laravel-rest-api-object-mapper/runtime'

@Resource('users', { limits: [1, 10, 25, 50] })
class User extends Model {
    @Key()
    @Field()
    id!: number

    @Field()
    firstname!: string

    @Field()
    lastname!: string

    posts = HasMany(() => Post, 'posts')
}

@Resource('posts')
class Post extends Model {
    @Key()
    @Field()
    id!: number

    @Field()
    title!: string

    author = BelongsTo(() => User, 'author')
}
```

```ts
// Query
const user = await User.query()
    .where('firstname', 'like', 'Eli%')
    .include('posts', (q) => q.orderBy('id', 'desc'))
    .findByKey(1)

// Field mutation — tracked in _changes, committed only on save success
user.firstname = 'Test'
await user.save()

// Relation mutations — deferred until save()
user.posts.attach(post)
user.posts.detach(3)
user.posts.sync(10, { withoutDetaching: true })
await user.save()
```

## Creating, updating & deleting ✍️

Mutations follow the same dirty-tracking model as a classic ORM: you mutate instances in memory, and nothing hits the network until you `save()`. Changes are committed to the persisted state **only after** the backend confirms the mutation.

### Creating

`create()` (alias `new()`) returns a draft instance. Its first `save()` issues a `create`; later saves issue `update`.

```ts
const post = Post.create({ title: 'Hello world' })
await post.save() // POST /posts/mutate → { mutate: [{ operation: 'create', attributes: { title: 'Hello world' } }] }
```

### Updating

Field writes are tracked as pending changes via a proxy and persisted on `save()`. Relation mutations (`attach`, `detach`, `sync`, `toggle`, `create`) are deferred the same way.

```ts
const post = await Post.query().findByKey(1)

post.title = 'Updated title' // staged in _changes, not yet persisted
await post.save() // POST /posts/mutate → { mutate: [{ operation: 'update', key: 1, attributes: { title: 'Updated title' } }] }
```

A `save()` with nothing pending is a no-op — no request is sent.

### Deleting

```ts
const post = await Post.query().findByKey(1)
await post.delete() // DELETE /posts → { resources: [1] }
```

`delete()` marks the instance as deleted, removes it from the identity map, and invalidates the resource's payload cache.

### Batch save — many instances in one request 🚀

`instance.save()` persists a single root (and its nested relation graph). When you have **several independent instances of the same resource** to persist — typically an edited list plus some freshly created drafts — use the static `Model.save(...)` instead. It serialises every instance into one lomkit `mutate` array, so a **single round-trip** can mix `create` and `update` operations.

It is variadic and flattens its arguments, so you can pass instances, arrays of instances, or any mix — without spreading:

```ts
const draft = Category.create({ name: 'New category' })

const edited = await Category.query().findByKey(1)
edited.name = 'Renamed category'

// One request mixing create + update
await Category.save(draft, edited)

// Pass your lists straight through
await Category.save(editedCategories, newCategories)
await Category.save([editedCategory], draftCategory)
```

The example above sends a single request:

```jsonc
// POST /categories/mutate
{
  "mutate": [
    { "operation": "create", "attributes": { "name": "New category" } },
    { "operation": "update", "key": 1, "attributes": { "name": "Renamed category" } }
  ]
}
```

Behaviour:

- 🎯 **One resource per request** — every instance must belong to the resource the method is called on. A batch mixing different resources throws.
- 🧹 **Unchanged instances are skipped** — if nothing has pending changes, no request is sent and it resolves to `{ created: [], updated: [] }`.
- 🔄 **Same commit semantics as `save()`** — on success the whole graph is committed (drafts become persisted, changes are flushed) and the resource's payload cache is invalidated.
- 🧬 Each instance carries its own nested relation operations, exactly like a single `save()`.

It returns lomkit's mutate response: `{ created: [...keys], updated: [...keys] }`.

## Identity Map 🧠

Without an identity map, multiple API calls can produce multiple JS instances for the same resource.

With the identity map:

- ✅ One primary key maps to one instance in memory
- ✅ Mutations are visible everywhere in the app
- ✅ Hydration reuses existing instances

## Fake Mode (Planned) 🎭

Identical read/write API, no network calls.

```ts
await User.query().findByKey(1) // real
await User.fake().findByKey(1) // fake — same API, in-memory
```

Benefits: frontend dev without a live backend, fast deterministic tests, factory-based scenarios.

## Product Roadmap 🗺️

### Phase 1 - Solid Core ✅

1. Decorator metadata behavior
2. Hydration + Identity Map sync
3. HTTP client layer

### Phase 2 - ORM Mutations ✅

1. `save()` with dirty tracking
2. Create / update / delete lifecycle
3. Relation mutation operations (`attach`, `detach`, `sync`, `toggle`, `create`)

### Phase 3 - Relation System 🚧

1. Morph relation support (`morphTo`, `morphMany`, `morphOne`)
2. Relation hydration + mutation parity across all relation kinds

### Phase 4 - Fake Engine 🚧

1. `fake()` and `FakeQueryBuilder`
2. In-memory factories / seeders
3. API parity guarantee between real and fake modes

### Phase 5 - DX & Quality

1. Strong autocomplete for fields and relations
2. Debug tooling (payload trace, hooks, optional devtools integration)
3. Integration tests with `lomkit/laravel-rest-api`

### Phase 6 - Production Readiness

1. Query caching + smart invalidation
2. Optimistic UI + rollback strategies
3. Pagination completeness + revalidation

## Additional Feature Ideas 💡

- Offline-first mutation queue + replay
- Lifecycle events (`beforeSave`, `afterHydrate`, `afterDelete`)
- Local policy/gate pre-check helpers for UX
- Typed Laravel error normalization
- Model code generation from API schema

## Installation 📦

```bash
npx nuxt module add laravel-rest-api-object-mapper
```

## Local Development 👩‍💻

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

## Contributing 🤝

Contributions are welcome, especially around:

- fake engine + factories
- morph relation support
- lifecycle hooks
- integration tests with `lomkit/laravel-rest-api`
