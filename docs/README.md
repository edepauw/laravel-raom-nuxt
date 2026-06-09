# laravel-raom-nuxt — documentation site

The documentation site for [`laravel-raom-nuxt`](https://github.com/edepauw/laravel-raom-nuxt), built with [Nuxt UI](https://ui.nuxt.com) and [Nuxt Content](https://content.nuxt.com) (scaffolded from the `ui/docs` template).

Content lives in [`content/`](./content) as Markdown (MDC). The navigation, search and table of contents are generated from the content structure.

## Setup

Install the dependencies:

```bash
pnpm install
```

## Development

Start the dev server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

```bash
pnpm build
pnpm preview
```

## Editing the docs

- Pages are under `content/` — `1.getting-started/` and `2.guide/`.
- Site branding (title, header/footer links, colors) lives in `app/app.config.ts`.
- Module config (SEO, llms, OG images) lives in `nuxt.config.ts`.
