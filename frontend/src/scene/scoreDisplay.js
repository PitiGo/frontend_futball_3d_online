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

  return { left: leftScoreText, right: rightScoreText };
}
