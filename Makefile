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

# Kubernetes (k3d) cluster management
.PHONY: k3d-check
k3d-check: ## Check if k3d is installed
	@which k3d > /dev/null 2>&1 || (echo "❌ k3d is not installed. Install it with: make k3d-install" && exit 1)
	@echo "✅ k3d is installed: $$(k3d version)"

.PHONY: k3d-install
k3d-install: ## Install k3d (macOS/Linux)
	@echo "Installing k3d..."
	@if [ "$$(uname)" = "Darwin" ]; then \
		if which brew > /dev/null 2>&1; then \
			brew install k3d; \
		else \
			curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash; \
		fi \
	else \
		curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash; \
	fi
	@echo "✅ k3d installed successfully"

.PHONY: k3d-create
k3d-create: k3d-check ## Create a local k3d cluster named 'lowkey-test'
	k3d cluster create lowkey-test \
		--servers 1 \
		--agents 2 \
		--port "8080:80@loadbalancer" \
		--port "8443:443@loadbalancer" \
		--wait
	@echo "✅ k3d cluster 'lowkey-test' created successfully"
	@echo "Run 'make k3d-context' to switch to this cluster"

.PHONY: k3d-delete
k3d-delete: ## Delete the k3d cluster 'lowkey-test'
	k3d cluster delete lowkey-test
	@echo "✅ k3d cluster 'lowkey-test' deleted"

.PHONY: k3d-stop
k3d-stop: ## Stop the k3d cluster 'lowkey-test'
	k3d cluster stop lowkey-test
	@echo "✅ k3d cluster 'lowkey-test' stopped"

.PHONY: k3d-start
k3d-start: ## Start the k3d cluster 'lowkey-test'
	k3d cluster start lowkey-test
	@echo "✅ k3d cluster 'lowkey-test' started"

.PHONY: k3d-context
k3d-context: ## Set kubectl context to k3d-lowkey-test
	kubectl config use-context k3d-lowkey-test
	@echo "✅ kubectl context switched to 'k3d-lowkey-test'"

.PHONY: k3d-status
k3d-status: ## Show status of k3d clusters
	@echo "k3d clusters:"
	@k3d cluster list
	@echo ""
	@echo "Current kubectl context:"
	@kubectl config current-context

.PHONY: k3d-clean
k3d-clean: k3d-delete ## Clean up k3d cluster and all resources
	@echo "✅ k3d cluster and resources cleaned up"

.PHONY: k3d-restart
k3d-restart: k3d-stop k3d-start ## Restart the k3d cluster
	@echo "✅ k3d cluster restarted"

.PHONY: k3d-setup
k3d-setup: k3d-create k3d-context ## Create cluster and set context (one command setup)
	@echo "✅ k3d cluster ready to use!"

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
test-coverage: ## Run tests with coverage report
	npm run test:coverage

.PHONY: test-coverage-threshold
test-coverage-threshold: ## Run tests with coverage and enforce 80% threshold
	npm run test:coverage:threshold

.PHONY: test-ci
test-ci: test test-coverage-threshold ## Run tests for CI with coverage requirements
	@echo "✅ All tests passed for CI with coverage requirements"