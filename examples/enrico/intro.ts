import * as Effect from "@effect/io/Effect"
import * as Fiber from "@effect/io/Fiber"
// import * as Layer from "@effect/io/Layer"
import * as Context from "@fp-ts/data/Context"
import { pipe } from "@fp-ts/data/Function"

export const FooId: unique symbol = Symbol()
export interface Foo {
  _service: typeof FooId
  foo: string
}

export const Foo = Context.Tag<Foo>()

export const BarId: unique symbol = Symbol()
export interface Bar {
  _service: typeof BarId
  bar: string
}

export const Bar = Context.Tag<Bar>()

const c = Effect.serviceWithEffect(Foo, ({ foo }) => Effect.log(`foo is ${foo}`))
const d = Effect.serviceWithEffect(Bar, ({ bar }) => Effect.log(`bar is ${bar}`))

const cd = pipe(
  Effect.fork(c),
  Effect.flatMap((a0) =>
    pipe(
      Effect.fork(d),
      Effect.flatMap((a1) =>
        pipe(
          Fiber.join(a0),
          Effect.flatMap((resA0) => pipe(Fiber.join(a1), Effect.map((resA1) => [resA0, resA1] as const)))
        )
      )
    )
  )
)

const makeBar = Effect.serviceWith(Foo, ({ foo }): Bar => ({ _service: BarId, bar: `bar(${foo})` }))

const mioEnv = <R, E, A>(effect: Effect.Effect<R, E, A>) =>
  pipe(
    effect,
    Effect.provideServiceEffect(Bar, makeBar),
    Effect.provideService(Foo, { _service: FooId, foo: "ok" })
  )

const main = pipe(
  cd,
  mioEnv
)

const fiber = Effect.unsafeFork(main)

fiber.unsafeAddObserver((exit) => {
  console.log(exit)
})
