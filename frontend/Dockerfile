FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/ scripts/
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV CORS_ORIGIN=https://sat.neuhard.dev
ENV API_KEY=""
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q --spider http://localhost/ || exit 1
