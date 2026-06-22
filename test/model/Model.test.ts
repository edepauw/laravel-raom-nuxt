import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Resource } from '../../src/runtime/core/decorators/class/Resource'
import { Field } from '../../src/runtime/core/decorators/property/Field'
import { Key } from '../../src/runtime/core/decorators/property/Key'
import { BelongsTo, HasMany } from '../../src/runtime/relations'
import { Model } from '../../src/runtime/model/Model'

type G = { $fetch: ReturnType<typeof vi.fn> }

function lastMutationRequest() {
  const calls = (globalThis as unknown as G).$fetch.mock.calls
  const [url, request] = calls[calls.length - 1] as [string, { body: string }]
  return {
    url,
    body: JSON.parse(request.body) as Record<string, unknown>,
  }
}

class User extends Model {
  id?: number
}

@Resource('categories', { limits: [10] })
class Category extends Model {
  @Key()
  @Field()
  id!: number

  @Field()
  name!: string
}

@Resource('products', { limits: [10] })
class Product extends Model {
  @Key()
  @Field()
  id!: number

  @Field()
  name!: string

  category = BelongsTo(() => Category, 'category')
}

@Resource('blog-posts', { limits: [10] })
class BlogPost extends Model {
  @Key()
  @Field()
  id!: number

  @Field()
  title!: string
}

@Resource('blog-users', { limits: [10] })
class PersistedBlogUser extends Model {
  @Key()
  @Field()
  id!: number

  posts = HasMany(() => BlogPost, 'posts')
}

@Resource('teams', { limits: [10] })
class Team extends Model {
  @Key()
  @Field()
  id!: number

  @Field()
  name!: string
}

@Resource('shared-users', { limits: [10] })
class SharedUser extends Model {
  @Key()
  @Field()
  id!: number
}

@Resource('reports', { limits: [10] })
class Report extends Model {
  @Key()
  @Field()
  id!: number

  @Field()
  title!: string

  team = BelongsTo(() => Team, 'team')
  users = HasMany(() => SharedUser, 'users')
}

describe('Model', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
      ; (globalThis as unknown as G).$fetch = vi.fn()
  })

  it('query/hydrate/create throw when model is not decorated', () => {
    expect(() => User.query()).toThrow('Must be decorated with @Resource')
    expect(() => User.hydrate({})).toThrow('Must be decorated with @Resource')
    expect(() => User.create({})).toThrow('Must be decorated with @Resource')
  })

  it('Resource.new marks instances as new', () => {
    const product = Product.new({ name: 'Draft product' })

    expect(product._isNew).toBe(true)
    expect(product.name).toBe('Draft product')
    expect(product._fields.name).toBeUndefined()
    expect(product._changes.name).toBe('Draft product')
  })

  it('tracks field mutations in _fields and _changes via proxy', () => {
    const product = Product.hydrate({ id: 10, name: 'Hydrated product' })

    expect(product._fields.id).toBe(10)
    expect(product._fields.name).toBe('Hydrated product')
    expect(product._changes).toEqual({})

    product.name = 'Updated product'

    expect(product._fields.name).toBe('Hydrated product')
    expect(product.name).toBe('Updated product')
    expect(product._changes.name).toBe('Updated product')
  })

  it('does not commit field changes when the mutation request fails', async () => {
    ; (globalThis as unknown as G).$fetch.mockRejectedValueOnce(new Error('mutation failed'))

    const product = Product.hydrate({ id: 10, name: 'Hydrated product' })
    product.name = 'Updated product'

    await expect(product.save()).rejects.toThrow('mutation failed')

    expect(product._fields.name).toBe('Hydrated product')
    expect(product.name).toBe('Updated product')
    expect(product._changes.name).toBe('Updated product')
  })

  it('applies pending changes to fields only when applyChanges is called', () => {
    const product = Product.hydrate({ id: 12, name: 'Initial name' })

    product.name = 'Pending name'
    expect(product._fields.name).toBe('Initial name')
    expect(product._changes.name).toBe('Pending name')

    product.applyChanges()
    expect(product._fields.name).toBe('Pending name')
    expect(product._changes).toEqual({})
  })

  it('hydrate resets _isDeleted', () => {
    const product = Product.hydrate({ id: 1, name: 'Hydrated product' })
    product._sharedMeta.isDeleted = true

    const hydratedAgain = Product.hydrate({ id: 1, name: 'Hydrated product' })

    expect(hydratedAgain._sharedMeta.isDeleted).toBe(false)
  })

  it('relation helpers remain defined without mutation behavior', () => {
    class Post extends Model { }

    type RelationStub = {
      attach(model: Post): unknown
      detach(key: number): unknown
    }

    class BlogUser extends Model {
      posts = HasMany(() => Post, 'posts')
    }

    const user = new BlogUser()
    const relation = user.hasMany(Post as unknown as typeof Model, 'posts')
    const relationStub = relation as RelationStub

    expect(relation).toBe(user.posts)
    expect(typeof relationStub.attach).toBe('function')
    expect(relationStub.attach(new Post())).toBe(relation)
    expect(relationStub.detach(1)).toBe(relation)
  })

  it('does not store relation builders in _fields', () => {
    const product = new Product()

    expect(product._fields.category).toBeUndefined()
    expect(product.category).toBeDefined()
  })

  it('keeps relation assembly per response without leaking relation state across hydrations', () => {
    const first = Product.hydrate({
      id: 4,
      name: 'Camera',
      category: {
        id: 2,
        name: 'Photo',
      },
    })

    const firstRelation = first.belongsTo(Category, 'category') as { name?: string }
    expect(firstRelation).toBeDefined()
    expect(firstRelation.name).toBe('Photo')

    const second = Product.hydrate({
      id: 4,
      name: 'Camera V2',
    })

    const secondRelation = second.belongsTo(Category, 'category') as { name?: string } | undefined
    expect(second.name).toBe('Camera V2')
    expect(secondRelation?.name).toBeUndefined()
  })

  it('defers attach-by-key relation changes until save succeeds', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const product = Product.hydrate({
      id: 4,
      name: 'Camera',
      category: {
        id: 2,
        name: 'Photo',
      },
    })

    product.category.attach(7)

    expect(product.category.name).toBe('Photo')

    await product.save()

    const [, request] = (globalThis as unknown as G).$fetch.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(request.body)).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 4,
          relations: {
            category: {
              operation: 'attach',
              key: 7,
            },
          },
        },
      ],
    })
    expect(product.category.name).toBeUndefined()
  })

  it('builds recursive relation payloads from a nested dirty model save', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const user = PersistedBlogUser.hydrate({
      id: 1,
      posts: [
        {
          id: 9,
          title: 'Old title',
        },
      ],
    })

    const post = user.posts[0] as BlogPost
    post.title = 'Updated title'

    expect(user.posts[0]!.title).toBe('Updated title')
    expect(post._fields.title).toBe('Old title')

    await post.save()

    const [url, request] = (globalThis as unknown as G).$fetch.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('http://localhost/blog-users/mutate')
    expect(JSON.parse(request.body)).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 1,
          relations: {
            posts: [
              {
                operation: 'update',
                key: 9,
                attributes: {
                  title: 'Updated title',
                },
              },
            ],
          },
        },
      ],
    })
    expect(post._fields.title).toBe('Updated title')
    expect(post._changes).toEqual({})
  })

  it('rejects attach() when the related model is deleted', () => {
    const user = PersistedBlogUser.hydrate({ id: 1, posts: [] })
    const post = BlogPost.hydrate({ id: 9, title: 'Post' })
    post._sharedMeta.isDeleted = true

    expect(() => user.posts.attach(post)).toThrow('cannot attach a deleted model')
  })

  it('rejects detach() when the related model is new', () => {
    const user = PersistedBlogUser.hydrate({ id: 1, posts: [] })
    const post = BlogPost.new({ title: 'Draft post' })

    expect(() => user.posts.detach(post)).toThrow('cannot detach a model that has not been persisted')
  })

  it('emits relation update payload when attaching a dirty persisted model', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const user = PersistedBlogUser.hydrate({ id: 1, posts: [] })
    const post = BlogPost.hydrate({ id: 10, title: 'Before' })
    post.title = 'After'

    user.posts.attach(post)
    await user.save()

    const { body } = lastMutationRequest()
    expect(body).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 1,
          relations: {
            posts: [
              {
                operation: 'update',
                key: 10,
                attributes: {
                  title: 'After',
                },
              },
            ],
          },
        },
      ],
    })
  })

  it('applies hasMany attach locally only after save succeeds', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const user = PersistedBlogUser.hydrate({
      id: 1,
      posts: [{ id: 1, title: 'A' }],
    })
    const post = BlogPost.hydrate({ id: 2, title: 'B' })

    user.posts.attach(post)
    expect(user.posts.length).toBe(1)

    await user.save()
    expect(user.posts.length).toBe(2)
    expect(user.posts[1]?.id).toBe(2)
  })

  it('builds detach payload and removes from hasMany only after success', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const user = PersistedBlogUser.hydrate({
      id: 1,
      posts: [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ],
    })

    user.posts.detach(2)
    expect(user.posts.length).toBe(2)

    await user.save()

    const { body } = lastMutationRequest()
    expect(body).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 1,
          relations: {
            posts: [
              {
                operation: 'detach',
                key: 2,
              },
            ],
          },
        },
      ],
    })
    expect(user.posts.length).toBe(1)
    expect(user.posts[0]?.id).toBe(1)
  })

  it('maps sync options to snake_case in mutation payload', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const user = PersistedBlogUser.hydrate({ id: 1, posts: [] })
    user.posts.sync(10, { withoutDetaching: true })

    await user.save()

    const { body } = lastMutationRequest()
    expect(body).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 1,
          relations: {
            posts: [
              {
                operation: 'sync',
                key: 10,
                without_detaching: true,
              },
            ],
          },
        },
      ],
    })
  })

  it('rejects sync() for new and deleted models', () => {
    const user = PersistedBlogUser.hydrate({ id: 1, posts: [] })

    const draft = BlogPost.new({ title: 'Draft' })
    expect(() => user.posts.sync(draft)).toThrow('expects persisted, non-deleted models')

    const deleted = BlogPost.hydrate({ id: 9, title: 'Deleted' })
    deleted._sharedMeta.isDeleted = true
    expect(() => user.posts.sync(deleted)).toThrow('expects persisted, non-deleted models')
  })

  it('supports belongsTo toggle payload by key', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const product = Product.hydrate({
      id: 4,
      name: 'Camera',
      category: {
        id: 2,
        name: 'Photo',
      },
    })

    product.category.toggle(3)
    await product.save()

    const { body } = lastMutationRequest()
    expect(body).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 4,
          relations: {
            category: {
              operation: 'toggle',
              key: 3,
            },
          },
        },
      ],
    })
  })

  it('queues relation create() and emits nested create payload', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const user = PersistedBlogUser.hydrate({ id: 1, posts: [] })
    user.posts.create({ title: 'Created from relation' })

    await user.save()

    const { body } = lastMutationRequest()
    expect(body).toEqual({
      mutate: [
        {
          operation: 'update',
          key: 1,
          relations: {
            posts: [
              {
                operation: 'create',
                attributes: {
                  title: 'Created from relation',
                },
              },
            ],
          },
        },
      ],
    })
  })

  it('keeps many relation payloads as arrays on draft create with keyed attaches', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({})

    const report = Report.create({ title: 'Quarterly report' })
    report.team.attach(5)
    report.users.attach(2)

    await report.save()

    const { url, body } = lastMutationRequest()
    expect(url).toBe('http://localhost/reports/mutate')
    expect(body).toEqual({
      mutate: [
        {
          operation: 'create',
          attributes: {
            title: 'Quarterly report',
          },
          relations: {
            team: {
              operation: 'attach',
              key: 5,
            },
            users: [
              {
                operation: 'attach',
                key: 2,
              },
            ],
          },
        },
      ],
    })
  })

  it('batches create and update operations of the same resource in a single mutate request', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({ created: [7], updated: [1] })

    const created = Category.create({ name: 'New category' })
    const updated = Category.hydrate({ id: 1, name: 'Old name' })
    updated.name = 'Renamed category'

    const res = await Category.save(created, updated)

    const { url, body } = lastMutationRequest()
    expect(url).toBe('/categories/mutate')
    expect(body).toEqual({
      mutate: [
        { operation: 'create', attributes: { name: 'New category' } },
        { operation: 'update', key: 1, attributes: { name: 'Renamed category' } },
      ],
    })
    expect((globalThis as unknown as G).$fetch).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ created: [7], updated: [1] })

    expect(created._isNew).toBe(false)
    expect(updated._changes).toEqual({})
    expect(updated._fields.name).toBe('Renamed category')
  })

  it('accepts arrays and a mix of arrays and instances without spreading', async () => {
    ; (globalThis as unknown as G).$fetch.mockResolvedValueOnce({ created: [7, 8], updated: [1] })

    const edited = Category.hydrate({ id: 1, name: 'Old name' })
    edited.name = 'Renamed category'
    const newOnes = [Category.create({ name: 'First new' })]
    const loneDraft = Category.create({ name: 'Second new' })

    const res = await Category.save([edited], newOnes, loneDraft)

    const { url, body } = lastMutationRequest()
    expect(url).toBe('/categories/mutate')
    expect(body).toEqual({
      mutate: [
        { operation: 'update', key: 1, attributes: { name: 'Renamed category' } },
        { operation: 'create', attributes: { name: 'First new' } },
        { operation: 'create', attributes: { name: 'Second new' } },
      ],
    })
    expect((globalThis as unknown as G).$fetch).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ created: [7, 8], updated: [1] })
  })

  it('rejects a batch mixing instances of different resources', async () => {
    const category = Category.create({ name: 'A' })
    const product = Product.create({ name: 'B' })

    await expect(Category.save(category, product)).rejects.toThrow(
      'A single mutate request targets one resource.',
    )
    expect((globalThis as unknown as G).$fetch).not.toHaveBeenCalled()
  })

  it('is a no-op when no instance has pending changes', async () => {
    const clean = Category.hydrate({ id: 2, name: 'Clean' })

    const res = await Category.save(clean)

    expect(res).toEqual({ created: [], updated: [] })
    expect((globalThis as unknown as G).$fetch).not.toHaveBeenCalled()
  })
})
