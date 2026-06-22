import { MetadataStorage } from '../core/metadata'
import type { QueryBuilder, SearchPayload } from '../query/QueryBuilder'
import { IdentityMap } from '../core/identityMap'
import { type PendingRelationOperation } from '../relations/base'
import getCurrentFetch from '../helpers/getCurrentFetch'
import { isRelationBuilder } from '../relations'
import { PayloadCache } from '../cache/payloadCache'
import type { IDetailsResponse } from '../types/details'
import type { IActionField, IActionResponse } from '../types/actions'
import { reactive, ref } from 'vue'
import type { IMutateResponse } from '../types/mutate'
import { snakeCaseToCamelCase } from '../utils/snakeCaseToCamelCase'

type ParentRelationLink = {
  owner: Model
  relation: string
}

type MutationPayload = {
  operation: 'create' | 'update' | 'delete' | 'attach' | 'detach' | 'sync' | 'toggle'
  key?: unknown
  attributes?: Record<string, unknown>
  relations?: Record<string, MutationPayload | MutationPayload[]>
} & Record<string, unknown>

type Gates = Record<string, boolean | { allowed: boolean, message: string }>

export type SharedMeta = {
  isDeleted: boolean
}
export abstract class Model {
  _sharedMeta = reactive<SharedMeta>({ isDeleted: false })
  _isNew = false
  _fields: Record<string, unknown> = {}
  _changes: Record<string, unknown> = {}
  _parentRelations: ParentRelationLink[] = []
  _bypassProxy = false

  gates: Gates = {}

  constructor() {
    return new Proxy(this, {
      get(target, property, receiver) {
        if (typeof property === 'string' && property.startsWith('_')) {
          return target[property as keyof Model]
        }
        if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(target._fields, property)) {
          return target._fields[property]
        }

        return Reflect.get(target, property, receiver)
      },
      set(target, property, value, receiver) {
        if (target.shouldStoreAsField(property, value)) {
          target.setChange(property as string, value)
          return true
        }

        return Reflect.set(target, property, value, receiver)
      },
    })
  }

  private getMetaSafe() {
    try {
      return MetadataStorage.getResource(this.constructor as typeof Model)
    }
    catch {
      return null
    }
  }

  private isRelationProperty(property: string) {
    const meta = this.getMetaSafe()
    if (!meta) {
      return false
    }

    return meta.relations.some(relation => relation.property === property)
  }

  private shouldStoreAsField(property: string | symbol, value: unknown) {
    if (typeof property !== 'string' || property.startsWith('_')) {
      return false
    }

    if (typeof value === 'function' || isRelationBuilder
      (value) || this.isRelationProperty(property)) {
      return false
    }

    const meta = this.getMetaSafe()
    if (meta) {
      return meta.fields.some(field => field.name === property)
    }

    return !(property in this)
  }

  /**
   * Write a value to persisted fields.
   * Optionally mirrors the same value into pending changes.
   */
  setField(property: string, value: unknown, trackChange = true) {
    this._fields[property] = value
    if (trackChange) {
      this._changes[property] = value
    }
  }

  /**
   * Register a pending change without mutating persisted fields.
   */
  setChange(property: string, value: unknown) {
    if (
      value === undefined
      && !Object.prototype.hasOwnProperty.call(this._fields, property)
      && !Object.prototype.hasOwnProperty.call(this._changes, property)
    ) {
      return
    }

    this._changes[property] = value
  }

  /**
   * Promote all pending changes to persisted fields.
   * Intended to be called after a successful backend mutation.
   */
  applyChanges() {
    Object.assign(this._fields, this._changes)
    this._changes = {}
  }

  /**
   * Drop all pending changes and keep persisted fields unchanged.
   */
  discardChanges() {
    this._changes = {}
  }

  /**
   * Bind this model instance to an external shared fields object.
   * Used by identity map hydration to share a single persisted state.
   */
  useSharedFields(fields: Record<string, unknown>) {
    this._fields = fields
  }

  useSharedMeta(meta: SharedMeta) {
    this._sharedMeta = meta
  }

  /**
   * Registers relation-builder metadata from a bootstrap instance.
   */
  static registerRelationBuildersFromInstance(instance: Model): void {
    instance.registerRelationBuilders({ registerMeta: true })
  }

  initializeRelationBuilders(): void {
    this.registerRelationBuilders()
  }

  private registerRelationBuilders(options?: { registerMeta?: boolean }) {
    for (const [propertyName, value] of Object.entries(this)) {
      if (!isRelationBuilder(value)) {
        continue
      }

      value.bindProperty(propertyName)
      value.bindOwner(this)

      if (options?.registerMeta) {
        value.registerMetadata(this.constructor as typeof Model, propertyName)
      }
    }
  }

  /**
   * Build a payload-ready attributes object.
   * For each declared field, prefers pending change over persisted value.
   */
  getAttributesPayload() {
    return MetadataStorage.getResource(this.constructor as typeof Model).fields.reduce((acc, field) => {
      if (Object.prototype.hasOwnProperty.call(this._changes, field.name)) {
        acc[field.name] = this._changes[field.name]
      }
      return acc
    }, {} as Record<string, unknown>)
  }

  /**
   * Return a query builder for this resource model.
   * Replaced at runtime by the Resource decorator.
   */
  static query<T extends Model>(this: new () => T): QueryBuilder<T> {
    throw new Error('Must be decorated with @Resource')
  }

  /**
   * Hydrate a model instance from raw data.
   * Replaced at runtime by the Resource decorator.
   */
  static hydrate<T extends Model>(this: new () => T, _: unknown): T {
    throw new Error('Must be decorated with @Resource')
  }

  /**
   * Create a new draft-like instance for this resource.
   * Replaced at runtime by the Resource decorator.
   */
  static new<T extends Model>(this: new () => T, _: unknown): T {
    throw new Error('Must be decorated with @Resource')
  }

  /**
   * Alias of new for resource creation.
   * Replaced at runtime by the Resource decorator.
   */
  static create<T extends Model>(this: new () => T, _: unknown): T {
    throw new Error('Must be decorated with @Resource')
  }

  /**
   * Return resource metadata associated with this model class.
   */
  getMeta() {
    const meta = MetadataStorage.getResource(this.constructor as typeof Model)
    if (!meta) throw new Error(`Resource ${this.constructor.name} not registered`)
    return meta
  }

  /**
   * Whether the model currently has a non-null key value.
   */
  hasKey() {
    const meta = this.getMeta()
    const keyField = meta.key
    if (!keyField) return false
    const keyValue = (this as unknown as Record<string, unknown>)[keyField]
    return keyValue !== undefined && keyValue !== null
  }

  /**
   * Return the model key value.
   * Throws when the key is not available.
   */
  getKey() {
    if (!this.hasKey()) {
      throw new Error(`Instance of ${this.constructor.name} doesn't have a key value set.`)
    }
    const meta = this.getMeta()
    const keyField = meta.key
    if (!keyField) {
      throw new Error(`Resource ${this.constructor.name} doesn't have a key field defined.`)
    }
    return (this as unknown as Record<string, unknown>)[keyField]
  }

  /**
   * Access a belongs-to relation by property name.
   */
  belongsTo(target: typeof Model, relationName: string) {
    void target
    return (this as Record<string, unknown>)[relationName]
  }

  /**
   * Access a has-many relation by property name.
   */
  hasMany(target: typeof Model, relationName: string) {
    void target
    return (this as Record<string, unknown>)[relationName]
  }

  /**
   * Access a has-one relation by property name.
   */
  hasOne(target: typeof Model, relationName: string) {
    void target
    return (this as Record<string, unknown>)[relationName]
  }

  /**
   * Access a belongs-to-many relation by property name.
   */
  belongsToMany(target: typeof Model, relationName: string) {
    void target
    return (this as Record<string, unknown>)[relationName]
  }

  isDirty() {
    return this._isNew || Object.keys(this._changes).length > 0
  }

  hasPendingMutations(visited = new Set<Model>()) {
    if (visited.has(this)) {
      return false
    }

    visited.add(this)

    if (this._sharedMeta.isDeleted || this.isDirty()) {
      return true
    }

    for (const relation of this.getMeta().relations) {
      const relationValue = (this as Record<string, unknown>)[relation.property]

      if (isRelationBuilder(relationValue)) {
        if (relationValue.hasPendingOperations()) {
          return true
        }

        const loaded = relationValue.getLoaded<unknown>()
        if (relationHasPendingModels(loaded, visited)) {
          return true
        }

        continue
      }

      if (relationHasPendingModels(relationValue, visited)) {
        return true
      }
    }

    return false
  }

  registerParentRelation(owner: Model, relation: string) {
    const alreadyLinked = this._parentRelations.some(link => link.owner === owner && link.relation === relation)
    if (!alreadyLinked) {
      this._parentRelations.push({ owner, relation })
    }
  }

  unregisterParentRelation(owner: Model, relation: string) {
    this._parentRelations = this._parentRelations.filter(link => !(link.owner === owner && link.relation === relation))
  }

  getMutationRoot() {
    return findMutationRoot(this)
  }

  async save(): Promise<IMutateResponse> {
    const payload = buildModelPayload(this)

    if (!payload) {
      return this
    }

    const endpoint = this.getMeta().endpoint
    const mutateRes = await getCurrentFetch()<IMutateResponse>(`/${endpoint}/mutate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutate: [payload] }),
    })

    PayloadCache.invalidate(endpoint)
    commitModelGraph(this)
    return mutateRes
  }

  /**
   * Persist several instances of the same resource in a single mutate request.
   *
   * Mirrors the instance `save()` but for a batch. Accepts instances, arrays of
   * instances, or any mix of both — so you can pass your lists straight through
   * without spreading:
   *   `User.save(userA, userB)`
   *   `User.save(editedUsers, newUsers)`
   *   `User.save(editedUsers, draftUser)`
   * Each instance becomes one element of lomkit's `mutate` array, so a single
   * round-trip can mix `create` and `update` operations (and their nested
   * relation operations).
   *
   * Instances with no pending changes are skipped. All instances must belong to
   * the resource the method is called on.
   */
  static async save(...models: (Model | Model[])[]): Promise<IMutateResponse> {
    const endpoint = MetadataStorage.getResource(this as unknown as typeof Model).endpoint
    const instances = models.flat()

    const payloads: MutationPayload[] = []
    for (const model of instances) {
      const modelEndpoint = model.getMeta().endpoint
      if (modelEndpoint !== endpoint) {
        throw new Error(`Model.save received an instance of resource '${modelEndpoint}' but was called on '${endpoint}'. A single mutate request targets one resource.`)
      }

      const payload = buildModelPayload(model)
      if (payload) {
        payloads.push(payload)
      }
    }

    if (payloads.length === 0) {
      return { created: [], updated: [] }
    }

    const mutateRes = await getCurrentFetch()<IMutateResponse>(`/${endpoint}/mutate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutate: payloads }),
    })

    PayloadCache.invalidate(endpoint)
    instances.forEach(model => commitModelGraph(model))
    return mutateRes
  }

  async delete<T extends Model>(): Promise<{
    data: T[]
    meta: Record<string, unknown>
  } | null> {
    try {
      const endpoint = this.getMeta().endpoint
      const fetch = getCurrentFetch()
      const response = await fetch<{
        data: T[]
        meta: Record<string, unknown>
      }>(`/${endpoint}`, {
        method: 'DELETE',
        body: JSON.stringify({ resources: [this.getKey()] }),
      })
      PayloadCache.invalidate(endpoint)
      this._sharedMeta.isDeleted = true
      return response
    }
    catch {
      throw new Error('Delete operation failed. Make sure the model has a key and that the endpoint is correct.')
    }
  }

  static async details<T extends Model>(): Promise<IDetailsResponse<T>> {
    try {
      const fetch = getCurrentFetch()
      const response = await fetch<IDetailsResponse<T>>(`/${this.getMeta().endpoint}`, {
        method: 'GET',
      })
      return response
    }
    catch {
      throw new Error('Details operation failed. Make sure the endpoint is correct.')
    }
  }

  static async actions<T extends Model>(actionName: string, fields?: IActionField[], queryCallback?: (query: QueryBuilder<T>) => void): Promise<IActionResponse> {
    try {
      const fetch = getCurrentFetch()

      let searchPayload = {} as SearchPayload
      if (queryCallback) {
        const query = (this.getMeta().target as typeof Model).query<T>()
        queryCallback(query)
        searchPayload = query.buildPayload()
      }

      const response = await fetch<IActionResponse>(`/${this.getMeta().endpoint}/actions/${actionName}`, {
        method: 'POST',
        body: JSON.stringify({
          fields,
          search: searchPayload.search
        }),
      })
      return response
    } catch {
      throw new Error(`Action ${actionName} failed. Make sure the model has a key, that the endpoint is correct, and that the action exists.`)
    }
  }

  deeplyGeneratePayload() {
    return buildModelPayload(this.getMutationRoot())
  }

}

function relationHasPendingModels(value: unknown, visited: Set<Model>) {
  if (Array.isArray(value)) {
    return value.some(item => item instanceof Model && item.hasPendingMutations(visited))
  }

  return value instanceof Model ? value.hasPendingMutations(visited) : false
}

function isModelOperationRelevant(model: Model, visited = new Set<Model>()) {
  return model.hasPendingMutations(visited)
}

function getImplicitRelationOperations(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is Model => item instanceof Model && isModelOperationRelevant(item))
  }

  if (value instanceof Model && isModelOperationRelevant(value)) {
    return [value]
  }

  return []
}

function convertPendingRelationOperation(operation: PendingRelationOperation): MutationPayload | null {
  if (operation.model) {
    const models = Array.isArray(operation.model) ? operation.model : [operation.model]
    if (models.length > 1) {
      return null
    }

    const model = models[0]
    if (!model) {
      return null
    }
    if (operation.operation === 'detach') {
      return {
        operation: 'detach',
        key: model.hasKey() ? model.getKey() : undefined,
      }
    }

    if (operation.operation === 'attach' && !model._isNew && !model.isDirty() && !model.hasPendingMutations()) {
      return {
        operation: 'attach',
        key: model.getKey(),
        ...operation.options,
      }
    }

    if (operation.operation === 'sync' || operation.operation === 'toggle') {
      return {
        operation: operation.operation,
        key: model.getKey(),
        ...operation.options,
      }
    }

    return buildModelPayload(model, operation.operation === 'create' ? 'create' : model._isNew ? 'create' : 'update')
  }

  return {
    operation: operation.operation,
    key: operation.key,
    ...operation.options,
  }
}

function buildRelationPayload(owner: Model, relationMeta: ReturnType<Model['getMeta']>['relations'][number]): MutationPayload | MutationPayload[] | undefined {
  const relationValue = (owner as unknown as Record<string, unknown>)[relationMeta.property]
  const payloads: MutationPayload[] = []
  const handledModels = new Set<Model>()

  if (isRelationBuilder(relationValue)) {
    for (const pending of relationValue.getPendingOperations()) {
      const payload = convertPendingRelationOperation(pending)
      if (payload) {
        payloads.push(payload)
      }

      const models = pending.model ? (Array.isArray(pending.model) ? pending.model : [pending.model]) : []
      models.forEach(model => handledModels.add(model))
    }

    const loaded = relationValue.getLoaded<unknown>()
    for (const model of getImplicitRelationOperations(loaded)) {
      if (!handledModels.has(model)) {
        const payload = buildModelPayload(model)
        if (payload) {
          payloads.push(payload)
        }
      }
    }

    if (payloads.length === 0) {
      return undefined
    }

    return relationMeta.many ? payloads : payloads[0]
  }

  const implicit = getImplicitRelationOperations(relationValue)
  implicit.forEach((model) => {
    const payload = buildModelPayload(model)
    if (payload) {
      payloads.push(payload)
    }
  })

  if (payloads.length === 0) {
    return undefined
  }

  return relationMeta.many ? payloads : payloads[0]
}

function buildModelPayload(model: Model, forcedOperation?: MutationPayload['operation'], visited = new Set<Model>()): MutationPayload | null {
  if (visited.has(model)) {
    return null
  }

  visited.add(model)

  const attributes = model.getAttributesPayload()
  const relations: Record<string, MutationPayload | MutationPayload[]> = {}

  for (const relation of model.getMeta().relations) {
    const relationPayload = buildRelationPayload(model, relation)
    if (relationPayload !== undefined) {
      relations[snakeCaseToCamelCase(relation.property)] = relationPayload
    }
  }

  const operation = forcedOperation ?? (model._sharedMeta.isDeleted ? 'delete' : (model._isNew ? 'create' : 'update'))
  const hasAttributes = Object.keys(attributes).length > 0
  const hasRelations = Object.keys(relations).length > 0

  if (!forcedOperation && !model._sharedMeta.isDeleted && !model._isNew && !hasAttributes && !hasRelations) {
    return null
  }

  const payload: MutationPayload = { operation }

  if (operation !== 'create' && model.hasKey()) {
    payload.key = model.getKey()
  }

  if (hasAttributes) {
    payload.attributes = attributes
  }

  if (hasRelations) {
    payload.relations = relations
  }

  return payload
}

function commitModelGraph(model: Model, visited = new Set<Model>()) {
  if (visited.has(model)) {
    return
  }

  visited.add(model)

  if (model._sharedMeta.isDeleted) {
    const meta = model.getMeta()
    if (meta.key && model.hasKey()) {
      IdentityMap.delete(model.constructor as unknown as new () => Model, model.getKey())
    }
  }
  else {
    model.applyChanges()
    model._isNew = false
  }

  for (const relation of model.getMeta().relations) {
    const relationValue = (model as unknown as Record<string, unknown>)[relation.property]

    if (isRelationBuilder(relationValue)) {
      relationValue.applyPendingOperations()
      const loaded = relationValue.getLoaded<unknown>()
      commitRelationValue(loaded, visited)
      continue
    }

    commitRelationValue(relationValue, visited)
  }
}

function commitRelationValue(value: unknown, visited: Set<Model>) {
  if (Array.isArray(value)) {
    value.forEach(item => item instanceof Model && commitModelGraph(item, visited))
    return
  }

  if (value instanceof Model) {
    commitModelGraph(value, visited)
  }
}

function findMutationRoot(model: Model) {
  const visited = new Set<Model>()
  let root = model

  while (root._parentRelations.length > 0) {
    const next = root._parentRelations[0]?.owner
    if (!next || visited.has(next)) {
      break
    }

    visited.add(root)
    root = next
  }

  return root
}
