# AutoRepuestos RC — Frontend MF

Sistema de gestión para AutoRepuestos RC construido con **Microfrontends** usando Angular 21 y Native Federation.

---

## 🏗️ Arquitectura

```
autorepuestos-rc/
├── rc-shell/          → Host principal, layout (sidebar, header)
├── rc-inventario/     → Módulo de inventario
├── rc-rrhh/           → Módulo de RRHH
├── rc-contabilidad/   → Módulo de contabilidad
├── rc-caja/           → Módulo de caja
├── rc-shared-ui/      → Librería de componentes compartidos
├── registry.json      → Fuente de verdad de todos los módulos
└── scripts/           → Scripts de automatización
```

Cada módulo es una aplicación Angular independiente que se carga dinámicamente en el shell. El shell maneja el layout completo (sidebar, header) y cada módulo solo se preocupa por su lógica de negocio.

---

## ⚙️ Requisitos

- Node.js v22+
- npm v11+
- Angular CLI v21
- GitHub CLI (`gh`) — para crear módulos nuevos
- Acceso al token de GitHub Packages

---

## 🚀 Primeros pasos

### 1. Clonar el repo raíz y los módulos

```bash
git clone https://github.com/Angular-MF/autorepuestos-rc
cd autorepuestos-rc

git clone https://github.com/Angular-MF/rc-shell
git clone https://github.com/Angular-MF/rc-inventario
git clone https://github.com/Angular-MF/rc-rrhh
git clone https://github.com/Angular-MF/rc-shared-ui
# ... otros módulos según en cuál trabajés
```

### 2. Configurar el token de GitHub Packages

Creá un archivo `.env` en la raíz `autorepuestos-rc/` con:

```env
NODE_AUTH_TOKEN=ghp_tuTokenAqui
```

> ⚠️ Este archivo nunca se sube a git. Pedile el token al tech lead.

### 3. Instalar dependencias en cada módulo

```bash
cd rc-shell && npm install && cd ..
cd rc-inventario && npm install && cd ..
cd rc-rrhh && npm install && cd ..
# ... repetir para cada módulo que vayas a usar
```

### 4. Instalar dependencias raíz

```bash
npm install
```

---

## 💻 Desarrollo

### Levantar el entorno

Desde la raíz `autorepuestos-rc/` usá los siguientes comandos según el módulo en el que trabajás:

```bash
# Shell + Inventario
npm run dev:inventario

# Shell + RRHH
npm run dev:rrhh

# Shell + Contabilidad
npm run dev:contabilidad

# Shell + Caja
npm run dev:caja

# Todos los módulos activos
npm run dev
```

> El shell siempre corre en `localhost:4200`. Cada módulo tiene su propio puerto definido en `registry.json`.

### URLs de desarrollo

| Módulo        | URL                    |
|---------------|------------------------|
| Shell         | http://localhost:4200  |
| Inventario    | http://localhost:4201  |
| RRHH          | http://localhost:4202  |
| Contabilidad  | http://localhost:4203  |
| Caja          | http://localhost:4204  |

---

## 📦 Crear un módulo nuevo

```bash
npm run create-module rc-nombre
```

El script automáticamente:
- Crea el repo en GitHub
- Configura Angular + Native Federation
- Instala `shared-ui`
- Registra el módulo en `registry.json`
- Agrega la ruta en el shell
- Agrega la entrada en el sidebar
- Hace el primer commit y push

---

## 🧩 Agregar una pantalla a un módulo existente

```bash
npm run create-module rc-inventario -- --child nombrePantalla
```

El script automáticamente:
- Crea el componente en `rc-inventario/src/app/pages/`
- Agrega la ruta en `rc-inventario/src/app/app.routes.ts`
- Expone el componente en `federation.config.js`
- Agrega la ruta en el shell
- Agrega el child en el sidebar

> Si el módulo padre no existe, el script te pregunta si querés crearlo primero.

---

## 🎨 Librería de componentes (shared-ui)

La librería `@angular-mf/shared-ui` está publicada en GitHub Packages y contiene:

| Componente | Selector | Descripción |
|---|---|---|
| Button | `lib-button` | Botón base del sistema |
| Dropdown | `lib-dropdown` | Contenedor dropdown genérico |
| DropdownItem | `lib-dropdown-item` | Item dentro de un dropdown |
| Modal | `lib-modal` | Modal global manejado por servicio |

### Uso del Modal

```typescript
import { ModalService } from '@angular-mf/shared-ui';

export class MiComponente {
  modalService = inject(ModalService);

  abrirModal() {
    this.modalService.open(MiFormularioComponent, {
      title: 'Nuevo registro',
      size: 'md' // sm | md | lg | xl
    });
  }
}
```

### Publicar nueva versión de shared-ui

1. Hacer cambios en `rc-shared-ui/projects/shared-ui/`
2. Subir la versión en `projects/shared-ui/package.json`
3. Push a `main` — el GitHub Action publica automáticamente

---

## 📁 Estructura de un módulo

```
rc-nombre/
├── src/
│   ├── app/
│   │   ├── app.ts              ← componente raíz
│   │   ├── app.html            ← solo <router-outlet /> si tiene pantallas hijas
│   │   ├── app.routes.ts       ← rutas internas del módulo
│   │   ├── app.config.ts
│   │   └── pages/              ← una carpeta por pantalla
│   │       └── productos/
│   │           └── productos.component.ts
│   ├── styles.scss
│   └── main.ts
├── federation.config.js        ← expone componentes al shell
├── nginx.conf
├── Dockerfile
└── .github/
    └── workflows/
        └── docker.yml          ← build y push automático al hacer push a main
```

---

## 🔧 registry.json

Es la fuente de verdad de todos los módulos. Cuando agregás un módulo con el script, este archivo se actualiza automáticamente en la raíz y en `rc-shell/public/`.

```json
{
  "modules": [
    {
      "name": "rc-inventario",
      "slug": "inventario",
      "label": "Inventario",
      "port": 4201,
      "urls": {
        "local": "http://localhost:4201/remoteEntry.json",
        "qa": "",
        "prod": ""
      }
    }
  ]
}
```

---

## 🐳 Docker

Cada módulo tiene su propio `Dockerfile`. Para buildear manualmente:

```bash
cd rc-inventario
docker build --build-arg NODE_AUTH_TOKEN=tuToken -t rc-inventario .
```

Para levantar todo con Docker Compose:

```bash
cd autorepuestos-rc
docker-compose up
```

---

## ❓ Problemas comunes

**El módulo no carga en el shell**
- Verificá que el módulo esté corriendo en su puerto
- Revisá que el `registry.json` tenga la URL correcta
- Reiniciá el shell después de cualquier cambio en el registry

**Error de versiones de Angular**
- Todos los módulos deben usar `@angular/core@21.2.8`
- Si hay conflicto ejecutá: `npm install @angular/core@21.2.8 --legacy-peer-deps`

**No puedo instalar shared-ui**
- Verificá que el `.env` tenga el `NODE_AUTH_TOKEN` correcto
- El `.npmrc` del módulo debe apuntar a GitHub Packages

**El sidebar no muestra el módulo nuevo**
- Verificá que el `nav.json` en `rc-shell/public/` tenga la entrada
- Reiniciá el shell

**El módulo carga en blanco al navegar**
- Verificá que `app.html` tenga `<router-outlet />` si el módulo tiene pantallas hijas
- Verificá que `app.config.ts` tenga `provideRouter(routes)`

---

## 📞 Contacto

Para dudas sobre la arquitectura o el setup, contactá al tech lead.
