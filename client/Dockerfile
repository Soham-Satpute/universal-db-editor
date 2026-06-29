# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage — compile the Vite app to static assets
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Production stage — serve the static bundle with nginx
# ---------------------------------------------------------------------------
FROM nginx:alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
