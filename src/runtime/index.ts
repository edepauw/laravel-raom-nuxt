// Core decorators
export { Resource } from './core/decorators/class/Resource'
export { Key } from './core/decorators/property/Key'
export { Field } from './core/decorators/property/Field'

// Runtime relations API
export {
    BelongsTo,
    BelongsToMany,
    HasMany,
    HasOne,
    isRelationBuilder,
} from './relations'

// Model classes
export { Model } from './model/Model'
export { DraftModel } from './model/DraftModel'
export { ModelList } from './model/ModelList'
export type { ModelCollection } from './model/ModelCollection'
export { hydrate } from './model/hydrate'

// Query builders
export { QueryBuilder } from './query/QueryBuilder'

// Cache
export { PayloadCache } from './cache/payloadCache'
// export { QueryCache } from './cache/queryCache'

// Utilities
// export { pascalCaseToSnakeCase } from './utils/pascalCaseToSnakeCase'
export { snakeCaseToCamelCase } from './utils/snakeCaseToCamelCase'
export { snakeCaseToPascalCase } from './utils/snakeCaseToPascalCase'

// Core utilities (IdentityMap, Metadata)
export { IdentityMap } from './core/identityMap'
export { MetadataStorage } from './core/metadata'
