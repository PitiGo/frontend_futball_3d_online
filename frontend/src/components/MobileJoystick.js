import React, { useState, useCallback, useRef, useEffect } from 'react';

const MobileJoystick = ({ onDirectionChange, onBallControlChange }) => {
    const [isActive, setIsActive] = useState(false);
    const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
    const [isKicking, setIsKicking] = useState(false);
    const [kickChargeTime, setKickChargeTime] = useState(0);
    const joystickRef = useRef(null);
    const kickStartTimeRef = useRef(null);
    const kickChargeIntervalRef = useRef(null);

    // Tamaño adaptativo basado en la pantalla
    const [sizes, setSizes] = useState({
        joystickSize: 140,
        stickSize: 55,
        buttonSize: 80,
        maxDistance: 45
    });

    useEffect(() => {
        const updateSizes = () => {
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const minDimension = Math.min(screenWidth, screenHeight);
            
            // Escalar según el tamaño de pantalla
            const scale = Math.max(0.8, Math.min(1.2, minDimension / 400));
            
            setSizes({
                joystickSize: Math.round(140 * scale),
                stickSize: Math.round(55 * scale),
                buttonSize: Math.round(80 * scale),
                maxDistance: Math.round(45 * scale)
            });
        };

        updateSizes();
        window.addEventListener('resize', updateSizes);
        return () => window.removeEventListener('resize', updateSizes);
    }, []);

    const throttleEmit = useCallback((vector) => {
        onDirectionChange && onDirectionChange(vector);
    }, [onDirectionChange]);

    const calculateVector = useCallback((deltaX, deltaY) => {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const deadzone = 8;

        if (distance < deadzone) {
            setStickPosition({ x: 0, y: 0 });
            return { x: 0, z: 0 };
        }

        const clampedDist = Math.min(distance, sizes.maxDistance);
        const stickX = (deltaX / distance) * clampedDist;
        const stickY = (deltaY / distance) * clampedDist;
        setStickPosition({ x: stickX, y: stickY });

        // Vector normalizado a [-1,1]
        const normX = stickX / sizes.maxDistance;
        const normZ = (-stickY) / sizes.maxDistance;
        return { x: normX, z: normZ };
    }, [sizes.maxDistance]);

    const handleInput = useCallback((clientX, clientY) => {
        if (!joystickRef.current) return;

        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;

        const vector = calculateVector(deltaX, deltaY);
        throttleEmit(vector);
    }, [calculateVector, throttleEmit]);

    const handleStart = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsActive(true);
        const point = e.touches ? e.touches[0] : e;
        handleInput(point.clientX, point.clientY);

        const moveListener = (ev) => {
            ev.preventDefault();
            const p = ev.touches ? ev.touches[0] : ev;
            handleInput(p.clientX, p.clientY);
        };
        
        const endListener = (ev) => {
            ev.preventDefault();
            setIsActive(false);
            setStickPosition({ x: 0, y: 0 });
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

    // Manejo del botón de disparo con carga
    const handleKickStart = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsKicking(true);
        kickStartTimeRef.current = Date.now();
        onBallControlChange && onBallControlChange(true);
        
        // Actualizar tiempo de carga cada 50ms
        kickChargeIntervalRef.current = setInterval(() => {
            const elapsed = (Date.now() - kickStartTimeRef.current) / 1000;
            setKickChargeTime(Math.min(elapsed, 3)); // Max 3 segundos
        }, 50);
    }, [onBallControlChange]);

    const handleKickEnd = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsKicking(false);
        setKickChargeTime(0);
        onBallControlChange && onBallControlChange(false);
        
        if (kickChargeIntervalRef.current) {
            clearInterval(kickChargeIntervalRef.current);
            kickChargeIntervalRef.current = null;
        }
    }, [onBallControlChange]);

    // Limpiar intervalo al desmontar
    useEffect(() => {
        return () => {
            if (kickChargeIntervalRef.current) {
                clearInterval(kickChargeIntervalRef.current);
            }
        };
    }, []);

    // Calcular color del botón según la carga
    const getKickButtonColor = () => {
        if (!isKicking) return 'rgba(76, 175, 80, 0.85)';
        const progress = kickChargeTime / 3;
        // De verde a amarillo a rojo
        if (progress < 0.5) {
            return `rgba(${76 + progress * 2 * 179}, ${175 - progress * 2 * 30}, 80, 0.95)`;
        }
        return `rgba(255, ${145 - (progress - 0.5) * 2 * 145}, 0, 0.95)`;
    };

    return (
        <>
            {/* Joystick - Esquina inferior izquierda */}
            <div
                ref={joystickRef}
                style={{
                    position: 'fixed',
                    bottom: '30px',
                    left: '30px',
                    width: `${sizes.joystickSize}px`,
                    height: `${sizes.joystickSize}px`,
                    borderRadius: '50%',
                    background: isActive 
                        ? 'radial-gradient(circle, rgba(60,60,60,0.9) 0%, rgba(30,30,30,0.85) 100%)'
                        : 'radial-gradient(circle, rgba(50,50,50,0.7) 0%, rgba(20,20,20,0.6) 100%)',
                    border: `3px solid ${isActive ? 'rgba(100, 200, 255, 0.6)' : 'rgba(255, 255, 255, 0.25)'}`,
                    touchAction: 'none',
                    userSelect: 'none',
                    zIndex: 1001,
                    boxShadow: isActive 
                        ? '0 0 30px rgba(100, 200, 255, 0.4), inset 0 0 20px rgba(0,0,0,0.3)'
                        : '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(0,0,0,0.2)',
                    transition: 'border-color 0.15s, box-shadow 0.15s'
                }}
                onMouseDown={handleStart}
                onTouchStart={handleStart}
            >
                {/* Líneas guía */}
                <svg 
                    style={{ 
                        position: 'absolute', 
                        top: 0, 
                        left: 0, 
                        width: '100%', 
                        height: '100%',
                        pointerEvents: 'none'
                    }}
                >
                    {/* Cruz central */}
                    <line 
                        x1="50%" y1="20%" x2="50%" y2="80%" 
                        stroke="rgba(255,255,255,0.15)" 
                        strokeWidth="2"
                        strokeDasharray="4,4"
                    />
                    <line 
                        x1="20%" y1="50%" x2="80%" y2="50%" 
                        stroke="rgba(255,255,255,0.15)" 
                        strokeWidth="2"
                        strokeDasharray="4,4"
                    />
                    {/* Flechas direccionales */}
                    <polygon 
                        points={`${sizes.joystickSize/2},12 ${sizes.joystickSize/2-8},24 ${sizes.joystickSize/2+8},24`}
                        fill="rgba(255,255,255,0.3)"
                    />
                    <polygon 
                        points={`${sizes.joystickSize/2},${sizes.joystickSize-12} ${sizes.joystickSize/2-8},${sizes.joystickSize-24} ${sizes.joystickSize/2+8},${sizes.joystickSize-24}`}
                        fill="rgba(255,255,255,0.3)"
                    />
                    <polygon 
                        points={`12,${sizes.joystickSize/2} 24,${sizes.joystickSize/2-8} 24,${sizes.joystickSize/2+8}`}
                        fill="rgba(255,255,255,0.3)"
                    />
                    <polygon 
                        points={`${sizes.joystickSize-12},${sizes.joystickSize/2} ${sizes.joystickSize-24},${sizes.joystickSize/2-8} ${sizes.joystickSize-24},${sizes.joystickSize/2+8}`}
                        fill="rgba(255,255,255,0.3)"
                    />
                </svg>

                {/* Stick (thumb) */}
                <div style={{
                    position: 'absolute',
                    width: `${sizes.stickSize}px`,
                    height: `${sizes.stickSize}px`,
                    borderRadius: '50%',
                    background: isActive 
                        ? 'radial-gradient(circle at 30% 30%, rgba(150,200,255,0.95) 0%, rgba(80,140,200,0.9) 100%)'
                        : 'radial-gradient(circle at 30% 30%, rgba(220,220,220,0.9) 0%, rgba(150,150,150,0.8) 100%)',
                    left: '50%',
                    top: '50%',
                    transform: `translate(
                        calc(-50% + ${stickPosition.x}px), 
                        calc(-50% + ${stickPosition.y}px)
                    )`,
                    transition: isActive ? 'none' : 'transform 0.15s ease-out',
                    boxShadow: isActive
                        ? '0 0 15px rgba(100, 200, 255, 0.6), 0 4px 8px rgba(0,0,0,0.3)'
                        : '0 3px 10px rgba(0, 0, 0, 0.3)',
                    border: '2px solid rgba(255,255,255,0.4)',
                    pointerEvents: 'none'
                }} />
            </div>

            {/* Botón KICK - Esquina inferior derecha */}
            <button
                onMouseDown={handleKickStart}
                onMouseUp={handleKickEnd}
                onMouseLeave={handleKickEnd}
                onTouchStart={handleKickStart}
                onTouchEnd={handleKickEnd}
                onTouchCancel={handleKickEnd}
                style={{
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    width: `${sizes.buttonSize}px`,
                    height: `${sizes.buttonSize}px`,
                    borderRadius: '50%',
                    background: getKickButtonColor(),
                    color: 'white',
                    border: `3px solid ${isKicking ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}`,
                    fontSize: `${Math.round(sizes.buttonSize * 0.2)}px`,
                    fontWeight: 800,
                    letterSpacing: '1px',
                    textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                    touchAction: 'none',
                    userSelect: 'none',
                    zIndex: 1001,
                    boxShadow: isKicking 
                        ? '0 0 30px rgba(255, 200, 0, 0.6), 0 4px 15px rgba(0,0,0,0.4)'
                        : '0 4px 20px rgba(0, 0, 0, 0.4)',
                    transform: isKicking ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.1s, box-shadow 0.1s, background 0.1s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                }}
            >
                <span>⚽</span>
                <span style={{ fontSize: `${Math.round(sizes.buttonSize * 0.15)}px`, marginTop: '2px' }}>
                    {isKicking ? `${kickChargeTime.toFixed(1)}s` : 'KICK'}
                </span>
            </button>

            {/* Indicador de carga circular alrededor del botón KICK */}
            {isKicking && (
                <svg
                    style={{
                        position: 'fixed',
                        bottom: `${30 - 8}px`,
                        right: `${30 - 8}px`,
                        width: `${sizes.buttonSize + 16}px`,
                        height: `${sizes.buttonSize + 16}px`,
                        zIndex: 1000,
                        pointerEvents: 'none',
                        transform: 'rotate(-90deg)'
                    }}
                >
                    <circle
                        cx={(sizes.buttonSize + 16) / 2}
                        cy={(sizes.buttonSize + 16) / 2}
                        r={(sizes.buttonSize + 6) / 2}
                        fill="none"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="4"
                    />
                    <circle
                        cx={(sizes.buttonSize + 16) / 2}
                        cy={(sizes.buttonSize + 16) / 2}
                        r={(sizes.buttonSize + 6) / 2}
                        fill="none"
                        stroke={kickChargeTime < 1 ? '#4CAF50' : kickChargeTime < 2 ? '#FFC107' : '#FF5722'}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${(kickChargeTime / 3) * Math.PI * (sizes.buttonSize + 6)} ${Math.PI * (sizes.buttonSize + 6)}`}
                        style={{ transition: 'stroke 0.2s' }}
                    />
                </svg>
            )}

            {/* Instrucción visual cuando no hay actividad */}
            {!isActive && !isKicking && (
                <div style={{
                    position: 'fixed',
                    bottom: `${30 + sizes.joystickSize + 15}px`,
                    left: '30px',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '12px',
                    fontWeight: '500',
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    pointerEvents: 'none'
                }}>
                    ← MOVE
                </div>
            )}
            {!isActive && !isKicking && (
                <div style={{
                    position: 'fixed',
                    bottom: `${30 + sizes.buttonSize + 15}px`,
                    right: '30px',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '12px',
                    fontWeight: '500',
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    pointerEvents: 'none',
                    textAlign: 'right'
                }}>
                    HOLD TO CHARGE →
                </div>
            )}
        </>
    );
};

export default MobileJoystick;
