import './styles.css';
import { App } from './ui/app';
import { unlockAudio } from './audio';

declare global {
  interface Window {
    __game: {
      state: import('./game').GameState;
      game: import('./game').Game;
      skipPhase: () => void;
      pullShard: () => void;
    };
  }
}

const app = new App();

const unlock = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

window.__game = app.debug;
