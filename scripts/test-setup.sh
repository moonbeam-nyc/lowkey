#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Setting up test environment..."

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if LocalStack is running
is_localstack_running() {
    if command_exists docker; then
        docker ps --format "table {{.Names}}" 2>/dev/null | grep -q "localstack" || \
        curl -s http://localhost:4566/_localstack/health >/dev/null 2>&1
    else
        return 1
    fi
}

# Function to check if k3d cluster exists and is running
is_k3d_cluster_running() {
    if command_exists k3d; then
        # Check if cluster exists and has running servers (1/1 not 0/1)
        k3d cluster list 2>/dev/null | grep -E "lowkey-test\s+[1-9]/[1-9]" >/dev/null
    else
        return 1
    fi
}

# Function to wait for LocalStack to be ready
wait_for_localstack() {
    echo "⏳ Waiting for LocalStack to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:4566/_localstack/health | grep -q '"secretsmanager".*"running"'; then
            echo -e "${GREEN}✅ LocalStack is ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ LocalStack failed to start properly${NC}"
    return 1
}

# Check and start LocalStack
echo "🔍 Checking LocalStack status..."
if is_localstack_running; then
    echo -e "${GREEN}✅ LocalStack is already running${NC}"
else
    echo -e "${YELLOW}⚠️  LocalStack is not running${NC}"
    
    if command_exists docker; then
        echo "🚀 Starting LocalStack..."
        
        # Check if docker-compose.localstack.yml exists
        if [ -f "docker-compose.localstack.yml" ]; then
            docker compose -f docker-compose.localstack.yml up -d
            wait_for_localstack
            export LOCALSTACK_ENDPOINT=http://localhost:4566
            echo "✅ LocalStack started and ready"
        else
            echo -e "${YELLOW}⚠️  docker-compose.localstack.yml not found, skipping LocalStack setup${NC}"
            echo "   AWS tests will be skipped"
        fi
    else
        echo -e "${YELLOW}⚠️  Docker not found, cannot start LocalStack${NC}"
        echo "   AWS tests will be skipped"
    fi
fi

# Check and start k3d cluster
echo "🔍 Checking k3d cluster status..."
if command_exists k3d; then
    if is_k3d_cluster_running; then
        echo -e "${GREEN}✅ k3d cluster 'lowkey-test' is already running${NC}"
        # Set the context to ensure we're using the right cluster
        kubectl config use-context k3d-lowkey-test >/dev/null 2>&1 || true
    else
        echo -e "${YELLOW}⚠️  k3d cluster 'lowkey-test' is not running${NC}"
        
        # Check if cluster exists but is stopped
        if k3d cluster list 2>/dev/null | grep -q "lowkey-test"; then
            echo "🚀 Starting existing k3d cluster..."
            k3d cluster start lowkey-test
            
            # Wait for cluster to actually start
            echo "⏳ Waiting for cluster containers to start..."
            max_attempts=15
            attempt=1
            while [ $attempt -le $max_attempts ]; do
                if k3d cluster list 2>/dev/null | grep -E "lowkey-test\s+[1-9]/[1-9]" >/dev/null; then
                    break
                fi
                sleep 2
                attempt=$((attempt + 1))
            done
            
            kubectl config use-context k3d-lowkey-test
            echo "✅ k3d cluster started"
        else
            echo "🚀 Creating new k3d cluster..."
            k3d cluster create lowkey-test \
                --servers 1 \
                --agents 2 \
                --port "8080:80@loadbalancer" \
                --port "8443:443@loadbalancer" \
                --port "6443:6443@server:0" \
                --k3s-arg "--disable=traefik@server:0" \
                --wait
            kubectl config use-context k3d-lowkey-test
            echo "✅ k3d cluster created and ready"
        fi
        
        # Wait for cluster to be ready
        echo "⏳ Waiting for cluster to be ready..."
        kubectl wait --for=condition=Ready nodes --all --timeout=60s >/dev/null 2>&1 || true
    fi
else
    echo -e "${YELLOW}⚠️  k3d not found, cannot start Kubernetes cluster${NC}"
    echo "   Kubernetes tests will be skipped"
fi

# Export environment variables for tests
if is_localstack_running; then
    export LOCALSTACK_ENDPOINT=http://localhost:4566
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    export AWS_DEFAULT_REGION=us-east-1
    echo "📝 LocalStack environment variables set"
fi

echo -e "${GREEN}✅ Test environment setup complete${NC}"
echo ""
echo "Environment summary:"
echo -n "  LocalStack: "
if is_localstack_running; then
    echo -e "${GREEN}Running${NC} (http://localhost:4566)"
else
    echo -e "${YELLOW}Not available${NC}"
fi

echo -n "  k3d cluster: "
if is_k3d_cluster_running; then
    echo -e "${GREEN}Running${NC} (lowkey-test)"
else
    echo -e "${YELLOW}Not available${NC}"
fi

echo ""