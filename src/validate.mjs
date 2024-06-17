import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { findTerraformCLI } from "./find-cli.mjs";

core.debug("Starting Terraform validation");

const terraformCLI = await findTerraformCLI();
core.debug(`Terraform CLI found at ${terraformCLI}`);

if (core.getBooleanInput("init", { required: true })) {
  core.startGroup("Running terraform init");
  await exec(terraformCLI, ["init", "-backend=false"]);
  core.endGroup();
}

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
await exec(terraformCLI, ["validate", "-json"], options);
const validation = JSON.parse(stdout);

if (validation.valid) {
  core.info("Terraform configuration is valid");
  await core.summary
    .addHeading(":white_check_mark: Validation successful")
    .write();
  process.exit();
}

let summary = await core.summary
  .addHeading(":x: Validation failed")
  .addSeparator();

if (validation.error_count > 0) {
  summary.addRaw(`Found ${validation.error_count} errors`, true);
}
if (validation.warning_count > 0) {
  summary.addRaw(`Found ${validation.warning_count} warnings`, true);
}

summary.addSeparator();
summary.addHeading("Validation details", 2);

for (const diagnostic of validation.diagnostics) {
  const properties = {
    title: diagnostic.summary,
    file: diagnostic.range.filename,
    startLine: diagnostic.range.start.line,
    endLine: diagnostic.range.end.line,
    startColumn: diagnostic.range.start.column,
    endColumn: diagnostic.range.end.column,
  };
  switch (diagnostic.severity) {
    case "error":
      core.error(diagnostic.detail, properties);
      summary.addHeading(
        `:x: \`${diagnostic.range.filename}\` ${diagnostic.summary}`,
        3
      );
      break;
    case "warning":
      core.warning(diagnostic.detail, properties);
      summary.addHeading(
        `:warning: \`${diagnostic.range.filename}\` ${diagnostic.summary}`,
        3
      );
      break;
    default:
      core.info(diagnostic.detail, properties);
      summary.addHeading(
        `:info: \`${diagnostic.range.filename}\` ${diagnostic.summary}`,
        3
      );
  }
  summary.addCodeBlock(diagnostic.snippet.context);
  summary.addRaw(diagnostic.detail, true);
  summary.addSeparator();
}
summary.write();
core.setFailed("Terraform configuration is invalid");
