import { getInput } from '@actions/core';
import { context, getOctokit } from '@actions/github';

type GitHub = ReturnType<typeof getOctokit>;

class ChangedFiles {
  public created: Array<string> = [];

  public updated: Array<string> = [];

  public count() {
    return this.updated.length + this.created.length;
  }
}

async function getFiles(octokit: GitHub, prNumber: number, fileCount: number) {
  const changedFiles = new ChangedFiles();
  const fetchPerPage = 100;

  for (
    let pageIndex = 0;
    pageIndex * fetchPerPage < fileCount;
    pageIndex += 1
  ) {
    // eslint-disable-next-line no-await-in-loop
    const listFilesResponse = await octokit.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prNumber,
      page: pageIndex,
      per_page: fetchPerPage,
    });

    const pattern = getInput('pattern');
    const re = new RegExp(pattern.length ? pattern : '.*');

    listFilesResponse.data
      .filter(file => re.test(file.filename))
      .forEach((file) => {
        switch (file.status) {
          case 'added':
            changedFiles.created.push(file.filename);
            break;

          case 'modified':
            changedFiles.updated.push(file.filename);
            break;

          case 'renamed':
            changedFiles.created.push(file.filename);
            break;

          default:
            break;
        }
      });
  }

  return changedFiles;
}

export async function getChangedFiles(octokit: GitHub): Promise<Array<string>> {
  const pr = context.payload.pull_request;

  if (!pr) {
    throw new Error('Could not get pull request number from context, exiting');
  }

  const changedFiles = await getFiles(octokit, pr.number, pr.changed_files);

  return [...changedFiles.created, ...changedFiles.updated];
}
