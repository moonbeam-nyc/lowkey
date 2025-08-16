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

# Debug and logging commands
.PHONY: debug-run
debug-run: ## Run lowkey in debug mode with logging
	LOWKEY_DEBUG=true node cli.js $(ARGS)

.PHONY: debug-interactive
debug-interactive: ## Run interactive mode with debug logging
	LOWKEY_DEBUG=true node cli.js interactive

.PHONY: log
log: ## View the latest debug log
	@if [ -f "$$(ls -1t lowkey-logs/lowkey-debug-*.log 2>/dev/null | head -1)" ]; then \
		tail -f "$$(ls -1t lowkey-logs/lowkey-debug-*.log | head -1)"; \
	else \
		echo "No debug logs found. Run with LOWKEY_DEBUG=true or use 'make debug-run'"; \
	fi

.PHONY: log-latest
log-latest: ## Cat the entire latest debug log
	@if [ -f "$$(ls -1t lowkey-logs/lowkey-debug-*.log 2>/dev/null | head -1)" ]; then \
		cat "$$(ls -1t lowkey-logs/lowkey-debug-*.log | head -1)"; \
	else \
		echo "No debug logs found. Run with LOWKEY_DEBUG=true or use 'make debug-run'"; \
	fi

.PHONY: log-clean
log-clean: ## Clean up all debug logs
	rm -rf lowkey-logs/

.PHONY: log-list
log-list: ## List all debug log files
	@if [ -d lowkey-logs ]; then \
		ls -lht lowkey-logs/*.log 2>/dev/null | head -20 || echo "No logs found"; \
	else \
		echo "No logs directory found"; \
	fi

# Testing commands
.PHONY: test
test: ## Run all tests including LocalStack AWS tests
	$(MAKE) test-localstack

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

# LocalStack commands for AWS simulation
.PHONY: localstack-start
localstack-start: ## Start LocalStack for AWS simulation
	docker compose -f docker-compose.localstack.yml up -d
	@echo "✅ LocalStack started on http://localhost:4566"
	@echo "Use 'make localstack-status' to check if services are ready"

.PHONY: localstack-stop
localstack-stop: ## Stop LocalStack
	docker compose -f docker-compose.localstack.yml down
	@echo "✅ LocalStack stopped"

.PHONY: localstack-restart
localstack-restart: localstack-stop localstack-start ## Restart LocalStack
	@echo "✅ LocalStack restarted"

.PHONY: localstack-logs
localstack-logs: ## View LocalStack logs
	docker compose -f docker-compose.localstack.yml logs -f localstack

.PHONY: localstack-status
localstack-status: ## Check LocalStack health status
	@echo "LocalStack Health Check:"
	@curl -s http://localhost:4566/_localstack/health | jq . 2>/dev/null || curl -s http://localhost:4566/_localstack/health

.PHONY: localstack-clean
localstack-clean: localstack-stop ## Stop LocalStack and clean up volumes
	docker compose -f docker-compose.localstack.yml down -v
	rm -rf tmp/localstack
	@echo "✅ LocalStack cleaned up"

.PHONY: localstack-test-setup
localstack-test-setup: localstack-start ## Start LocalStack and create test secrets
	@echo "Waiting for LocalStack to be ready..."
	@for i in $$(seq 1 20); do \
		if curl -s http://localhost:4566/_localstack/health >/dev/null 2>&1; then \
			echo "✅ LocalStack is ready after $$((i*3)) seconds"; \
			break; \
		fi; \
		if [ $$i -eq 20 ]; then \
			echo "❌ LocalStack failed to start after 60 seconds"; \
			exit 1; \
		fi; \
		printf "."; \
		sleep 3; \
	done; \
	echo ""; \
	echo "Creating test secrets..."
	@docker compose -f docker-compose.localstack.yml exec -T localstack \
		awslocal secretsmanager delete-secret --secret-id test-secret --force-delete-without-recovery >/dev/null 2>&1 || true
	@docker compose -f docker-compose.localstack.yml exec -T localstack \
		awslocal secretsmanager create-secret \
		--name test-secret \
		--secret-string '{"username":"testuser","password":"testpass","api_key":"test123"}' || true
	@echo "✅ Test environment ready"

.PHONY: localstack-test-list
localstack-test-list: ## List secrets in LocalStack
	@docker compose -f docker-compose.localstack.yml exec -T localstack \
		awslocal secretsmanager list-secrets

.PHONY: test-localstack
test-localstack: localstack-test-setup ## Run tests against LocalStack
	@echo "Running tests with LocalStack..."
	@LOCALSTACK_ENDPOINT=http://localhost:4566 \
	 AWS_ACCESS_KEY_ID=test \
	 AWS_SECRET_ACCESS_KEY=test \
	 AWS_REGION=us-east-1 \
	 NODE_ENV=test \
	 npm test
	@echo "✅ LocalStack tests completed"

.PHONY: test-aws
test-aws: localstack-test-setup ## Run only AWS copy tests against LocalStack
	@echo "Running AWS copy tests with LocalStack..."
	@LOCALSTACK_ENDPOINT=http://localhost:4566 \
	 AWS_ACCESS_KEY_ID=test \
	 AWS_SECRET_ACCESS_KEY=test \
	 AWS_REGION=us-east-1 \
	 NODE_ENV=test \
	 node --test tests/integration/copy-aws.test.js
	@echo "✅ AWS copy tests completed"

# Helper target to ensure LocalStack is running
.PHONY: localstack-ensure-running
localstack-ensure-running:
	@if ! curl -s http://localhost:4566/_localstack/health >/dev/null 2>&1; then \
		echo "🚀 LocalStack not running, starting it..."; \
		$(MAKE) localstack-start; \
		echo "⏳ Waiting for LocalStack to be ready..."; \
		for i in $$(seq 1 20); do \
			if curl -s http://localhost:4566/_localstack/health >/dev/null 2>&1; then \
				echo "✅ LocalStack is ready after $$((i*3)) seconds"; \
				break; \
			fi; \
			if [ $$i -eq 20 ]; then \
				echo "❌ LocalStack failed to start after 60 seconds"; \
				exit 1; \
			fi; \
			printf "."; \
			sleep 3; \
		done; \
		echo ""; \
	fi

# LocalStack development commands with environment pre-configured
.PHONY: localstack-interactive
localstack-interactive: ## Run lowkey interactive mode with LocalStack (auto-starts LocalStack)
	@echo "🔍 Checking if LocalStack is running..."
	@$(MAKE) localstack-ensure-running
	@echo "🎯 Starting lowkey interactive with LocalStack..."
	@LOCALSTACK_ENDPOINT=http://localhost:4566 AWS_REGION=us-east-1 node cli.js interactive

.PHONY: localstack-list
localstack-list: localstack-ensure-running ## List secrets in LocalStack (auto-starts LocalStack)
	@LOCALSTACK_ENDPOINT=http://localhost:4566 AWS_REGION=us-east-1 node cli.js list --type aws-secrets-manager --region us-east-1

.PHONY: localstack-copy
localstack-copy: localstack-ensure-running ## Copy secrets with LocalStack (auto-starts LocalStack, requires ARGS)
	@LOCALSTACK_ENDPOINT=http://localhost:4566 AWS_REGION=us-east-1 node cli.js copy $(ARGS)

.PHONY: localstack-inspect
localstack-inspect: localstack-ensure-running ## Inspect secrets with LocalStack (auto-starts LocalStack, requires ARGS)
	@LOCALSTACK_ENDPOINT=http://localhost:4566 AWS_REGION=us-east-1 node cli.js inspect $(ARGS)

.PHONY: localstack-run
localstack-run: localstack-ensure-running ## Run any lowkey command with LocalStack (auto-starts LocalStack, requires ARGS)
	@LOCALSTACK_ENDPOINT=http://localhost:4566 AWS_REGION=us-east-1 node cli.js $(ARGS)