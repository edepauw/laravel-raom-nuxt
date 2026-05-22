# SKILL: utiliser `laravel-raom-nuxt`

Ce document sert de guide LLM pour intégrer rapidement le package dans un projet Nuxt.

## Objectif du package

`laravel-raom-nuxt` fournit un object-mapper typé pour API Laravel REST (style ORM côté frontend) avec :
- modèles décorés (`@Resource`, `@Field`, `@Key`)
- query builder typé
- relations (`HasMany`, `BelongsTo`, `HasOne`, `BelongsToMany`)
- identity map et hydratation
- suivi des mutations avec `save()`

## Installation

```bash
npm install laravel-raom-nuxt
```

Dans `nuxt.config.ts` :

```ts
export default defineNuxtConfig({
  modules: ['laravel-raom-nuxt'],
})
```

## Import recommandé

Importer depuis le runtime :

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

## Pattern modèle minimal

1. Décorer la classe avec `@Resource('endpoint')`
2. Définir la clé primaire avec `@Key()` + `@Field()`
3. Déclarer les champs avec `@Field()`
4. Déclarer les relations via les builders (`HasMany`, `BelongsTo`, etc.)

## Opérations principales

- Lecture:
  - `Model.query().where(...).include(...).get()`
  - `Model.query().findByKey(id)`
- Création:
  - `Model.new({ ... })` puis `save()`
- Mise à jour:
  - modifier les propriétés puis `save()`
- Relations:
  - `attach`, `detach`, `sync`, `toggle`, `create`
  - les mutations de relation sont différées jusqu’à `save()`

## Contraintes importantes pour un agent LLM

- Toujours définir une ressource avec `@Resource` avant d’appeler `query()`, `hydrate()` ou `create()`.
- Vérifier que les champs passés à `where`, `orderBy`, `select` existent dans les `@Field`.
- Vérifier que les relations passées à `include` existent réellement sur le modèle.
- Préférer l’import depuis `laravel-raom-nuxt/runtime` pour les API modèle/runtime.

## Validation locale du package

```bash
npm run lint
npm run test
npm run prepack
```

Note: le projet nécessite une préparation Nuxt (`.nuxt/tsconfig.json`) avant certains checks.
