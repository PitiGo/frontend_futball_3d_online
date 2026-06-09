import * as GUI from '@babylonjs/gui';

/** Babylon GUI scoreboard for desktop view. */
export function createScoreDisplay(advancedTexture) {
  const scoreBackground = new GUI.Rectangle();
  scoreBackground.width = '300px';
  scoreBackground.height = '40px';
  scoreBackground.cornerRadius = 20;
  scoreBackground.color = 'White';
  scoreBackground.thickness = 2;
  scoreBackground.background = 'Black';
  scoreBackground.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  scoreBackground.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  scoreBackground.top = '10px';
  advancedTexture.addControl(scoreBackground);

  const leftScoreText = new GUI.TextBlock();
  leftScoreText.text = '0';
  leftScoreText.color = '#3b82f6';
  leftScoreText.fontSize = 24;
  leftScoreText.left = '-40px';
  scoreBackground.addControl(leftScoreText);

  const separator = new GUI.TextBlock();
  separator.text = '-';
  separator.color = 'white';
  separator.fontSize = 24;
  scoreBackground.addControl(separator);

  const rightScoreText = new GUI.TextBlock();
  rightScoreText.text = '0';
  rightScoreText.color = '#ef4444';
  rightScoreText.fontSize = 24;
  rightScoreText.left = '40px';
  scoreBackground.addControl(rightScoreText);

  // Brief scale-up of the digit that just changed (goal feedback).
  const BASE_FONT_SIZE = 24;
  const PULSE_DURATION_MS = 500;
  const pulseTimers = { left: null, right: null };
  const pulse = (side) => {
    const block = side === 'left' ? leftScoreText : rightScoreText;
    if (pulseTimers[side]) clearInterval(pulseTimers[side]);
    const start = performance.now();
    pulseTimers[side] = setInterval(() => {
      const t = (performance.now() - start) / PULSE_DURATION_MS;
      if (t >= 1) {
        block.fontSize = BASE_FONT_SIZE;
        clearInterval(pulseTimers[side]);
        pulseTimers[side] = null;
        return;
      }
      block.fontSize = Math.round(BASE_FONT_SIZE + Math.sin(t * Math.PI) * 14);
    }, 30);
  };

  return { left: leftScoreText, right: rightScoreText, pulse };
}
