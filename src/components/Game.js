const setupSocket = useCallback(() => {
    console.group('Socket Setup (Default Path)');
    if (!roomId) {
        console.error('Error: roomId no está definido al intentar configurar el socket');
        console.groupEnd();
        return null;
    }

    const publicGameUrl = process.env.REACT_APP_GAME_SERVER_URL || 'https://football-online-3d.dantecollazzi.com';

    console.log('Configurando socket (Default Path):', {
        publicGameUrl,
        roomId,
    });

    try {
        const socket = io({
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        console.log('Socket Options Effective (Default Path):', JSON.stringify(socket.io.opts, null, 2));

        socket.on('connect', () => {
            console.log('Socket conectado exitosamente (Default Path):', {
                id: socket.id,
                opts: socket.io.opts,
                roomId
            });
            setIsConnected(true);
        });

        socket.on('connect_error', (error) => {
            console.error('Error de conexión del socket (Default Path):', {
                error: error.message || error,
                roomId,
                urlAttempted: publicGameUrl,
                pathAttempted: '/socket.io/'
            });
            if (error.description) console.error('Descripción del error:', error.description);
            if (error.context) console.error('Contexto del error:', error.context);
            setIsConnected(false);
        });

        console.groupEnd();
        return socket;
    } catch (error) {
        console.error('Error al crear el socket:', error);
        console.log('Error details:', error);
        console.groupEnd();
        return null;
    }
}, [roomId]);

const handleJoinGame = (name) => {
    if (socketRef.current && socketRef.current.connected && roomId && name && name.trim() !== '') {
        console.log(`Emitiendo joinGame con name: ${name}, roomId: ${roomId}`);

        console.log('>>> DEBUG handleJoinGame - name:', name, 'roomId:', roomId, 'Payload a enviar:', {
            name: name?.trim(),
            roomId: roomId
        });

        socketRef.current.emit('joinGame', { name: name.trim(), roomId: roomId });
        setPlayerName(name.trim());
        setHasJoined(true);
    } else {
        console.error("No se pudo emitir joinGame. Revisar:", {
            socketExists: !!socketRef.current,
            socketConnected: socketRef.current?.connected,
            roomIdAvailable: !!roomId,
            nameAvailable: !!name && name.trim() !== '',
            nameValue: name,
            roomIdValue: roomId
        });
    }
}; 