import type * as ExecutionStrategy from "@effect/io/ExecutionStrategy"
import type { LazyArg } from "@fp-ts/data/Function"

/** @internal */
export const OP_SEQUENTIAL = "Sequential" as const

/** @internal */
export type OP_SEQUENTIAL = typeof OP_SEQUENTIAL

/** @internal */
export const OP_PARALLEL = "Parallel" as const

/** @internal */
export type OP_PARALLEL = typeof OP_PARALLEL

/** @internal */
export const OP_PARALLEL_N = "ParallelN" as const

/** @internal */
export type OP_PARALLEL_N = typeof OP_PARALLEL_N

/** @internal */
export const sequential: ExecutionStrategy.ExecutionStrategy = { _tag: OP_SEQUENTIAL }

/** @internal */
export const parallel: ExecutionStrategy.ExecutionStrategy = { _tag: OP_PARALLEL }

/** @internal */
export const parallelN = (parallelism: number): ExecutionStrategy.ExecutionStrategy => {
  return { _tag: OP_PARALLEL_N, parallelism }
}

/** @internal */
export const isSequential = (self: ExecutionStrategy.ExecutionStrategy): self is ExecutionStrategy.Sequential => {
  return self._tag === OP_SEQUENTIAL
}

/** @internal */
export const isParallel = (self: ExecutionStrategy.ExecutionStrategy): self is ExecutionStrategy.Parallel => {
  return self._tag === OP_PARALLEL
}

/** @internal */
export const isParallelN = (self: ExecutionStrategy.ExecutionStrategy): self is ExecutionStrategy.ParallelN => {
  return self._tag === OP_PARALLEL_N
}

/** @internal */
export const match = <A>(
  onSequential: LazyArg<A>,
  onParallel: LazyArg<A>,
  onParallelN: (n: number) => A
) => {
  return (self: ExecutionStrategy.ExecutionStrategy): A => {
    switch (self._tag) {
      case OP_SEQUENTIAL: {
        return onSequential()
      }
      case OP_PARALLEL: {
        return onParallel()
      }
      case OP_PARALLEL_N: {
        return onParallelN(self.parallelism)
      }
    }
  }
}
