FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node --max-old-space-size=2048 node_modules/@angular/cli/bin/ng.js build --configuration production

FROM nginx:alpine
COPY --from=builder /app/dist/rsalgotrainer/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
