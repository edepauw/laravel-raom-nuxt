export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      secondary: 'orange',
      neutral: 'slate'
    },
    footer: {
      slots: {
        root: 'border-t border-default',
        left: 'text-sm text-muted'
      }
    }
  },
  seo: {
    siteName: 'laravel-raom-nuxt'
  },
  header: {
    title: 'laravel-raom-nuxt',
    to: '/',
    logo: {
      alt: '',
      light: '',
      dark: ''
    },
    search: true,
    colorMode: true,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/edepauw/laravel-raom-nuxt',
      'target': '_blank',
      'aria-label': 'GitHub'
    }]
  },
  footer: {
    credits: `laravel-raom-nuxt • © ${new Date().getFullYear()}`,
    colorMode: false,
    links: [{
      'icon': 'i-simple-icons-github',
      'to': 'https://github.com/edepauw/laravel-raom-nuxt',
      'target': '_blank',
      'aria-label': 'laravel-raom-nuxt on GitHub'
    }, {
      'icon': 'i-simple-icons-laravel',
      'to': 'https://github.com/lomkit/laravel-rest-api',
      'target': '_blank',
      'aria-label': 'lomkit/laravel-rest-api'
    }]
  },
  toc: {
    title: 'Table of Contents',
    bottom: {
      title: 'Community',
      edit: 'https://github.com/edepauw/laravel-raom-nuxt/edit/develop/docs/content',
      links: [{
        icon: 'i-lucide-star',
        label: 'Star on GitHub',
        to: 'https://github.com/edepauw/laravel-raom-nuxt',
        target: '_blank'
      }, {
        icon: 'i-lucide-book-open',
        label: 'lomkit/laravel-rest-api',
        to: 'https://github.com/lomkit/laravel-rest-api',
        target: '_blank'
      }]
    }
  }
})
