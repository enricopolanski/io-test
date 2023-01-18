/**
 * @since 1.0.0
 */

import { identity } from "@fp-ts/data/Function"

/**
 * @since 1.0.0
 * @category models
 */
export interface Debug {
  /**
   * Overrides the default log level filter for loggers such as console.
   */
  minumumLogLevel: "All" | "Fatal" | "Error" | "Warning" | "Info" | "Debug" | "Trace" | "None"
  /**
   * Sets a limit on how many stack traces should be rendered.
   */
  traceStackLimit: number
  /**
   * Sets a limit on how many execution traces should be rendered.
   */
  traceExecutionLimit: number
  /**
   * Enables debug logging of execution traces.
   */
  traceExecutionLogEnabled: boolean
  /**
   * Enables debug logging of execution traces.
   */
  tracingEnabled: boolean
  /**
   * Enables debug logging of execution traces.
   */
  tracingRuntimeEnabled: boolean
}

const getCallTraceFromNewError = (at: number): string | undefined => {
  if (!runtimeDebug.tracingRuntimeEnabled) {
    return
  }
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = at
  const stack = new Error().stack
  Error.stackTraceLimit = limit
  if (stack) {
    const lines = stack.split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.startsWith("Error")) {
        const m = lines[i + at]?.match(/(file:\/\/)?\/(.*):(\d+):(\d+)/)
        if (m) {
          return `/${m[2]}:${m[3]}:${m[4]}`
        }
      }
    }
  }
}

const levels = ["All", "Fatal", "Error", "Warning", "Info", "Debug", "Trace", "None"]

/**
 * @category debug
 * @since 1.0.0
 */
export const runtimeDebug: Debug = {
  minumumLogLevel:
    process && process.env && process.env["EFFECT_LOG_LEVEL"] && levels.includes(process.env["EFFECT_LOG_LEVEL"]) ?
      process.env["EFFECT_LOG_LEVEL"] as Debug["minumumLogLevel"] :
      "Info",
  traceExecutionLimit: process && process.env && process.env["EFFECT_TRACING_EXECUTION_LIMIT"] ?
    Number.parseInt(process.env["EFFECT_TRACING_EXECUTION_LIMIT"]) :
    5,
  traceStackLimit: process && process.env && process.env["EFFECT_TRACING_STACK_LIMIT"] ?
    Number.parseInt(process.env["EFFECT_TRACING_STACK_LIMIT"]) :
    5,
  traceExecutionLogEnabled: process && process.env && process.env["EFFECT_TRACING_EXECUTION_LOG"] &&
      process.env["EFFECT_TRACING_EXECUTION_LOG"] === "true" ?
    true :
    false,
  tracingEnabled: process && process.env && process.env["EFFECT_TRACING_ENABLED"] &&
      process.env["EFFECT_TRACING_ENABLED"] === "false" ?
    false :
    true,
  tracingRuntimeEnabled: process && process.env && process.env["EFFECT_TRACING_RUNTIME_ENABLED"] &&
      process.env["EFFECT_TRACING_RUNTIME_ENABLED"] === "false" ?
    false :
    true
}

const stack: Array<string | undefined> = []
const cleanup = <A>(x: A) => {
  stack.pop()
  return x
}

/**
 * @since 1.0.0
 */
export const withCallTrace = (trace: string): <A>(value: A) => A => {
  stack.push(trace)
  return cleanup
}

const getFromStack = () => {
  if (stack.length > 0) {
    const trace = stack[stack.length - 1]
    stack[stack.length - 1] = undefined
    return trace
  }
}

/**
 * @since 1.0.0
 */
export const untracedWith = <A>(
  body: (
    trace: string | undefined,
    restore: <F extends (...args: Array<any>) => any>(f: F) => F
  ) => A
) => {
  if (!runtimeDebug.tracingEnabled) {
    return body(void 0, identity)
  }
  const trace = getFromStack() ?? getCallTraceFromNewError(4)
  runtimeDebug.tracingEnabled = false
  try {
    return body(trace, (f): any =>
      (...args: Array<any>) => {
        if (runtimeDebug.tracingEnabled) {
          return f(...args)
        }
        runtimeDebug.tracingEnabled = true
        try {
          return f(...args)
        } finally {
          runtimeDebug.tracingEnabled = false
        }
      })
  } finally {
    runtimeDebug.tracingEnabled = true
  }
}

/**
 * @since 1.0.0
 */
export const untraced = <A>(
  body: (restore: <F extends (...args: Array<any>) => any>(f: F) => F) => A
) => {
  if (!runtimeDebug.tracingEnabled) {
    return body(identity)
  }
  runtimeDebug.tracingEnabled = false
  try {
    return body((f): any =>
      (...args: Array<any>) => {
        if (runtimeDebug.tracingEnabled) {
          return f(...args)
        }
        runtimeDebug.tracingEnabled = true
        try {
          return f(...args)
        } finally {
          runtimeDebug.tracingEnabled = false
        }
      }
    )
  } finally {
    runtimeDebug.tracingEnabled = true
  }
}

/**
 * @since 1.0.0
 */
export const getCallTrace = (): string | undefined => {
  return undefined
}
