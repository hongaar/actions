import { getInput, info, warning } from '@actions/core'
import { getExecOutput } from '@actions/exec'
import { promises as fs } from 'fs'
import { join as pathJoin } from 'path'

const TRUE_VALUES = [true, 'true', 'TRUE', 'True']
const FALSE_VALUES = [false, 'false', 'FALSE', 'False']

export function getJSONInput<T = any>(name: string, defaultValue?: T) {
  const inputValueAsString = getInput(name)

  if (inputValueAsString.trim() === '') {
    return defaultValue
  }

  let inputValue: T
  try {
    inputValue = JSON.parse(inputValueAsString)
  } catch (error: unknown) {
    throw new Error(`Can't parse input value "${inputValueAsString}" as JSON`)
  }

  return inputValue
}

export function getBooleanInput(name: string, defaultValue: boolean) {
  let inputValue = getInput(name) || defaultValue

  if (TRUE_VALUES.includes(inputValue)) {
    return true
  }

  if (FALSE_VALUES.includes(inputValue)) {
    return false
  }

  throw new Error(
    `Can't parse input value (${JSON.stringify(inputValue)}) as boolean`
  )
}

export async function unzipAll(path: string) {
  for (const file of await fs.readdir(path)) {
    if (file.endsWith('.zip')) {
      await exec('7z', ['x', pathJoin(path, file), `-o${path}`])
    } else if ((await fs.lstat(pathJoin(path, file))).isDirectory()) {
      unzipAll(pathJoin(path, file))
    }
  }
}

/**
 * Iterates an array, and returns the first element for which the predicate
 * returns a value.
 */
export function shortCircuit<T, R>(
  input: T[],
  predicate: (value: T, index: number, array: typeof input) => R | undefined
) {
  let output: R | undefined

  input.some(
    (value, index, array) => !!(output = predicate(value, index, array))
  )

  return output
}

export function table(key: string, value: string) {
  info(`${key.padEnd(15)}: ${value}`)
}

export function isObject(
  value: unknown
): value is { [key: string | number | symbol]: unknown } {
  return !!(
    value &&
    typeof value === 'object' &&
    value.constructor === {}.constructor
  )
}

export async function exec(command: string, args?: string[]) {
  const result = await getExecOutput(command, args, {
    silent: true,
    ignoreReturnCode: true,
  })

  if (result.exitCode !== 0) {
    warning(
      [
        result.stdout.trim(),
        result.stdout.trim() && result.stderr.trim() ? '\n' : '',
        result.stderr.trim(),
      ].join('')
    )
    throw new Error(`Process completed with exit code ${result.exitCode}`)
  }

  return result.stdout
}
