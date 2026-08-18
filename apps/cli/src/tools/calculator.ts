import { requireString, ToolError } from './types.js'
import type { Tool } from './types.js'

/**
 * A recursive-descent parser rather than `eval` or `new Function`.
 *
 * This evaluates a string that a language model composed, which may itself be echoing something a
 * web page said. `eval` on that path is arbitrary code execution with extra steps, and no amount of
 * regex pre-filtering makes it safe. ~90 lines buys a hard guarantee instead of a hopeful one.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | '%') unary)*
 *   unary      := ('-' | '+') unary | power
 *   power      := primary ('^' unary)?          // right-associative
 *   primary    := number | name '(' expression ')' | '(' expression ')'
 */

type Token = { type: 'number'; value: number } | { type: 'name'; value: string } | { type: 'op'; value: string }

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const char = input[i]

    if (/\s/.test(char)) {
      i += 1
      continue
    }

    if (/[0-9.]/.test(char)) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(input.slice(i))
      if (!match) throw new ToolError(`Could not read a number at position ${i}.`)
      tokens.push({ type: 'number', value: Number(match[0]) })
      i += match[0].length
      continue
    }

    if (/[a-zA-Z_]/.test(char)) {
      const match = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(input.slice(i)) as RegExpExecArray
      tokens.push({ type: 'name', value: match[0].toLowerCase() })
      i += match[0].length
      continue
    }

    if ('+-*/%^()'.includes(char)) {
      tokens.push({ type: 'op', value: char })
      i += 1
      continue
    }

    throw new ToolError(
      `"${char}" is not something this calculator understands. ` +
        `Allowed: numbers, + - * / % ^ ( ), and ${Object.keys(FUNCTIONS).join(', ')}.`,
    )
  }

  return tokens
}

export function evaluate(expression: string): number {
  const tokens = tokenize(expression)
  if (tokens.length === 0) throw new ToolError('Nothing to calculate.')

  let position = 0

  const peek = (): Token | undefined => tokens[position]
  const eat = (value: string): boolean => {
    const token = peek()
    if (token?.type === 'op' && token.value === value) {
      position += 1
      return true
    }
    return false
  }

  function primary(): number {
    const token = peek()
    if (!token) throw new ToolError('Expression ends unexpectedly.')

    if (token.type === 'number') {
      position += 1
      return token.value
    }

    if (token.type === 'name') {
      position += 1
      if (token.value in CONSTANTS) return CONSTANTS[token.value]

      const fn = FUNCTIONS[token.value]
      if (!fn) {
        throw new ToolError(
          `Unknown name "${token.value}". Available: ${[...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)].join(', ')}.`,
        )
      }
      if (!eat('(')) throw new ToolError(`"${token.value}" must be called with parentheses.`)
      const argument = expr()
      if (!eat(')')) throw new ToolError(`Missing ")" after ${token.value}(...).`)
      return fn(argument)
    }

    if (eat('(')) {
      const value = expr()
      if (!eat(')')) throw new ToolError('Missing ")".')
      return value
    }

    throw new ToolError(`Unexpected "${token.value}".`)
  }

  function power(): number {
    const base = primary()
    // Right-associative: 2^3^2 is 512, not 64.
    if (eat('^')) return base ** unary()
    return base
  }

  function unary(): number {
    if (eat('-')) return -unary()
    if (eat('+')) return unary()
    return power()
  }

  function term(): number {
    let left = unary()
    for (;;) {
      if (eat('*')) left *= unary()
      else if (eat('/')) {
        const right = unary()
        // JavaScript returns Infinity; the model needs to be told it asked something meaningless.
        if (right === 0) throw new ToolError('Division by zero.')
        left /= right
      } else if (eat('%')) {
        const right = unary()
        if (right === 0) throw new ToolError('Modulo by zero.')
        left %= right
      } else return left
    }
  }

  function expr(): number {
    let left = term()
    for (;;) {
      if (eat('+')) left += term()
      else if (eat('-')) left -= term()
      else return left
    }
  }

  const result = expr()

  if (position < tokens.length) {
    const rest = tokens.slice(position).map((t) => String(t.value)).join(' ')
    throw new ToolError(`Could not parse the rest of the expression: "${rest}".`)
  }

  if (!Number.isFinite(result)) {
    throw new ToolError('The result is not a finite number - check for an overflow or a bad domain.')
  }

  return result
}

export const calculatorTool: Tool = {
  name: 'calculator',
  description:
    'Evaluate an arithmetic expression exactly. Use this for ANY arithmetic rather than computing ' +
    'it yourself - that is the single most common source of a wrong answer. Supports + - * / % ^, ' +
    'parentheses, and sqrt, abs, round, floor, ceil, ln, log, sin, cos, tan, plus the constants ' +
    'pi and e. Example: "(3200 * 1900) / 1000000" for the area of a slab in square metres.',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The expression, e.g. "sqrt(2) * 100" or "(1200 + 800) / 3".',
      },
    },
    required: ['expression'],
  },
  async run(input) {
    const expression = requireString(input, 'expression', { max: 500 })
    const value = evaluate(expression)
    // Both forms: the model usually wants the exact value, the user usually wants the readable one.
    const rounded = Math.round(value * 1e10) / 1e10
    return `${expression} = ${rounded}`
  },
}
