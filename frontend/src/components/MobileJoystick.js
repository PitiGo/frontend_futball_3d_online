import React, { useState, useCallback } from 'react';

const MobileJoystick = ({ onDirectionChange }) => {
    const [isActive, setIsActive] = useState(false);
    const [currentDirection, setCurrentDirection] = useState(null);
    const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
    const joystickRef = React.useRef(null);
    const lastEmitTimeRef = React.useRef(0);

    // Simplificar throttleEmit
    const throttleEmit = useCallback((direction) => {
        // Eliminamos el throttling para tener respuesta inmediata
        onDirectionChange(direction);
    }, [onDirectionChange]);

    const calculateDirection = useCallback((deltaX, deltaY) => {
        const angle = Math.atan2(deltaY, deltaX);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = 50;
        const deadzone = 10; // Reducido para mayor sensibilidad

        if (distance < deadzone) {
            setStickPosition({ x: 0, y: 0 });
            return null;
        }

        // Normalizar la posición del stick
        const normalizedDistance = Math.min(distance, maxDistance);
        const normalizedX = (deltaX / distance) * normalizedDistance;
        const normalizedY = (deltaY / distance) * normalizedDistance;
        setStickPosition({ x: normalizedX, y: normalizedY });

        let degrees = ((angle * 180) / Math.PI + 360) % 360;

        // Zonas de dirección ajustadas
        if (degrees >= 45 && degrees < 135) return 'down';
        if (degrees >= 135 && degrees < 225) return 'left';
        if (degrees >= 225 && degrees < 315) return 'up';
        return 'right';
    }, []);

    const handleInput = useCallback((clientX, clientY) => {
        if (!joystickRef.current) return;
    
        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
    
        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;
    
        const newDirection = calculateDirection(deltaX, deltaY);
        
        // Emitir siempre una nueva dirección, incluso si es la misma
        setCurrentDirection(newDirection);
        if (newDirection) {
            // Si hay una dirección activa, siempre la emitimos
            onDirectionChange(newDirection);
        } else {
            // Solo emitimos null cuando realmente no hay dirección
            onDirectionChange(null);
        }
    }, [calculateDirection, onDirectionChange]);

    // Manejadores de eventos unificados
    const handleStart = useCallback((e) => {
        e.preventDefault();
        setIsActive(true);
        const point = e.touches ? e.touches[0] : e;
        handleInput(point.clientX, point.clientY);
    }, [handleInput]);

    const handleMove = useCallback((e) => {
        e.preventDefault();
        if (!isActive) return;
        const point = e.touches ? e.touches[0] : e;
        handleInput(point.clientX, point.clientY);
    }, [isActive, handleInput]);

    const handleEnd = useCallback((e) => {
        e.preventDefault();
        setIsActive(false);
        setStickPosition({ x: 0, y: 0 });
        setCurrentDirection(null);
        onDirectionChange(null);
    }, [onDirectionChange]);

    return (
        <div style={{
            position: 'fixed',
            bottom: '120px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none'
        }}>
            <div
                ref={joystickRef}
                style={{
                    width: '180px',
                    height: '180px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.3)',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    position: 'relative',
                    touchAction: 'none',
                    userSelect: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    pointerEvents: 'auto',
                    boxShadow: '0 0 20px rgba(0, 0, 0, 0.3)'
                }}
                onMouseDown={handleStart}
                onMouseMove={handleMove}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={handleStart}
                onTouchMove={handleMove}
                onTouchEnd={handleEnd}
                onTouchCancel={handleEnd}
            >
                {/* Cruz guía */}
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '0',
                    bottom: '0',
                    width: '2px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    transform: 'translateX(-50%)'
                }} />
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '0',
                    right: '0',
                    height: '2px',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    transform: 'translateY(-50%)'
                }} />

                {/* Stick */}
                <div style={{
                    position: 'absolute',
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)',
                    left: '50%',
                    top: '50%',
                    transform: `translate(
                        calc(-50% + ${stickPosition.x}px), 
                        calc(-50% + ${stickPosition.y}px)
                    )`,
                    transition: isActive ? 'none' : 'transform 0.2s ease-out, background-color 0.2s',
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)',
                    pointerEvents: 'none'
                }} />

                {/* Dirección actual */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
                    pointerEvents: 'none'
                }}>
                    {currentDirection || '•'}
                </div>
            </div>
        </div>
    );
};

export default MobileJoystick;