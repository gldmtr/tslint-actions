import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';

import { getInput, setFailed } from '@actions/core';
import { getOctokit, context } from '@actions/github';

import { stripIndent as markdown } from 'common-tags';
import { Configuration, Linter, RuleSeverity } from 'tslint';

import { getChangedFiles } from './get-changed-files';

type SeverityAnnotationLevel = 'notice' | 'warning' | 'failure';

interface Annotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: SeverityAnnotationLevel;
  message: string;
}

const CHECK_NAME = 'TSLint Checks';

const SeverityAnnotationLevelMap = new Map<RuleSeverity, SeverityAnnotationLevel>([
  ['warning', 'warning'],
  ['error', 'failure'],
]);

(async () => {
  const configFileName = getInput('config') || 'tslint.json';
  const projectFileName = getInput('project');
  const pattern = getInput('pattern');
  const ghToken = getInput('token');

  const workingDir = path.resolve('.');

  if (!projectFileName && !pattern) {
    setFailed('tslint-actions: Please set project or pattern input');

    return;
  }

  if (!ghToken) {
    setFailed('tslint-actions: Please set token');

    return;
  }

  const octokit = getOctokit(ghToken);

  let changedFiles: Array<string>;

  try {
    changedFiles = await getChangedFiles(octokit);
  } catch (e) {
    setFailed(e.message);

    return;
  }

  let HEAD = context.sha;

  if (context.payload?.pull_request?.head?.sha) {
    HEAD = context.payload?.pull_request?.head?.sha;
  }

  // Create check
  const check = await octokit.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
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
      const program = Linter.createProgram(projectFileName, projectDir);
      const linter = new Linter(options, program);

      const files = Linter.getFileNames(program);
      const filesToCheck = files.filter(file => changedFiles.includes(path.relative(workingDir, file)));

      for (const file of filesToCheck) {
        const sourceFile = program.getSourceFile(file);
        if (sourceFile) {
          const fileContents = sourceFile.getFullText();
          const configuration = Configuration.findConfiguration(null, file)
            .results;
          linter.lint(file, fileContents, configuration);
        }
      }

      return linter.getResult();
    }

    const linter = new Linter(options);

    const files = glob.sync(pattern!);
    for (const file of files) {
      const fileContents = fs.readFileSync(file, { encoding: 'utf8' });
      const configuration = Configuration.findConfiguration(
        configFileName,
        file,
      ).results;
      linter.lint(file, fileContents, configuration);
    }

    return linter.getResult();
  })();

  const annotations: Array<Annotation> = result.failures.map(failure => ({
    path: path.relative(workingDir, failure.getFileName()),
    start_line: failure.getStartPosition().getLineAndCharacter().line + 1,
    end_line: failure.getEndPosition().getLineAndCharacter().line + 1,
    annotation_level:
      SeverityAnnotationLevelMap.get(failure.getRuleSeverity()) || 'notice',
    message: `[${failure.getRuleName()}] ${failure.getFailure()}`,
  }));

  // Update check
  await octokit.checks.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    check_run_id: check.data.id,
    name: CHECK_NAME,
    status: 'completed',
    conclusion: result.errorCount > 0 ? 'failure' : 'success',
    output: {
      annotations,
      title: CHECK_NAME,
      summary: `${result.errorCount} error(s), ${result.warningCount} warning(s) found`,
      text: markdown`
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
      `.replace(
      '__CONFIG_CONTENT__',
      JSON.stringify(
        Configuration.readConfigurationFile(configFileName),
        null,
        2,
      ),
    ),
    },
  });
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e.stack);

  setFailed(e.message);
});
