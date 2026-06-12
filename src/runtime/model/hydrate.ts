import { IdentityMap } from '../core/identityMap'
import { MetadataStorage } from '../core/metadata'
import { isRelationBuilder } from '../relations'
import type { Model } from './Model'

export function hydrate<T extends Model>(resourceClass: new () => T, data: any): T {
  const meta = MetadataStorage.getResource(resourceClass)
  const keyField = meta.key
  const keyValue = keyField ? data[keyField] : undefined

  const sharedFields = IdentityMap.get(resourceClass, keyValue)
  const instance = new resourceClass()

  if (typeof instance.initializeRelationBuilders === 'function') {
    instance.initializeRelationBuilders()
  }

  if (sharedFields) {
    instance.useSharedFields(sharedFields.fields as Record<string, unknown>)
    instance.useSharedMeta(sharedFields.sharedMeta)
  }

  const relationProperties = new Set(meta.relations.map(r => r.property))

  for (const key in data) {
    if (relationProperties.has(key)) continue

    const field = meta.fields.find(f => f.name === key)
    let value = data[key]

    if (field) {
      if (field.castFn) {
        value = field.castFn(value)
      }
      if (field.validators) {
        for (const validator of field.validators) {
          const result = validator(value)
          if (result !== true) {
            throw new Error(`Validation failed for ${key}: ${result}`)
          }
        }
      }
    }
    instance.setField(key, value, false)
  }

  for (const relation of meta.relations) {
    const relData = data[relation.property]
    const relationBuilderCandidate = (instance as any)[relation.property]

    if (!relData) {
      if (isRelationBuilder(relationBuilderCandidate)) {
        relationBuilderCandidate.clear()
      }
      continue
    }

    const assignLoadedParents = (value: unknown) => {
      const register = (item: unknown) => {
        if (item && typeof item === 'object' && 'registerParentRelation' in item && typeof item.registerParentRelation === 'function') {
          item.registerParentRelation(instance, relation.property)
        }
      }

      if (Array.isArray(value)) {
        value.forEach(register)
        return
      }

      register(value)
    }

    if (relation.many) {
      const hydratedRelation = relData.map((item: any) => hydrate(relation.target(), item))
      if (relationBuilderCandidate && typeof relationBuilderCandidate.setLoaded === 'function') {
        relationBuilderCandidate.setLoaded(hydratedRelation)
      }
      else {
        ; (instance as any)[relation.property] = hydratedRelation
        assignLoadedParents(hydratedRelation)
      }
    }
    else {
      const hydratedRelation = hydrate(relation.target(), relData)
      if (relationBuilderCandidate && typeof relationBuilderCandidate.setLoaded === 'function') {
        relationBuilderCandidate.setLoaded(hydratedRelation)
      }
      else {
        ; (instance as any)[relation.property] = hydratedRelation
        assignLoadedParents(hydratedRelation)
      }
    }
  }

  if (keyValue !== undefined && keyValue !== null) {
    const existing = IdentityMap.get(resourceClass, keyValue)
    if (!existing) {
      // _fields and _sharedMeta are already reactive (created in the Model
      // constructor). Share the instance's own reactive objects through the
      // identity map so this instance — and every later one for the same key —
      // observe the same reactive state. Previously a reactive copy was stored
      // here while the instance kept its raw _fields, so reads were not tracked.
      IdentityMap.set(resourceClass, keyValue, {
        fields: instance._fields,
        sharedMeta: instance._sharedMeta,
      })
    }
  }
  return instance
}
