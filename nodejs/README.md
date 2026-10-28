# kys-cpp web edition (Node.js + Docker)

金庸群侠传 kys-cpp 的网页版：游戏在浏览器中运行，由一个 Node.js 服务器提供资源、存档和设置，可直接用 Docker 部署。

This directory contains a port of kys-cpp to a web application:

- **`server/`** – a dependency-free Node.js server. It serves the browser client, the resources of a kys-cpp game directory, the save slots and the configuration file.
- **`public/`** – the game itself, rewritten in JavaScript (ES modules, WebGL 2, Web Audio). It is a direct port of the C++ sources in `../src`, class by class, so the game logic, menus, scripts and battles behave like the desktop version.
- **`test/`** – unit tests for the script interpreter and a generator for a small synthetic game directory used for automated tests.

The game resources are **not** included (same as for the desktop version). Download them from the link in the main [readme](../readme.md) and use the extracted game directory (the one that contains `resource/`, `save/`, `config/`, `music/`, `font/`, ...).

## Run with Docker

```bash
cd nodejs
docker build -t kys-cpp-web .
```

```bash
docker run -d --name kys -p 8080:8080 -v /path/to/game:/game kys-cpp-web
```

Then open <http://localhost:8080>. The server runs as the image's `node` user (uid 1000); the mounted game directory must be writable by that user so that the game can write `save/` and `config/kysmod.ini`. Use `--user <uid>:<gid>` to run as another user.

With Docker Compose, put the game directory in `nodejs/game` (or point `KYS_GAME_DIR` at it):

```bash
KYS_GAME_DIR=/path/to/game docker compose up -d
```

`KYS_PORT`, `KYS_UID` and `KYS_GID` change the published port and the user of the server. Rendered music is kept in the `kys-cache` volume.

## Run without Docker

Node.js 22.13 or newer is required (the server uses the built-in `node:sqlite` module). Install FluidSynth to hear MIDI music.

```bash
cd nodejs
GAME_DIR=/path/to/game npm start
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `GAME_DIR` | `../game` (`/game` in Docker) | kys-cpp game directory |
| `SAVE_DIR` | `$GAME_DIR/save` | save slots |
| `CONFIG_FILE` | `$GAME_DIR/config/kysmod.ini` | game settings, edited by the in-game settings menu |
| `CACHE_DIR` | `/tmp/kys-cache` (`/cache` in Docker) | MIDI music rendered by FluidSynth |
| `SOUND_FONT` | – | sound font used when the game has no `music/mid.sf2` (the Docker image falls back to the General MIDI font installed with FluidSynth) |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | listen address |

All the options of `kysmod.ini` work as in the desktop version, except `battle_presentation` (the paper presentation is not available).

## Controls

Keyboard, mouse, gamepads (Gamepad API) and touch screens are supported. On touch screens the virtual gamepad of the mobile version is shown (setting `use_virtual_stick`). Chinese names can be typed with the system input method.

## How the port works

| Desktop (C++) | Web |
| --- | --- |
| SDL3 renderer, render targets, blend modes | WebGL 2 renderer with the same API (`Engine.js`) |
| SDL_ttf | browser text rendering with the game font (`font/chinese.ttf`) |
| SDL_mixer (MIDI via FluidSynth, MP3, WAV) | Web Audio; MIDI files are rendered once on the server with FluidSynth and the game's `music/mid.sf2` |
| nested blocking `RunNode::run()` loops | `async`/`await` loops driven by `requestAnimationFrame` |
| images loaded from `resource/*` (folders or zip files) | the server reads the same folders/zip files and sends images in batches |
| saves (`save/N.zip` with SQLite + grp) | written by the server in the same format, so saves can be copied between the desktop and web versions |
| Cifa scripts (`script/event-cifa`) | the Cifa interpreter reimplemented in JavaScript |
| movies (`movie/*.mp4`) | HTML video |

Not available in the web edition: the "paper" 3D battle presentation, network battles and the debug console's network commands.

## Tests

```bash
npm test
```

To try the client without the real resources, generate a small synthetic game directory (placeholder graphics, one village, one battle) and serve it:

```bash
node test/make-test-game.js /tmp/kys-test-game
```

```bash
GAME_DIR=/tmp/kys-test-game npm start
```
