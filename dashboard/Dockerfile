FROM node:20-slim AS build
# Vite inlines this at BUILD time. Set to the engine's PUBLIC url for remote deploys.
ARG VITE_ENGINE_URL=http://localhost:3000
ENV VITE_ENGINE_URL=$VITE_ENGINE_URL
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
