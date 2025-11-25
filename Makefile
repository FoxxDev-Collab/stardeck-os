.PHONY: dev-frontend dev-backend build clean deploy test vendor

# Development
dev-frontend:
	cd stardeckos-frontend && npm run dev

dev-backend:
	cd stardeckos-backend && go run -mod=vendor .

# Build production binary
build: build-frontend build-backend

build-frontend:
	cd stardeckos-frontend && npm run build
	rm -rf stardeckos-backend/frontend_dist
	cp -r stardeckos-frontend/out stardeckos-backend/frontend_dist

build-backend:
	cd stardeckos-backend && go build -mod=vendor -o stardeckos-backend

# Clean build artifacts
clean:
	rm -rf stardeckos-frontend/out
	rm -rf stardeckos-frontend/.next
	rm -rf stardeckos-backend/frontend_dist
	rm -f stardeckos-backend/stardeckos-backend
	mkdir -p stardeckos-backend/frontend_dist
	echo '<!DOCTYPE html><html><body>Development placeholder</body></html>' > stardeckos-backend/frontend_dist/index.html

# Deploy to test VM
# Usage: make deploy VM=192.168.1.100 USER=admin
deploy:
	scp stardeckos-backend/stardeckos-backend $(USER)@$(VM):/tmp/
	scp scripts/install.sh $(USER)@$(VM):/tmp/
	ssh $(USER)@$(VM) "sudo cp /tmp/stardeckos-backend /opt/stardeck/"

# Run tests
test:
	cd stardeckos-backend && go test -mod=vendor ./...

# Vendor dependencies
vendor:
	cd stardeckos-backend && go mod tidy && go mod vendor
