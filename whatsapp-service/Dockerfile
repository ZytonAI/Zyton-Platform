# Zyton WhatsApp Service — imagen con Chromium del sistema
# (más liviana y confiable que dejar que Puppeteer descargue su propio Chromium)

FROM node:20-slim

# Chromium + librerías que necesita para correr headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# No descargar el Chromium propio de Puppeteer: usamos el del sistema (apt) de arriba
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

# Sesión de WhatsApp persistida — monta un volumen aquí en EasyPanel
VOLUME ["/app/.wwebjs_auth"]

EXPOSE 3001

CMD ["node", "src/index.js"]
