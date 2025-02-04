import type * as Config from "@effect/io/Config"
import * as ConfigError from "@effect/io/Config/Error"
import type * as ConfigSecret from "@effect/io/Config/Secret"
import * as configError from "@effect/io/internal/configError"
import * as configSecret from "@effect/io/internal/configSecret"
import * as OpCodes from "@effect/io/internal/opCodes/config"
import type { EnforceNonEmptyRecord, NonEmptyArrayConfig, TupleConfig } from "@effect/io/internal/types"
import * as Chunk from "@fp-ts/data/Chunk"
import * as Either from "@fp-ts/data/Either"
import type { LazyArg } from "@fp-ts/data/Function"
import { constTrue, pipe } from "@fp-ts/data/Function"
import type * as HashMap from "@fp-ts/data/HashMap"
import * as HashSet from "@fp-ts/data/HashSet"
import * as Option from "@fp-ts/data/Option"
import type { Predicate, Refinement } from "@fp-ts/data/Predicate"

/** @internal */
const ConfigSymbolKey = "@effect/io/Config"

/** @internal */
export const ConfigTypeId: Config.ConfigTypeId = Symbol.for(
  ConfigSymbolKey
) as Config.ConfigTypeId

/** @internal */
export type ConfigPrimitive =
  | Constant
  | Described
  | Fallback
  | Fail
  | Lazy
  | MapOrFail
  | Nested
  | Primitive
  | Sequence
  | Table
  | Zipped

/** @internal */
const configVariance = {
  _A: (_: never) => _
}

/** @internal */
const proto = {
  [ConfigTypeId]: configVariance
}

/** @internal */
export type Op<Tag extends string, Body = {}> = Config.Config<never> & Body & {
  readonly _tag: Tag
}

/** @internal */
export interface Constant extends
  Op<OpCodes.OP_CONSTANT, {
    readonly value: unknown
    parse(text: string): Either.Either<ConfigError.ConfigError, unknown>
  }>
{}

/** @internal */
export interface Described extends
  Op<OpCodes.OP_DESCRIBED, {
    readonly config: Config.Config<unknown>
    readonly description: string
  }>
{}

/** @internal */
export interface Fallback extends
  Op<OpCodes.OP_FALLBACK, {
    readonly first: Config.Config<unknown>
    readonly second: Config.Config<unknown>
    readonly condition: Predicate<ConfigError.ConfigError>
  }>
{}

/** @internal */
export interface Fail extends
  Op<OpCodes.OP_FAIL, {
    readonly message: string
    parse(text: string): Either.Either<ConfigError.ConfigError, unknown>
  }>
{}

/** @internal */
export interface Lazy extends
  Op<OpCodes.OP_LAZY, {
    readonly config: LazyArg<Config.Config<unknown>>
  }>
{}

/** @internal */
export interface MapOrFail extends
  Op<OpCodes.OP_MAP_OR_FAIL, {
    readonly original: Config.Config<unknown>
    readonly mapOrFail: (value: unknown) => Either.Either<ConfigError.ConfigError, unknown>
  }>
{}

/** @internal */
export interface Nested extends
  Op<OpCodes.OP_NESTED, {
    readonly name: string
    readonly config: Config.Config<unknown>
  }>
{}

/** @internal */
export interface Primitive extends
  Op<OpCodes.OP_PRIMITIVE, {
    readonly description: string
    parse(text: string): Either.Either<ConfigError.ConfigError, unknown>
  }>
{}

/** @internal */
export interface Sequence extends
  Op<OpCodes.OP_SEQUENCE, {
    readonly config: Config.Config<unknown>
  }>
{}

/**
 * @since 1.0.0
 * @category models
 */
export interface Table extends
  Op<OpCodes.OP_TABLE, {
    readonly op: OpCodes.OP_TABLE
    readonly valueConfig: Config.Config<unknown>
  }>
{}

/**
 * @since 1.0.0
 * @category models
 */
export interface Zipped extends
  Op<OpCodes.OP_ZIP_WITH, {
    readonly op: OpCodes.OP_ZIP_WITH
    readonly left: Config.Config<unknown>
    readonly right: Config.Config<unknown>
    readonly zip: (a: unknown, b: unknown) => unknown
  }>
{}

/** @internal */
export const bool = (name?: string): Config.Config<boolean> => {
  const config = primitive(
    "a boolean property",
    (text) => {
      switch (text) {
        case "true":
        case "yes":
        case "on":
        case "1": {
          return Either.right(true)
        }
        case "false":
        case "no":
        case "off":
        case "0": {
          return Either.right(false)
        }
        default: {
          const error = configError.InvalidData(
            Chunk.empty(),
            `Expected a boolean value, but received ${text}`
          )
          return Either.left(error)
        }
      }
    }
  )
  return name === undefined ? config : nested(name)(config)
}

/** @internal */
export const arrayOf = <A>(config: Config.Config<A>, name?: string): Config.Config<ReadonlyArray<A>> => {
  return pipe(chunkOf(config, name), map(Chunk.toReadonlyArray))
}

/** @internal */
export const chunkOf = <A>(config: Config.Config<A>, name?: string): Config.Config<Chunk.Chunk<A>> => {
  return name === undefined ? repeat(config) : nested(name)(repeat(config))
}

/** @internal */
export const date = (name?: string): Config.Config<Date> => {
  const config = primitive(
    "a date property",
    (text) => {
      const result = Date.parse(text)
      if (Number.isNaN(result)) {
        return Either.left(
          configError.InvalidData(
            Chunk.empty(),
            `Expected a date value but received ${text}`
          )
        )
      }
      return Either.right(new Date(result))
    }
  )
  return name === undefined ? config : nested(name)(config)
}

/** @internal */
export const defer = <A>(config: LazyArg<Config.Config<A>>): Config.Config<A> => {
  const lazy = Object.create(proto)
  lazy._tag = OpCodes.OP_LAZY
  lazy.config = config
  return lazy
}

/** @internal */
export const fail = (message: string): Config.Config<never> => {
  const fail = Object.create(proto)
  fail._tag = OpCodes.OP_FAIL
  fail.message = message
  fail.parse = () => Either.left(configError.Unsupported(Chunk.empty(), message))
  return fail
}

/** @internal */
export const float = (name?: string): Config.Config<number> => {
  const config = primitive(
    "a float property",
    (text) => {
      const result = Number.parseFloat(text)
      if (Number.isNaN(result)) {
        return Either.left(
          configError.InvalidData(
            Chunk.empty(),
            `Expected an float value but received ${text}`
          )
        )
      }
      return Either.right(result)
    }
  )
  return name === undefined ? config : nested(name)(config)
}

/** @internal */
export const integer = (name?: string): Config.Config<number> => {
  const config = primitive(
    "an integer property",
    (text) => {
      const result = Number.parseInt(text, 10)
      if (Number.isNaN(result)) {
        return Either.left(
          configError.InvalidData(
            Chunk.empty(),
            `Expected an integer value but received ${text}`
          )
        )
      }
      return Either.right(result)
    }
  )
  return name === undefined ? config : nested(name)(config)
}

/** @internal */
export const map = <A, B>(f: (a: A) => B) => {
  return (self: Config.Config<A>): Config.Config<B> => {
    return pipe(self, mapOrFail((a) => Either.right(f(a))))
  }
}

/** @internal */
export const mapAttempt = <A, B>(f: (a: A) => B) => {
  return (self: Config.Config<A>): Config.Config<B> => {
    return pipe(
      self,
      mapOrFail((a) => {
        try {
          return Either.right(f(a))
        } catch (error) {
          return Either.left(
            configError.InvalidData(
              Chunk.empty(),
              error instanceof Error ? error.message : `${error}`
            )
          )
        }
      })
    )
  }
}

/** @internal */
export const mapOrFail = <A, B>(f: (a: A) => Either.Either<ConfigError.ConfigError, B>) => {
  return (self: Config.Config<A>): Config.Config<B> => {
    const mapOrFail = Object.create(proto)
    mapOrFail._tag = OpCodes.OP_MAP_OR_FAIL
    mapOrFail.original = self
    mapOrFail.mapOrFail = f
    return mapOrFail
  }
}

/** @internal */
export const missingError = (name: string) => {
  return <A>(self: Config.Config.Primitive<A>): ConfigError.ConfigError => {
    return configError.MissingData(Chunk.empty(), `Expected ${self.description} with name ${name}`)
  }
}

/** @internal */
export const nested = (name: string) => {
  return <A>(self: Config.Config<A>): Config.Config<A> => {
    const nested = Object.create(proto)
    nested._tag = OpCodes.OP_NESTED
    nested.name = name
    nested.config = self
    return nested
  }
}

/** @internal */
export const orElse = <A2>(that: LazyArg<Config.Config<A2>>) => {
  return <A>(self: Config.Config<A>): Config.Config<A | A2> => {
    const fallback = Object.create(proto)
    fallback._tag = OpCodes.OP_FALLBACK
    fallback.first = self
    fallback.second = defer(that)
    fallback.condition = constTrue
    return fallback
  }
}

/** @internal */
export const orElseIf = <A2>(
  that: LazyArg<Config.Config<A2>>,
  condition: Predicate<ConfigError.ConfigError>
) => {
  return <A>(self: Config.Config<A>): Config.Config<A> => {
    const fallback = Object.create(proto)
    fallback._tag = OpCodes.OP_FALLBACK
    fallback.first = self
    fallback.second = defer(that)
    fallback.condition = condition
    return fallback
  }
}

/** @internal */
export const optional = <A>(self: Config.Config<A>): Config.Config<Option.Option<A>> => {
  return pipe(
    self,
    map(Option.some),
    orElseIf(() => succeed(Option.none), ConfigError.isMissingDataOnly)
  )
}

/** @internal */
export const primitive = <A>(
  description: string,
  parse: (text: string) => Either.Either<ConfigError.ConfigError, A>
): Config.Config<A> => {
  const primitive = Object.create(proto)
  primitive._tag = OpCodes.OP_PRIMITIVE
  primitive.description = description
  primitive.parse = parse
  return primitive
}

/** @internal */
export const repeat = <A>(self: Config.Config<A>): Config.Config<Chunk.Chunk<A>> => {
  const repeat = Object.create(proto)
  repeat._tag = OpCodes.OP_SEQUENCE
  repeat.config = self
  return repeat
}

/** @internal */
export const secret = (name?: string): Config.Config<ConfigSecret.ConfigSecret> => {
  const config = primitive(
    "a secret property",
    (text) => Either.right(configSecret.fromString(text))
  )
  return name === undefined ? config : nested(name)(config)
}

/** @internal */
export const setOf = <A>(config: Config.Config<A>, name?: string): Config.Config<HashSet.HashSet<A>> => {
  const newConfig = pipe(chunkOf(config), map(HashSet.from))
  return name === undefined ? newConfig : nested(name)(newConfig)
}

/** @internal */
export const string = (name?: string): Config.Config<string> => {
  const config = primitive(
    "a text property",
    Either.right
  )
  return name === undefined ? config : nested(name)(config)
}

/** @internal */
export const struct = <NER extends Record<string, Config.Config<any>>>(
  r: EnforceNonEmptyRecord<NER> | Record<string, Config.Config<any>>
): Config.Config<
  {
    [K in keyof NER]: [NER[K]] extends [{ [ConfigTypeId]: { _A: (_: never) => infer A } }] ? A : never
  }
> => {
  const entries = Object.entries(r)
  let result = pipe(entries[0][1], map((value) => ({ [entries[0][0]]: value })))
  if (entries.length === 1) {
    return result as any
  }
  const rest = entries.slice(1)
  for (const [key, config] of rest) {
    result = pipe(
      result,
      zipWith(config, (record, value) => ({ ...record, [key]: value }))
    )
  }
  return result as any
}

/** @internal */
export const succeed = <A>(value: A): Config.Config<A> => {
  const constant = Object.create(proto)
  constant._tag = OpCodes.OP_CONSTANT
  constant.value = value
  constant.parse = () => Either.right(value)
  return constant
}

/** @internal */
export const sync = <A>(value: LazyArg<A>): Config.Config<A> => {
  return defer(() => succeed(value()))
}

/** @internal */
export const table = <A>(config: Config.Config<A>, name?: string): Config.Config<HashMap.HashMap<string, A>> => {
  const table = Object.create(proto)
  table._tag = OpCodes.OP_TABLE
  table.valueConfig = config
  return name === undefined ? table : nested(name)(table)
}

/** @internal */
export const tuple = <T extends NonEmptyArrayConfig>(...tuple: T): Config.Config<TupleConfig<T>> => {
  if (tuple.length === 1) {
    return tuple[0]
  }
  let result = tuple[0]
  const rest = tuple.slice(1)
  for (const config of rest) {
    result = pipe(result, zipWith(config, (tuple, value) => [...tuple, value])) as any
  }
  return result as any
}

/** @internal */
export const validate: {
  <A, B extends A>(message: string, f: Refinement<A, B>): (self: Config.Config<A>) => Config.Config<B>
  <A>(message: string, f: Predicate<A>): (self: Config.Config<A>) => Config.Config<A>
} = <A>(message: string, f: Predicate<A>) => {
  return (self: Config.Config<A>): Config.Config<A> => {
    return pipe(
      self,
      mapOrFail((a) => {
        if (f(a)) {
          return Either.right(a)
        }
        return Either.left(configError.InvalidData(Chunk.empty(), message))
      })
    )
  }
}

/** @internal */
export const withDefault = <A2>(def: A2) => {
  return <A>(self: Config.Config<A>): Config.Config<A | A2> =>
    pipe(self, orElseIf(() => succeed(def), ConfigError.isMissingDataOnly))
}

/** @internal */
export const withDescription = (description: string) => {
  return <A>(self: Config.Config<A>): Config.Config<A> => {
    const described = Object.create(proto)
    described._tag = OpCodes.OP_DESCRIBED
    described.config = self
    described.description = description
    return described
  }
}

/** @internal */
export const zip = <B>(that: Config.Config<B>) => {
  return <A>(self: Config.Config<A>): Config.Config<readonly [A, B]> => {
    return pipe(self, zipWith(that, (a, b) => [a, b]))
  }
}

/** @internal */
export const zipWith = <B, A, C>(that: Config.Config<B>, f: (a: A, b: B) => C) => {
  return (self: Config.Config<A>): Config.Config<C> => {
    const zipWith = Object.create(proto)
    zipWith._tag = OpCodes.OP_ZIP_WITH
    zipWith.left = self
    zipWith.right = that
    zipWith.zip = f
    return zipWith
  }
}
