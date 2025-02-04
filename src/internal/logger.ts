import type * as CauseExt from "@effect/io/Cause"
import type * as FiberId from "@effect/io/Fiber/Id"
import type * as FiberRefs from "@effect/io/FiberRefs"
import * as Cause from "@effect/io/internal/cause"
import * as Pretty from "@effect/io/internal/cause-pretty"
import * as _fiberId from "@effect/io/internal/fiberId"
import type * as Logger from "@effect/io/Logger"
import type * as LogLevel from "@effect/io/Logger/Level"
import * as LogSpan from "@effect/io/Logger/Span"
import type { Runtime } from "@effect/io/Runtime"
import * as Chunk from "@fp-ts/data/Chunk"
import type { LazyArg } from "@fp-ts/data/Function"
import { constVoid, pipe } from "@fp-ts/data/Function"
import * as HashMap from "@fp-ts/data/HashMap"
import * as Option from "@fp-ts/data/Option"

/** @internal */
const LoggerSymbolKey = "@effect/io/Logger"

/** @internal */
export const LoggerTypeId: Logger.LoggerTypeId = Symbol.for(
  LoggerSymbolKey
) as Logger.LoggerTypeId

/** @internal */
const loggerVariance = {
  _Message: (_: unknown) => _,
  _Output: (_: never) => _
}

/** @internal */
export const makeLogger = <Message, Output>(
  log: (
    fiberId: FiberId.FiberId,
    logLevel: LogLevel.LogLevel,
    message: Message,
    cause: CauseExt.Cause<unknown>,
    context: FiberRefs.FiberRefs,
    spans: Chunk.Chunk<LogSpan.LogSpan>,
    annotations: HashMap.HashMap<string, string>,
    runtime: Runtime<never>
  ) => Output
): Logger.Logger<Message, Output> => ({
  [LoggerTypeId]: loggerVariance,
  log
})

/** @internal */
export const stringLogger: Logger.Logger<string, string> = makeLogger<string, string>(
  (fiberId, logLevel, message, cause, _context, spans, annotations, runtime) => {
    const now = new Date()
    const nowMillis = now.getTime()

    const outputArray = [
      `timestamp=${now.toISOString()}`,
      `level=${logLevel.label}`,
      `fiber=${_fiberId.threadName(fiberId)}`
    ]

    let output = outputArray.join(" ")

    if (message.length > 0) {
      output = output + " message="
      output = appendQuoted(message, output)
    }

    if (cause != null && cause != Cause.empty) {
      output = output + " cause="
      output = appendQuoted(runtime.unsafeRunSync(Pretty.prettySafe(cause, Pretty.defaultRenderer)), output)
    }

    if (Chunk.isNonEmpty(spans)) {
      output = output + " "

      let first = true
      for (const span of spans) {
        if (first) {
          first = false
        } else {
          output = output + " "
        }
        output = output + pipe(span, LogSpan.render(nowMillis))
      }
    }

    if (pipe(annotations, HashMap.size) > 0) {
      output = output + " "

      let first = true
      for (const [key, value] of annotations) {
        if (first) {
          first = false
        } else {
          output = output + " "
        }
        output = output + filterKeyName(key)
        output = output + "="
        output = appendQuoted(value, output)
      }
    }

    return output
  }
)

/** @internal */
function escapeDoubleQuotes(str: string) {
  return `"${str.replace(/\\([\s\S])|(")/g, "\\$1$2")}"`
}

const textOnly = /^[^\s"=]+$/

/** @internal */
const appendQuoted = (label: string, output: string): string => {
  return output + (label.match(textOnly) ? label : escapeDoubleQuotes(label))
}

/** @internal */
export const logfmtLogger = makeLogger<string, string>(
  (fiberId, logLevel, message, cause, _context, spans, annotations, runtime) => {
    const now = new Date()
    const nowMillis = now.getTime()

    const outputArray = [
      `timestamp=${now.toISOString()}`,
      `level=${logLevel.label}`,
      `fiber=${_fiberId.threadName(fiberId)}`
    ]

    let output = outputArray.join(" ")

    if (message.length > 0) {
      output = output + " message="
      output = appendQuotedLogfmt(message, output)
    }

    if (cause != null && cause != Cause.empty) {
      output = output + " cause="
      output = appendQuotedLogfmt(runtime.unsafeRunSync(Pretty.prettySafe(cause, Pretty.defaultRenderer)), output)
    }

    if (Chunk.isNonEmpty(spans)) {
      output = output + " "

      let first = true
      for (const span of spans) {
        if (first) {
          first = false
        } else {
          output = output + " "
        }
        output = output + pipe(span, renderLogSpanLogfmt(nowMillis))
      }
    }

    if (pipe(annotations, HashMap.size) > 0) {
      output = output + " "

      let first = true
      for (const [key, value] of annotations) {
        if (first) {
          first = false
        } else {
          output = output + " "
        }
        output = output + filterKeyName(key)
        output = output + "="
        output = appendQuotedLogfmt(value, output)
      }
    }

    return output
  }
)

/** @internal */
function filterKeyName(key: string) {
  return key.replace(/[\s="]/g, "_")
}

/** @internal */
function escapeDoubleQuotesLogfmt(str: string) {
  return JSON.stringify(str)
}

/** @internal */
const appendQuotedLogfmt = (label: string, output: string): string => {
  return output + (label.match(textOnly) ? label : escapeDoubleQuotesLogfmt(label))
}

/** @internal */
const renderLogSpanLogfmt = (now: number) => {
  return (self: LogSpan.LogSpan): string => {
    const label = filterKeyName(self.label)
    return `${label}=${now - self.startTime}ms`
  }
}

/** @internal */
export function contramap<Message, Message2>(f: (message: Message2) => Message) {
  return <Output>(self: Logger.Logger<Message, Output>): Logger.Logger<Message2, Output> => ({
    [LoggerTypeId]: loggerVariance,
    log: (fiberId, logLevel, message, cause, context, spans, annotations, runtime) => {
      return self.log(fiberId, logLevel, f(message), cause, context, spans, annotations, runtime)
    }
  })
}

/** @internal */
export const filterLogLevel = (f: (logLevel: LogLevel.LogLevel) => boolean) => {
  return <Message, Output>(self: Logger.Logger<Message, Output>): Logger.Logger<Message, Option.Option<Output>> => ({
    [LoggerTypeId]: loggerVariance,
    log: (fiberId, logLevel, message, cause, context, spans, annotations, runtime) => {
      return f(logLevel)
        ? Option.some(
          self.log(
            fiberId,
            logLevel,
            message,
            cause,
            context,
            spans,
            annotations,
            runtime
          )
        )
        : Option.none
    }
  })
}

/** @internal */
export const map = <Output, Output2>(f: (output: Output) => Output2) => {
  return <Message>(self: Logger.Logger<Message, Output>): Logger.Logger<Message, Output2> => ({
    [LoggerTypeId]: loggerVariance,
    log: (fiberId, logLevel, message, cause, context, spans, annotations, runtime) => {
      return f(self.log(fiberId, logLevel, message, cause, context, spans, annotations, runtime))
    }
  })
}

/** @internal */
export const none = (): Logger.Logger<unknown, void> => ({
  [LoggerTypeId]: loggerVariance,
  log: constVoid
})

/** @internal */
export const simple = <A, B>(log: (a: A) => B): Logger.Logger<A, B> => ({
  [LoggerTypeId]: loggerVariance,
  log: (_fiberId, _logLevel, message, _cause, _context, _spans, _annotations) => {
    return log(message)
  }
})

/** @internal */
export const succeed = <A>(value: A): Logger.Logger<unknown, A> => {
  return simple(() => value)
}

/** @internal */
export const sync = <A>(evaluate: LazyArg<A>): Logger.Logger<unknown, A> => {
  return simple(evaluate)
}

/** @internal */
export const zip = <Message2, Output2>(that: Logger.Logger<Message2, Output2>) => {
  return <Message, Output>(
    self: Logger.Logger<Message, Output>
  ): Logger.Logger<Message & Message2, readonly [Output, Output2]> => ({
    [LoggerTypeId]: loggerVariance,
    log: (fiberId, logLevel, message, cause, context, spans, annotations, runtime) =>
      [
        self.log(fiberId, logLevel, message, cause, context, spans, annotations, runtime),
        that.log(fiberId, logLevel, message, cause, context, spans, annotations, runtime)
      ] as const
  })
}

/** @internal */
export const zipLeft = <Message2, Output2>(that: Logger.Logger<Message2, Output2>) => {
  return <Message, Output>(
    self: Logger.Logger<Message, Output>
  ): Logger.Logger<Message & Message2, Output> => {
    return pipe(self, zip(that), map((tuple) => tuple[0]))
  }
}

/** @internal */
export const zipRight = <Message2, Output2>(that: Logger.Logger<Message2, Output2>) => {
  return <Message, Output>(
    self: Logger.Logger<Message, Output>
  ): Logger.Logger<Message & Message2, Output2> => {
    return pipe(self, zip(that), map((tuple) => tuple[1]))
  }
}
