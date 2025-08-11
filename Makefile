# Makefile for lowkey CLI

# Docker image settings
IMAGE_NAME = lowkey
IMAGE_TAG = latest
REGISTRY = ghcr.io/moonbeam-nyc
FULL_IMAGE = $(REGISTRY)/$(IMAGE_NAME):$(IMAGE_TAG)

# Default target
.PHONY: help
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Docker build commands
.PHONY: build
build: ## Build Docker image locally
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

.PHONY: build-full
build-full: ## Build Docker image with full registry path
	docker build -t $(FULL_IMAGE) .

# Docker run commands
.PHONY: run
run: ## Run Docker container with help command
	docker run --rm $(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: run-version
run-version: ## Show version using Docker container
	docker run --rm $(IMAGE_NAME):$(IMAGE_TAG) --version

.PHONY: run-help
run-help: ## Show help using Docker container
	docker run --rm $(IMAGE_NAME):$(IMAGE_TAG) --help

# Interactive development commands
.PHONY: run-shell
run-shell: ## Run container with shell for debugging
	docker run --rm -it --entrypoint /bin/sh $(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: run-aws
run-aws: ## Run container with AWS environment variables mounted
	docker run --rm \
		-e AWS_ACCESS_KEY_ID \
		-e AWS_SECRET_ACCESS_KEY \
		-e AWS_REGION \
		-e AWS_PROFILE \
		-v ~/.aws:/home/lowkey/.aws:ro \
		$(IMAGE_NAME):$(IMAGE_TAG) $(ARGS)

# Example usage commands
.PHONY: example-copy-env
example-copy-env: ## Example: Copy secrets to env format (requires AWS credentials)
	$(MAKE) run-aws ARGS="copy --input-type aws-secrets-manager --input-name example-secret --output-type env"

.PHONY: example-copy-json
example-copy-json: ## Example: Copy secrets to JSON format (requires AWS credentials)
	$(MAKE) run-aws ARGS="copy --input-type aws-secrets-manager --input-name example-secret --output-type json"

.PHONY: example-list-aws
example-list-aws: ## Example: List AWS secrets (requires AWS credentials)
	$(MAKE) run-aws ARGS="list --type aws-secrets-manager --region us-east-1"

.PHONY: example-list-env
example-list-env: ## Example: List .env files in current directory
	docker run --rm -v $(PWD):/workspace $(IMAGE_NAME):$(IMAGE_TAG) list --type env --path /workspace

.PHONY: example-list-json
example-list-json: ## Example: List JSON files in current directory
	docker run --rm -v $(PWD):/workspace $(IMAGE_NAME):$(IMAGE_TAG) list --type json --path /workspace

# File output commands
.PHONY: run-output
run-output: ## Run container with volume mount for file output
	docker run --rm \
		-e AWS_ACCESS_KEY_ID \
		-e AWS_SECRET_ACCESS_KEY \
		-e AWS_REGION \
		-e AWS_PROFILE \
		-v ~/.aws:/home/lowkey/.aws:ro \
		-v $(PWD):/workspace \
		$(IMAGE_NAME):$(IMAGE_TAG) $(ARGS)

# Testing commands
.PHONY: test-build
test-build: build run-version ## Build and test that the container works
	@echo "✅ Docker build and basic functionality test passed"

.PHONY: test-all
test-all: build run run-version run-help ## Run all basic tests
	@echo "✅ All basic tests passed"

# Cleanup commands
.PHONY: clean
clean: ## Remove locally built images
	docker rmi $(IMAGE_NAME):$(IMAGE_TAG) 2>/dev/null || true
	docker rmi $(FULL_IMAGE) 2>/dev/null || true

.PHONY: clean-all
clean-all: clean ## Remove all related Docker images and containers
	docker system prune -f

# Development commands
.PHONY: dev-install
dev-install: ## Install dependencies locally for development
	npm install

.PHONY: dev-link
dev-link: ## Link package globally for local development
	npm link

.PHONY: dev-unlink
dev-unlink: ## Unlink global package
	npm unlink -g @moonbeam-nyc/lowkey

# Package version commands
.PHONY: version-patch
version-patch: ## Bump patch version
	npm run version:patch

.PHONY: version-minor
version-minor: ## Bump minor version
	npm run version:minor

.PHONY: version-major
version-major: ## Bump major version
	npm run version:major

# Package publish commands (version + publish)
.PHONY: publish-patch
publish-patch: ## Bump patch version and publish to npm
	npm run publish:patch

.PHONY: publish-minor
publish-minor: ## Bump minor version and publish to npm
	npm run publish:minor

.PHONY: publish-major
publish-major: ## Bump major version and publish to npm
	npm run publish:major

# Testing commands
.PHONY: test
test: ## Run all tests
	npm test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	npm run test:watch

.PHONY: test-unit
test-unit: ## Run only unit tests
	node --test tests/unit/**/*.test.js

.PHONY: test-integration
test-integration: ## Run only integration tests
	node --test tests/integration/**/*.test.js

.PHONY: test-coverage
test-coverage: ## Run tests with coverage (if coverage tool is added)
	@echo "Test coverage not yet implemented - run 'make test' for now"

.PHONY: test-ci
test-ci: test ## Run tests for CI (currently same as test)
	@echo "✅ All tests passed for CI"