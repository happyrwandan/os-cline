# Dockerfile for building the Cline VS Code extension with config modifications
# Uses pre-installed node_modules from the host (installed via bun)
FROM node:22-bullseye

WORKDIR /build

# Copy everything including node_modules
COPY . .

# Install bun for running scripts
RUN npm install -g bun

# Generate protobuf files
WORKDIR /build/apps/vscode
RUN bun add @grpc/proto-loader grpc-tools 2>&1 || true
RUN bun run protos 2>&1; echo "protos exit code: $?"

# Build webview
WORKDIR /build/apps/vscode/webview-ui
RUN npm install --legacy-peer-deps 2>&1 || true
RUN npx vite build 2>&1; echo "webview build exit code: $?"

# Build extension
WORKDIR /build/apps/vscode
RUN npm install --legacy-peer-deps 2>&1 || true
RUN npm install web-tree-sitter tree-sitter-wasms --legacy-peer-deps 2>&1 || true
RUN node esbuild.mjs 2>&1; echo "esbuild exit code: $?"

# Verify
RUN ls -la /build/apps/vscode/dist/ 2>&1 || echo "dist not found"
RUN ls -la /build/apps/vscode/webview-ui/build/ 2>&1 || echo "webview build not found"

CMD ["bash"]