#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ─── Argumentos ───────────────────────────────────────────────────────────────
const moduleName = process.argv[2];
const childFlag = process.argv.indexOf("--child");
const childName = childFlag !== -1 ? process.argv[childFlag + 1] : null;
const isChild = !!childName;

if (!moduleName) {
  console.error("❌ Debés especificar el nombre del módulo.");
  process.exit(1);
}

if (!moduleName.startsWith("rc-")) {
  console.error('❌ El nombre debe empezar con "rc-".');
  process.exit(1);
}

if (isChild && !childName) {
  console.error(
    "❌ Debés especificar el nombre del submódulo. Ejemplo: --child productos",
  );
  process.exit(1);
}

const moduleSlug = moduleName.replace("rc-", "");
const moduleLabel = moduleSlug.charAt(0).toUpperCase() + moduleSlug.slice(1);
const rootDir = path.resolve(__dirname, "..");
const moduleDir = path.join(rootDir, moduleName);
const org = "Angular-MF";
const port = getNextPort();

// ─── Utilidades ───────────────────────────────────────────────────────────────
function run(cmd, cwd = rootDir) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function question(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function getNextPort() {
  const registryPath = path.join(rootDir, "registry.json");
  const usedPorts = [4200];

  if (fs.existsSync(registryPath)) {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    registry.modules.forEach((m) => {
      if (m.port) usedPorts.push(m.port);
    });
  }

  let port = 4201;
  while (usedPorts.includes(port)) port++;
  return port;
}

function addToRootPackageJson() {
  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  pkg.scripts[moduleSlug] =
    `npm start --prefix ${moduleName} -- --port ${port}`;
  pkg.scripts[`dev:${moduleSlug}`] =
    `concurrently -n "SHELL,${moduleLabel.toUpperCase()}" -c "blue,cyan" "npm run shell" "npm run ${moduleSlug}"`;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`✅ Scripts agregados al package.json raíz`);
}

function addToNavJson() {
  const navPath = path.join(rootDir, "rc-shell", "public", "nav.json");
  const nav = JSON.parse(fs.readFileSync(navPath, "utf8"));

  const icon = `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5ZM5 4.75C4.86193 4.75 4.75 4.86193 4.75 5V19C4.75 19.1381 4.86193 19.25 5 19.25H19C19.1381 19.25 19.25 19.1381 19.25 19V5C19.25 4.86193 19.1381 4.75 19 4.75H5Z" fill="currentColor"/></svg>`;

  nav.push({
    label: moduleLabel,
    route: `/${moduleSlug}`,
    icon,
  });

  fs.writeFileSync(navPath, JSON.stringify(nav, null, 2));
  console.log(`✅ Entrada agregada al nav.json`);
}

function addToRegistry(qaUrl, prodUrl) {
  const registryPath = path.join(rootDir, "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

  registry.modules.push({
    name: moduleName,
    slug: moduleSlug,
    label: moduleLabel,
    port,
    urls: {
      local: `http://localhost:${port}/remoteEntry.json`,
      qa: qaUrl || "",
      prod: prodUrl || "",
    },
  });

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  // Copiar al shell
  const shellRegistryPath = path.join(
    rootDir,
    "rc-shell",
    "public",
    "registry.json",
  );
  fs.writeFileSync(shellRegistryPath, JSON.stringify(registry, null, 2));

  console.log(`✅ registry.json actualizado`);
}

function addToShellRoutes() {
  const routesPath = path.join(
    rootDir,
    "rc-shell",
    "src",
    "app",
    "app.routes.ts",
  );
  let content = fs.readFileSync(routesPath, "utf8");

  const newRoute = `  {
    path: '${moduleSlug}',
    loadComponent: () => loadRemoteModule('${moduleName}', './Component').then((m) => m.App),
  },`;

  content = content.replace(/(\s*\{\s*\n\s*path: '',)/, `\n${newRoute}\n$1`);

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
  fs.writeFileSync(path.join(moduleDir, "Dockerfile"), content);
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
    try_files $uri $uri/ /index.html;
  }
}
`;
  fs.writeFileSync(path.join(moduleDir, "nginx.conf"), content);
  console.log(`✅ nginx.conf creado`);
}

function createDockerignore() {
  const content = `node_modules
dist
.git
.gitignore
`;
  fs.writeFileSync(path.join(moduleDir, ".dockerignore"), content);
  console.log(`✅ .dockerignore creado`);
}

function createNpmrc() {
  const envPath = path.join(rootDir, ".env");
  let token = "";

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/NODE_AUTH_TOKEN=(.+)/);
    if (match) token = match[1].trim();
  }

  if (!token) {
    console.warn("⚠️  No se encontró NODE_AUTH_TOKEN en .env raíz.");
  }

  const content = `@angular-mf:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${token || "${NODE_AUTH_TOKEN}"}
`;
  fs.writeFileSync(path.join(moduleDir, ".npmrc"), content);
  console.log(`✅ .npmrc creado`);
}

function createGithubAction() {
  const actionsDir = path.join(moduleDir, ".github", "workflows");
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
  fs.writeFileSync(path.join(actionsDir, "docker.yml"), content);
  console.log(`✅ GitHub Action creado`);
}

function updateFederationConfig() {
  const configPath = path.join(moduleDir, "federation.config.js");
  const content = `const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: '${moduleName}',
  exposes: {
    './Component': './src/app/app.ts',
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: false, requiredVersion: 'auto' }),
  },
  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    '@angular-devkit/build-angular',
    '@angular/build',
    '@angular/compiler-cli',
    '@angular/cli',
    'karma',
  ],
});
`;
  fs.writeFileSync(configPath, content);
  console.log(`✅ federation.config.js actualizado`);
}

function updateStyles() {
  const stylesPath = path.join(moduleDir, "src", "styles.scss");
  const content = `@use '@angular-mf/shared-ui/src/styles' as *;

body {
  font-family: var(--font-outfit);
}
`;
  fs.writeFileSync(stylesPath, content);
  console.log(`✅ styles.scss actualizado`);
}

function updateAppConfig() {
  const configPath = path.join(moduleDir, "src", "app", "app.config.ts");
  const content = `import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes)
  ]
};
`;
  fs.writeFileSync(configPath, content);
  console.log(`✅ app.config.ts actualizado`);
}

function updateAppRoutes() {
  const routesPath = path.join(moduleDir, "src", "app", "app.routes.ts");
  const content = `import { Routes } from '@angular/router';

export const routes: Routes = [];
`;
  fs.writeFileSync(routesPath, content);
  console.log(`✅ app.routes.ts creado`);
}

function updateAppHtml() {
  const htmlPath = path.join(moduleDir, "src", "app", "app.html");
  const content = `<div class="module-container">
  <h1>${moduleLabel} works!</h1>
</div>
`;
  fs.writeFileSync(htmlPath, content);
  console.log(`✅ app.html actualizado`);
}

function alignAngularVersion() {
  const pkgPath = path.join(moduleDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  const angularVersion = "21.2.8";
  const buildVersion = "21.2.7";

  const angularPkgs = [
    "@angular/animations",
    "@angular/common",
    "@angular/compiler",
    "@angular/core",
    "@angular/forms",
    "@angular/platform-browser",
    "@angular/router",
  ];

  angularPkgs.forEach((p) => {
    if (pkg.dependencies[p]) pkg.dependencies[p] = angularVersion;
  });

  if (pkg.devDependencies["@angular/compiler-cli"]) {
    pkg.devDependencies["@angular/compiler-cli"] = angularVersion;
  }
  if (pkg.devDependencies["@angular/build"]) {
    pkg.devDependencies["@angular/build"] = buildVersion;
  }
  if (pkg.devDependencies["@angular-devkit/build-angular"]) {
    pkg.devDependencies["@angular-devkit/build-angular"] = buildVersion;
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`✅ Versiones de Angular alineadas a ${angularVersion}`);
}

function addChildToNavJson(parentSlug, childSlug) {
  const navPath = path.join(rootDir, 'rc-shell', 'public', 'nav.json');
  const nav = JSON.parse(fs.readFileSync(navPath, 'utf8'));
  const childLabel = toClassName(childSlug).replace(/([A-Z])/g, ' $1').trim();

  const parent = nav.find(item => item.route === `/${parentSlug}`);
  if (!parent) {
    console.error(`❌ No se encontró el módulo padre /${parentSlug} en nav.json`);
    process.exit(1);
  }

  const isFirstChild = !parent.children || parent.children.length === 0;

  if (!parent.children) parent.children = [];

  const alreadyExists = parent.children.some(c => c.route === `/${parentSlug}/${childSlug}`);
  if (alreadyExists) {
    console.warn(`⚠️ El child /${parentSlug}/${childSlug} ya existe en nav.json`);
    return;
  }

  // Si es el primer hijo, crear automáticamente el hijo "inicio" primero
  if (isFirstChild) {
    console.log(`\n🏠 Primer hijo detectado — creando hijo "inicio" automáticamente...`);
    parent.children.push({
      label: 'Inicio',
      route: `/${parentSlug}/inicio`
    });
  }

  parent.children.push({
    label: childLabel,
    route: `/${parentSlug}/${childSlug}`
  });

  fs.writeFileSync(navPath, JSON.stringify(nav, null, 2));
  console.log(`✅ Children agregados al nav.json`);
}

function addChildRoute(parentModuleName, childSlug) {
  const routesPath = path.join(rootDir, parentModuleName, 'src', 'app', 'app.routes.ts');
  const className = toClassName(childSlug);
  const parentSlug = parentModuleName.replace('rc-', '');

  // Verificar si es el primer hijo
  let routesContent = fs.readFileSync(routesPath, 'utf8');
  const isFirstChild = !routesContent.includes('loadComponent');

  if (isFirstChild) {
    console.log(`\n🏠 Creando componente "inicio" automáticamente...`);

    // Crear componente inicio
    const inicioContent = `import { Component } from '@angular/core';

@Component({
  selector: 'app-inicio',
  standalone: true,
  template: \`
    <div class="page-container">
      <h1>${toClassName(parentSlug)}</h1>
      <p>Bienvenido al módulo de ${toClassName(parentSlug).toLowerCase()}.</p>
    </div>
  \`
})
export class InicioComponent {}
`;
    const inicioDir = path.join(rootDir, parentModuleName, 'src', 'app', 'pages', 'inicio');
    fs.mkdirSync(inicioDir, { recursive: true });
    fs.writeFileSync(path.join(inicioDir, 'inicio.component.ts'), inicioContent);

    // Agregar ruta de inicio
    const inicioRoute = `  {
    path: '${parentSlug}/inicio',
    loadComponent: () => import('./pages/inicio/inicio.component').then(m => m.InicioComponent),
  },`;

    routesContent = routesContent.replace(
      /export const routes: Routes = \[/,
      `export const routes: Routes = [\n${inicioRoute}`
    );

    console.log(`✅ Componente InicioComponent creado`);
  }

  // Crear componente del hijo solicitado
  const componentContent = `import { Component } from '@angular/core';

@Component({
  selector: 'app-${childSlug}',
  standalone: true,
  template: \`
    <div class="page-container">
      <h1>${className}</h1>
      <p>${className} works!</p>
    </div>
  \`
})
export class ${className}Component {}
`;

  const pagesDir = path.join(rootDir, parentModuleName, 'src', 'app', 'pages', childSlug);
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.writeFileSync(path.join(pagesDir, `${childSlug}.component.ts`), componentContent);
  console.log(`✅ Componente ${className}Component creado`);

  // Agregar ruta del hijo solicitado
  const newRoute = `  {
    path: '${parentSlug}/${childSlug}',
    loadComponent: () => import('./pages/${childSlug}/${childSlug}.component').then(m => m.${className}Component),
  },`;

  if (routesContent.includes(`path: '${parentSlug}/${childSlug}'`)) {
    console.warn(`⚠️ La ruta /${parentSlug}/${childSlug} ya existe`);
  } else {
    routesContent = routesContent.replace(
      /export const routes: Routes = \[/,
      `export const routes: Routes = [\n${newRoute}`
    );
  }

  fs.writeFileSync(routesPath, routesContent);
  console.log(`✅ Rutas agregadas al app.routes.ts de ${parentModuleName}`);
}

function addExposeToFederationConfig(parentModuleName, childSlug) {
  const configPath = path.join(rootDir, parentModuleName, 'federation.config.js');
  let content = fs.readFileSync(configPath, 'utf8');
  const className = toClassName(childSlug);

  // Si es el primer hijo, agregar también el expose de Inicio
  const isFirstChild = !content.includes("'./Inicio'");

  if (isFirstChild) {
    content = content.replace(
      /exposes: \{([^}]*)\}/s,
      (match, inner) => `exposes: {${inner}    './Inicio': './src/app/pages/inicio/inicio.component.ts',\n  }`
    );
    console.log(`✅ Expose Inicio agregado al federation.config.js`);
  }

  if (content.includes(`'./${className}'`)) {
    console.warn(`⚠️ El expose ./${className} ya existe`);
    return;
  }

  content = content.replace(
    /exposes: \{([^}]*)\}/s,
    (match, inner) => `exposes: {${inner}    './${className}': './src/app/pages/${childSlug}/${childSlug}.component.ts',\n  }`
  );

  fs.writeFileSync(configPath, content);
  console.log(`✅ Expose ${className} agregado al federation.config.js`);
}

function addChildRouteToShell(parentModuleName, childSlug) {
  const routesPath = path.join(rootDir, 'rc-shell', 'src', 'app', 'app.routes.ts');
  let content = fs.readFileSync(routesPath, 'utf8');
  const parentSlug = parentModuleName.replace('rc-', '');
  const className = toClassName(childSlug);

  // Verificar si es el primer hijo chequeando si inicio ya existe
  const isFirstChild = !content.includes(`path: '${parentSlug}/inicio'`);

  if (isFirstChild) {
    const inicioRoute = `  {
    path: '${parentSlug}/inicio',
    loadComponent: () => loadRemoteModule('${parentModuleName}', './Inicio').then((m) => m.InicioComponent),
  },`;

    content = content.replace(
      /(\s*\{\s*\n\s*path: '',)/,
      `\n${inicioRoute}\n$1`
    );
    console.log(`✅ Ruta inicio agregada al shell`);
  }

  // Agregar ruta del hijo solicitado
  const newRoute = `  {
    path: '${parentSlug}/${childSlug}',
    loadComponent: () => loadRemoteModule('${parentModuleName}', './${className}').then((m) => m.${className}Component),
  },`;

  if (content.includes(`path: '${parentSlug}/${childSlug}'`)) {
    console.warn(`⚠️ La ruta ${parentSlug}/${childSlug} ya existe en el shell`);
  } else {
    content = content.replace(
      /(\s*\{\s*\n\s*path: '',)/,
      `\n${newRoute}\n$1`
    );
  }

  fs.writeFileSync(routesPath, content);
  console.log(`✅ Rutas child agregadas al app.routes.ts del shell`);
}

async function createParentModule(qaUrl, prodUrl) {
  console.log(`\n📦 Creando repositorio en GitHub...`);
  run(`gh repo create ${org}/${moduleName} --private --clone`);

  console.log(`\n⚙️  Creando proyecto Angular...`);
  run(
    `npx @angular/cli@21 new ${moduleName} --routing=false --style=scss --skip-git --directory ${moduleName}`,
  );

  createNpmrc();

  console.log(`\n🔗 Instalando Native Federation...`);
  run(
    `npx ng add @angular-architects/native-federation@21 --project ${moduleName} --type remote --port ${port}`,
    moduleDir,
  );

  console.log(`\n📐 Alineando versiones de Angular...`);
  alignAngularVersion();
  run(`npm install --legacy-peer-deps`, moduleDir);

  console.log(`\n🎨 Instalando shared-ui...`);
  run(`npm install @angular-mf/shared-ui@latest`, moduleDir);

  console.log(`\n📝 Creando archivos...`);
  createDockerfile();
  createNginxConf();
  createDockerignore();
  createGithubAction();
  updateFederationConfig();
  updateStyles();
  updateAppConfig();
  updateAppRoutes();
  updateAppHtml();

  console.log(`\n🔧 Actualizando rc-shell y registry...`);
  addToNavJson();
  addToShellRoutes();
  addToRegistry(qaUrl, prodUrl);
  addToRootPackageJson();

  console.log(`\n📤 Haciendo primer commit...`);
  run(`git add .`, moduleDir);
  run(`git commit -m "feat: initial setup ${moduleName}"`, moduleDir);
  run(`git push origin main`, moduleDir);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (isChild) {
    const parentSlug = moduleName.replace("rc-", "");
    const moduleExists = fs.existsSync(path.join(rootDir, moduleName));

    if (!moduleExists) {
      // Padre no existe — preguntar si crear primero
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      console.log(`\n⚠️  El módulo padre ${moduleName} no existe localmente.`);
      const answer = await question(rl, `¿Querés crearlo primero? (s/n): `);

      if (answer.toLowerCase() !== "s") {
        console.log("❌ Operación cancelada.");
        rl.close();
        process.exit(0);
      }

      console.log(
        `\n📋 Configuración de URLs para ${moduleName} (Enter para dejar vacío):`,
      );
      const qaUrl = await question(rl, `  URL QA: `);
      const prodUrl = await question(rl, `  URL Prod: `);
      rl.close();
    } else {
      const rl2 = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl2.close();
    }

    console.log(
      `\n🧩 Creando submódulo: ${childName} dentro de ${moduleName}\n`,
    );
    addChildToNavJson(parentSlug, childName);
    addChildRoute(moduleName, childName);
    addExposeToFederationConfig(moduleName, childName);
    addChildRouteToShell(moduleName, childName);

    console.log(`\n✅ Submódulo ${childName} creado en ${moduleName}`);
    console.log(`\n📌 Reiniciá ${moduleName} para que tome el nuevo expose:`);
    console.log(`   npm run dev:${parentSlug}\n`);
    return;
  }

  // ─── Modo módulo nuevo sin hijo ───────────────────────────────────────────
  console.log(`\n🚀 Creando módulo: ${moduleName}\n`);
  console.log(`⚠️  Estás creando un módulo SIN hijos.`);
  console.log(`   Para agregar pantallas después usá:`);
  console.log(
    `   npm run create-module ${moduleName} -- --child nombrePantalla\n`,
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  console.log("📋 Configuración de URLs por entorno (Enter para dejar vacío):");
  const qaUrl = await question(rl, `  URL QA para ${moduleName}: `);
  const prodUrl = await question(rl, `  URL Prod para ${moduleName}: `);
  rl.close();

  await createParentModule(qaUrl.trim(), prodUrl.trim());

  console.log(`\n✅ Módulo ${moduleName} creado exitosamente.`);
  console.log(
    `\n⚠️  Recordá que para empezar a trabajar necesitás al menos un hijo:`,
  );
  console.log(
    `   npm run create-module ${moduleName} -- --child nombrePantalla\n`,
  );
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
