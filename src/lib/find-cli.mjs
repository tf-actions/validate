import * as core from "@actions/core";
import * as io from "@actions/io";
import * as os from "node:os";
import * as path from "node:path";

export async function findCLI() {
	core.debug("Searching for CLI");

	let cliPath = "";
	const exeSuffix = os.platform().startsWith("win") ? ".exe" : "";

	if (core.getInput("cli_path")) {
		core.debug(`Looking for CLI path from input: ${cliPath}`);
		cliPath = core.getInput("cli_path");
		if (!cliPath.endsWith(exeSuffix)) {
			cliPath += exeSuffix;
		}
		try {
			await io.which(cliPath, true);
			return cliPath;
		} catch {
			core.info(`CLI path from input not found: ${cliPath}`);
			core.debug("Searching for CLI in PATH");
		}
	}

	if (process.env.TOFU_CLI_PATH) {
		core.debug(`Looking for CLI path from TOFU_CLI_PATH: ${cliPath}`);
		cliPath = path.join(process.env.TOFU_CLI_PATH, `tofu-bin${exeSuffix}`);
		try {
			await io.which(cliPath, true);
			return cliPath;
		} catch {
			core.info(`CLI not found using TOFU_CLI_PATH: ${cliPath}`);
		}
	}

	if (process.env.TERRAFORM_CLI_PATH) {
		core.debug(`Looking for CLI path from TERRAFORM_CLI_PATH: ${cliPath}`);
		cliPath = path.join(
			process.env.TERRAFORM_CLI_PATH,
			`terraform-bin${exeSuffix}`,
		);
		try {
			await io.which(cliPath, true);
			return cliPath;
		} catch {
			core.info(`CLI not found using TERRAFORM_CLI_PATH: ${cliPath}`);
		}
	}

	try {
		core.debug("Looking for `tofu`");
		cliPath = await io.which(`tofu${exeSuffix}`, true);
		core.info(`Using tofu binary at ${cliPath}`);
		return cliPath;
	} catch {
		core.info("tofu binary not found");
	}

	try {
		core.debug("Looking for `terraform`");
		cliPath = await io.which(`terraform${exeSuffix}`, true);
		core.info(`Using terraform binary at ${cliPath}`);
		return cliPath;
	} catch {
		core.info("terraform binary not found");
	}
	throw new Error("CLI not found");
}
