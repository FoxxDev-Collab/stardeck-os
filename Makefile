.PHONY: dev-frontend dev-backend build clean deploy test vendor package

# Binary name
BINARY_NAME := stardeckos
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')

# Development
dev-frontend:
	cd stardeckos-frontend && npm run dev

dev-backend:
	cd stardeckos-backend && STARDECK_USE_HTTP=true STARDECK_PORT=8080 go run -mod=vendor .

# Build production binary (frontend + backend)
build: build-frontend build-backend
	@echo "Build complete: stardeckos-backend/$(BINARY_NAME)"
	@ls -lh stardeckos-backend/$(BINARY_NAME)

build-frontend:
	@echo "Building frontend..."
	cd stardeckos-frontend && npm run build
	rm -rf stardeckos-backend/frontend_dist
	cp -r stardeckos-frontend/out stardeckos-backend/frontend_dist
	@echo "Frontend built and copied to backend/frontend_dist"

build-backend:
	@echo "Building backend with embedded frontend..."
	cd stardeckos-backend && go build -mod=vendor -ldflags="-s -w" -o $(BINARY_NAME)
	@echo "Backend binary built: stardeckos-backend/$(BINARY_NAME)"

# Clean build artifacts
clean:
	rm -rf stardeckos-frontend/out
	rm -rf stardeckos-frontend/.next
	rm -rf stardeckos-backend/frontend_dist
	rm -f stardeckos-backend/$(BINARY_NAME)
	rm -f stardeck-*.tar.gz
	mkdir -p stardeckos-backend/frontend_dist
	echo '<!DOCTYPE html><html><body>Build required</body></html>' > stardeckos-backend/frontend_dist/index.html
	@echo "Cleaned build artifacts"

# Create deployment package
package: build
	@echo "Creating deployment package..."
	mkdir -p dist
	cp stardeckos-backend/$(BINARY_NAME) dist/
	cp scripts/install.sh dist/
	cp scripts/stardeck.service dist/
	tar -czvf stardeck-$(VERSION).tar.gz -C dist .
	rm -rf dist
	@echo "Package created: stardeck-$(VERSION).tar.gz"

# Deploy to test VM
# Usage: make deploy VM=192.168.1.100 USER=admin
deploy: package
	@echo "Deploying to $(USER)@$(VM)..."
	scp stardeck-$(VERSION).tar.gz $(USER)@$(VM):/tmp/
	ssh $(USER)@$(VM) "cd /tmp && tar -xzf stardeck-$(VERSION).tar.gz && sudo bash install.sh"
	@echo "Deployment complete!"

# Run tests
test:
	cd stardeckos-backend && go test -mod=vendor ./...

# Vendor dependencies
vendor:
	cd stardeckos-backend && go mod tidy && go mod vendor
