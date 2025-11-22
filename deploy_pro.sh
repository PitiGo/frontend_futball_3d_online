#!/bin/bash

# --- CONFIGURACIÓN ---
SSH_HOST="vps-dante"
SERVER_PATH="/opt/football3d"
EXCLUDE_LIST="--exclude node_modules --exclude .git --exclude build --exclude .env.local --exclude .DS_Store"

echo "🚀 Iniciando despliegue a $SSH_HOST..."

# 1. Sincronizar archivos
echo "📦 Sincronizando archivos..."
rsync -avz $EXCLUDE_LIST ./ $SSH_HOST:$SERVER_PATH/

if [ $? -eq 0 ]; then
  echo "✅ Sincronización completada."
else
  echo "❌ Error en la sincronización."
  exit 1
fi

# 2. Ejecutar comandos remotos
echo "🐳 Reconstruyendo contenedores en el servidor..."
ssh $SSH_HOST << EOF
  cd $SERVER_PATH
  
  echo "🛑 Deteniendo contenedores antiguos (Fuerza bruta)..."
  # Usamos docker puro para evitar el error de python de docker-compose viejo
  docker stop football3d_frontend_1 football3d_game-server_1 2>/dev/null
  docker rm football3d_frontend_1 football3d_game-server_1 2>/dev/null

  echo "🏗️ Levantando nuevos contenedores..."
  # Intentamos usar el comando moderno (v2)
  if docker compose version >/dev/null 2>&1; then
      docker compose up --build -d
  else
      # Fallback al viejo si no hay v2, pero funcionará porque ya borramos los contenedores rotos
      docker-compose up --build -d
  fi

  # Limpieza
  docker image prune -f
EOF

echo "🎉 ¡Despliegue finalizado con éxito!"
echo "👉 Frontend: https://football-online-3d.dantecollazzi.com"