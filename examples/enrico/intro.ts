import * as Cause from "@effect/io/Cause"
import * as Effect from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
// import * as Layer from "@effect/io/Layer"
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
  _service: typeof BarId
  bar: string
}

export const Bar = Context.Tag<Bar>()

const c = Effect.delay(Duration.millis(100))(Effect.serviceWithEffect(Foo, ({ foo }) => Effect.log(`foo is ${foo}`)))
const d = Effect.delay(Duration.millis(100))(Effect.serviceWithEffect(Bar, ({ bar }) => Effect.log(`bar is ${bar}`)))

const cd = pipe(
  Effect.tuplePar(
    c,
    d,
    c,
    d,
    c,
    d,
    c,
    d,
    c,
    d,
    c,
    d,
    c,
    d,
    Effect.sync(() => {
      throw new Error("bah")
    })
  ),
  Effect.withParallelism(4)
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
  if (Exit.isFailure(exit)) {
    console.log(Cause.pretty()(exit.cause))
  }
})
