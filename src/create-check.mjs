import * as core from "@actions/core";
import * as github from "@actions/github";
const { context } = github;
const { pull_request } = context.payload;

const octokit = github.getOctokit(core.getInput("token", { required: true }));

export async function createCheck(validationResult) {
	core.info("Creating code check");
	// Create the check for annotations
	const { data: check } = await octokit.checks.create({
		...context.repo,
		name: context.action,
		head_sha: context.sha,
		started_at: new Date().toISOString(),
		output: {
			title: "Terraform validation",
			summary: validationResult.summary,
			text: `Found ${validation.error_count} errors and ${validation.warning_count} warnings`,
		},
	});

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
		await octokit.checks.update({
			...context.repo,
			check_run_id: check.id,
			annotations: annotations.slice(i, i + 50),
		});
	}

	// Mark the check as completed
	await octokit.checks.update({
		...context.repo,
		check_run_id: check.id,
		status: "completed",
		conclusion: validationResult.valid ? "success" : "failure",
		completed_at: new Date().toISOString(),
	});
}
