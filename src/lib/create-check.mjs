import * as core from "@actions/core";
import * as github from "@actions/github";
const { context } = github;

const octokit = github.getOctokit(core.getInput("token", { required: true }));

export async function createCheck(validationResult) {
	core.info("Creating code check");
	if (core.isDebug()) {
		core.startGroup("ValidationResult");
		console.dir(validationResult, { depth: null });
		core.endGroup();

		core.startGroup("context");
		console.dir(context, { depth: null });
		core.endGroup();
	}

	core.debug(`github.action = ${process.env.GITHUB_ACTION}`);
	core.debug(`github.job = ${process.env.GITHUB_JOB}`);

	const checkSummary = validationResult.valid
		? "Configuration is valid"
		: `${validationResult.error_count} errors and ${validationResult.warning_count} warnings found`;

	// Find the current check
	const { data: currentChecks } = await octokit.rest.checks.listForRef({
		...context.repo,
		ref: context.payload.after,
	});
	core.debug(`Found ${currentChecks.check_runs.length} checks`);
	if (core.isDebug()) {
		core.startGroup("currentChecks");
		console.dir(currentChecks, { depth: null });
		core.endGroup();
	}

	const check = currentChecks.check_runs.find((c) => c.name === context.action);
	core.debug(`Found check ${check.id}`);

	core.debug("Clearing existing annotations from check");
	// Clear the annotations from previous runs
	await octokit.rest.checks.update({
		...context.repo,
		check_run_id: check.id,
		status: "in_progress",
		output: {
			title: check.output.title,
			summary: checkSummary,
			annotations: [],
		},
	});

	const annotations = [];
	for (const d of validationResult.diagnostics) {
		annotations.push({
			annotation_level: d.severity,
			message: d.summary,
			raw_details: d.detail,
			path: d.range.filename,
			start_line: d.range.start.line,
			end_line: d.range.end.line,
			start_column: d.range.start.column,
			end_column: d.range.end.column,
		});
	}
	core.info(`Creating ${annotations.length} annotations`);
	if (core.isDebug()) {
		core.startGroup("annotations");
		console.dir(annotations, { depth: null });
		core.endGroup();
	}

	// GitHub API will only accept 50 annotations at a time
	for (let i = 0; i < annotations.length; i += 50) {
		await octokit.rest.checks.update({
			...context.repo,
			check_run_id: check.id,
			status: "in_progress",
			output: {
				title: check.output.title,
				summary: checkSummary,
				annotations: annotations.slice(i, i + 50),
			},
		});
	}
	core.info("Code check updated");
}
