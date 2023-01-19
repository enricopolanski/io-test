import * as Cause from "@effect/io/Cause"
import * as Effect from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
import * as Layer from "@effect/io/Layer"
import * as Context from "@fp-ts/data/Context"
import * as Duration from "@fp-ts/data/Duration"
import { pipe } from "@fp-ts/data/Function"

export const FooId: unique symbol = Symbol()
export interface Foo {
  _service: typeof FooId
  foo: string
}

export const Foo = Context.Tag<Foo>()

export const BarId: unique symbol = Symbol()
export interface Bar {
  readonly _service: typeof BarId
  readonly bar: string
}

export const Bar = Context.Tag<Bar>()

const c = Effect.delay(Duration.millis(100))(Effect.serviceWithEffect(Foo, ({ foo }) => Effect.log(`foo is ${foo}`)))
const d = Effect.delay(Duration.millis(100))(Effect.serviceWithEffect(Bar, ({ bar }) => Effect.log(`bar is ${bar}`)))

Effect.promise(() => Promise.resolve(0))
Effect.tryCatchPromise(() => Promise.resolve(0), () => new Error("bla"))
Effect.tryPromiseInterrupt((signal) => fetch("bla", { signal }))

Effect.asyncInterrupt<never, string, void>((resume) => {
  const timer = setTimeout(() => {
    resume(Effect.unit())
  }, 1000)
  return Effect.sync(() => {
    clearTimeout(timer)
  })
})

const cd = pipe(
  Effect.tuplePar(c, d, c),
  Effect.withParallelism(4)
)

const FooLive = Layer.succeed(
  Foo,
  { _service: FooId, foo: "ok" }
)

const res = pipe(
  [0, 1, 2],
  Effect.reduce("", (s, n) => Effect.succeed(`${s}(${n})`))
)

const BarLive = Layer.scoped(
  Bar,
  Effect.gen(function*($) {
    const foo = yield* $(Effect.service(Foo))
    return {
      _service: BarId,
      bar: `bar: ${foo}`
    } as const
  })
)

const AppLive = pipe(
  FooLive,
  Layer.provideToAndMerge(BarLive)
)

const main = pipe(
  cd,
  Effect.provideSomeLayer(AppLive)
)

const fiber = Effect.unsafeFork(main)

fiber.unsafeAddObserver((exit) => {
  if (Exit.isFailure(exit)) {
    console.log(Cause.pretty()(exit.cause))
  }
})
