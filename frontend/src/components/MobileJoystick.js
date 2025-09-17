import React, { useState, useCallback, useRef } from 'react';

const MobileJoystick = ({ onDirectionChange, onBallControlChange }) => {
    const [isActive, setIsActive] = useState(false);
    const [currentDirection, setCurrentDirection] = useState(null);
    const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
    const joystickRef = useRef(null);
    const isPointerDownRef = useRef(false);

    // Simplificar throttleEmit
    const throttleEmit = useCallback((vector) => {
        onDirectionChange && onDirectionChange(vector);
    }, [onDirectionChange]);

    const calculateVector = useCallback((deltaX, deltaY) => {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = 50;
        const deadzone = 10;

        if (distance < deadzone) {
            setStickPosition({ x: 0, y: 0 });
            return { x: 0, z: 0 };
        }

        const clampedDist = Math.min(distance, maxDistance);
        const stickX = (deltaX / distance) * clampedDist;
        const stickY = (deltaY / distance) * clampedDist;
        setStickPosition({ x: stickX, y: stickY });

        // Vector normalizado a [-1,1]; z positivo = arriba pantalla (deltaY negativo)
        const normX = stickX / maxDistance;
        const normZ = (-stickY) / maxDistance;
        return { x: normX, z: normZ };
    }, []);
    const handleInput = useCallback((clientX, clientY) => {
        if (!joystickRef.current) return;

        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;

        const vector = calculateVector(deltaX, deltaY);
        // Mantener un indicador textual simple
        let dirLabel = '•';
        if (Math.abs(vector.x) > 0.1 || Math.abs(vector.z) > 0.1) {
            const angleDeg = (Math.atan2(-vector.z, vector.x) * 180) / Math.PI;
            const deg = (angleDeg + 360) % 360;
            if (deg >= 45 && deg < 135) dirLabel = 'up';
            else if (deg >= 135 && deg < 225) dirLabel = 'left';
            else if (deg >= 225 && deg < 315) dirLabel = 'down';
            else dirLabel = 'right';
        }
        setCurrentDirection(dirLabel);
        throttleEmit(vector);
    }, [calculateVector, throttleEmit]);

    // Manejadores de eventos unificados
    const handleStart = useCallback((e) => {
        e.preventDefault();
        setIsActive(true);
        isPointerDownRef.current = true;
        const point = e.touches ? e.touches[0] : e;
        handleInput(point.clientX, point.clientY);

        // Capturar movimiento global para no parar al salir del círculo
        const moveListener = (ev) => {
            const p = ev.touches ? ev.touches[0] : ev;
            handleInput(p.clientX, p.clientY);
        };
        const endListener = (ev) => {
            ev.preventDefault();
            isPointerDownRef.current = false;
            setIsActive(false);
            setStickPosition({ x: 0, y: 0 });
            setCurrentDirection(null);
            throttleEmit({ x: 0, z: 0 });
            window.removeEventListener('mousemove', moveListener);
            window.removeEventListener('mouseup', endListener);
            window.removeEventListener('touchmove', moveListener);
            window.removeEventListener('touchend', endListener);
            window.removeEventListener('touchcancel', endListener);
        };
        window.addEventListener('mousemove', moveListener, { passive: false });
        window.addEventListener('mouseup', endListener, { passive: false });
        window.addEventListener('touchmove', moveListener, { passive: false });
        window.addEventListener('touchend', endListener, { passive: false });
        window.addEventListener('touchcancel', endListener, { passive: false });
    }, [handleInput, throttleEmit]);

    const handleMove = useCallback((e) => {
        e.preventDefault();
        if (!isActive) return;
        const point = e.touches ? e.touches[0] : e;
        handleInput(point.clientX, point.clientY);
    }, [isActive, handleInput]);

    const handleEnd = useCallback((e) => {
        e.preventDefault();
        // No hacemos nada aquí; el final global limpia estado
    }, []);

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
                onMouseLeave={() => { /* no detener al salir */ }}
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

            {/* Botón de control de balón (mantener presionado) */}
            <button
                onMouseDown={(e) => { e.preventDefault(); onBallControlChange && onBallControlChange(true); }}
                onMouseUp={(e) => { e.preventDefault(); onBallControlChange && onBallControlChange(false); }}
                onMouseLeave={(e) => { e.preventDefault(); onBallControlChange && onBallControlChange(false); }}
                onTouchStart={(e) => { e.preventDefault(); onBallControlChange && onBallControlChange(true); }}
                onTouchEnd={(e) => { e.preventDefault(); onBallControlChange && onBallControlChange(false); }}
                onTouchCancel={(e) => { e.preventDefault(); onBallControlChange && onBallControlChange(false); }}
                style={{
                    position: 'fixed',
                    bottom: '200px',
                    right: '24px',
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.25)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.3)',
                    fontSize: '12px',
                    fontWeight: 700,
                    backdropFilter: 'blur(2px)',
                    pointerEvents: 'auto'
                }}
            >
                HOLD
            </button>
        </div>
    );
};

export default MobileJoystick;