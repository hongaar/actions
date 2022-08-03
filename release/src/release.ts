import { info, warning } from '@actions/core'
import { getOctokit } from '@actions/github'
import { getLatestVersion, gitPushTags, gitTag } from '../../lib/git'
import { createLightweightTag, getRepository } from '../../lib/github'
import { runPlugins } from './changelogPlugins'
import { readLockfile } from './common/files'
import {
  getJiraClient,
  transitionToReleased,
  getVersion,
} from './common/jiraClient'
import { checkRepositories } from './common/repositories'
import { Lockfile } from './common/types'

export async function release({
  octokit,
  lockfilePath,
  jiraClient,
  repositoriesJsonPath,
  dryRun,
}: {
  octokit: ReturnType<typeof getOctokit>
  lockfilePath: string
  jiraClient: ReturnType<typeof getJiraClient>
  repositoriesJsonPath: string
  dryRun: boolean
}) {
  // All jira issues from prev release to upcoming release
  // (we need to do this before updating tag in next step)
  const jiraIssueIds = await getJiraIssues(
    octokit,
    jiraClient,
    repositoriesJsonPath
  )

  // Variables
  const repository = getRepository()

  const lockfile = await readLockfile(lockfilePath)

  // Tag current commit with version
  if (dryRun) {
    info(`Dry run, not tagging ${repository.fqn}`)
  } else {
    await gitTag(lockfile.version)
    await gitPushTags()
    info(`Pushed tag ${lockfile.version} to ${repository.fqn}`)
  }

  // Tag repositories in lockfile
  await tagRepositories(dryRun, lockfile, octokit)

  // Transition jira issues
  await transitionIssues(dryRun, jiraIssueIds, jiraClient)

  // Update fixVersion of all issues
  try {
    await updateIssueReleaseVersion(
      dryRun,
      lockfile.version,
      jiraIssueIds,
      jiraClient
    )
  } catch (e) {
    warning(
      `Got error while trying to update release version of tickets: ${JSON.stringify(
        e
      )}`
    )
  }
}

async function tagRepositories(
  dryRun: boolean,
  lockfile: Lockfile,
  octokit: ReturnType<typeof getOctokit>
) {
  for (const [repository, sha] of Object.entries(lockfile.repositories)) {
    if (dryRun) {
      info(`Dry run, not tagging ${repository}`)
    } else {
      await createLightweightTag({
        octokit,
        owner: 'exivity',
        repo: repository,
        tag: lockfile.version,
        sha,
      })
    }
  }
}

async function transitionIssues(
  dryRun: boolean,
  jiraIssueIds: string[],
  jiraClient: ReturnType<typeof getJiraClient>
) {
  if (dryRun) {
    info(`Dry run, not transitioning tickets`)
  } else {
    info(`Transitioning ticket status of:`)
    info(
      `${
        jiraIssueIds.length > 0 ? 'found no tickets' : jiraIssueIds.join('\n')
      }`
    )

    await Promise.all(
      jiraIssueIds.map((issueIdOrKey) => {
        return transitionToReleased(issueIdOrKey, jiraClient)
      })
    ).then(() => {
      jiraIssueIds.forEach((issueIdOrKey) => {
        info(`Transitioned issue ${issueIdOrKey} to released`)
      })
    })
  }
}

async function getJiraIssues(
  octokit: ReturnType<typeof getOctokit>,
  jiraClient: ReturnType<typeof getJiraClient>,
  repositoriesJsonPath: string
) {
  const latestVersion = await getLatestVersion()
  let [changelog, _] = await checkRepositories(
    repositoriesJsonPath,
    latestVersion,
    octokit
  )

  changelog = await runPlugins({ octokit, jiraClient, changelog })

  return changelog
    .flatMap((item) => item.links.issues?.map((issue) => issue.slug))
    .filter(isString)
}

function isString(x: any): x is string {
  return typeof x === 'string'
}

async function updateIssueReleaseVersion(
  dryRun: boolean,
  version: string,
  jiraIssueIds: string[],
  jiraClient: ReturnType<typeof getJiraClient>
) {
  if (dryRun) {
    info(`Dry run, not setting release version of tickets`)
  } else {
    info(`Setting release version of:`)
    info(
      `${
        jiraIssueIds.length > 0 ? 'found no tickets' : jiraIssueIds.join('\n')
      }`
    )

    for (const issueIdOrKey of jiraIssueIds) {
      await jiraClient.issues.editIssue({
        issueIdOrKey,
        fields: {
          fixVersions: [
            { id: await getVersion(dryRun, jiraClient, version, issueIdOrKey) },
          ],
        },
      })
      info(`Set release version of ${issueIdOrKey} to ${version}`)
    }
  }
}
