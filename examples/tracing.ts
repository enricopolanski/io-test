import * as Cause from "@effect/io/Cause"
import * as Effect from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
import { pipe } from "@fp-ts/data/Function"

const program = pipe(
  Effect.suspendSucceed(() => Effect.fail("ok")),
  Effect.flatMap(() => Effect.succeed(0))
)

Effect.unsafeRunPromiseExit(program).then((exit) => {
  if (Exit.isFailure(exit)) {
    console.log(Cause.pretty()(exit.cause))
  }
})
