import type * as Config from "@effect/io/Config"
import type * as ConfigError from "@effect/io/Config/Error"
import type * as ConfigProvider from "@effect/io/Config/Provider"
import { getCallTrace } from "@effect/io/Debug"
import type * as Effect from "@effect/io/Effect"
import * as _config from "@effect/io/internal/config"
import * as configError from "@effect/io/internal/configError"
import * as configSecret from "@effect/io/internal/configSecret"
import * as core from "@effect/io/internal/core"
import * as OpCodes from "@effect/io/internal/opCodes/config"
import * as Chunk from "@fp-ts/data/Chunk"
import * as Context from "@fp-ts/data/Context"
import * as Either from "@fp-ts/data/Either"
import type { LazyArg } from "@fp-ts/data/Function"
import { pipe } from "@fp-ts/data/Function"
import * as HashMap from "@fp-ts/data/HashMap"
import * as HashSet from "@fp-ts/data/HashSet"
import * as Option from "@fp-ts/data/Option"

/** @internal */
export const configProviderTag: Context.Tag<ConfigProvider.ConfigProvider> = Context.Tag()

/** @internal */
const ConfigProviderSymbolKey = "@effect/io/Config/Provider"

/** @internal */
export const ConfigProviderTypeId: ConfigProvider.ConfigProviderTypeId = Symbol.for(
  ConfigProviderSymbolKey
) as ConfigProvider.ConfigProviderTypeId

/** @internal */
const FlatConfigProviderSymbolKey = "@effect/io/Config/Provider/Flat"

/** @internal */
export const FlatConfigProviderTypeId: ConfigProvider.FlatConfigProviderTypeId = Symbol.for(
  FlatConfigProviderSymbolKey
) as ConfigProvider.FlatConfigProviderTypeId

/** @internal */
export const make = (
  load: <A>(config: Config.Config<A>) => Effect.Effect<never, ConfigError.ConfigError, A>,
  flatten: () => ConfigProvider.ConfigProvider.Flat
): ConfigProvider.ConfigProvider => {
  return {
    [ConfigProviderTypeId]: ConfigProviderTypeId,
    load: (config) => {
      const trace = getCallTrace()
      return load(config).traced(trace)
    },
    flatten
  }
}

/** @internal */
export const makeFlat = (
  load: <A>(
    path: Chunk.Chunk<string>,
    config: Config.Config.Primitive<A>
  ) => Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>,
  enumerateChildren: (
    path: Chunk.Chunk<string>
  ) => Effect.Effect<never, ConfigError.ConfigError, HashSet.HashSet<string>>
): ConfigProvider.ConfigProvider.Flat => {
  return {
    [FlatConfigProviderTypeId]: FlatConfigProviderTypeId,
    load: (path, config) => {
      const trace = getCallTrace()
      return load(path, config).traced(trace)
    },
    enumerateChildren: (path) => {
      const trace = getCallTrace()
      return enumerateChildren(path).traced(trace)
    }
  }
}

/** @internal */
export const fromFlat = (flat: ConfigProvider.ConfigProvider.Flat): ConfigProvider.ConfigProvider => {
  return make(
    (config) => {
      const trace = getCallTrace()
      return pipe(
        fromFlatLoop(flat, Chunk.empty(), config),
        core.flatMap((chunk) =>
          pipe(
            Chunk.head(chunk),
            Option.match(
              () =>
                core.fail(
                  configError.MissingData(
                    Chunk.empty(),
                    `Expected a single value having structure: ${config}`
                  )
                ),
              core.succeed
            )
          )
        )
      ).traced(trace)
    },
    () => flat
  )
}

/** @internal */
export const fromEnv = (
  config: Partial<ConfigProvider.ConfigProvider.FromEnvConfig> = {}
): ConfigProvider.ConfigProvider => {
  const { pathDelim, seqDelim } = Object.assign({}, { pathDelim: "_", seqDelim: "," }, config)
  const makePathString = (path: Chunk.Chunk<string>): string => pipe(path, Chunk.join(pathDelim))
  const unmakePathString = (pathString: string): ReadonlyArray<string> => pathString.split(pathDelim)

  const getEnv = () =>
    typeof process !== "undefined" && "env" in process && typeof process.env === "object" ? process.env : {}

  const load = <A>(
    path: Chunk.Chunk<string>,
    primitive: Config.Config.Primitive<A>
  ): Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>> => {
    const trace = getCallTrace()
    const pathString = makePathString(path)
    const current = getEnv()
    const valueOpt = pathString in current ? Option.some(current[pathString]!) : Option.none
    return pipe(
      core.fromOption(valueOpt),
      core.mapError(() => configError.MissingData(path, `Expected ${pathString} to exist in the process environment`)),
      core.flatMap((value) => parsePrimitive(value, path, primitive, seqDelim))
    ).traced(trace)
  }

  const enumerateChildren = (
    path: Chunk.Chunk<string>
  ): Effect.Effect<never, ConfigError.ConfigError, HashSet.HashSet<string>> => {
    return core.sync(() => {
      const current = getEnv()
      const keys = Object.keys(current)
      const keyPaths = Array.from(keys).map(unmakePathString)
      const filteredKeyPaths = keyPaths.filter((keyPath) => {
        for (let i = 0; i < path.length; i++) {
          const pathComponent = pipe(path, Chunk.unsafeGet(i))
          const currentElement = keyPath[i]
          if (currentElement === undefined || pathComponent !== currentElement) {
            return false
          }
        }
        return true
      }).flatMap((keyPath) => keyPath.slice(path.length, path.length + 1))
      return HashSet.from(filteredKeyPaths)
    })
  }

  return fromFlat(makeFlat(load, enumerateChildren))
}

/** @internal */
export const fromMap = (
  map: Map<string, string>,
  config: Partial<ConfigProvider.ConfigProvider.FromMapConfig> = {}
): ConfigProvider.ConfigProvider => {
  const { pathDelim, seqDelim } = Object.assign({}, { seqDelim: ",", pathDelim: "." }, config)
  const makePathString = (path: Chunk.Chunk<string>): string => pipe(path, Chunk.join(pathDelim))
  const unmakePathString = (pathString: string): ReadonlyArray<string> => pathString.split(pathDelim)
  const load = <A>(
    path: Chunk.Chunk<string>,
    primitive: Config.Config.Primitive<A>
  ): Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>> => {
    const trace = getCallTrace()
    const pathString = makePathString(path)
    const valueOpt = map.has(pathString) ? Option.some(map.get(pathString)!) : Option.none
    return pipe(
      core.fromOption(valueOpt),
      core.mapError(() => configError.MissingData(path, `Expected ${pathString} to exist in the provided map`)),
      core.flatMap((value) => parsePrimitive(value, path, primitive, seqDelim))
    ).traced(trace)
  }
  const enumerateChildren = (
    path: Chunk.Chunk<string>
  ): Effect.Effect<never, ConfigError.ConfigError, HashSet.HashSet<string>> => {
    return core.sync(() => {
      const keyPaths = Array.from(map.keys()).map(unmakePathString)
      const filteredKeyPaths = keyPaths.filter((keyPath) => {
        for (let i = 0; i < path.length; i++) {
          const pathComponent = pipe(path, Chunk.unsafeGet(i))
          const currentElement = keyPath[i]
          if (currentElement === undefined || pathComponent !== currentElement) {
            return false
          }
        }
        return true
      }).flatMap((keyPath) => keyPath.slice(path.length, path.length + 1))
      return HashSet.from(filteredKeyPaths)
    })
  }
  return fromFlat(makeFlat(load, enumerateChildren))
}

/** @internal */
const extend = <A, B>(
  leftDef: (n: number) => A,
  rightDef: (n: number) => B,
  left: Chunk.Chunk<A>,
  right: Chunk.Chunk<B>
): readonly [Chunk.Chunk<A>, Chunk.Chunk<B>] => {
  const leftPad = Chunk.unfold(
    left.length,
    (index) =>
      index >= right.length ?
        Option.none :
        Option.some([leftDef(index), index + 1])
  )
  const rightPad = Chunk.unfold(
    right.length,
    (index) =>
      index >= left.length ?
        Option.none :
        Option.some([rightDef(index), index + 1])
  )
  const leftExtension = pipe(left, Chunk.concat(leftPad))
  const rightExtension = pipe(right, Chunk.concat(rightPad))
  return [leftExtension, rightExtension]
}

/** @internal */
const fromFlatLoop = <A>(
  flat: ConfigProvider.ConfigProvider.Flat,
  prefix: Chunk.Chunk<string>,
  config: Config.Config<A>
): Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>> => {
  const trace = getCallTrace()
  const op = config as _config.ConfigPrimitive
  switch (op._tag) {
    case OpCodes.OP_CONSTANT: {
      return core.succeed(Chunk.of(op.value)).traced(trace) as Effect.Effect<
        never,
        ConfigError.ConfigError,
        Chunk.Chunk<A>
      >
    }
    case OpCodes.OP_DESCRIBED: {
      return core.suspendSucceed(
        () => fromFlatLoop(flat, prefix, op.config)
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_FAIL: {
      return core.fail(configError.MissingData(prefix, op.message)).traced(trace) as Effect.Effect<
        never,
        ConfigError.ConfigError,
        Chunk.Chunk<A>
      >
    }
    case OpCodes.OP_FALLBACK: {
      return pipe(
        core.suspendSucceed(() => fromFlatLoop(flat, prefix, op.first)),
        core.catchAll((error1) => {
          if (op.condition(error1)) {
            return pipe(
              fromFlatLoop(flat, prefix, op.second),
              core.catchAll((error2) => core.fail(configError.Or(error1, error2)))
            )
          }
          return core.fail(error1)
        })
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_LAZY: {
      return core.suspendSucceed(() => fromFlatLoop(flat, prefix, op.config())).traced(
        trace
      ) as Effect.Effect<
        never,
        ConfigError.ConfigError,
        Chunk.Chunk<A>
      >
    }
    case OpCodes.OP_MAP_OR_FAIL: {
      return core.suspendSucceed(() =>
        pipe(
          fromFlatLoop(flat, prefix, op.original),
          core.flatMap(
            core.forEach((a) =>
              pipe(
                core.fromEither(op.mapOrFail(a)),
                core.mapError(configError.prefixed(prefix))
              )
            )
          )
        )
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_NESTED: {
      return core.suspendSucceed(() =>
        fromFlatLoop(
          flat,
          pipe(prefix, Chunk.concat(Chunk.of(op.name))),
          op.config
        )
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_PRIMITIVE: {
      return pipe(
        flat.load(prefix, op),
        core.flatMap((values) => {
          if (Chunk.isEmpty(values)) {
            const name = pipe(Chunk.last(prefix), Option.getOrElse(() => "<n/a>"))
            return core.fail(_config.missingError(name))
          }
          return core.succeed(values)
        })
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_SEQUENCE: {
      return core.suspendSucceed(() =>
        pipe(
          fromFlatLoop(flat, prefix, op.config),
          core.map(Chunk.of)
        )
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_TABLE: {
      return core.suspendSucceed(() =>
        pipe(
          flat.enumerateChildren(prefix),
          core.flatMap((keys) => {
            return pipe(
              keys,
              core.forEach((key) =>
                fromFlatLoop(
                  flat,
                  pipe(prefix, Chunk.concat(Chunk.of(key))),
                  op.valueConfig
                )
              ),
              core.map((values) => {
                if (values.length === 0) {
                  return Chunk.of(HashMap.empty())
                }
                const matrix = Chunk.toReadonlyArray(values).map(Chunk.toReadonlyArray) as Array<Array<unknown>>
                return pipe(
                  Chunk.unsafeFromArray(transpose(matrix).map(Chunk.unsafeFromArray)),
                  Chunk.map((values) => HashMap.from(pipe(Chunk.fromIterable(keys), Chunk.zip(values))))
                )
              })
            )
          })
        )
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
    case OpCodes.OP_ZIP_WITH: {
      return core.suspendSucceed(() =>
        pipe(
          fromFlatLoop(flat, prefix, op.left),
          core.either,
          core.flatMap((left) =>
            pipe(
              fromFlatLoop(flat, prefix, op.right),
              core.either,
              core.flatMap((right) => {
                if (Either.isLeft(left) && Either.isLeft(right)) {
                  return core.fail(configError.And(left.left, right.left))
                }
                if (Either.isLeft(left) && Either.isRight(right)) {
                  return core.fail(left.left)
                }
                if (Either.isRight(left) && Either.isLeft(right)) {
                  return core.fail(right.left)
                }
                if (Either.isRight(left) && Either.isRight(right)) {
                  const path = pipe(prefix, Chunk.join("."))
                  const fail = fromFlatLoopFail(prefix, path)
                  const [lefts, rights] = extend(
                    fail,
                    fail,
                    pipe(left.right, Chunk.map(Either.right)),
                    pipe(right.right, Chunk.map(Either.right))
                  )
                  return pipe(
                    lefts,
                    Chunk.zip(rights),
                    core.forEach(([left, right]) =>
                      pipe(
                        core.fromEither(left),
                        core.zip(core.fromEither(right)),
                        core.map(([left, right]) => op.zip(left, right))
                      )
                    )
                  )
                }
                throw new Error(
                  "BUG: ConfigProvider.fromFlatLoop - please report an issue at https://github.com/Effect-TS/io/issues"
                )
              })
            )
          )
        )
      ).traced(trace) as unknown as Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>>
    }
  }
}

/** @internal */
const fromFlatLoopFail = (prefix: Chunk.Chunk<string>, path: string) => {
  return (index: number): Either.Either<ConfigError.ConfigError, unknown> => {
    return Either.left(
      configError.MissingData(
        prefix,
        `The element at index ${index} in a sequence at path "${path}" was missing`
      )
    )
  }
}

/** @internal */
export const nested = (name: string) => {
  return (self: ConfigProvider.ConfigProvider): ConfigProvider.ConfigProvider =>
    fromFlat(pipe(self.flatten(), nestedFlat(name)))
}

/** @internal */
const nestedFlat = (name: string) => {
  return (self: ConfigProvider.ConfigProvider.Flat): ConfigProvider.ConfigProvider.Flat =>
    makeFlat(
      (path, config) => {
        const trace = getCallTrace()
        return self.load(pipe(path, Chunk.prepend(name)), config).traced(trace)
      },
      (path) => {
        const trace = getCallTrace()
        return self.enumerateChildren(pipe(path, Chunk.prepend(name))).traced(trace)
      }
    )
}

/** @internal */
export const orElse = (that: LazyArg<ConfigProvider.ConfigProvider>) => {
  return (self: ConfigProvider.ConfigProvider): ConfigProvider.ConfigProvider =>
    fromFlat(pipe(self.flatten(), orElseFlat(() => that().flatten())))
}

/** @internal */
const orElseFlat = (that: LazyArg<ConfigProvider.ConfigProvider.Flat>) => {
  return (self: ConfigProvider.ConfigProvider.Flat): ConfigProvider.ConfigProvider.Flat =>
    makeFlat(
      (path, config) =>
        pipe(
          self.load(path, config),
          core.catchAll((error1) =>
            pipe(
              that().load(path, config),
              core.catchAll((error2) => core.fail(configError.Or(error1, error2)))
            )
          )
        ),
      (path) =>
        pipe(
          core.either(self.enumerateChildren(path)),
          core.flatMap((left) =>
            pipe(
              core.either(that().enumerateChildren(path)),
              core.flatMap((right) => {
                if (Either.isLeft(left) && Either.isLeft(right)) {
                  return core.fail(configError.And(left.left, right.left))
                }
                if (Either.isLeft(left) && Either.isRight(right)) {
                  return core.fail(left.left)
                }
                if (Either.isRight(left) && Either.isLeft(right)) {
                  return core.fail(right.left)
                }
                if (Either.isRight(left) && Either.isRight(right)) {
                  return core.succeed(pipe(left.right, HashSet.union(right.right)))
                }
                throw new Error(
                  "BUG: ConfigProvider.orElseFlat - please report an issue at https://github.com/Effect-TS/io/issues"
                )
              })
            )
          )
        )
    )
}

/** @internal */
const splitPathString = (text: string, delim: string): Chunk.Chunk<string> => {
  const split = text.split(new RegExp(`\\s*${escapeRegex(delim)}\\s*`))
  return Chunk.unsafeFromArray(split)
}

/** @internal */
const parsePrimitive = <A>(
  text: string,
  path: Chunk.Chunk<string>,
  primitive: Config.Config.Primitive<A>,
  delimiter: string
): Effect.Effect<never, ConfigError.ConfigError, Chunk.Chunk<A>> => {
  const unsplit = configSecret.isConfigSecret(primitive)
  if (unsplit) {
    return pipe(core.fromEither(primitive.parse(text)), core.map(Chunk.of))
  }
  return pipe(
    splitPathString(text, delimiter),
    core.forEach((char) => core.fromEither(primitive.parse(char.trim()))),
    core.mapError(configError.prefixed(path))
  )
}

const transpose = <A>(array: Array<Array<A>>): Array<Array<A>> => {
  return Object.keys(array[0]).map((column) => array.map((row) => row[column]))
}

const escapeRegex = (string: string): string => {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&")
}
