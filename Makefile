help:           ## Show this help.
	@fgrep -h "##" $(MAKEFILE_LIST) | fgrep -v fgrep | sed -e 's/\\$$//' | sed -e 's/##//'

build:          ## Build the project.
build: dist/index.mjs
.PHONY: build

clean:          ## Clean the project.
	rm -rf dist
.PHONY: clean

dist/index.mjs: src/*.mjs
	ncc build src/validate.mjs \
		--out $(@D)
