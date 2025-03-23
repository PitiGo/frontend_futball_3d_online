#!/bin/bash
LOCAL_PROJECT_DIR="/Users/dantecollazzi/Desktop/frontend_futball_3d_online"
REMOTE_USER="root"
REMOTE_HOST="147.79.118.190"
REMOTE_PATH="/opt/football3d"

# Preparar frontend localmente
echo "🏗️ Preparando el frontend..."
cd "$LOCAL_PROJECT_DIR/frontend"
npm install
npm run build

# Crear directorios necesarios en el servidor
echo "📁 Creando directorios en el servidor..."
ssh $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_PATH/frontend $REMOTE_PATH/game-server"

# Copiar build del frontend
echo "📤 Copiando archivos del frontend..."
rsync -avz \
    "$LOCAL_PROJECT_DIR/frontend/build/" \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/frontend/"

# Copiar archivos del servidor
echo "📤 Copiando archivos del servidor..."
rsync -avz \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'build' \
    "$LOCAL_PROJECT_DIR/game-server/" \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/game-server/"

# Copiar docker-compose y otros archivos de configuración
echo "📤 Copiando archivos de configuración..."
rsync -avz \
    "$LOCAL_PROJECT_DIR/docker-compose.yml" \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

# Limpiar caché y contenedores antiguos
echo "🧹 Limpiando caché y contenedores..."
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose down -v"
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose rm -f"
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker system prune -f"

# Verificar que los archivos nuevos se han copiado correctamente
echo "🔍 Verificando archivos actualizados..."
ssh $REMOTE_USER@$REMOTE_HOST "find $REMOTE_PATH/frontend/ -type f -name \"*.js\" -mtime -1 | wc -l"
ssh $REMOTE_USER@$REMOTE_HOST "find $REMOTE_PATH/frontend/ -type f -name \"*.js\" -exec grep -l \"createProceduralField\" {} \; | wc -l"

# Asegurar permisos correctos
echo "🔒 Configurando permisos..."
ssh $REMOTE_USER@$REMOTE_HOST "chown -R www-data:www-data $REMOTE_PATH/frontend"

# Verificar que Docker está instalado e iniciado
echo "🐳 Verificando Docker..."
ssh $REMOTE_USER@$REMOTE_HOST "if ! command -v docker &> /dev/null; then \
    apt-get update && apt-get install -y docker.io docker-compose; \
    fi && systemctl start docker && systemctl enable docker"

# Construir y ejecutar contenedores desde cero
echo "🚀 Desplegando servicios (reconstrucción completa)..."
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose down -v"
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose build --no-cache"
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose up -d"

# Verificar el estado de los servicios
echo "✅ Despliegue completado!"
echo "🔍 Verificando servicios..."
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose ps"

# Mostrar logs iniciales para detectar problemas
echo "📋 Mostrando logs de inicio..."
ssh $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose logs --tail=50"

echo "🌐 Verificando la estructura del sitio web..."
ssh $REMOTE_USER@$REMOTE_HOST "ls -la $REMOTE_PATH/frontend/"