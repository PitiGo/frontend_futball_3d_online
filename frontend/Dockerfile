# frontend/Dockerfile
FROM node:18-alpine as build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa de producción
 FROM nginx:alpine
 COPY --from=build /usr/src/app/build /usr/share/nginx/html
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 EXPOSE 3000
 CMD ["nginx", "-g", "daemon off;"]