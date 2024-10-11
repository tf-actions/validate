import * as core from "@actions/core";
import * as github from "@actions/github";
const { context } = github;

const octokit = github.getOctokit(core.getInput("token", { required: true }));

export async function createCheck(validationResult) {
	core.info("Creating code check");

	const summary = validationResult.valid
		? `Found ${validationResult.error_count} errors and ${validationResult.warning_count} warnings`
		: "Terraform configuration is valid";

	// Find the current check
	const { data: currentChecks } = await octokit.rest.checks.listForRef({
		...context.repo,
		ref: context.sha,
	});
	const check = currentChecks.check_runs.find((c) => c.name === context.job);
	console.dir(check);

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

	// GitHub API will only accept 50 annotations at a time
	for (let i = 0; i < annotations.length; i += 50) {
		await octokit.rest.checks.update({
			...context.repo,
			check_run_id: check.id,
			status: check.status,
			output: check.output,
			annotations: annotations.slice(i, i + 50),
		});
	}
}
