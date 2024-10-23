import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { exec } from "@actions/exec";
import { get } from "node:http";

const commentTag = `<!-- Comment from ${context.action} -->`;

if (!context.payload.pull_request) {
	throw new Error("This action can only be run on pull_request events");
}
const { pull_request } = context.payload;
const octokit = getOctokit(core.getInput("token", { required: true }));

core.info("Starting Terraform validation");

// Setup flags to control execution
let strictMode = false;
if (core.getBooleanInput("strict_mode", { required: true })) {
	core.debug("Strict mode enabled. Will fail if there are validation warnings");
	strictMode = true;
}

// Get the working directory
let workingDirectory = process.env.GITHUB_WORKSPACE ?? ".";
if (core.getInput("working_directory") !== workingDirectory) {
	let userWorkingDirectory = core.getInput("working_directory");
	if (!path.isAbsolute(userWorkingDirectory)) {
		userWorkingDirectory = path.join(
			process.env.GITHUB_WORKSPACE ?? "",
			core.getInput("working_directory"),
		);
	}
	if (fs.existsSync(userWorkingDirectory)) {
		workingDirectory = userWorkingDirectory;
	} else {
		core.setFailed(`Working directory ${userWorkingDirectory} does not exist`);
	}
}

// Get the Terraform/OpenTofu CLI path
let cliPath = "";
let cliName = "";
const exeSuffix = os.platform().startsWith("win") ? ".exe" : "";

if (core.getInput("cli_path")) {
	cliPath = core.getInput("cli_path");
	if (cliPath === "") {
		throw new Error("CLI path is empty");
	}
	if (!cliPath.endsWith(exeSuffix)) {
		core.debug("Adding exe suffix to CLI path");
		cliPath += exeSuffix;
	}
	core.info(`Using CLI from input: ${cliPath}`);
	if (!fs.existsSync(cliPath)) {
		core.setFailed(`CLI path does not exist: ${cliPath}`);
	}
	cliName = path.basename(cliPath, exeSuffix);
	core.info(`Using ${cliName} CLI from input: ${cliPath}`);
} else if (process.env.TOFU_CLI_PATH) {
	cliPath = path.join(process.env.TOFU_CLI_PATH, `tofu-bin${exeSuffix}`);
	cliName = "tofu";
	core.info(`Using ${cliName} CLI from TOFU_CLI_PATH: ${cliPath}`);
} else if (process.env.TERRAFORM_CLI_PATH) {
	cliPath = path.join(
		process.env.TERRAFORM_CLI_PATH,
		`terraform-bin${exeSuffix}`,
	);
	cliName = "terraform";
	core.info(`Using ${cliName} CLI from TERRAFORM_CLI_PATH: ${cliPath}`);
} else {
	core.setFailed(
		"No CLI path provided, and no Terraform/OpenTofu Setup task detected.",
	);
}

if (!fs.existsSync(cliPath)) {
	core.setFailed(`CLI path does not exist: ${cliPath}`);
}

if (core.getBooleanInput("init", { required: true })) {
	core.startGroup(`Running ${cliName} init`);
	await exec(cliPath, ["init", "-backend=false"]);
	core.endGroup();
}

core.info(`Running ${cliName} validate`);
let stdout = "";
let stderr = "";
const options = {
	listeners: {
		stdout: (data: Buffer) => {
			stdout += data.toString();
		},
		stderr: (data: Buffer) => {
			stderr += data.toString();
		},
	},
	ignoreReturnCode: true,
	silent: true, // avoid printing command in stdout: https://github.com/actions/toolkit/issues/649
};
await exec(cliPath, ["validate", "-json"], options);
const validation = JSON.parse(stdout);

if (!validation.format_version.startsWith("1.")) {
	core.setFailed(
		`Validation output version ${validation.version} is not supported`,
	);
}

// Generate summary for the run
if (validation.error_count === 0 && validation.warning_count === 0) {
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
	summary
		.addRaw(`Found ${validation.warning_count} warnings`)
		.addEOL()
		.addEOL();
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
			} as core.AnnotationProperties);
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
			} as core.AnnotationProperties);
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

if (
	// Return failure if there are any errors,
	validation.error_count > 0
) {
	core.debug("Failing due to validation errors");
	core.setFailed("Terraform configuration is not valid");
} else if (
	// or if there are any warnings and strict mode is enabled
	validation.warning_count > 0 &&
	strictMode
) {
	core.debug("Failing due to validation warnings as strict mode is enabled");
	core.setFailed("Terraform configuration is not valid");
}
