import * as core from "@actions/core";
import * as github from "@actions/github";
const { context } = github;

const octokit = github.getOctokit(core.getInput("token", { required: true }));

export async function createCheck(validationResult) {
	core.info("Creating code check");
	core.debug(JSON.stringify(validationResult));

	const checkSummary = validationResult.valid
		? "Configuration is valid"
		: `${validationResult.error_count} errors and ${validationResult.warning_count} warnings found`;

	// Find the current check
	const { data: currentChecks } = await octokit.rest.checks.listForRef({
		...context.repo,
		ref: context.sha,
	});
	core.debug(`Found ${currentChecks.check_runs.length} checks`);

	const check = currentChecks.check_runs.find((c) => c.name === context.action);
	core.debug(`Found check ${check.id}`);

	const annotations = [];
	for (const d of validationResult.diagnostics) {
		annotations.push({
			annotation_level: d.severity,
			title: d.summary,
			path: d.path,
			start_line: d.range.start.line,
			start_column: d.range.start.column,
			end_line: d.range.end.line,
			end_column: d.range.end.column,
			message: d.detail,
		});
	}
	core.info(`Creating ${annotations.length} annotations`);
	core.debug(JSON.stringify(annotations));

	// GitHub API will only accept 50 annotations at a time
	for (let i = 0; i < annotations.length; i += 50) {
		await octokit.rest.checks.update({
			...context.repo,
			check_run_id: check.id,
			status: "in_progress",
			output: {
				title: check.output.title,
				summary: checkSummary,
			},
			annotations: annotations.slice(i, i + 50),
		});
	}
	core.info("Code check updated");
}
