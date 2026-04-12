#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Argumentos ───────────────────────────────────────────────────────────────
const moduleName = process.argv[2];

if (!moduleName) {
  console.error('❌ Debés especificar el nombre del módulo. Ejemplo: npm run create-module rc-contabilidad');
  process.exit(1);
}

if (!moduleName.startsWith('rc-')) {
  console.error('❌ El nombre del módulo debe empezar con "rc-". Ejemplo: rc-contabilidad');
  process.exit(1);
}

const moduleSlug = moduleName.replace('rc-', '');
const moduleLabel = moduleSlug.charAt(0).toUpperCase() + moduleSlug.slice(1);
const rootDir = path.resolve(__dirname, '..');
const moduleDir = path.join(rootDir, moduleName);
const org = 'Angular-MF';
const port = getNextPort();

// ─── Utilidades ───────────────────────────────────────────────────────────────
function run(cmd, cwd = rootDir) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function getNextPort() {
  const usedPorts = [4200, 4201, 4202];
  const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const scripts = pkgJson.scripts || {};
  Object.values(scripts).forEach(script => {
    const match = script.match(/--port (\d+)/g);
    if (match) match.forEach(m => usedPorts.push(parseInt(m.replace('--port ', ''))));
  });
  let port = 4203;
  while (usedPorts.includes(port)) port++;
  return port;
}

function addToRootPackageJson() {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  pkg.scripts[moduleSlug] = `npm start --prefix ${moduleName} -- --port ${port}`;
  pkg.scripts[`dev:${moduleSlug}`] = `concurrently -n "SHELL,${moduleLabel.toUpperCase()}" -c "blue,cyan" "npm run shell" "npm run ${moduleSlug}"`;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`✅ Scripts agregados al package.json raíz`);
}

function addToNavJson() {
  const navPath = path.join(rootDir, 'rc-shell', 'public', 'nav.json');
  const nav = JSON.parse(fs.readFileSync(navPath, 'utf8'));

  const icon = `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5ZM5 4.75C4.86193 4.75 4.75 4.86193 4.75 5V19C4.75 19.1381 4.86193 19.25 5 19.25H19C19.1381 19.25 19.25 19.1381 19.25 19V5C19.25 4.86193 19.1381 4.75 19 4.75H5Z" fill="currentColor"/></svg>`;

  nav.push({
    label: moduleLabel,
    route: `/${moduleSlug}`,
    icon
  });

  fs.writeFileSync(navPath, JSON.stringify(nav, null, 2));
  console.log(`✅ Entrada agregada al nav.json`);
}

function addToShellRoutes() {
  const routesPath = path.join(rootDir, 'rc-shell', 'src', 'app', 'app.routes.ts');
  let content = fs.readFileSync(routesPath, 'utf8');

  const newRoute = `  {
    path: '${moduleSlug}',
    loadComponent: () => loadRemoteModule('${moduleName}', './Component').then((m) => m.App),
  },`;

  // Insertar antes del path vacío ''
  content = content.replace(
    /(\s*\{\s*\n\s*path: '',)/,
    `\n${newRoute}\n$1`
  );

  fs.writeFileSync(routesPath, content);
  console.log(`✅ Ruta agregada al app.routes.ts`);
}

function createDockerfile() {
  const content = `# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
ARG NODE_AUTH_TOKEN
COPY .npmrc .npmrc
COPY package*.json ./
RUN npm install
COPY . .
RUN npx ng build --configuration production

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/dist/${moduleName}/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
  fs.writeFileSync(path.join(moduleDir, 'Dockerfile'), content);
  console.log(`✅ Dockerfile creado`);
}

function createNginxConf() {
  const content = `server {
  listen 80;
  server_name localhost;
  root /usr/share/nginx/html;
  index index.html;

  add_header Access-Control-Allow-Origin *;
  add_header Access-Control-Allow-Methods 'GET, OPTIONS';
  add_header Access-Control-Allow-Headers '*';

  location / {
    try_files \\$uri \\$uri/ /index.html;
  }
}
`;
  fs.writeFileSync(path.join(moduleDir, 'nginx.conf'), content);
  console.log(`✅ nginx.conf creado`);
}

function createDockerignore() {
  const content = `node_modules
dist
.git
.gitignore
`;
  fs.writeFileSync(path.join(moduleDir, '.dockerignore'), content);
  console.log(`✅ .dockerignore creado`);
}

function createNpmrc() {
  // Leer token del .env raíz
  const envPath = path.join(rootDir, '.env');
  let token = '';

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/NODE_AUTH_TOKEN=(.+)/);
    if (match) token = match[1].trim();
  }

  if (!token) {
    console.warn('⚠️  No se encontró NODE_AUTH_TOKEN en .env raíz. El .npmrc usará variable de entorno.');
  }

  const content = `@angular-mf:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${token || '${NODE_AUTH_TOKEN}'}
`;
  fs.writeFileSync(path.join(moduleDir, '.npmrc'), content);
  console.log(`✅ .npmrc creado`);
}

function createGithubAction() {
  const actionsDir = path.join(moduleDir, '.github', 'workflows');
  fs.mkdirSync(actionsDir, { recursive: true });

  const content = `name: Build and Push Docker Image

on:
  push:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/angular-mf/${moduleName}:latest
          build-args: |
            NODE_AUTH_TOKEN=\${{ secrets.NODE_AUTH_TOKEN }}
`;
  fs.writeFileSync(path.join(actionsDir, 'docker.yml'), content);
  console.log(`✅ GitHub Action creado`);
}

function updateFederationConfig() {
  const configPath = path.join(moduleDir, 'federation.config.js');
  const content = `const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: '${moduleName}',
  exposes: {
    './Component': './src/app/app.ts',
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
  skip: [],
});
`;
  fs.writeFileSync(configPath, content);
  console.log(`✅ federation.config.js actualizado`);
}

function updateStyles() {
  const stylesPath = path.join(moduleDir, 'src', 'styles.scss');
  const content = `@use '@angular-mf/shared-ui/src/styles' as *;

body {
  font-family: var(--font-outfit);
}
`;
  fs.writeFileSync(stylesPath, content);
  console.log(`✅ styles.scss actualizado`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Creando módulo: ${moduleName}\n`);

  // 1. Crear repo en GitHub
  console.log(`\n📦 Creando repositorio en GitHub...`);
  run(`gh repo create ${org}/${moduleName} --private --clone`);

  // 2. Crear proyecto Angular con Native Federation
  console.log(`\n⚙️  Creando proyecto Angular...`);
  run(`npx @angular/cli@21 new ${moduleName} --routing=false --style=scss --skip-git --directory ${moduleName}`);

  // 3. Crear .npmrc ANTES de instalar cualquier cosa
  console.log(`\n📝 Creando archivos de configuración...`);
  createNpmrc();

  // 4. Instalar Native Federation
  console.log(`\n🔗 Instalando Native Federation...`);
  run(`npx ng add @angular-architects/native-federation@21 --project ${moduleName} --type remote --port ${port}`, moduleDir);

  // 5. Instalar shared-ui
  console.log(`\n🎨 Instalando shared-ui...`);
  run(`npm install @angular-mf/shared-ui@latest`, moduleDir);

  // 6. Crear resto de archivos
  createDockerfile();
  createNginxConf();
  createDockerignore();
  createGithubAction();
  updateFederationConfig();
  updateStyles();

  // 7. Actualizar shell
  console.log(`\n🔧 Actualizando rc-shell...`);
  addToNavJson();
  addToShellRoutes();

  // 8. Actualizar package.json raíz
  addToRootPackageJson();

  // 9. Primer commit
  console.log(`\n📤 Haciendo primer commit...`);
  run(`git add .`, moduleDir);
  run(`git commit -m "feat: initial setup ${moduleName}"`, moduleDir);
  run(`git push origin main`, moduleDir);

  console.log(`\n✅ Módulo ${moduleName} creado exitosamente!`);
  console.log(`\n📌 Para empezar a desarrollar:`);
  console.log(`   npm run dev:${moduleSlug}\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});