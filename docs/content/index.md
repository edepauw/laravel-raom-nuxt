---
seo:
  title: laravel-raom-nuxt
  description: An Active-Record-style client for lomkit/laravel-rest-api, for Nuxt. Declare API resources as decorated models and query them with a typed builder.
---

::u-page-hero{class="dark:bg-gradient-to-b from-neutral-900 to-neutral-950"}
---
orientation: horizontal
---
#top
:hero-background

#title
Your Laravel REST API, as [models]{.bg-gradient-to-r .from-secondary .to-primary .bg-clip-text .text-transparent}.

#description
`laravel-raom-nuxt` is an Active-Record-style client for [`lomkit/laravel-rest-api`](https://github.com/lomkit/laravel-rest-api). Declare your API resources as decorated model classes, then read and mutate them with a typed, chainable query builder — no hand-built payloads, no `$fetch` against resource endpoints.

#links
  :::u-button
  ---
  to: /getting-started
  size: xl
  trailing-icon: i-lucide-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  icon: i-simple-icons-github
  color: neutral
  variant: outline
  size: xl
  to: https://github.com/edepauw/laravel-raom-nuxt
  target: _blank
  ---
  View on GitHub
  :::

#default
  ```ts
  @Resource('reports', { limits: [1, 10, 25, 50] })
  export class Report extends Model {
    @Key() @Field() id!: number
    @Field() title!: string
    creator = BelongsTo(() => User, 'creator')
    subjects = HasMany(() => Subject, 'subjects')
  }

  const [reports, pagination] = await Report.query()
    .where('status.slug', 'published')
    .include('creator')
    .orderBy('created_at', 'desc')
    .limit(25)
    .get()
  ```
::

::u-page-section
#title
Familiar ORM ergonomics over HTTP

#features
  :::u-page-feature
  ---
  icon: i-lucide-box
  ---
  #title
  Decorator-based models

  #description
  Declare each resource once with `@Resource`, `@Field`, `@Key` and typed relation builders. Endpoint, fields, key, relations and pagination limits live in one place.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-search
  ---
  #title
  Typed query builder

  #description
  `.where().include().withCount().orderBy()` maps directly onto lomkit's `search` payload, with validation on field and relation names.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-link
  ---
  #title
  Relations & mutations

  #description
  `attach` / `detach` / `sync` / `toggle` / nested `create`, all flushed in a single `save()` — including on a freshly created parent.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-fingerprint
  ---
  #title
  Identity map

  #description
  One primary key maps to one in-memory instance, so a change on a detail page is visible in the list that rendered it.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-server
  ---
  #title
  SSR-aware

  #description
  Search responses are cached during SSR and transferred to the client, avoiding a double fetch on hydration.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-shield-check
  ---
  #title
  One way to call the API

  #description
  Everything goes through the model — no `$fetch`, no `useFetch`, no hand-built `{ filters, includes }` objects to drift out of sync.
  :::
::

::u-page-section{class="dark:bg-gradient-to-b from-neutral-950 to-neutral-900"}
  :::u-page-c-t-a
  ---
  links:
    - label: Get started
      to: '/getting-started'
      trailingIcon: i-lucide-arrow-right
    - label: View on GitHub
      to: 'https://github.com/edepauw/laravel-raom-nuxt'
      target: _blank
      variant: subtle
      icon: i-simple-icons-github
  title: Stop hand-building lomkit payloads.
  description: Declare a model once and query it everywhere.
  class: dark:bg-neutral-950
  ---

  :stars-bg
  :::
::
