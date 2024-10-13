import * as core from "@actions/core";
import * as path from "node:path";
import { exec } from "@actions/exec";
import { findCLI } from "./lib/find-cli.mjs";

core.info("Starting Terraform validation");

let workingDirectory = process.env.GITHUB_WORKSPACE;
if (core.getInput("working_directory") !== workingDirectory) {
	let userWorkingDirectory = core.getInput("working_directory");
	if (!path.isAbsolute(userWorkingDirectory)) {
		userWorkingDirectory = path.join(
			process.env.GITHUB_WORKSPACE,
			core.getInput("working_directory"),
		);
	}
	if (fs.existsSync(userWorkingDirectory)) {
		workingDirectory = userWorkingDirectory;
	} else {
		core.setFailed(`Working directory ${userWorkingDirectory} does not exist`);
	}
}

core.startGroup("Finding Terraform CLI");
const cli = await findCLI();
let cliName = "";
switch (cli.split(path.sep).pop()) {
	case "tofu":
	case "tofu-bin":
		cliName = "tofu";
		break;
	case "terraform":
	case "terraform-bin":
		cliName = "terraform";
		break;
	default:
		cliName = cli.split(path.sep).pop();
}
core.endGroup();

if (core.getBooleanInput("init", { required: true })) {
	core.startGroup(`Running ${cliName} init`);
	await exec(cli, ["init", "-backend=false"]);
	core.endGroup();
}

core.info(`Running ${cliName} validate`);
let stdout = "";
let stderr = "";
const options = {
	listeners: {
		stdout: (data) => {
			stdout += data.toString();
		},
		stderr: (data) => {
			stderr += data.toString();
		},
	},
	ignoreReturnCode: true,
	silent: true, // avoid printing command in stdout: https://github.com/actions/toolkit/issues/649
};
await exec(cli, ["validate", "-json"], options);
const validation = JSON.parse(stdout);

if (!validation.format_version.startsWith("1.")) {
	core.setFailed(
		`Validation output version ${validation.version} is not supported`,
	);
}

// Generate summary for the run
if (validation.valid) {
	core.info("Terraform configuration is valid");
	await core.summary
		.addHeading(":white_check_mark: Validation successful", 2)
		.write();
	process.exit();
}

const summary = core.summary.addHeading(":x: Validation failed", 2);

// Need the extra newline due to markdown rendering
if (validation.error_count > 0) {
	summary.addRaw(`Found ${validation.error_count} errors`).addEOL().addEOL();
}
if (validation.warning_count > 0) {
	summary.addRaw(`Found ${validation.warning_count} warnings`).addEOL().addEOL;
}

summary.addHeading("Validation details", 3);

for (const diagnostic of validation.diagnostics) {
	switch (diagnostic.severity) {
		case "error":
			core.error(diagnostic.detail, {
				title: diagnostic.summary,
				file: diagnostic.range.filename,
				startLine: diagnostic.range.start.line,
				endLine: diagnostic.range.start.line,
				startColumn: diagnostic.range.start.column,
				endColumn: diagnostic.range.end.column,
			});
			summary
				.addSeparator()
				.addHeading(
					`:x: ${diagnostic.range.filename} : ${diagnostic.summary}`,
					4,
				)
				.addCodeBlock(diagnostic.snippet.context, "terraform")
				.addRaw(diagnostic.detail, true);
			break;
		case "warning":
			core.warning(diagnostic.detail, {
				title: diagnostic.summary,
				file: diagnostic.range.filename,
				startLine: diagnostic.range.start.line,
				endLine: diagnostic.range.start.line,
				startColumn: diagnostic.range.start.column,
				endColumn: diagnostic.range.end.column,
			});
			summary
				.addSeparator()
				.addHeading(
					`:warning: ${diagnostic.range.filename} : ${diagnostic.summary}`,
					4,
				)
				.addCodeBlock(diagnostic.snippet.context, "terraform")
				.addRaw(diagnostic.detail, true);
			break;
		default:
			core.warning(`Unknown severity: ${diagnostic.severity}`);
			continue;
	}
}
summary.write();

// Only return a failure if there are errors
if (validation.error_count > 0) {
	core.setFailed("Terraform configuration is not valid");
} else if (
	validation.warning_count > 0 &&
	core.getBooleanInput("strict_mode", { required: true })
) {
	core.setFailed("Terraform configuration is not valid");
}
