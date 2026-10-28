# kys-cpp web edition: a Node.js server that serves the browser version of the
# game. The game resources are not part of the image: mount a kys-cpp game
# directory (the one containing resource/, save/, config/, ...) at /game.
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}

# FluidSynth renders the MIDI music (music/*.mid + music/mid.sf2) to Ogg Vorbis
# once; the results are cached in /cache.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fluidsynth \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    GAME_DIR=/game \
    CACHE_DIR=/cache \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /game /cache && chown node:node /cache
USER node

EXPOSE 8080
VOLUME ["/cache"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
