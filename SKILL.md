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
