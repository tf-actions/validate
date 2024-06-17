# terraform-validate GitHub Action

A javascript GitHub Action to validate a Terraform configuration, and post a code review on the pull request highlighting issues.

The action will initialise the Terraform working directory by default.
This can be disabled with the `init` parameter.

A summary will be posted with details of any validation errors.

## Inputs

### `init`

Description: Run terraform init before validating

Required : `true`

Default: `"true"`

## Outputs

No outputs are returned.

## Example usage

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Setup Terraform
    uses: hashicorp/setup-terraform@v3
    with:
      terraform_wrapper: false

  - name: Validate Configuration
    uses: oWretch/terraform-validate@v1
```
