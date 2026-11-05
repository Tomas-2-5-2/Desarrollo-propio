const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, 'dist');
const PORTABLE_DIR = path.join(DIST_DIR, 'Moto-Travel-Ultra-3D-Portable');
const ZIP_PATH = path.join(DIST_DIR, 'Moto-Travel-Ultra-3D-Portable.zip');

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
if (!fs.existsSync(PORTABLE_DIR)) fs.mkdirSync(PORTABLE_DIR, { recursive: true });

// 1. Leer todos los recursos del juego
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const threeJs = fs.readFileSync(path.join(ROOT, 'js', 'three.min.js'), 'utf8');
const audioJs = fs.readFileSync(path.join(ROOT, 'js', 'audio.js'), 'utf8');
const adventureJs = fs.readFileSync(path.join(ROOT, 'js', 'adventure.js'), 'utf8');
const gameJs = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');

// 2. Construir el archivo único Moto-Travel-Offline.html (100% autocontenido sin dependencias externas)
let standaloneHtml = indexHtml
  .replace(
    '<link rel="stylesheet" href="style.css">',
    `<style>\n${styleCss}\n/* En la edición portable ocultamos los botones de descarga */\n#btn-download-hud, #btn-download-card { display: none !important; }\n</style>`
  )
  .replace('<script src="js/three.min.js"></script>', () => `<script>\n${threeJs}\n</script>`)
  .replace('<script src="js/audio.js"></script>', () => `<script>\n${audioJs}\n</script>`)
  .replace('<script src="js/adventure.js"></script>', () => `<script>\n${adventureJs}\n</script>`)
  .replace('<script src="js/game.js"></script>', () => `<script>\n${gameJs}\n</script>`);

const offlineHtmlPath = path.join(PORTABLE_DIR, 'Moto-Travel-Offline.html');
fs.writeFileSync(offlineHtmlPath, standaloneHtml, 'utf8');

// 3. Crear el lanzador ejecutable Jugar-Moto-Travel.bat (abre en modo ventana de aplicación sin pestañas)
const batContent = [
  '@echo off',
  'title MotoTravel 3D - Lanzador Portable',
  'set "GAME_HTML=%~dp0Moto-Travel-Offline.html"',
  '',
  'REM Intentar abrir en modo App de Escritorio con Chrome o Edge (sin barra de direcciones)',
  'where chrome >nul 2>nul',
  'if %ERRORLEVEL% EQU 0 (',
  '  start "" chrome --app="file:///%GAME_HTML:\\=/%" --start-maximized',
  '  exit /b',
  ')',
  'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
  '  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="file:///%GAME_HTML:\\=/%" --start-maximized',
  '  exit /b',
  ')',
  'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
  '  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="file:///%GAME_HTML:\\=/%" --start-maximized',
  '  exit /b',
  ')',
  '',
  'REM Alternativa: abrir con el navegador predeterminado',
  'start "" "%GAME_HTML%"',
  'exit /b'
].join('\r\n');

fs.writeFileSync(path.join(PORTABLE_DIR, 'Jugar-Moto-Travel.bat'), batContent, 'utf8');

// 4. Crear archivo LEEME.txt con instrucciones
const readmeContent = [
  '====================================================================',
  '   MOTO-TRAVEL ULTRA 3D - EDICION PORTABLE OFFLINE (SCRAMBLER 650)  ',
  '====================================================================',
  '',
  'COMO JUGAR (SIN INSTALAR NADA NI NECESITAR INTERNET):',
  '  1. Extrae esta carpeta en cualquier lugar de tu PC.',
  '  2. Haz doble clic en "Jugar-Moto-Travel.bat" para abrir el simulador',
  '     en una ventana de juego dedicada, o abre directamente el archivo',
  '     "Moto-Travel-Offline.html" en cualquier navegador.',
  '',
  'CONTROLES EN RUTA:',
  '  - W / Flecha Arriba      : Acelerar',
  '  - S / Flecha Abajo       : Freno combinado',
  '  - A / D o Flechas Izq/Der: Doblar e inclinar la Scrambler',
  '  - E                      : Subir marcha (1a a 6a)',
  '  - Q                      : Bajar marcha (6a a Neutro)',
  '  - L                      : Encender / Apagar faro delantero',
  '  - H                      : Bocina',
  '  - F                      : Pantalla Completa',
  '===================================================================='
].join('\r\n');

fs.writeFileSync(path.join(PORTABLE_DIR, 'LEEME.txt'), readmeContent, 'utf8');

// 5. Generar el paquete .ZIP descargable
if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${PORTABLE_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force"`,
  { stdio: 'inherit' }
);

const stats = fs.statSync(ZIP_PATH);
console.log(`Paquete portable generado con exito: ${ZIP_PATH} (${(stats.size / 1024).toFixed(1)} KB)`);
