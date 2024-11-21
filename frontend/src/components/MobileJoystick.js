import React, { useState, useCallback } from 'react';

const MobileJoystick = ({ onDirectionChange }) => {
    const [touching, setTouching] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [basePosition, setBasePosition] = useState({ x: 0, y: 0 });

    const handleStart = useCallback((e) => {
        e.preventDefault(); // Prevenir comportamientos por defecto
        const touch = e.touches[0];
        setTouching(true);
        setBasePosition({ x: touch.clientX, y: touch.clientY });
        setPosition({ x: touch.clientX, y: touch.clientY });
    }, []);

    const handleMove = useCallback((e) => {
        e.preventDefault(); // Prevenir comportamientos por defecto
        if (!touching) return;
        const touch = e.touches[0];
        setPosition({ x: touch.clientX, y: touch.clientY });

        const deltaX = touch.clientX - basePosition.x;
        const deltaY = touch.clientY - basePosition.y;
        const angle = Math.atan2(deltaY, deltaX);
        const distance = Math.min(50, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
        
        if (distance > 20) {
            if (angle > -Math.PI/4 && angle < Math.PI/4) onDirectionChange('right');
            else if (angle >= Math.PI/4 && angle < 3*Math.PI/4) onDirectionChange('down');
            else if (angle >= -3*Math.PI/4 && angle < -Math.PI/4) onDirectionChange('up');
            else onDirectionChange('left');
        }
    }, [touching, basePosition, onDirectionChange]);

    const handleEnd = useCallback((e) => {
        e.preventDefault(); // Prevenir comportamientos por defecto
        setTouching(false);
        onDirectionChange(null);
    }, [onDirectionChange]);

    return (
        <div style={{
            width: '128px',
            height: '128px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            position: 'relative',
            touchAction: 'none'
        }}>
            {touching && (
                <div 
                    style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.5)',
                        position: 'absolute',
                        transform: `translate(${position.x - basePosition.x}px, ${position.y - basePosition.y}px)`,
                        left: '32px',
                        top: '32px'
                    }}
                />
            )}
            <div 
                style={{
                    position: 'absolute',
                    inset: 0,
                    touchAction: 'none'
                }}
                onTouchStart={handleStart}
                onTouchMove={handleMove}
                onTouchEnd={handleEnd}
            />
        </div>
    );
};

export default MobileJoystick;