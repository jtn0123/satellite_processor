FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/ scripts/
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
ENV CORS_ORIGIN=https://sat.neuhard.dev
ENV API_KEY=""
EXPOSE 80
CMD ["/bin/sh", "-c", "envsubst '${CORS_ORIGIN} ${API_KEY}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
