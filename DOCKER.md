# Docker Usage

## Installation

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/moonbeam-nyc/lowkey:latest

# Or use a specific version
docker pull ghcr.io/moonbeam-nyc/lowkey:v1.1.0
```

## Commands

<details>
<summary><strong>copy</strong></summary>

```bash
# Copy AWS secrets to env file with volume mount
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type aws-secrets-manager --input-name my-app-secrets --output-type env --output-name /workspace/.env

# Using AWS profile with volume mount
docker run --rm \
  -v ~/.aws:/home/lowkey/.aws:ro \
  -v $(pwd):/workspace \
  -e AWS_PROFILE=production \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type aws-secrets-manager --input-name my-secrets --output-type env --output-name /workspace/.env

# Convert local files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  copy --input-type json --input-name /workspace/config.json \
  --output-type env --output-name /workspace/.env
```

</details>

<details>
<summary><strong>list</strong></summary>

```bash
# List AWS secrets
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type aws-secrets-manager --region us-east-1

# List local files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type env --path /workspace
```

</details>

<details>
<summary><strong>inspect</strong></summary>

```bash
# Inspect AWS secret keys only
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  inspect --type aws-secrets-manager --name myapp-secrets

# Inspect AWS secret with values
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  inspect --type aws-secrets-manager --name myapp-secrets --show-values

# Inspect local files with volume mount
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  inspect --type json --name /workspace/config.json
```

</details>

<details>
<summary><strong>interactive, x</strong></summary>

```bash
# Interactive AWS secrets browser
docker run --rm -it \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  interactive

# Interactive local files browser with volume mount
docker run --rm -it \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  x --path /workspace
```

</details>

## Authentication

### AWS Authentication

Use one of these methods for AWS credentials:

**Environment Variables:**
```bash
docker run --rm \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type aws-secrets-manager
```

**AWS Profile with Volume Mount:**
```bash
docker run --rm \
  -v ~/.aws:/home/lowkey/.aws:ro \
  -e AWS_PROFILE=production \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type aws-secrets-manager
```

### Kubernetes Authentication

Mount your kubeconfig for Kubernetes access:

```bash
docker run --rm \
  -v ~/.kube:/home/lowkey/.kube:ro \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type kubernetes --namespace default
```

## Volume Mounts

### Working with Local Files

Mount your current directory to `/workspace` to work with local files:

```bash
docker run --rm \
  -v $(pwd):/workspace \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type env --path /workspace
```

### AWS Credentials

Mount your AWS credentials directory:

```bash
docker run --rm \
  -v ~/.aws:/home/lowkey/.aws:ro \
  -e AWS_PROFILE=your-profile \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type aws-secrets-manager
```

### Kubernetes Config

Mount your kubeconfig:

```bash
docker run --rm \
  -v ~/.kube:/home/lowkey/.kube:ro \
  ghcr.io/moonbeam-nyc/lowkey:latest \
  list --type kubernetes
```

## Notes

- Use `-it` flags for interactive mode
- Mount volumes as read-only (`:ro`) when possible for security
- The container runs as a non-root user `lowkey` with UID 1000
- AWS credentials can be provided via environment variables or volume-mounted profiles
- File paths inside the container should reference the mounted volumes (e.g., `/workspace/file.env`)