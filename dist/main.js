"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const glob = __importStar(require("glob"));
const path = __importStar(require("path"));
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const common_tags_1 = require("common-tags");
const tslint_1 = require("tslint");
const get_changed_files_1 = require("./get-changed-files");
const CHECK_NAME = 'TSLint Checks';
const SeverityAnnotationLevelMap = new Map([
    ['warning', 'warning'],
    ['error', 'failure'],
]);
(async () => {
    var _a, _b, _c, _d, _e, _f;
    const configFileName = core_1.getInput('config') || 'tslint.json';
    const projectFileName = core_1.getInput('project');
    const pattern = core_1.getInput('pattern');
    const ghToken = core_1.getInput('token');
    const workingDir = path.resolve('.');
    if (!projectFileName && !pattern) {
        core_1.setFailed('tslint-actions: Please set project or pattern input');
        return;
    }
    if (!ghToken) {
        core_1.setFailed('tslint-actions: Please set token');
        return;
    }
    const octokit = github_1.getOctokit(ghToken);
    let changedFiles;
    try {
        changedFiles = await get_changed_files_1.getChangedFiles(octokit);
    }
    catch (e) {
        core_1.setFailed(e.message);
        return;
    }
    let HEAD = github_1.context.sha;
    if ((_c = (_b = (_a = github_1.context.payload) === null || _a === void 0 ? void 0 : _a.pull_request) === null || _b === void 0 ? void 0 : _b.head) === null || _c === void 0 ? void 0 : _c.sha) {
        HEAD = (_f = (_e = (_d = github_1.context.payload) === null || _d === void 0 ? void 0 : _d.pull_request) === null || _e === void 0 ? void 0 : _e.head) === null || _f === void 0 ? void 0 : _f.sha;
    }
    // Create check
    const check = await octokit.checks.create({
        owner: github_1.context.repo.owner,
        repo: github_1.context.repo.repo,
        name: CHECK_NAME,
        head_sha: HEAD,
        status: 'in_progress',
    });
    const options = {
        fix: false,
        formatter: 'json',
    };
    // Create a new Linter instance
    const result = (() => {
        if (projectFileName && !pattern) {
            const projectDir = path.dirname(path.resolve(projectFileName));
            const program = tslint_1.Linter.createProgram(projectFileName, projectDir);
            const linter = new tslint_1.Linter(options, program);
            const files = tslint_1.Linter.getFileNames(program);
            const filesToCheck = files.filter(file => changedFiles.includes(path.relative(workingDir, file)));
            for (const file of filesToCheck) {
                const sourceFile = program.getSourceFile(file);
                if (sourceFile) {
                    const fileContents = sourceFile.getFullText();
                    const configuration = tslint_1.Configuration.findConfiguration(null, file)
                        .results;
                    linter.lint(file, fileContents, configuration);
                }
            }
            return linter.getResult();
        }
        const linter = new tslint_1.Linter(options);
        const files = glob.sync(pattern);
        for (const file of files) {
            const fileContents = fs.readFileSync(file, { encoding: 'utf8' });
            const configuration = tslint_1.Configuration.findConfiguration(configFileName, file).results;
            linter.lint(file, fileContents, configuration);
        }
        return linter.getResult();
    })();
    const annotations = result.failures.map(failure => ({
        path: path.relative(workingDir, failure.getFileName()),
        start_line: failure.getStartPosition().getLineAndCharacter().line + 1,
        end_line: failure.getEndPosition().getLineAndCharacter().line + 1,
        annotation_level: SeverityAnnotationLevelMap.get(failure.getRuleSeverity()) || 'notice',
        message: `[${failure.getRuleName()}] ${failure.getFailure()}`,
    }));
    // Update check
    await octokit.checks.update({
        owner: github_1.context.repo.owner,
        repo: github_1.context.repo.repo,
        check_run_id: check.data.id,
        name: CHECK_NAME,
        status: 'completed',
        conclusion: result.errorCount > 0 ? 'failure' : 'success',
        output: {
            annotations,
            title: CHECK_NAME,
            summary: `${result.errorCount} error(s), ${result.warningCount} warning(s) found`,
            text: common_tags_1.stripIndent `
      ## Configuration

      #### Actions Input

      | Name | Value |
        | ---- | ----- |
        | config | \`${configFileName}\` |
        | project | \`${projectFileName || '(not provided)'}\` |
        | pattern | \`${pattern || '(not provided)'}\` |

        #### TSLint Configuration

      \`\`\`json
      __CONFIG_CONTENT__
      \`\`\`
      </details>
      `.replace('__CONFIG_CONTENT__', JSON.stringify(tslint_1.Configuration.readConfigurationFile(configFileName), null, 2)),
        },
    });
})().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e.stack);
    core_1.setFailed(e.message);
});
