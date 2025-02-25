import { debug, getInput, setFailed } from '@actions/core'
import glob from 'glob-promise'
import rcedit from 'rcedit'
import { getRepository, getSha } from '../../lib/github'

type RceditConfig = {
  [key: string]: string
}

function removeEmpty(obj: RceditConfig) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != ''))
}

const executionLevels = [
  'asInvoker',
  'highestAvailable',
  'requireAdministrator',
] as const

async function run() {
  const { owner, repo } = getRepository()
  const sha = getSha()

  // Inputs
  const path = getInput('path', { required: true })

  const fileDescription =
    owner === 'exivity'
      ? getInput('file-description') || `Exivity component: ${repo}@${sha}`
      : getInput('file-description')
  const fileVersion = getInput('file-version')
  const productName =
    owner === 'exivity'
      ? getInput('product-name') || 'Exivity'
      : getInput('product-name')
  const productVersion = getInput('product-version')
  const companyName =
    owner === 'exivity'
      ? getInput('company-name') || 'Exivity'
      : getInput('company-name')
  const comments = getInput('comments')
  const internalFilename = getInput('internal-filename')
  const legalCopyright =
    owner === 'exivity'
      ? getInput('legal-copyright') || `© 2017 Exivity`
      : getInput('legal-copyright')
  const legalTrademarks1 = getInput('legal-trademarks1')
  const legalTrademarks2 = getInput('legal-trademarks2')
  const originalFilename = getInput('original-filename')
  const icon = getInput('icon')
  const requestedExecutionLevel =
    (getInput(
      'requested-execution-level'
    ) as (typeof executionLevels)[number]) || undefined
  const applicationManifest = getInput('application-manifest')

  // Assertions
  if (
    !comments &&
    !companyName &&
    !fileDescription &&
    !internalFilename &&
    !legalCopyright &&
    !legalTrademarks1 &&
    !legalTrademarks2 &&
    !originalFilename &&
    !productName &&
    !fileVersion &&
    !productVersion &&
    !icon &&
    !requestedExecutionLevel &&
    !applicationManifest
  ) {
    throw new Error('No properties set')
  }

  if (
    requestedExecutionLevel &&
    !executionLevels.includes(requestedExecutionLevel)
  ) {
    throw new Error('Invalid value for requested-execution-level')
  }

  // Obtain absolute paths
  const absPaths = await glob(path, { absolute: true })
  debug(`Absolute path to file(s): "${absPaths.join(', ')}"`)

  for (const absPath of absPaths) {
    await rcedit(absPath, {
      'version-string': removeEmpty({
        Comments: comments,
        CompanyName: companyName,
        FileDescription: fileDescription,
        InternalFilename: internalFilename,
        LegalCopyright: legalCopyright,
        LegalTrademarks1: legalTrademarks1,
        LegalTrademarks2: legalTrademarks2,
        OriginalFilename: originalFilename,
        ProductName: productName,
      }),
      ...removeEmpty({
        'file-version': fileVersion,
        'product-version': productVersion,
        icon: icon,
        'requested-execution-level': requestedExecutionLevel,
        'application-manifest': applicationManifest,
      }),
    })
    debug(`processed ${absPath} with rcedit`)
  }
}

run().catch(setFailed)
