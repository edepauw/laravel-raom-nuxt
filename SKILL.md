# SKILL: use `laravel-raom-nuxt`

This document is an LLM guide to quickly integrate the package in a Nuxt project.

## Package purpose

`laravel-raom-nuxt` provides a typed object mapper for Laravel REST APIs (ORM-like frontend style) with:
- decorated models (`@Resource`, `@Field`, `@Key`)
- typed query builder
- relations (`HasMany`, `BelongsTo`, `HasOne`, `BelongsToMany`)
- identity map and hydration
- mutation tracking with `save()`

## Installation

```bash
npm install laravel-raom-nuxt
```

In `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['laravel-raom-nuxt'],
})
```

## Recommended import

Import from the runtime entry:

```ts
import {
  Model,
  Resource,
  Field,
  Key,
  HasMany,
  BelongsTo,
} from 'laravel-raom-nuxt/runtime'
```

## Minimal model pattern

1. Decorate the class with `@Resource('endpoint')`
2. Define the primary key with `@Key()` + `@Field()`
3. Declare fields with `@Field()`
4. Declare relations using relation builders (`HasMany`, `BelongsTo`, etc.)

## Main operations

- Read:
  - `Model.query().where(...).include(...).get()`
  - `Model.query().findByKey(id)`
- Create:
  - `Model.new({ ... })` then `save()`
- Update:
  - mutate properties then `save()`
- Relations:
  - `attach`, `detach`, `sync`, `toggle`, `create`
  - relation mutations are deferred until `save()`

## Query integrations (important)

`QueryBuilder` supports:
- filters: `where`, `orWhere`, `whereNested`
- sorting/selection: `orderBy`, `select`
- relations: `include('posts')`, nested include callbacks
- API scopes: `scope(...)`
- aggregates: `withCount`, `withSum`, `withAvg`, `withMin`, `withMax`
- pagination/limit: `page`, `limit`, `getPage`, `first`, `findByKey`
- permission checks: `gate(...)`

Example:

```ts
const [users, meta] = await User.query()
  .where('firstname', 'like', 'Eli%')
  .include('posts', q => q.orderBy('id', 'desc'))
  .withCount('posts', 'posts_count')
  .limit(10)
  .page(1)
  .get()
```

## Mutation integrations (important)

- Field mutations are tracked in `_changes` through model proxies.
- `save()` builds one nested mutation graph payload (model + relation operations).
- Changes are committed only after a successful mutation request (`applyChanges` behavior).
- `delete()` marks model shared meta as deleted (`_sharedMeta.isDeleted = true`).

Typical flow:

```ts
const user = User.new({ firstname: 'Eli' })
await user.save()

user.firstname = 'Eliott' // tracked as pending field change
user.posts.attach(12) // tracked as pending relation mutation
await user.save() // flushes both field + relation operations
```

## ModelList integration

- `get()` returns a `ModelList` on client side.
- `ModelList` is reactive and index-access is proxy-based (`users[0]`).
- Deleted models are automatically filtered out of active reads (`length`, iteration, `map`, `find`, etc.).
- Use `.raw` to access unfiltered underlying items when needed.

## Proxy behavior to preserve

- `Model` instances are proxies:
  - reads prefer `_fields` values
  - writes to declared fields go into `_changes` (pending changes)
  - internal/private properties (`_...`) are not tracked as field changes
- Relation builders are proxies too and expose relation mutation methods while keeping pending operation queues.

## Relation integration details

- Relation builders: `HasMany`, `BelongsTo`, `HasOne`, `BelongsToMany`
- Relations self-register metadata during model bootstrap.
- `attach` accepts model instances and/or keys.
- `detach`, `sync`, `toggle`, `create` queue operations until `save()`.
- Invalid states are guarded (for example: attaching deleted models, detaching non-persisted models).

## Important constraints for an LLM agent

- Always define a resource with `@Resource` before calling `query()`, `hydrate()`, or `create()`.
- Ensure fields passed to `where`, `orderBy`, and `select` exist in `@Field` metadata.
- Ensure relations passed to `include` actually exist on the model.
- Prefer imports from `laravel-raom-nuxt/runtime` for model/runtime APIs.

## Local package validation

```bash
npm run lint
npm run test
npm run prepack
```

Note: this project requires Nuxt preparation (`.nuxt/tsconfig.json`) before some checks.
