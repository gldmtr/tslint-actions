"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChangedFiles = void 0;
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
class ChangedFiles {
    constructor() {
        this.created = [];
        this.updated = [];
    }
    count() {
        return this.updated.length + this.created.length;
    }
}
async function getFiles(octokit, prNumber, fileCount) {
    const changedFiles = new ChangedFiles();
    const fetchPerPage = 100;
    for (let pageIndex = 0; pageIndex * fetchPerPage < fileCount; pageIndex += 1) {
        // eslint-disable-next-line no-await-in-loop
        const listFilesResponse = await octokit.pulls.listFiles({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            pull_number: prNumber,
            page: pageIndex,
            per_page: fetchPerPage,
        });
        const pattern = core_1.getInput('pattern');
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
async function getChangedFiles(octokit) {
    const pr = github_1.context.payload.pull_request;
    if (!pr) {
        throw new Error('Could not get pull request number from context, exiting');
    }
    const changedFiles = await getFiles(octokit, pr.number, pr.changed_files);
    return [...changedFiles.created, ...changedFiles.updated];
}
exports.getChangedFiles = getChangedFiles;
